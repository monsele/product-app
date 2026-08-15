import { createId, type Identifier } from "@avlp/config";
import {
  projects,
  contentBlocks,
  parsedDocuments,
  parsedSections,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  type DatabaseClient,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { PostgresAuditWriter, PostgresUsageMeter } from "@avlp/observability";
import {
  currentIngestionCompatibility,
  doclingIngestionRequestSchema,
  documentIngestionJobPayloadSchema,
  parseNormalizedDocument,
  type DoclingIngestionResult,
  type NormalizedDocument,
} from "@avlp/schemas";
import {
  storageKeys,
  type ObjectStorage,
  type StorageKey,
} from "@avlp/storage";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  DoclingIngestionError,
  type DoclingIngestionClient,
} from "./docling-ingestion-client.js";
import {
  doclingNormalizerVersion,
  normalizeDoclingOutput,
} from "./docling-normalizer.js";

export const documentIngestionJobType = "document.ingestion";
export const documentIngestionPayloadVersion = 1;

type IngestionArtifact = {
  id: Identifier;
  state: "staging" | "ready";
  parserVersion: string;
  configurationHash: string;
  processingTimeMs: number;
  warnings: readonly string[];
};

export type DocumentIngestionJobHandlerOptions = {
  database: DatabaseClient;
  storage: Pick<
    ObjectStorage,
    "copy" | "createSignedDownload" | "delete" | "getBytes" | "putBytes"
  >;
  client: DoclingIngestionClient;
  now?: () => Date;
};

function artifactKeys(
  ownerUserId: Identifier,
  projectId: Identifier,
  artifactId: Identifier,
) {
  const scope = { userId: ownerUserId, projectId, versionId: artifactId };
  return {
    canonical: storageKeys.parsedDocling(scope),
    markdown: storageKeys.parsedMarkdown(scope),
    stagingCanonical: storageKeys.parsedStagingDocling(scope),
    stagingMarkdown: storageKeys.parsedStagingMarkdown(scope),
    normalized: storageKeys.parsedNormalized(scope),
    stagingNormalized: storageKeys.parsedStagingNormalized(scope),
  } as {
    canonical: StorageKey;
    markdown: StorageKey;
    normalized: StorageKey;
    stagingCanonical: StorageKey;
    stagingMarkdown: StorageKey;
    stagingNormalized: StorageKey;
  };
}

function usageIdempotencyKey(context: {
  jobId: Identifier;
  attempt: number;
}): string {
  return `document-ingestion:${context.jobId}:attempt:${context.attempt}`;
}

async function recordFailedUsage(
  database: DatabaseClient,
  context: {
    jobId: Identifier;
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
    attempt: number;
  },
  code: string,
): Promise<void> {
  await new PostgresUsageMeter(database).record({
    ownerUserId: context.ownerUserId,
    projectId: context.projectId,
    operationType: "document.ingestion",
    idempotencyKey: usageIdempotencyKey(context),
    provider: "docling",
    model: currentIngestionCompatibility.parserVersion,
    unit: "document",
    quantity: 1,
    estimatedCostUsd: 0,
    retryCount: Math.max(0, context.attempt - 1),
    status: "failed",
    correlationId: context.correlationId,
    metadata: { code },
  });
}

function toArtifact(
  result: DoclingIngestionResult,
  id: Identifier,
): IngestionArtifact {
  return {
    id,
    state: "staging",
    parserVersion: result.parserVersion,
    configurationHash: result.configurationHash,
    processingTimeMs: result.processingTimeMs,
    warnings: result.warnings,
  };
}

function storedWarnings(value: unknown): readonly string[] {
  if (
    Array.isArray(value) &&
    value.every((warning) => typeof warning === "string")
  )
    return value;
  throw new JobExecutionError(
    "terminal",
    "INGESTION_ARTIFACT_METADATA_INVALID",
    "The staged parser metadata is invalid.",
  );
}

async function loadStagedNormalizedDocument(
  storage: Pick<ObjectStorage, "getBytes">,
  key: StorageKey,
): Promise<NormalizedDocument> {
  try {
    const result = await storage.getBytes(key, 25 * 1024 * 1024);
    return parseNormalizedDocument(
      JSON.parse(new TextDecoder().decode(result.body)),
    );
  } catch {
    throw new JobExecutionError(
      "terminal",
      "SCHEMA_NORMALIZATION_DEFECT",
      "The parser result could not be normalized.",
    );
  }
}

