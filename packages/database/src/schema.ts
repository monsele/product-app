import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { projectStageValues } from "@avlp/schemas";
import { sql } from "drizzle-orm";

export const primaryId = (name = "id") => uuid(name).primaryKey();

export const utcTimestamp = (name: string) =>
  timestamp(name, { mode: "date", withTimezone: true });

export const auditColumns = () => ({
  createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
});

export const revisionColumn = () => integer("revision").notNull().default(1);

export const softDeletionColumn = () => utcTimestamp("deleted_at");

export const ownershipColumn = () => uuid("owner_user_id").notNull();

/** Standard columns for every future project-owned domain table. */
export const projectOwnershipColumns = () => ({
  projectId: uuid("project_id").notNull(),
  ownerUserId: ownershipColumn(),
});

/**
 * Infrastructure-only smoke table. Feature stories own all domain tables.
 * JSONB is available for versioned metadata without making it an ownership or
 * workflow source of truth.
 */
export const databaseMetadata = pgTable("database_metadata", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  revision: revisionColumn(),
  ...auditColumns(),
});

export const userStatusValues = ["active", "disabled"] as const;
export const userStatus = pgEnum("user_status", userStatusValues);

/** Application-owned user profiles are the durable ownership root. */
export const users = pgTable(
  "users",
  {
    id: primaryId(),
    emailNormalized: text("email_normalized").notNull(),
    displayName: text("display_name").notNull(),
    status: userStatus("status").notNull().default("active"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("users_email_normalized_unique").on(table.emailNormalized),
  ],
);

/** Maps the application user to its authentication provider subject. */
export const authIdentities = pgTable(
  "auth_identities",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerSubject: text("provider_subject").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("auth_identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
    uniqueIndex("auth_identities_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
  ],
);

/** Credential hashes remain separate from profile and provider mapping records. */
export const passwordCredentials = pgTable("password_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  ...auditColumns(),
});

/** Browser session tokens are stored only as keyed hashes. */
export const sessions = pgTable(
  "sessions",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    revokedAt: utcTimestamp("revoked_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_expiry_idx").on(table.userId, table.expiresAt),
  ],
);

/** Password-reset secrets are persisted only as keyed hashes and consumed once. */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    usedAt: utcTimestamp("used_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_expiry_idx").on(
      table.userId,
      table.expiresAt,
    ),
  ],
);

export { projectStageValues } from "@avlp/schemas";
export const projectStage = pgEnum("project_stage", projectStageValues);

/** The ownership root for every teacher-created lesson workspace. */
export const projects = pgTable(
  "projects",
  {
    id: primaryId(),
    ownerUserId: ownershipColumn().references(() => users.id, {
      onDelete: "restrict",
    }),
    title: text("title").notNull(),
    stage: projectStage("stage").notNull().default("draft"),
    latestFailedOperation: text("latest_failed_operation"),
    ...auditColumns(),
    revision: revisionColumn(),
    deletedAt: softDeletionColumn(),
    cleanupAfter: utcTimestamp("cleanup_after"),
    cleanupCompletedAt: utcTimestamp("cleanup_completed_at"),
  },
  (table) => [
    index("projects_owner_active_updated_idx").on(
      table.ownerUserId,
      table.deletedAt,
      table.updatedAt,
      table.id,
    ),
  ],
);

/** Idempotency record for a source project clone; retained with tombstones. */
export const projectCloneRequests = pgTable(
  "project_clone_requests",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    duplicateProjectId: uuid("duplicate_project_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("project_clone_requests_source_key_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("project_clone_requests_duplicate_idx").on(
      table.ownerUserId,
      table.duplicateProjectId,
    ),
  ],
);

export const sourceDocumentStatusValues = [
  "pending_validation",
  "validating",
  "active",
  "rejected",
  "validation_error",
] as const;
export const sourceDocumentStatus = pgEnum(
  "source_document_status",
  sourceDocumentStatusValues,
);

