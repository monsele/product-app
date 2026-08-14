import { createId, type Identifier } from "@avlp/config";
import {
  jobs,
  outboxEvents,
  projects,
  sourceDocuments,
  type DatabaseClient,
} from "@avlp/database";
import {
  createIdempotencyKey,
  createJobEnvelope,
  defineJobHandler,
  JobExecutionError,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  documentIngestionJobPayloadSchema,
  documentValidationCleanupJobPayloadSchema,
  documentValidationJobPayloadSchema,
  sourceDocumentMediaTypeSchema,
} from "@avlp/schemas";
import { type ObjectStorage } from "@avlp/storage";
import { and, eq, sql } from "drizzle-orm";
import {
  type MalwareScanner,
  validateDocumentBytes,
} from "./document-validation.js";
import {
  documentValidationCleanupJobType,
  documentValidationCleanupPayloadVersion,
} from "./document-validation-cleanup-job.js";

export const documentValidationJobType = "document.validation";
export const documentValidationPayloadVersion = 1;
const maxPages = 20;

export type DocumentValidationJobHandlerOptions = {
  database: DatabaseClient;
  storage: Pick<ObjectStorage, "delete" | "getBytes">;
  scanner: MalwareScanner;
  maxUploadBytes: number;
  now?: () => Date;
};

function errorForScannerFailure(): JobExecutionError {
  return new JobExecutionError(
    "retryable",
    "MALWARE_SCAN_UNAVAILABLE",
    "The file safety check is temporarily unavailable.",
  );
}

export function createDocumentValidationJobHandler(
  options: DocumentValidationJobHandlerOptions,
): RegisteredJobHandler {
  const now = options.now ?? (() => new Date());
  return defineJobHandler(
    documentValidationJobType,
    documentValidationPayloadVersion,
    documentValidationJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      const [document] = await options.database
        .select()
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.id, payload.sourceDocumentId),
            eq(sourceDocuments.projectId, context.projectId),
            eq(sourceDocuments.ownerUserId, context.ownerUserId),
          ),
        )
        .limit(1);
      if (document === undefined)
        throw new JobExecutionError(
          "terminal",
          "DOCUMENT_VALIDATION_DOCUMENT_NOT_FOUND",
          "The source document was not found.",
        );
      if (document.status === "active") return { validation: "already_valid" };
      if (document.status === "rejected")
        return { validation: "already_rejected" };

      await options.database
        .update(sourceDocuments)
        .set({ status: "validating", updatedAt: now() })
        .where(
          and(
            eq(sourceDocuments.id, document.id),
            eq(sourceDocuments.projectId, context.projectId),
            eq(sourceDocuments.ownerUserId, context.ownerUserId),
          ),
        );

      let object;
      try {
        object = await options.storage.getBytes(
          document.storageKey,
          options.maxUploadBytes + 1,
        );
      } catch {
        await recordSystemFailure(
          options.database,
          document,
          context,
          "DOCUMENT_INSPECTION_UNAVAILABLE",
          now(),
        );
        throw new JobExecutionError(
          "retryable",
          "DOCUMENT_READ_FAILED",
          "The uploaded file could not be inspected.",
        );
      }
      const result = await validateDocumentBytes({
        bytes: object.body,
        mediaType: sourceDocumentMediaTypeSchema.parse(document.mediaType),
        maxBytes: options.maxUploadBytes,
        maxPages,
      });
      if (!result.ok) {
        await recordRejected(
          options.database,
          document,
          context,
          result,
          now(),
        );
        return { validation: "rejected", code: result.code };
      }

      let scan;
      try {
        scan = await options.scanner.scan({
          bytes: object.body,
          sha256: document.sha256,
        });
      } catch {
        await recordSystemFailure(
          options.database,
          document,
          context,
          "MALWARE_SCAN_UNAVAILABLE",
          now(),
        );
        throw errorForScannerFailure();
      }
      if (scan.status === "unsafe")
        return rejectMalware(options.database, document, context, now());
      await recordSuccess(options.database, document, context, result, now());
      return { validation: "accepted", pageCount: result.pageCount };
    },
    { leaseDurationMs: 60_000, maxAttempts: 3, retryDelayMs: 30_000 },
  );
}

type SourceDocumentRow = typeof sourceDocuments.$inferSelect;
type Context = {
  projectId: Identifier;
  ownerUserId: Identifier;
  correlationId: Identifier;
};