export function createDocumentIngestionJobHandler(
  options: DocumentIngestionJobHandlerOptions,
): RegisteredJobHandler {
  const now = options.now ?? (() => new Date());
  return defineJobHandler(
    documentIngestionJobType,
    documentIngestionPayloadVersion,
    documentIngestionJobPayloadSchema,
    async (payload, context): Promise<JobMetadata> => {
      const [document] = await options.database
        .select()
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.id, payload.sourceDocumentId),
            eq(sourceDocuments.projectId, context.projectId),
            eq(sourceDocuments.ownerUserId, context.ownerUserId),
            eq(sourceDocuments.status, "active"),
            eq(sourceDocuments.scanStatus, "safe"),
          ),
        )
        .limit(1);
      if (document === undefined)
        throw new JobExecutionError(
          "terminal",
          "INGESTION_SOURCE_NOT_AVAILABLE",
          "The validated source document is no longer available.",
        );

      const findExisting = async (): Promise<IngestionArtifact | undefined> => {
        const [existing] = await options.database
          .select({
            id: sourceDocumentIngestionArtifacts.id,
            state: sourceDocumentIngestionArtifacts.state,
            parserVersion: sourceDocumentIngestionArtifacts.parserVersion,
            configurationHash:
              sourceDocumentIngestionArtifacts.configurationHash,
            processingTimeMs: sourceDocumentIngestionArtifacts.processingTimeMs,
            warnings: sourceDocumentIngestionArtifacts.warnings,
          })
          .from(sourceDocumentIngestionArtifacts)
          .where(
            and(
              eq(
                sourceDocumentIngestionArtifacts.sourceDocumentId,
                document.id,
              ),
              eq(
                sourceDocumentIngestionArtifacts.parserVersion,
                currentIngestionCompatibility.parserVersion,
              ),
              eq(
                sourceDocumentIngestionArtifacts.normalizedSchemaVersion,
                currentIngestionCompatibility.normalizedSchemaVersion,
              ),
            ),
          )
          .limit(1);
        if (existing === undefined) return undefined;
        return {
          id: existing.id,
          state: existing.state,
          parserVersion: existing.parserVersion,
          configurationHash: existing.configurationHash,
          processingTimeMs: existing.processingTimeMs,
          warnings: storedWarnings(existing.warnings),
        };
      };

      let artifact = await findExisting();
      if (artifact?.state === "ready")
        return { ingestion: "already_completed" };

      if (artifact === undefined) {
        await context.reportProgress(0.1);
        const download = await options.storage.createSignedDownload({
          key: document.storageKey,
          expiresInSeconds: 900,
        });
        let parsed: DoclingIngestionResult;
        try {
          parsed = await options.client.ingest(
            doclingIngestionRequestSchema.parse({
              schemaVersion: 1,
              jobId: context.jobId,
              sourceDocumentId: document.id,
              sourceDownloadUrl: download.url,
              mediaType: document.mediaType,
              parserVersion: currentIngestionCompatibility.parserVersion,
              correlationId: context.correlationId,
            }),
          );
        } catch (error) {
          const code =
            error instanceof DoclingIngestionError
              ? error.code
              : "TEMPORARY_INFRASTRUCTURE";
          await recordFailedUsage(options.database, context, code).catch(
            () => undefined,
          );
          if (error instanceof DoclingIngestionError)
            throw new JobExecutionError(
              error.classification,
              error.code,
              "The document could not be parsed.",
            );
          throw new JobExecutionError(
            "retryable",
            "TEMPORARY_INFRASTRUCTURE",
            "The ingestion service is temporarily unavailable.",
          );
        }
        if (
          parsed.parserVersion !== currentIngestionCompatibility.parserVersion
        )
          throw new JobExecutionError(
            "terminal",
            "PARSER_RESULT_VERSION_MISMATCH",
            "The parser returned an incompatible result version.",
          );
        await context.heartbeat();
        await context.reportProgress(0.65);

        const candidate = toArtifact(parsed, createId(now()));
        const keys = artifactKeys(
          context.ownerUserId,
          context.projectId,
          candidate.id,
        );
        try {
          await options.storage.putBytes({
            key: keys.stagingCanonical,
            body: new TextEncoder().encode(
              JSON.stringify(parsed.canonicalJson),
            ),
            contentType: "application/json",
            metadata: {
              "parser-version": parsed.parserVersion,
              "configuration-hash": parsed.configurationHash,
            },
          });
          await options.storage.putBytes({
            key: keys.stagingMarkdown,
            body: new TextEncoder().encode(parsed.markdown),
            contentType: "text/markdown; charset=utf-8",
            metadata: { "parser-version": parsed.parserVersion },
          });
        } catch {
          await Promise.allSettled([
            options.storage.delete(keys.stagingCanonical),
            options.storage.delete(keys.stagingMarkdown),
          ]);
          throw new JobExecutionError(
            "retryable",
            "INGESTION_ARTIFACT_WRITE_FAILED",
            "The parsed document could not be stored.",
          );
        }
        const timestamp = now();
        const [created] = await options.database
          .insert(sourceDocumentIngestionArtifacts)
          .values({
            id: candidate.id,
            projectId: context.projectId,
            ownerUserId: context.ownerUserId,
            sourceDocumentId: document.id,
            parserVersion: candidate.parserVersion,
            normalizedSchemaVersion:
              currentIngestionCompatibility.normalizedSchemaVersion,
            canonicalStorageKey: keys.canonical,
            markdownStorageKey: keys.markdown,
            configurationHash: candidate.configurationHash,
            processingTimeMs: candidate.processingTimeMs,
            warnings: [...candidate.warnings],
            state: "staging",
            normalizedStorageKey: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .onConflictDoNothing()
          .returning({ id: sourceDocumentIngestionArtifacts.id });
        if (created === undefined) {
          await Promise.allSettled([
            options.storage.delete(keys.stagingCanonical),
            options.storage.delete(keys.stagingMarkdown),
          ]);
          artifact = await findExisting();
          if (artifact === undefined)
            throw new JobExecutionError(
              "retryable",
              "INGESTION_ARTIFACT_CONCURRENT_WRITE",
              "The document ingestion result is being finalized.",
            );
          if (artifact.state === "ready")
            return { ingestion: "already_completed" };
        } else {
          artifact = candidate;
          let normalized: NormalizedDocument;
          try {
            normalized = normalizeDoclingOutput({
              artifactId: candidate.id,
              sourceDocumentId: document.id,
              pageCount: document.pageCount ?? 1,
              canonicalJson: parsed.canonicalJson,
            });
          } catch {
            // The staged canonical result and its DB record remain immutable for diagnosis.
            await recordFailedUsage(
              options.database,
              context,
              "SCHEMA_NORMALIZATION_DEFECT",
            ).catch(() => undefined);
            throw new JobExecutionError(
              "terminal",
              "SCHEMA_NORMALIZATION_DEFECT",
              "The parser result could not be normalized.",
            );
          }
          try {
            await options.storage.putBytes({
              key: keys.stagingNormalized,
              body: new TextEncoder().encode(JSON.stringify(normalized)),
              contentType: "application/json",
              metadata: {
                "adapter-version": doclingNormalizerVersion,
                "schema-version": normalized.schemaVersion,
              },
            });
          } catch {
            throw new JobExecutionError(
              "retryable",
              "INGESTION_ARTIFACT_WRITE_FAILED",
              "The normalized document could not be stored.",
            );
          }
        }
      }

      const keys = artifactKeys(
        context.ownerUserId,
        context.projectId,
        artifact.id,
      );
      const normalized = await loadStagedNormalizedDocument(
        options.storage,
        keys.stagingNormalized,
      );
      try {
        await options.storage.copy({
          sourceKey: keys.stagingCanonical,
          destinationKey: keys.canonical,
        });
        await options.storage.copy({
          sourceKey: keys.stagingMarkdown,
          destinationKey: keys.markdown,
        });
        await options.storage.copy({
          sourceKey: keys.stagingNormalized,
          destinationKey: keys.normalized,
        });
      } catch {
        throw new JobExecutionError(
          "retryable",
          "INGESTION_ARTIFACT_PROMOTION_FAILED",
          "The parsed document could not be finalized.",
        );
      }

      const timestamp = now();
      let finalized: boolean;
      try {
        finalized = await options.database.transaction(async (transaction) => {
          const [activeDocument] = await transaction
            .select({ id: sourceDocuments.id })
            .from(sourceDocuments)
            .where(
              and(
                eq(sourceDocuments.id, document.id),
                eq(sourceDocuments.projectId, context.projectId),
                eq(sourceDocuments.ownerUserId, context.ownerUserId),
                eq(sourceDocuments.status, "active"),
                eq(sourceDocuments.scanStatus, "safe"),
              ),
            )
            .limit(1);
          if (activeDocument === undefined)
            throw new JobExecutionError(
              "cancelled",
              "INGESTION_SOURCE_NO_LONGER_ACTIVE",
              "The source document is no longer available.",
            );
          await transaction
            .insert(parsedDocuments)
            .values({
              id: normalized.id,
              projectId: context.projectId,
              ownerUserId: context.ownerUserId,
              ingestionArtifactId: artifact.id,
              sourceDocumentId: document.id,
              version: normalized.parsedDocumentVersion,
              schemaVersion: normalized.schemaVersion,
              parserVersion: artifact.parserVersion,
              adapterVersion: doclingNormalizerVersion,
              normalizedStorageKey: keys.normalized,
              title: normalized.title ?? null,
              language: normalized.language,
              pageCount: normalized.pageCount,
              createdAt: timestamp,
              updatedAt: timestamp,
            })
            .onConflictDoNothing();
          await transaction
            .insert(parsedSections)
            .values(
              normalized.sections.map((section) => ({
                id: section.id,
                parsedDocumentId: normalized.id,
                parentSectionId: section.parentSectionId ?? null,
                order: section.order,
                level: section.level,
                heading: section.heading,
                pageStart: section.pageStart,
                pageEnd: section.pageEnd ?? section.pageStart,
                createdAt: timestamp,
                updatedAt: timestamp,
              })),
            )
            .onConflictDoNothing();
          await transaction
            .insert(contentBlocks)
            .values(
              normalized.blocks.map((block) => ({
                id: block.id,
                parsedDocumentId: normalized.id,
                sectionId: block.sectionId,
                kind: block.kind,
                order: block.order,
                pageStart: block.pageStart,
                pageEnd: block.pageEnd ?? block.pageStart,
                boundingBox: block.boundingBox ?? null,
                content: block,
                createdAt: timestamp,
                updatedAt: timestamp,
              })),
            )
            .onConflictDoNothing();
          const [updated] = await transaction
            .update(sourceDocumentIngestionArtifacts)
            .set({
              state: "ready",
              normalizedStorageKey: keys.normalized,
              updatedAt: timestamp,
            })
            .where(
              and(
                eq(sourceDocumentIngestionArtifacts.id, artifact.id),
                eq(
                  sourceDocumentIngestionArtifacts.projectId,
                  context.projectId,
                ),
                eq(
                  sourceDocumentIngestionArtifacts.ownerUserId,
                  context.ownerUserId,
                ),
                eq(sourceDocumentIngestionArtifacts.state, "staging"),
              ),
            )
            .returning({ id: sourceDocumentIngestionArtifacts.id });
          if (updated === undefined) return false;
          const [updatedProject] = await transaction
            .update(projects)
            .set({
              stage: "ingestion_review",
              latestFailedOperation: null,
              revision: sql`${projects.revision} + 1`,
              updatedAt: timestamp,
            })
            .where(
              and(
                eq(projects.id, context.projectId),
                eq(projects.ownerUserId, context.ownerUserId),
                isNull(projects.deletedAt),
              ),
            )
            .returning({ id: projects.id });
          if (updatedProject === undefined)
            throw new JobExecutionError(
              "cancelled",
              "INGESTION_PROJECT_NO_LONGER_ACTIVE",
              "The project is no longer available.",
            );
          await new PostgresAuditWriter(transaction).write({
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            actor: { type: "system" },
            eventType: "document.ingestion_completed",
            target: { type: "source_document", id: document.id },
            correlationId: context.correlationId,
            metadata: {
              parserVersion: artifact.parserVersion,
              configurationHash: artifact.configurationHash,
              processingTimeMs: artifact.processingTimeMs,
              warningCount: artifact.warnings.length,
            },
            occurredAt: timestamp,
          });
          await new PostgresUsageMeter(transaction).record({
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            operationType: "document.ingestion",
            idempotencyKey: usageIdempotencyKey(context),
            provider: "docling",
            model: artifact.parserVersion,
            unit: "document",
            quantity: 1,
            estimatedCostUsd: 0,
            latencyMs: artifact.processingTimeMs,
            retryCount: Math.max(0, context.attempt - 1),
            status: "succeeded",
            correlationId: context.correlationId,
            metadata: {
              configurationHash: artifact.configurationHash,
              warningCount: artifact.warnings.length,
            },
            occurredAt: timestamp,
          });
          return true;
        });
      } catch (error) {
        if (
          error instanceof JobExecutionError &&
          error.classification === "cancelled"
        )
          await Promise.allSettled([
            options.storage.delete(keys.canonical),
            options.storage.delete(keys.markdown),
            options.storage.delete(keys.normalized),
            options.storage.delete(keys.stagingCanonical),
            options.storage.delete(keys.stagingMarkdown),
            options.storage.delete(keys.stagingNormalized),
          ]);
        throw error;
      }
      if (!finalized) return { ingestion: "already_completed" };
      await Promise.allSettled([
        options.storage.delete(keys.stagingCanonical),
        options.storage.delete(keys.stagingMarkdown),
        options.storage.delete(keys.stagingNormalized),
      ]);
      await context.reportProgress(0.95);
      return {
        ingestion: "completed",
        artifactId: artifact.id,
        parserVersion: artifact.parserVersion,
        configurationHash: artifact.configurationHash,
        processingTimeMs: artifact.processingTimeMs,
        warningCount: artifact.warnings.length,
      };
    },
    { leaseDurationMs: 15 * 60_000, maxAttempts: 3, retryDelayMs: 30_000 },
  );
}
