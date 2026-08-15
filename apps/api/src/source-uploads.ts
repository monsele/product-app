import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  outboxEvents,
  projects,
  sourceDocuments,
  sourceDocumentIngestionReuses,
  uploadSessions,
  type DatabaseClient,
} from "@avlp/database";
import { createJobEnvelope, createIdempotencyKey } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  completeSourceUploadInputSchema,
  completeSourceUploadResponseSchema,
  createSourceUploadSessionInputSchema,
  documentValidationJobPayloadSchema,
  sourceDocumentMediaTypeSchema,
  sourceDocumentStatusResponseSchema,
  uploadSessionResponseSchema,
  type CompleteSourceUploadResponse,
  type CreateSourceUploadSessionInput,
  type SourceDocumentStatusResponse,
  type UploadSessionResponse,
} from "@avlp/schemas";
import {
  storageKeySchema,
  storageKeys,
  type ObjectStorage,
  type StorageObjectMetadata,
  StorageObjectNotFoundError,
} from "@avlp/storage";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

const uploadSessionTtlMs = 5 * 60 * 1_000;

type PendingSession = {
  id: Identifier;
  documentId: Identifier;
  projectId: Identifier;
  ownerUserId: Identifier;
  originalName: string;
  mediaType: z.infer<typeof sourceDocumentMediaTypeSchema>;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  expiresAt: Date;
  completedAt: Date | null;
  duplicateDetected: boolean;
};

function publicValidationError(field: string, message: string): PublicError {
  return new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    {
      [field]: message,
    },
  );
}

function extensionFor(input: CreateSourceUploadSessionInput): "pdf" | "docx" {
  const extension = input.fileName.split(".").at(-1)?.toLowerCase();
  if (input.mediaType === "application/pdf" && extension === "pdf")
    return "pdf";
  if (
    input.mediaType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
    extension === "docx"
  )
    return "docx";
  throw publicValidationError(
    "fileName",
    "The file extension must match the declared PDF or DOCX type.",
  );
}

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}

export interface SourceUploadRepository {
  createSession(input: PendingSession): Promise<void>;
  findSession(
    ownerUserId: Identifier,
    projectId: Identifier,
    sessionId: Identifier,
  ): Promise<PendingSession>;
  completeSession(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sessionId: Identifier;
    correlationId: Identifier;
  }): Promise<CompleteSourceUploadResponse>;
  getStatus(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceDocumentStatusResponse | null>;
}

export class SourceUploadService {
  public constructor(
    private readonly repository: SourceUploadRepository,
    private readonly storage: ObjectStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly maxUploadBytes = 25 * 1024 * 1024,
  ) {}

  public async create(
    ownerUserId: Identifier,
    projectId: Identifier,
    input: unknown,
  ): Promise<UploadSessionResponse> {
    const request = parseBoundary(createSourceUploadSessionInputSchema, input);
    if (request.sizeBytes > this.maxUploadBytes)
      throw publicValidationError(
        "sizeBytes",
        "The file exceeds the configured upload size limit.",
      );
    const extension = extensionFor(request);
    const timestamp = this.now();
    const documentId = createId(timestamp);
    const sessionId = createId(timestamp);
    const storageKey = storageKeys.sourceOriginal({
      userId: ownerUserId,
      projectId,
      documentId,
      extension,
    });
    const signed = await this.storage.createSignedUpload({
      key: storageKey,
      contentType: request.mediaType,
      contentLength: request.sizeBytes,
      checksumSha256: request.sha256,
      expiresInSeconds: Math.floor(uploadSessionTtlMs / 1_000),
      metadata: { "upload-session-id": sessionId },
    });
    await this.repository.createSession({
      id: sessionId,
      documentId,
      projectId,
      ownerUserId,
      originalName: request.fileName,
      mediaType: request.mediaType,
      sizeBytes: request.sizeBytes,
      sha256: request.sha256,
      storageKey,
      expiresAt: signed.expiresAt,
      completedAt: null,
      duplicateDetected: false,
    });
    return uploadSessionResponseSchema.parse({
      sessionId,
      documentId,
      uploadUrl: signed.url,
      method: signed.method,
      requiredHeaders: signed.requiredHeaders,
      expiresAt: serializeUtcTimestamp(signed.expiresAt),
    });
  }