/** Immutable original uploads; source replacement will supersede rather than overwrite. */
export const sourceDocuments = pgTable(
  "source_documents",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    originalName: text("original_name").notNull(),
    mediaType: text("media_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    pageCount: integer("page_count"),
    scanStatus: text("scan_status").notNull().default("pending"),
    validationCode: text("validation_code"),
    validationWarnings: jsonb("validation_warnings").notNull().default([]),
    validatedAt: utcTimestamp("validated_at"),
    status: sourceDocumentStatus("status")
      .notNull()
      .default("pending_validation"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("source_documents_project_active_unique")
      .on(table.projectId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("source_documents_storage_key_unique").on(table.storageKey),
    index("source_documents_owner_checksum_idx").on(
      table.ownerUserId,
      table.sha256,
    ),
  ],
);

/**
 * Immutable parser outputs that may be safely referenced by another project
 * belonging to the same owner. Review edits are deliberately not stored here.
 */
export const sourceDocumentIngestionArtifactStateValues = [
  "staging",
  "ready",
] as const;
export const sourceDocumentIngestionArtifactState = pgEnum(
  "source_document_ingestion_artifact_state",
  sourceDocumentIngestionArtifactStateValues,
);

export const sourceDocumentIngestionArtifacts = pgTable(
  "source_document_ingestion_artifacts",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id),
    parserVersion: text("parser_version").notNull(),
    normalizedSchemaVersion: text("normalized_schema_version").notNull(),
    canonicalStorageKey: text("canonical_storage_key").notNull(),
    markdownStorageKey: text("markdown_storage_key"),
    configurationHash: text("configuration_hash").notNull().default(""),
    /** Explicit retry configuration identity; never rewrite an existing parse. */
    requestedConfigurationVersion: text("requested_configuration_version")
      .notNull()
      .default("default"),
    processingTimeMs: integer("processing_time_ms").notNull().default(0),
    warnings: jsonb("warnings").notNull().default([]),
    /** Staged artifacts are never exposed to downstream consumers. */
    state: sourceDocumentIngestionArtifactState("state")
      .notNull()
      .default("ready"),
    /** Set by ST-034 after application-owned normalization succeeds. */
    normalizedStorageKey: text("normalized_storage_key"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("source_document_ingestion_artifacts_version_unique").on(
      table.sourceDocumentId,
      table.parserVersion,
      table.normalizedSchemaVersion,
      table.requestedConfigurationVersion,
    ),
    index("source_document_ingestion_artifacts_owner_versions_idx").on(
      table.ownerUserId,
      table.parserVersion,
      table.normalizedSchemaVersion,
    ),
  ],
);

/** A project-local reference to a compatible immutable ingestion artifact. */
export const sourceDocumentIngestionReuses = pgTable(
  "source_document_ingestion_reuses",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id),
    ingestionArtifactId: uuid("ingestion_artifact_id")
      .notNull()
      .references(() => sourceDocumentIngestionArtifacts.id),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("source_document_ingestion_reuses_document_unique").on(
      table.sourceDocumentId,
    ),
    index("source_document_ingestion_reuses_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/** Immutable, application-owned normalized view of one parser artifact. */
export const parsedDocuments = pgTable(
  "parsed_documents",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    ingestionArtifactId: uuid("ingestion_artifact_id")
      .notNull()
      .references(() => sourceDocumentIngestionArtifacts.id),
    sourceDocumentId: uuid("source_document_id")
      .notNull()
      .references(() => sourceDocuments.id),
    version: integer("version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    parserVersion: text("parser_version").notNull(),
    adapterVersion: text("adapter_version").notNull(),
    normalizedStorageKey: text("normalized_storage_key").notNull(),
    title: text("title"),
    language: text("language").notNull(),
    pageCount: integer("page_count").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("parsed_documents_artifact_unique").on(
      table.ingestionArtifactId,
    ),
    uniqueIndex("parsed_documents_source_parser_version_unique").on(
      table.sourceDocumentId,
      table.parserVersion,
      table.schemaVersion,
      table.version,
    ),
    index("parsed_documents_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/** Query-oriented section metadata derived from an immutable normalized document. */
export const parsedSections = pgTable(
  "parsed_sections",
  {
    id: primaryId(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    parentSectionId: uuid("parent_section_id"),
    order: integer("order").notNull(),
    level: integer("level").notNull(),
    heading: text("heading").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    ...auditColumns(),
  },
  (table) => [
    index("parsed_sections_document_parent_order_idx").on(
      table.parsedDocumentId,
      table.parentSectionId,
      table.order,
    ),
  ],
);

/** Query-oriented content/provenance records; the JSON snapshot remains authoritative. */
export const contentBlocks = pgTable(
  "content_blocks",
  {
    id: primaryId(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    kind: text("kind").notNull(),
    order: integer("order").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    boundingBox: jsonb("bounding_box"),
    content: jsonb("content").notNull(),
    ...auditColumns(),
  },
  (table) => [
    index("content_blocks_document_section_order_idx").on(
      table.parsedDocumentId,
      table.sectionId,
      table.order,
    ),
    index("content_blocks_document_page_idx").on(
      table.parsedDocumentId,
      table.pageStart,
    ),
  ],
);

/** Immutable figure metadata; bytes remain in private object storage. */
export const extractedFigures = pgTable(
  "extracted_figures",
  {
    id: primaryId(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    order: integer("order").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    captionBlockId: uuid("caption_block_id"),
    altText: text("alt_text"),
    sourceLocator: text("source_locator"),
    storageKey: text("storage_key"),
    thumbnailStorageKey: text("thumbnail_storage_key"),
    checksumSha256: text("checksum_sha256"),
    contentType: text("content_type"),
    byteLength: integer("byte_length"),
    width: integer("width"),
    height: integer("height"),
    ...auditColumns(),
  },
  (table) => [
    index("extracted_figures_document_section_order_idx").on(
      table.parsedDocumentId,
      table.sectionId,
      table.order,
    ),
    index("extracted_figures_document_page_idx").on(
      table.parsedDocumentId,
      table.pageStart,
    ),
  ],
);

/** Immutable table metadata and raw parser representation for review recovery. */
export const parsedTables = pgTable(
  "parsed_tables",
  {
    id: primaryId(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").notNull(),
    order: integer("order").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    captionBlockId: uuid("caption_block_id"),
    columns: jsonb("columns").notNull(),
    rows: jsonb("rows").notNull(),
    rawRepresentation: jsonb("raw_representation"),
    ...auditColumns(),
  },
  (table) => [
    index("parsed_tables_document_section_order_idx").on(
      table.parsedDocumentId,
      table.sectionId,
      table.order,
    ),
  ],
);

/** Ordered cells preserve table shape and merged-cell spans independently of the snapshot. */
export const parsedTableCells = pgTable(
  "parsed_table_cells",
  {
    id: primaryId(),
    parsedTableId: uuid("parsed_table_id")
      .notNull()
      .references(() => parsedTables.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    columnIndex: integer("column_index").notNull(),
    text: text("text").notNull(),
    rowSpan: integer("row_span").notNull().default(1),
    columnSpan: integer("column_span").notNull().default(1),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("parsed_table_cells_table_position_unique").on(
      table.parsedTableId,
      table.rowIndex,
      table.columnIndex,
    ),
  ],
);

/** Teacher-visible, parser-safe warnings; canonical normalized JSON remains authoritative. */
export const ingestionWarnings = pgTable(
  "ingestion_warnings",
  {
    id: primaryId(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    severity: text("severity").notNull(),
    message: text("message").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    sectionId: uuid("section_id"),
    blockId: uuid("block_id"),
    figureId: uuid("figure_id"),
    tableId: uuid("table_id"),
    ...auditColumns(),
  },
  (table) => [
    index("ingestion_warnings_document_page_idx").on(
      table.parsedDocumentId,
      table.pageStart,
    ),
  ],
);

/** Immutable deterministic assessment for one immutable normalized parse. */
export const ingestionQualityReports = pgTable(
  "ingestion_quality_reports",
  {
    id: primaryId(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    status: text("status").notNull(),
    findings: jsonb("findings").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("ingestion_quality_reports_document_unique").on(
      table.parsedDocumentId,
    ),
  ],
);

/**
 * Project/version-specific section-selection overlay. The immutable
 * `parsed_sections` row remains authoritative; these rows carry the teacher's
 * include/exclude, rename, and review-order decisions as editable overlays.
 */
export const sourceSectionOverlays = pgTable(
  "source_section_overlays",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => parsedSections.id, { onDelete: "cascade" }),
    included: boolean("included").notNull().default(true),
    displayHeading: text("display_heading"),
    reviewOrder: integer("review_order"),
    revision: revisionColumn(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("source_section_overlays_project_section_unique").on(
      table.projectId,
      table.sectionId,
    ),
    index("source_section_overlays_project_document_idx").on(
      table.ownerUserId,
      table.projectId,
      table.parsedDocumentId,
    ),
  ],
);

/**
 * Project/version-specific figure inclusion overlay. The immutable
 * `extracted_figures` row remains authoritative; these rows carry the teacher's
 * include/exclude decision for asset planning as an editable overlay.
 */
export const figureInclusionOverlays = pgTable(
  "figure_inclusion_overlays",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    figureId: uuid("figure_id")
      .notNull()
      .references(() => extractedFigures.id, { onDelete: "cascade" }),
    included: boolean("included").notNull().default(true),
    revision: revisionColumn(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("figure_inclusion_overlays_project_figure_unique").on(
      table.projectId,
      table.figureId,
    ),
    index("figure_inclusion_overlays_project_document_idx").on(
      table.ownerUserId,
      table.projectId,
      table.parsedDocumentId,
    ),
  ],
);

/**
 * Editable text correction for one immutable content block. The immutable
 * `content_blocks.content` row remains authoritative; these rows carry the
 * teacher's corrected plain/structured text as overlays with a revision.
 */
export const contentBlockCorrections = pgTable(
  "content_block_corrections",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => parsedSections.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => contentBlocks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    correctedText: text("corrected_text"),
    correctedItems: jsonb("corrected_items"),
    correctedLatex: text("corrected_latex"),
    revision: revisionColumn(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("content_block_corrections_project_block_unique").on(
      table.projectId,
      table.blockId,
    ),
    index("content_block_corrections_project_document_idx").on(
      table.ownerUserId,
      table.projectId,
      table.parsedDocumentId,
    ),
  ],
);

/**
 * Idempotent dependency-invalidation record: a source correction changed the
 * effective content, so unapproved downstream drafts must be marked stale.
 * One row per (project, block, correction revision) prevents duplicates.
 */
export const sourceContentInvalidations = pgTable(
  "source_content_invalidations",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => parsedSections.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => contentBlocks.id, { onDelete: "cascade" }),
    blockRevision: integer("block_revision").notNull(),
    scope: text("scope").notNull().default("unapproved_drafts"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex(
      "source_content_invalidations_project_block_revision_unique",
    ).on(table.projectId, table.blockId, table.blockRevision),
    index("source_content_invalidations_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/**
 * Idempotent dependency-invalidation record: a figure inclusion change made the
 * effective figure set stale, so unapproved downstream drafts referencing the
 * figure must be marked stale. One row per (project, figure, revision) prevents
 * duplicates.
 */
export const sourceFigureInvalidations = pgTable(
  "source_figure_invalidations",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    figureId: uuid("figure_id")
      .notNull()
      .references(() => extractedFigures.id, { onDelete: "cascade" }),
    figureRevision: integer("figure_revision").notNull(),
    scope: text("scope").notNull().default("unapproved_drafts"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex(
      "source_figure_invalidations_project_figure_revision_unique",
    ).on(table.projectId, table.figureId, table.figureRevision),
    index("source_figure_invalidations_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/**
 * Immutable approved source snapshot. `payload` freezes the effective reviewed
 * content (included sections, corrected blocks, included figures/tables) as
 * JSONB; the queryable columns mirror the metadata needed by generation jobs.
 * Later overlay edits create a new snapshot version rather than mutating this
 * row. The AI pipeline consumes approved snapshots, never live draft overlays.
 */
export const sourceSnapshots = pgTable(
  "source_snapshots",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    parsedDocumentId: uuid("parsed_document_id")
      .notNull()
      .references(() => parsedDocuments.id, { onDelete: "cascade" }),
    parsedDocumentVersion: integer("parsed_document_version").notNull(),
    snapshotVersion: integer("snapshot_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    contentHash: text("content_hash").notNull(),
    approvedBy: uuid("approved_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    approvedAt: utcTimestamp("approved_at").notNull(),
    payload: jsonb("payload").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("source_snapshots_project_version_unique").on(
      table.projectId,
      table.snapshotVersion,
    ),
    index("source_snapshots_owner_project_parsed_idx").on(
      table.ownerUserId,
      table.projectId,
      table.parsedDocumentId,
    ),
    index("source_snapshots_parsed_document_idx").on(table.parsedDocumentId),
  ],
);

export const uploadSessions = pgTable(
  "upload_sessions",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    documentId: uuid("document_id").notNull(),
    originalName: text("original_name").notNull(),
    expectedMediaType: text("expected_media_type").notNull(),
    expectedSizeBytes: integer("expected_size_bytes").notNull(),
    expectedSha256: text("expected_sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    completedAt: utcTimestamp("completed_at"),
    duplicateDetected: boolean("duplicate_detected").notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("upload_sessions_document_unique").on(table.documentId),
    index("upload_sessions_owner_project_expiry_idx").on(
      table.ownerUserId,
      table.projectId,
      table.expiresAt,
    ),
  ],
);

export const jobStateValues = [
  "queued",
  "running",
  "retry_wait",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export const jobState = pgEnum("job_state", jobStateValues);

export const jobErrorClassificationValues = [
  "retryable",
  "terminal",
  "cancelled",
] as const;

export const jobErrorClassification = pgEnum(
  "job_error_classification",
  jobErrorClassificationValues,
);

export const jobs = pgTable(
  "jobs",
  {
    id: primaryId(),
    jobType: text("job_type").notNull(),
    queueName: text("queue_name").notNull(),
    ...projectOwnershipColumns(),
    inputVersion: text("input_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    payload: jsonb("payload").notNull(),
    state: jobState("state").notNull().default("queued"),
    progress: real("progress").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    retryDelayMs: integer("retry_delay_ms").notNull().default(5_000),
    availableAt: utcTimestamp("available_at").notNull().defaultNow(),
    startedAt: utcTimestamp("started_at"),
    completedAt: utcTimestamp("completed_at"),
    heartbeatAt: utcTimestamp("heartbeat_at"),
    leaseExpiresAt: utcTimestamp("lease_expires_at"),
    resultMetadata: jsonb("result_metadata"),
    errorClassification: jobErrorClassification("error_classification"),
    errorMetadata: jsonb("error_metadata"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("jobs_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("jobs_project_created_idx").on(table.projectId, table.createdAt),
    index("jobs_stale_lease_idx").on(table.state, table.leaseExpiresAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: primaryId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    queueName: text("queue_name").notNull(),
    envelope: jsonb("envelope").notNull(),
    deliveryOptions: jsonb("delivery_options").notNull(),
    availableAt: utcTimestamp("available_at").notNull().defaultNow(),
    claimedAt: utcTimestamp("claimed_at"),
    claimExpiresAt: utcTimestamp("claim_expires_at"),
    dispatchedAt: utcTimestamp("dispatched_at"),
    dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
    lastError: jsonb("last_error"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("outbox_events_job_event_unique").on(
      table.jobId,
      table.eventType,
    ),
    index("outbox_events_pending_idx").on(
      table.dispatchedAt,
      table.availableAt,
      table.claimExpiresAt,
    ),
  ],
);

export const auditActorTypeValues = ["user", "system"] as const;
export const auditActorType = pgEnum("audit_actor_type", auditActorTypeValues);

export const auditEventTypeValues = [
  "auth.registration",
  "auth.login",
  "auth.login_failed",
  "auth.logout",
  "auth.password_reset_requested",
  "auth.password_changed",
  "project.created",
  "project.duplicated",
  "project.deleted",
  "document.uploaded",
  "document.deleted",
  "document.validation_requested",
  "document.validation_rejected",
  "document.ingestion_reused",
  "document.ingestion_completed",
  "source.selection_updated",
  "source.block_corrected",
  "source.block_restored",
  "source.figure_updated",
  "source.figure_restored",
  "source.review_approved",
  "share.created",
  "share.revoked",
  "lesson.configuration_saved",
  "lesson.approved",
  "ai.generated",
  "version.restored",
  "render.initiated",
  "job.admin_retried",
  "job.admin_cancelled",
] as const;
export const auditEventType = pgEnum("audit_event_type", auditEventTypeValues);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: primaryId(),
    ownerUserId: ownershipColumn(),
    projectId: uuid("project_id"),
    actorType: auditActorType("actor_type").notNull(),
    actorUserId: uuid("actor_user_id"),
    eventType: auditEventType("event_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: utcTimestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_project_occurred_idx").on(
      table.ownerUserId,
      table.projectId,
      table.occurredAt,
    ),
    index("audit_events_actor_occurred_idx").on(
      table.actorUserId,
      table.occurredAt,
    ),
    index("audit_events_correlation_idx").on(table.correlationId),
  ],
);

export const usageOperationTypeValues = [
  "document.ingestion",
  "ai.objectives",
  "ai.outline",
  "ai.narration",
  "ai.storyboard",
  "ai.scene_regeneration",
  "ai.grounding",
  "image.generation",
  "tts.generation",
  "video.render",
] as const;
export const usageOperationType = pgEnum(
  "usage_operation_type",
  usageOperationTypeValues,
);

export const usageStatusValues = ["succeeded", "failed"] as const;
export const usageStatus = pgEnum("usage_status", usageStatusValues);

/**
 * One immutable metadata record per model call. Persisted for every provider
 * interaction (including failures) so costs, retries, prompt versions, and
 * validation outcomes are traceable. Provider response payloads never enter
 * the domain record.
 */
export const modelCalls = pgTable(
  "model_calls",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    operationType: text("operation_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputVersion: text("input_version").notNull(),
    inputHash: text("input_hash").notNull(),
    inputUnits: integer("input_units").notNull(),
    outputUnits: integer("output_units").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 14,
      scale: 6,
    }).notNull(),
    latencyMs: integer("latency_ms").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    validationStatus: text("validation_status").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    correlationId: uuid("correlation_id").notNull(),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
    updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("model_calls_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("model_calls_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
    index("model_calls_correlation_idx").on(table.correlationId),
  ],
);

export const usageRecords = pgTable(
  "usage_records",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    operationType: usageOperationType("operation_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: text("provider"),
    model: text("model"),
    unit: text("unit").notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 4 }).notNull(),
    inputUnits: integer("input_units"),
    outputUnits: integer("output_units"),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 14,
      scale: 6,
    }).notNull(),
    latencyMs: integer("latency_ms"),
    retryCount: integer("retry_count").notNull().default(0),
    status: usageStatus("status").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    occurredAt: utcTimestamp("occurred_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("usage_records_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("usage_records_project_operation_idx").on(
      table.ownerUserId,
      table.projectId,
      table.operationType,
      table.occurredAt,
    ),
    index("usage_records_user_operation_idx").on(
      table.ownerUserId,
      table.operationType,
      table.occurredAt,
    ),
    index("usage_records_correlation_idx").on(table.correlationId),
  ],
);

/**
 * One current-draft lesson configuration per project. `version` increments on
 * each save and backs the optimistic-concurrency conflict check. Approved
 * immutable configuration versions referenced by generated artifacts are
 * preserved by downstream stories (ST-042+) rather than stored here.
 */
export const lessonConfigurations = pgTable(
  "lesson_configurations",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    version: revisionColumn(),
    ageBand: text("age_band").notNull(),
    difficulty: text("difficulty").notNull(),
    subject: text("subject").notNull(),
    lessonTitle: text("lesson_title").notNull(),
    targetDurationSeconds: integer("target_duration_seconds").notNull(),
    tone: text("tone").notNull(),
    visualTheme: text("visual_theme").notNull().default("mvp-default"),
    includeRecallQuestions: boolean("include_recall_questions")
      .notNull()
      .default(false),
    /** Effective selected-source parsed version that grounds the lesson. */
    sourceParsedDocumentVersion: integer(
      "source_parsed_document_version",
    ).notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("lesson_configurations_project_unique").on(table.projectId),
    index("lesson_configurations_owner_updated_idx").on(
      table.ownerUserId,
      table.projectId,
      table.updatedAt,
    ),
  ],
);