async function recordRejected(
  database: DatabaseClient,
  document: SourceDocumentRow,
  context: Context,
  result: Extract<
    Awaited<ReturnType<typeof validateDocumentBytes>>,
    { ok: false }
  >,
  timestamp: Date,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .update(sourceDocuments)
      .set({
        status: "rejected",
        scanStatus:
          result.code === "MALWARE_DETECTED" ? "unsafe" : "not_required",
        validationCode: result.code,
        validationWarnings: [],
        validatedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(sourceDocuments.id, document.id),
          eq(sourceDocuments.projectId, context.projectId),
          eq(sourceDocuments.ownerUserId, context.ownerUserId),
        ),
      );
    await transaction
      .update(projects)
      .set({
        stage: "uploading",
        latestFailedOperation: result.code,
        updatedAt: timestamp,
        revision: sql`${projects.revision} + 1`,
      })
      .where(
        and(
          eq(projects.id, context.projectId),
          eq(projects.ownerUserId, context.ownerUserId),
        ),
      );
    await new PostgresAuditWriter(transaction).write({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      actor: { type: "system" },
      eventType: "document.validation_rejected",
      target: { type: "source_document", id: document.id },
      correlationId: context.correlationId,
      metadata: { code: result.code },
      occurredAt: timestamp,
    });
    const payload = documentValidationCleanupJobPayloadSchema.parse({
      schemaVersion: 1,
      sourceDocumentId: document.id,
    });
    const envelope = createJobEnvelope(
      documentValidationCleanupJobPayloadSchema,
      {
        jobId: createId(timestamp),
        jobType: documentValidationCleanupJobType,
        projectId: context.projectId,
        ownerUserId: context.ownerUserId,
        inputVersion: `source-document:${document.id}:validation-cleanup`,
        idempotencyKey: createIdempotencyKey({
          jobType: documentValidationCleanupJobType,
          projectId: context.projectId,
          inputVersion: `source-document:${document.id}:validation-cleanup`,
          options: {},
        }),
        correlationId: context.correlationId,
        payloadVersion: documentValidationCleanupPayloadVersion,
        payload,
        requestedAt: timestamp,
      },
    );
    await transaction
      .insert(jobs)
      .values({
        id: envelope.jobId,
        jobType: envelope.jobType,
        queueName: "pipeline",
        projectId: envelope.projectId,
        ownerUserId: envelope.ownerUserId,
        inputVersion: envelope.inputVersion,
        idempotencyKey: envelope.idempotencyKey,
        correlationId: envelope.correlationId,
        payloadVersion: envelope.payloadVersion,
        payload: envelope.payload,
      })
      .onConflictDoNothing();
    await transaction.insert(outboxEvents).values({
      id: createId(timestamp),
      jobId: envelope.jobId,
      eventType: "document.validation.cleanup.requested.v1",
      queueName: "pipeline",
      envelope,
      deliveryOptions: { maxAttempts: 5, retryDelayMs: 30_000 },
    });
  });
}

async function rejectMalware(
  database: DatabaseClient,
  document: SourceDocumentRow,
  context: Context,
  timestamp: Date,
): Promise<JobMetadata> {
  await recordRejected(database, document, context, {
    ok: false,
    code: "MALWARE_DETECTED",
    message: "The uploaded file did not pass the safety check.",
  }, timestamp);
  return { validation: "rejected", code: "MALWARE_DETECTED" };
}

async function recordSystemFailure(
  database: DatabaseClient,
  document: SourceDocumentRow,
  context: Context,
  code: "DOCUMENT_INSPECTION_UNAVAILABLE" | "MALWARE_SCAN_UNAVAILABLE",
  timestamp: Date,
): Promise<void> {
  await database
    .update(sourceDocuments)
    .set({
      status: "validation_error",
      scanStatus: "error",
      validationCode: code,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(sourceDocuments.id, document.id),
        eq(sourceDocuments.projectId, context.projectId),
        eq(sourceDocuments.ownerUserId, context.ownerUserId),
      ),
    );
}

async function recordSuccess(
  database: DatabaseClient,
  document: SourceDocumentRow,
  context: Context,
  result: Extract<
    Awaited<ReturnType<typeof validateDocumentBytes>>,
    { ok: true }
  >,
  timestamp: Date,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction
      .update(sourceDocuments)
      .set({
        status: "active",
        scanStatus: "safe",
        validationCode: null,
        validationWarnings: result.warnings,
        pageCount: result.pageCount,
        validatedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(sourceDocuments.id, document.id),
          eq(sourceDocuments.projectId, context.projectId),
          eq(sourceDocuments.ownerUserId, context.ownerUserId),
        ),
      );
    const payload = documentIngestionJobPayloadSchema.parse({
      schemaVersion: 1,
      sourceDocumentId: document.id,
    });
    const envelope = createJobEnvelope(documentIngestionJobPayloadSchema, {
      jobId: createId(timestamp),
      jobType: "document.ingestion",
      projectId: context.projectId,
      ownerUserId: context.ownerUserId,
      inputVersion: `source-document:${document.id}`,
      idempotencyKey: createIdempotencyKey({
        jobType: "document.ingestion",
        projectId: context.projectId,
        inputVersion: `source-document:${document.id}`,
        options: {},
      }),
      correlationId: context.correlationId,
      payloadVersion: 1,
      payload,
      requestedAt: timestamp,
    });
    await transaction
      .insert(jobs)
      .values({
        id: envelope.jobId,
        jobType: envelope.jobType,
        queueName: "pipeline",
        projectId: envelope.projectId,
        ownerUserId: envelope.ownerUserId,
        inputVersion: envelope.inputVersion,
        idempotencyKey: envelope.idempotencyKey,
        correlationId: envelope.correlationId,
        payloadVersion: envelope.payloadVersion,
        payload: envelope.payload,
      })
      .onConflictDoNothing();
    await transaction
      .insert(outboxEvents)
      .values({
        id: createId(timestamp),
        jobId: envelope.jobId,
        eventType: "document.ingestion.requested.v1",
        queueName: "pipeline",
        envelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
      })
      .onConflictDoNothing();
    await transaction
      .update(projects)
      .set({
        stage: "ingesting",
        latestFailedOperation: null,
        updatedAt: timestamp,
        revision: sql`${projects.revision} + 1`,
      })
      .where(
        and(
          eq(projects.id, context.projectId),
          eq(projects.ownerUserId, context.ownerUserId),
        ),
      );
  });
}