  public async complete(
    ownerUserId: Identifier,
    projectId: Identifier,
    sessionId: Identifier,
    input: unknown,
    correlationId: Identifier,
  ): Promise<CompleteSourceUploadResponse> {
    parseBoundary(completeSourceUploadInputSchema, input);
    const session = await this.repository.findSession(
      ownerUserId,
      projectId,
      sessionId,
    );
    if (session.completedAt !== null)
      return this.repository.completeSession({
        ownerUserId,
        projectId,
        sessionId,
        correlationId,
      });
    if (session.expiresAt <= this.now())
      throw new PublicError(
        "validation_failed",
        "This upload session has expired. Start a new upload.",
        400,
      );
    let metadata: StorageObjectMetadata;
    try {
      metadata = await this.storage.getMetadata(
        storageKeySchema.parse(session.storageKey),
      );
    } catch (error) {
      if (!(error instanceof StorageObjectNotFoundError)) throw error;
      throw new PublicError(
        "validation_failed",
        "The uploaded file could not be found. Retry the upload.",
        400,
      );
    }
    if (
      metadata.sizeBytes !== session.sizeBytes ||
      metadata.contentType?.toLowerCase() !== session.mediaType ||
      metadata.checksumSha256 !== session.sha256
    )
      throw new PublicError(
        "validation_failed",
        "The uploaded file does not match the requested metadata. Retry the upload.",
        400,
      );
    return this.repository.completeSession({
      ownerUserId,
      projectId,
      sessionId,
      correlationId,
    });
  }

  public async status(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceDocumentStatusResponse | null> {
    return this.repository.getStatus(ownerUserId, projectId);
  }
}

export class PostgresSourceUploadRepository implements SourceUploadRepository {
  public constructor(
    private readonly executor: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async createSession(input: PendingSession): Promise<void> {
    await this.executor.transaction(async (transaction) => {
      const [project] = await transaction
        .select({ id: projects.id, stage: projects.stage })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.ownerUserId, input.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (project === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      const [existing] = await transaction
        .select({ id: sourceDocuments.id, sha256: sourceDocuments.sha256 })
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.projectId, input.projectId),
            eq(sourceDocuments.ownerUserId, input.ownerUserId),
            inArray(sourceDocuments.status, [
              "pending_validation",
              "validating",
              "active",
            ]),
          ),
        )
        .limit(1);
      if (existing !== undefined && existing.sha256 === input.sha256)
        throw new PublicError(
          "validation_failed",
          "This exact source document is already attached to this project.",
          409,
          false,
          { sha256: "duplicate_source" },
        );
      if (existing !== undefined)
        throw new PublicError(
          "validation_failed",
          "This project already has a source document being processed.",
          409,
        );
      await transaction.insert(uploadSessions).values({
        id: input.id,
        documentId: input.documentId,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        originalName: input.originalName,
        expectedMediaType: input.mediaType,
        expectedSizeBytes: input.sizeBytes,
        expectedSha256: input.sha256,
        storageKey: input.storageKey,
        expiresAt: input.expiresAt,
      });
      if (project.stage === "draft")
        await transaction
          .update(projects)
          .set({
            stage: "uploading",
            updatedAt: this.now(),
            revision: sql`${projects.revision} + 1`,
          })
          .where(
            and(
              eq(projects.id, input.projectId),
              eq(projects.ownerUserId, input.ownerUserId),
            ),
          );
    });
  }

  public async findSession(
    ownerUserId: Identifier,
    projectId: Identifier,
    sessionId: Identifier,
  ): Promise<PendingSession> {
    const [session] = await this.executor
      .select()
      .from(uploadSessions)
      .where(
        and(
          eq(uploadSessions.id, sessionId),
          eq(uploadSessions.ownerUserId, ownerUserId),
          eq(uploadSessions.projectId, projectId),
        ),
      )
      .limit(1);
    if (session === undefined)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return toPendingSession(session);
  }

