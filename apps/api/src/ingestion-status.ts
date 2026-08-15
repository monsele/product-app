import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  ingestionQualityReports,
  jobs,
  outboxEvents,
  parsedDocuments,
  projects,
  sourceDocuments,
  type DatabaseClient,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  currentIngestionCompatibility,
  documentIngestionJobPayloadSchema,
  ingestionRetryInputSchema,
  projectIngestionStatusResponseSchema,
  type IngestionRetryResponse,
  type ProjectIngestionStatusResponse,
} from "@avlp/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    {
      ...Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join(".") || "root",
          issue.message,
        ]),
      ),
    },
  );
}

export interface IngestionStatusService {
  status(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectIngestionStatusResponse>;
  retry(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<IngestionRetryResponse>;
}

export class PostgresIngestionStatusService implements IngestionStatusService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async status(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<ProjectIngestionStatusResponse> {
    const [report] = await this.database
      .select({
        score: ingestionQualityReports.score,
        status: ingestionQualityReports.status,
        findings: ingestionQualityReports.findings,
      })
      .from(parsedDocuments)
      .innerJoin(
        ingestionQualityReports,
        eq(ingestionQualityReports.parsedDocumentId, parsedDocuments.id),
      )
      .where(
        and(
          eq(parsedDocuments.ownerUserId, ownerUserId),
          eq(parsedDocuments.projectId, projectId),
        ),
      )
      .orderBy(desc(parsedDocuments.createdAt))
      .limit(1);
    const [job] = await this.database
      .select({
        id: jobs.id,
        state: jobs.state,
        progress: jobs.progress,
        errorMetadata: jobs.errorMetadata,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerUserId, ownerUserId),
          eq(jobs.projectId, projectId),
          eq(jobs.jobType, "document.ingestion"),
        ),
      )
      .orderBy(desc(jobs.createdAt))
      .limit(1);
    const errorCode =
      job?.errorMetadata !== null &&
      typeof job?.errorMetadata === "object" &&
      job.errorMetadata !== null &&
      "code" in job.errorMetadata &&
      typeof job.errorMetadata.code === "string"
        ? job.errorMetadata.code
        : null;
    // A failed parse has no normalized document to attach a quality report to;
    // the durable job failure is surfaced as the blocking parser finding.
    const quality =
      report === undefined && job?.state === "failed"
        ? {
            score: 0,
            status: "blocked" as const,
            findings: [
              {
                code: "parser_failure" as const,
                severity: "blocking" as const,
                message:
                  "The document could not be parsed. Retry with the available parser configuration.",
                pageStart: 1,
                pageEnd: 1,
              },
            ],
          }
        : report === undefined
          ? null
          : {
              score: report.score,
              status: report.status,
              findings: report.findings,
            };
    return projectIngestionStatusResponseSchema.parse({
      quality,
      latestJob:
        job === undefined
          ? null
          : {
              id: job.id,
              state: job.state,
              progress: job.progress,
              errorCode,
              updatedAt: serializeUtcTimestamp(job.updatedAt),
            },
      canProceed: quality !== null && quality.status !== "blocked",
    });
  }

  public async retry(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    idempotencyKey: string | undefined;
    correlationId: Identifier;
  }): Promise<IngestionRetryResponse> {
    const retry = parseBoundary(ingestionRetryInputSchema, input.body);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to retry ingestion.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const timestamp = this.now();
    return this.database.transaction(async (transaction) => {
      const [document] = await transaction
        .select({ id: sourceDocuments.id, sha256: sourceDocuments.sha256 })
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.ownerUserId, input.ownerUserId),
            eq(sourceDocuments.projectId, input.projectId),
            eq(sourceDocuments.status, "active"),
            eq(sourceDocuments.scanStatus, "safe"),
          ),
        )
        .orderBy(desc(sourceDocuments.createdAt))
        .limit(1)
        .for("update");
      if (document === undefined)
        throw new PublicError(
          "validation_failed",
          "A validated document is required before retrying ingestion.",
          409,
        );
      const payload = documentIngestionJobPayloadSchema.parse({
        schemaVersion: 1,
        sourceDocumentId: document.id,
        parserVersion: currentIngestionCompatibility.parserVersion,
        configurationVersion: retry.configurationVersion,
      });
      const inputVersion = `source-document:${document.id}:sha256:${document.sha256}:config:${retry.configurationVersion}`;
      const envelope = createJobEnvelope(documentIngestionJobPayloadSchema, {
        jobId: createId(timestamp),
        jobType: "document.ingestion",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: "document.ingestion.retry",
          projectId: input.projectId,
          inputVersion,
          options: {
            requestKey: idempotencyKey,
            parserVersion: payload.parserVersion,
          },
        }),
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
        requestedAt: timestamp,
      });
      const [created] = await transaction
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
        .onConflictDoNothing()
        .returning({ id: jobs.id });
      const jobId =
        created?.id ??
        (
          await transaction
            .select({ id: jobs.id })
            .from(jobs)
            .where(
              and(
                eq(jobs.ownerUserId, input.ownerUserId),
                eq(jobs.projectId, input.projectId),
                eq(jobs.idempotencyKey, envelope.idempotencyKey),
              ),
            )
            .limit(1)
        )[0]?.id;
      if (jobId === undefined)
        throw new Error("The idempotent retry job could not be read.");
      if (created !== undefined) {
        await transaction.insert(outboxEvents).values({
          id: createId(timestamp),
          jobId,
          eventType: "document.ingestion.retry_requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
        });
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
              eq(projects.id, input.projectId),
              eq(projects.ownerUserId, input.ownerUserId),
            ),
          );
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "document.ingestion_retry_requested",
          target: { type: "source_document", id: document.id },
          correlationId: input.correlationId,
          metadata: { configurationVersion: retry.configurationVersion, jobId },
          occurredAt: timestamp,
        });
      }
      return { jobId, status: "queued" };
    });
  }
}
