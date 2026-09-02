import { createHash } from "node:crypto";
import { createId, type Identifier } from "@avlp/config";
import {
  projects,
  contentBlocks,
  extractedFigures,
  ingestionWarnings,
  ingestionQualityReports,
  parsedDocuments,
  parsedSections,
  parsedTableCells,
  parsedTables,
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
  extractDoclingFigureAssets,
  normalizeDoclingOutput,
} from "./docling-normalizer.js";
import { assessIngestionQuality } from "./ingestion-quality.js";

export const documentIngestionJobType = "document.ingestion";
export const documentIngestionPayloadVersion = 1;

type IngestionArtifact = {
  id: Identifier;
  state: "staging" | "ready";
  parserVersion: string;
  configurationHash: string;
  requestedConfigurationVersion: string;
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

function deterministicId(seed: string): Identifier {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-${((Number.parseInt(hex[16]!, 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}` as Identifier;
}

/** A stable, collision-resistant positive 32-bit integer required by PostgreSQL int4. */
function parsedDocumentVersionForArtifact(artifactId: Identifier): number {
  return (
    (Number.parseInt(artifactId.replaceAll("-", "").slice(-7), 16) %
      2_000_000_000) +
    1
  );
}

function imageExtension(contentType: string): "gif" | "jpeg" | "png" | "webp" {
  switch (contentType) {
    case "image/gif":
      return "gif";
    case "image/jpeg":
      return "jpeg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      throw new Error("Unsupported normalized figure content type.");
  }
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
  parserVersion: string,
): Promise<void> {
  await new PostgresUsageMeter(database).record({
    ownerUserId: context.ownerUserId,
    projectId: context.projectId,
    operationType: "document.ingestion",
    idempotencyKey: usageIdempotencyKey(context),
    provider: "docling",
    model: parserVersion,
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
    requestedConfigurationVersion: "default",
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

async function restageFigureAssets(input: {
  storage: Pick<ObjectStorage, "getBytes" | "putBytes">;
  canonicalKey: StorageKey;
  normalized: NormalizedDocument;
  ownerUserId: Identifier;
  projectId: Identifier;
  artifactId: Identifier;
  parserVersion: string;
}): Promise<void> {
  let canonicalJson: unknown;
  try {
    const canonical = await input.storage.getBytes(
      input.canonicalKey,
      25 * 1024 * 1024,
    );
    canonicalJson = JSON.parse(new TextDecoder().decode(canonical.body));
  } catch {
    throw new JobExecutionError(
      "retryable",
      "INGESTION_ARTIFACT_WRITE_FAILED",
      "The staged figure media could not be recovered.",
    );
  }
  const assets = extractDoclingFigureAssets({
    artifactId: input.artifactId,
    canonicalJson,
  }).assets;
  const assetsByFigureId = new Map(
    assets.map((asset) => [asset.figureId, asset]),
  );
  try {
    for (const figure of input.normalized.figures) {
      if (figure.asset === undefined) continue;
      const asset = assetsByFigureId.get(figure.id);
      if (asset === undefined)
        throw new Error(
          "Normalized figure asset did not match canonical media.",
        );
      await input.storage.putBytes({
        key: storageKeys.parsedStagingFigureOriginal({
          userId: input.ownerUserId,
          projectId: input.projectId,
          versionId: input.artifactId,
          figureId: figure.id,
          extension: imageExtension(figure.asset.contentType),
        }),
        body: Uint8Array.from(asset.body),
        contentType: asset.contentType,
        metadata: {
          sha256: asset.checksumSha256,
          "parser-version": input.parserVersion,
        },
      });
    }
  } catch {
    throw new JobExecutionError(
      "retryable",
      "INGESTION_ARTIFACT_WRITE_FAILED",
      "The staged figure media could not be stored.",
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
      const parserVersion =
        payload.parserVersion ?? currentIngestionCompatibility.parserVersion;
      const configurationVersion = payload.configurationVersion ?? "default";
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
            requestedConfigurationVersion:
              sourceDocumentIngestionArtifacts.requestedConfigurationVersion,
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
              eq(sourceDocumentIngestionArtifacts.parserVersion, parserVersion),
              eq(
                sourceDocumentIngestionArtifacts.normalizedSchemaVersion,
                currentIngestionCompatibility.normalizedSchemaVersion,
              ),
              eq(
                sourceDocumentIngestionArtifacts.requestedConfigurationVersion,
                configurationVersion,
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
          requestedConfigurationVersion: existing.requestedConfigurationVersion,
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
              parserVersion,
              correlationId: context.correlationId,
            }),
          );
        } catch (error) {
          const code =
            error instanceof DoclingIngestionError
              ? error.code
              : "TEMPORARY_INFRASTRUCTURE";
          await recordFailedUsage(
            options.database,
            context,
            code,
            parserVersion,
          ).catch(() => undefined);
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
        if (parsed.parserVersion !== parserVersion)
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
            requestedConfigurationVersion: configurationVersion,
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
          let figureAssets: ReturnType<
            typeof extractDoclingFigureAssets
          >["assets"];
          try {
            normalized = normalizeDoclingOutput({
              artifactId: candidate.id,
              sourceDocumentId: document.id,
              parsedDocumentVersion: parsedDocumentVersionForArtifact(
                candidate.id,
              ),
              pageCount: document.pageCount ?? 1,
              canonicalJson: parsed.canonicalJson,
            });
            figureAssets = extractDoclingFigureAssets({
              artifactId: candidate.id,
              canonicalJson: parsed.canonicalJson,
            }).assets;
          } catch {
            // The staged canonical result and its DB record remain immutable for diagnosis.
            await recordFailedUsage(
              options.database,
              context,
              "SCHEMA_NORMALIZATION_DEFECT",
              parserVersion,
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
            for (const asset of figureAssets) {
              await options.storage.putBytes({
                key: storageKeys.parsedStagingFigureOriginal({
                  userId: context.ownerUserId,
                  projectId: context.projectId,
                  versionId: candidate.id,
                  figureId: asset.figureId,
                  extension: imageExtension(asset.contentType),
                }),
                body: Uint8Array.from(asset.body),
                contentType: asset.contentType,
                metadata: {
                  sha256: asset.checksumSha256,
                  "parser-version": parsed.parserVersion,
                },
              });
            }
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
      await restageFigureAssets({
        storage: options.storage,
        canonicalKey: keys.stagingCanonical,
        normalized,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        artifactId: artifact.id,
        parserVersion: artifact.parserVersion,
      });
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
        for (const figure of normalized.figures) {
          if (figure.asset === undefined) continue;
          const extension = imageExtension(figure.asset.contentType);
          await options.storage.copy({
            sourceKey: storageKeys.parsedStagingFigureOriginal({
              userId: context.ownerUserId,
              projectId: context.projectId,
              versionId: artifact.id,
              figureId: figure.id,
              extension,
            }),
            destinationKey: storageKeys.parsedFigureOriginal({
              userId: context.ownerUserId,
              projectId: context.projectId,
              versionId: artifact.id,
              figureId: figure.id,
              extension,
            }),
          });
        }
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
          if (normalized.sections.length > 0) {
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
          }
          if (normalized.blocks.length > 0) {
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
          }
          if (normalized.figures.length > 0)
            await transaction
              .insert(extractedFigures)
              .values(
                normalized.figures.map((figure) => ({
                  id: figure.id,
                  parsedDocumentId: normalized.id,
                  sectionId: figure.sectionId,
                  order: figure.order,
                  pageStart: figure.pageStart,
                  pageEnd: figure.pageEnd ?? figure.pageStart,
                  captionBlockId: figure.captionBlockId ?? null,
                  altText: figure.altText ?? null,
                  sourceLocator: figure.sourceLocator ?? null,
                  storageKey:
                    figure.asset === undefined
                      ? null
                      : storageKeys.parsedFigureOriginal({
                          userId: context.ownerUserId,
                          projectId: context.projectId,
                          versionId: artifact.id,
                          figureId: figure.id,
                          extension: imageExtension(figure.asset.contentType),
                        }),
                  thumbnailStorageKey: null,
                  checksumSha256: figure.asset?.checksumSha256 ?? null,
                  contentType: figure.asset?.contentType ?? null,
                  byteLength: figure.asset?.byteLength ?? null,
                  width: figure.asset?.width ?? null,
                  height: figure.asset?.height ?? null,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                })),
              )
              .onConflictDoNothing();
          if (normalized.tables.length > 0)
            await transaction
              .insert(parsedTables)
              .values(
                normalized.tables.map((table) => ({
                  id: table.id,
                  parsedDocumentId: normalized.id,
                  sectionId: table.sectionId,
                  order: table.order,
                  pageStart: table.pageStart,
                  pageEnd: table.pageEnd ?? table.pageStart,
                  captionBlockId: table.captionBlockId ?? null,
                  columns: table.columns,
                  rows: table.rows,
                  rawRepresentation: table.rawRepresentation ?? null,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                })),
              )
              .onConflictDoNothing();
          if (
            normalized.tables.some(
              (table) => (table.cells?.length ?? table.rows.length) > 0,
            )
          )
            await transaction
              .insert(parsedTableCells)
              .values(
                normalized.tables.flatMap((table) =>
                  (
                    table.cells ??
                    table.rows.flatMap((row, rowIndex) =>
                      row.map((text, column) => ({
                        row: rowIndex,
                        column,
                        text,
                        rowSpan: 1,
                        columnSpan: 1,
                      })),
                    )
                  ).map((cell) => ({
                    id: deterministicId(
                      `${table.id}:cell:${cell.row}:${cell.column}`,
                    ),
                    parsedTableId: table.id,
                    rowIndex: cell.row,
                    columnIndex: cell.column,
                    text: cell.text,
                    rowSpan: cell.rowSpan,
                    columnSpan: cell.columnSpan,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  })),
                ),
              )
              .onConflictDoNothing();
          if (normalized.warnings.length > 0)
            await transaction
              .insert(ingestionWarnings)
              .values(
                normalized.warnings.map((warning, index) => ({
                  id: deterministicId(
                    `${normalized.id}:warning:${index}:${warning.code}`,
                  ),
                  parsedDocumentId: normalized.id,
                  code: warning.code,
                  severity: warning.severity,
                  message: warning.message,
                  pageStart: warning.pageStart,
                  pageEnd: warning.pageEnd ?? warning.pageStart,
                  sectionId: warning.sectionId ?? null,
                  blockId: warning.blockId ?? null,
                  figureId: warning.figureId ?? null,
                  tableId: warning.tableId ?? null,
                  createdAt: timestamp,
                  updatedAt: timestamp,
                })),
              )
              .onConflictDoNothing();
          const quality = assessIngestionQuality(normalized.warnings);
          await transaction
            .insert(ingestionQualityReports)
            .values({
              id: deterministicId(`${normalized.id}:quality-report`),
              parsedDocumentId: normalized.id,
              score: quality.score,
              status: quality.status,
              findings: quality.findings,
              createdAt: timestamp,
              updatedAt: timestamp,
            })
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
        ...normalized.figures.flatMap((figure) =>
          figure.asset === undefined
            ? []
            : [
                options.storage.delete(
                  storageKeys.parsedStagingFigureOriginal({
                    userId: context.ownerUserId,
                    projectId: context.projectId,
                    versionId: artifact.id,
                    figureId: figure.id,
                    extension: imageExtension(figure.asset.contentType),
                  }),
                ),
              ],
        ),
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