  public async completeSession(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sessionId: Identifier;
    correlationId: Identifier;
  }): Promise<CompleteSourceUploadResponse> {
    const timestamp = this.now();
    return this.executor.transaction(async (transaction) => {
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.ownerUserId, input.ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1)
        .for("update");
      if (project === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      const [session] = await transaction
        .select()
        .from(uploadSessions)
        .where(
          and(
            eq(uploadSessions.id, input.sessionId),
            eq(uploadSessions.ownerUserId, input.ownerUserId),
            eq(uploadSessions.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (session === undefined)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      if (session.completedAt !== null)
        return completeSourceUploadResponseSchema.parse({
          documentId: session.documentId,
          status: "pending_validation",
          ingestionRequested: false,
          duplicateDetected: session.duplicateDetected,
        });
      const [duplicate] = await transaction
        .select({ id: sourceDocuments.id })
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.ownerUserId, session.ownerUserId),
            eq(sourceDocuments.sha256, session.expectedSha256),
            ne(sourceDocuments.id, session.documentId),
          ),
        )
        .limit(1);
      const [created] = await transaction
        .insert(sourceDocuments)
        .values({
          id: session.documentId,
          projectId: session.projectId,
          ownerUserId: session.ownerUserId,
          originalName: session.originalName,
          mediaType: session.expectedMediaType,
          sizeBytes: session.expectedSizeBytes,
          sha256: session.expectedSha256,
          storageKey: session.storageKey,
          status: "pending_validation",
          scanStatus: "pending",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({ id: sourceDocuments.id });
      if (created === undefined) {
        const [active] = await transaction
          .select({ id: sourceDocuments.id })
          .from(sourceDocuments)
          .where(
            and(
              eq(sourceDocuments.projectId, session.projectId),
              eq(sourceDocuments.ownerUserId, session.ownerUserId),
              eq(sourceDocuments.status, "active"),
            ),
          )
          .limit(1);
        if (active?.id !== session.documentId)
          throw new PublicError(
            "validation_failed",
            "This project already has an active source document.",
            409,
          );
      }
      const payload = documentValidationJobPayloadSchema.parse({
        schemaVersion: 1,
        sourceDocumentId: session.documentId,
      });
      const envelope = createJobEnvelope(documentValidationJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "document.validation",
        projectId: session.projectId as Identifier,
        ownerUserId: session.ownerUserId as Identifier,
        inputVersion: `source-document:${session.documentId}`,
        idempotencyKey: createIdempotencyKey({
          jobType: "document.validation",
          projectId: session.projectId,
          inputVersion: `source-document:${session.documentId}`,
          options: {},
        }),
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
        requestedAt: timestamp,
      });
      await transaction.insert(jobs).values({
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
      });
      await transaction.insert(outboxEvents).values({
        id: createId(timestamp),
        jobId: envelope.jobId,
        eventType: "document.validation.requested.v1",
        queueName: "pipeline",
        envelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
      });
      await transaction
        .update(uploadSessions)
        .set({
          completedAt: timestamp,
          duplicateDetected: duplicate !== undefined,
          updatedAt: timestamp,
        })
        .where(eq(uploadSessions.id, session.id));
      await transaction
        .update(projects)
        .set({
          stage: "validating_source",
          updatedAt: timestamp,
          revision: sql`${projects.revision} + 1`,
        })
        .where(
          and(
            eq(projects.id, session.projectId),
            eq(projects.ownerUserId, session.ownerUserId),
          ),
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: session.ownerUserId as Identifier,
        projectId: session.projectId as Identifier,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "document.validation_requested",
        target: { type: "source_document", id: session.documentId },
        correlationId: input.correlationId,
        metadata: {
          mediaType: session.expectedMediaType,
          sizeBytes: session.expectedSizeBytes,
        },
        occurredAt: timestamp,
      });
      return completeSourceUploadResponseSchema.parse({
        documentId: session.documentId,
        status: "pending_validation",
        ingestionRequested: false,
        duplicateDetected: duplicate !== undefined,
      });
    });
  }

  public async getStatus(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<SourceDocumentStatusResponse | null> {
    const [document] = await this.executor
      .select({
        id: sourceDocuments.id,
        status: sourceDocuments.status,
        validationCode: sourceDocuments.validationCode,
        pageCount: sourceDocuments.pageCount,
        validationWarnings: sourceDocuments.validationWarnings,
        reuseId: sourceDocumentIngestionReuses.id,
      })
      .from(sourceDocuments)
      .leftJoin(
        sourceDocumentIngestionReuses,
        and(
          eq(
            sourceDocumentIngestionReuses.sourceDocumentId,
            sourceDocuments.id,
          ),
          eq(
            sourceDocumentIngestionReuses.projectId,
            sourceDocuments.projectId,
          ),
          eq(
            sourceDocumentIngestionReuses.ownerUserId,
            sourceDocuments.ownerUserId,
          ),
        ),
      )
      .where(
        and(
          eq(sourceDocuments.ownerUserId, ownerUserId),
          eq(sourceDocuments.projectId, projectId),
        ),
      )
      .orderBy(desc(sourceDocuments.createdAt))
      .limit(1);
    if (document === undefined) return null;
    return sourceDocumentStatusResponseSchema.parse({
      documentId: document.id,
      validation: {
        status: document.status,
        code: document.validationCode,
        pageCount: document.pageCount,
        warnings: document.validationWarnings,
      },
      reuse: { status: document.reuseId === null ? "not_reused" : "reused" },
    });
  }
}

function toPendingSession(
  session: typeof uploadSessions.$inferSelect,
): PendingSession {
  return {
    id: session.id as Identifier,
    documentId: session.documentId as Identifier,
    projectId: session.projectId as Identifier,
    ownerUserId: session.ownerUserId as Identifier,
    originalName: session.originalName,
    mediaType: sourceDocumentMediaTypeSchema.parse(session.expectedMediaType),
    sizeBytes: session.expectedSizeBytes,
    sha256: session.expectedSha256,
    storageKey: session.storageKey,
    expiresAt: session.expiresAt,
    completedAt: session.completedAt,
    duplicateDetected: session.duplicateDetected,
  };
}
