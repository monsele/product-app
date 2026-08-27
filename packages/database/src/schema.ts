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
    /** Current immutable version used by downstream render commands. */
    currentLessonVersionId: uuid("current_lesson_version_id").references(
      () => lessonVersions.id,
      { onDelete: "restrict" },
    ),
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

/** Immutable, project-private teacher image upload (ST-058). */
export const projectAssets = pgTable(
  "project_assets",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    mediaType: text("media_type").notNull(),
    originalName: text("original_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    width: integer("width"),
    height: integer("height"),
    storageKey: text("storage_key").notNull(),
    thumbnailStorageKey: text("thumbnail_storage_key"),
    provenance: text("provenance").notNull().default("teacher_uploaded"),
    status: text("status").notNull().default("pending_validation"),
    validationCode: text("validation_code"),
    deletedAt: utcTimestamp("deleted_at"),
    cleanupAfter: utcTimestamp("cleanup_after"),
    cleanupCompletedAt: utcTimestamp("cleanup_completed_at"),
    ...auditColumns(),
  },
  (table) => [
    index("project_assets_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/** Short-lived, idempotently-completed upload session for a project asset. */
export const projectAssetUploadSessions = pgTable(
  "project_asset_upload_sessions",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    assetId: uuid("asset_id").notNull(),
    originalName: text("original_name").notNull(),
    expectedMediaType: text("expected_media_type").notNull(),
    expectedSizeBytes: integer("expected_size_bytes").notNull(),
    expectedSha256: text("expected_sha256").notNull(),
    storageKey: text("storage_key").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    completedAt: utcTimestamp("completed_at"),
    validationJobId: uuid("validation_job_id"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("project_asset_upload_sessions_asset_unique").on(table.assetId),
    index("project_asset_upload_sessions_tenant_expiry_idx").on(
      table.ownerUserId,
      table.projectId,
      table.expiresAt,
    ),
  ],
);

/**
 * Immutable review candidate produced by a bounded, scene-scoped illustration
 * request. The asset remains inactive until the teacher explicitly accepts it.
 */
export const illustrationGenerationCandidates = pgTable(
  "illustration_generation_candidates",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    assetId: uuid("asset_id").references(() => projectAssets.id, {
      onDelete: "restrict",
    }),
    status: text("status").notNull().default("queued"),
    promptVersion: text("prompt_version").notNull(),
    provider: text("provider").notNull(),
    providerCallId: text("provider_call_id"),
    moderationStatus: text("moderation_status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    failureCode: text("failure_code"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("illustration_candidates_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.sceneId,
      table.idempotencyKey,
    ),
    index("illustration_candidates_scene_status_idx").on(
      table.sceneId,
      table.status,
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
  "project_asset.validation_requested",
  "project_asset.deleted",
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
  "voice.configuration_saved",
  "lesson.approved",
  "ai.generated",
  "objectives.edited",
  "objectives.approved",
  "outline.edited",
  "outline.approved",
  "narration.edited",
  "narration.block_candidate_accepted",
  "narration.block_candidate_rejected",
  "narration.block_restored",
  "version.restored",
  "render.initiated",
  "job.admin_retried",
  "job.admin_cancelled",
  "storyboard.scene_candidate_accepted",
  "storyboard.scene_candidate_rejected",
  "storyboard.edited",
  "audio.generation_requested",
  "export.downloaded",
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

export const learningObjectiveSetStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const learningObjectiveSetStatus = pgEnum(
  "learning_objective_set_status",
  learningObjectiveSetStatusValues,
);

/**
 * One objective set (draft or approved) per project. The latest `draft` set is
 * the teacher's working revision: its objective rows are edited in place and
 * `revision` is the optimistic concurrency token. Approved sets are immutable
 * snapshots used by outline generation; editing approved content creates a new
 * draft revision (ST-045) rather than mutating the approved snapshot. The
 * tenant-unique idempotency key makes generation retries idempotent end to end.
 */
export const learningObjectiveSets = pgTable(
  "learning_objective_sets",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    sourceSnapshotContentHash: text("source_snapshot_content_hash").notNull(),
    configurationVersion: integer("configuration_version").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "restrict" }),
    status: learningObjectiveSetStatus("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    keyConcepts: jsonb("key_concepts").notNull().default([]),
    prerequisiteKnowledge: jsonb("prerequisite_knowledge")
      .notNull()
      .default([]),
    vocabulary: jsonb("vocabulary").notNull().default([]),
    misconceptions: jsonb("misconceptions").notNull().default([]),
    assessmentQuestions: jsonb("assessment_questions").notNull().default([]),
    generatedAt: utcTimestamp("generated_at").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("learning_objective_sets_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("learning_objective_sets_owner_project_generated_idx").on(
      table.ownerUserId,
      table.projectId,
      table.generatedAt,
    ),
  ],
);

/**
 * One objective within a set. `source_refs` stores the resolved SourceRef
 * array; `generated` marks AI output (teacher-added rows are `false`) and
 * `revision` tracks overlay edits for auditability.
 */
export const learningObjectives = pgTable(
  "learning_objectives",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    setId: uuid("set_id")
      .notNull()
      .references(() => learningObjectiveSets.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    statement: text("statement").notNull(),
    verb: text("verb").notNull(),
    confidence: real("confidence").notNull(),
    sourceRefs: jsonb("source_refs").notNull(),
    generated: boolean("generated").notNull().default(true),
    revision: integer("revision").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("learning_objectives_set_order_unique").on(
      table.setId,
      table.order,
    ),
    index("learning_objectives_set_idx").on(table.setId),
  ],
);

export const lessonOutlineSetStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const lessonOutlineSetStatus = pgEnum(
  "lesson_outline_set_status",
  lessonOutlineSetStatusValues,
);

/**
 * One outline set (draft or approved) per project. The latest `draft` set is
 * the teacher's working revision; ST-046 persists a generated draft and
 * ST-047 editing/approval creates revisions rather than mutating generated
 * items. The approved objective-set content hash binds the outline to the
 * exact approved objectives it must cover. The tenant-unique idempotency key
 * makes generation retries idempotent end to end.
 */
export const lessonOutlineSets = pgTable(
  "lesson_outline_sets",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    sourceSnapshotContentHash: text("source_snapshot_content_hash").notNull(),
    objectiveSetId: uuid("objective_set_id")
      .notNull()
      .references(() => learningObjectiveSets.id, { onDelete: "restrict" }),
    objectiveSetContentHash: text("objective_set_content_hash").notNull(),
    configurationVersion: integer("configuration_version").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "restrict" }),
    status: lessonOutlineSetStatus("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    totalEstimatedSeconds: integer("total_estimated_seconds").notNull(),
    generatedAt: utcTimestamp("generated_at").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("lesson_outline_sets_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("lesson_outline_sets_owner_project_generated_idx").on(
      table.ownerUserId,
      table.projectId,
      table.generatedAt,
    ),
  ],
);

/**
 * One outline item within a set. `source_refs` stores the resolved SourceRef
 * array; `framing_note` labels a generated hook that does not cite a source
 * block. Objective-to-outline links live in `outline_objective_links`.
 */
export const lessonOutlineItems = pgTable(
  "lesson_outline_items",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    setId: uuid("set_id")
      .notNull()
      .references(() => lessonOutlineSets.id, { onDelete: "cascade" }),
    order: integer("order").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    estimatedSeconds: integer("estimated_seconds").notNull(),
    sourceRefs: jsonb("source_refs").notNull(),
    framingNote: text("framing_note"),
    generated: boolean("generated").notNull().default(true),
    revision: integer("revision").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("lesson_outline_items_set_order_unique").on(
      table.setId,
      table.order,
    ),
    index("lesson_outline_items_set_idx").on(table.setId),
  ],
);

/**
 * Objective-to-outline mapping. One row per (outline item, approved
 * objective); the approved objective rows are immutable, so the links stay
 * stable for the outline set's lifetime.
 */
export const outlineObjectiveLinks = pgTable(
  "outline_objective_links",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    outlineItemId: uuid("outline_item_id")
      .notNull()
      .references(() => lessonOutlineItems.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => learningObjectives.id, { onDelete: "cascade" }),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("outline_objective_links_item_objective_unique").on(
      table.outlineItemId,
      table.objectiveId,
    ),
    index("outline_objective_links_owner_project_item_idx").on(
      table.ownerUserId,
      table.projectId,
      table.outlineItemId,
    ),
  ],
);

export const narrationSetStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const narrationSetStatus = pgEnum(
  "narration_set_status",
  narrationSetStatusValues,
);

/**
 * One narration set (draft or approved) per project. The latest `draft` set is
 * the teacher's working revision; ST-048 persists a generated draft and
 * ST-049 editing/approval creates revisions rather than mutating generated
 * blocks. The approved outline-set content hash binds the narration to the
 * exact approved outline it narrates. The tenant-unique idempotency key makes
 * generation retries idempotent end to end.
 */
export const narrationSets = pgTable(
  "narration_sets",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    sourceSnapshotContentHash: text("source_snapshot_content_hash").notNull(),
    outlineSetId: uuid("outline_set_id")
      .notNull()
      .references(() => lessonOutlineSets.id, { onDelete: "restrict" }),
    outlineSetContentHash: text("outline_set_content_hash").notNull(),
    configurationVersion: integer("configuration_version").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "restrict" }),
    status: narrationSetStatus("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    totalEstimatedSeconds: integer("total_estimated_seconds").notNull(),
    generatedAt: utcTimestamp("generated_at").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("narration_sets_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("narration_sets_owner_project_generated_idx").on(
      table.ownerUserId,
      table.projectId,
      table.generatedAt,
    ),
  ],
);

/**
 * One narration block within a set. `text` is the joined spoken text,
 * `estimated_words` the deterministic word count, `target_seconds` the outline
 * item's time budget, and `source_refs`/`generated_additions` the grounding.
 */
export const narrationBlocks = pgTable(
  "narration_blocks",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    setId: uuid("set_id")
      .notNull()
      .references(() => narrationSets.id, { onDelete: "cascade" }),
    outlineItemId: uuid("outline_item_id")
      .notNull()
      .references(() => lessonOutlineItems.id, { onDelete: "restrict" }),
    order: integer("order").notNull(),
    text: text("text").notNull(),
    estimatedWords: integer("estimated_words").notNull(),
    targetSeconds: integer("target_seconds").notNull(),
    sourceRefs: jsonb("source_refs").notNull(),
    generatedAdditions: jsonb("generated_additions").notNull(),
    generated: boolean("generated").notNull().default(true),
    revision: integer("revision").notNull().default(0),
    origin: text("origin").notNull().default("generated"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("narration_blocks_set_order_unique").on(
      table.setId,
      table.order,
    ),
    index("narration_blocks_set_idx").on(table.setId),
  ],
);

/**
 * One generated block-transform candidate produced by a `narration.transform`
 * job. Candidates are idempotent per (tenant, project, block, job key) and
 * wait for the teacher to accept or reject them; accepting applies the
 * candidate as a new block revision. `block_revision` is the block revision
 * the candidate was generated from, used to reject stale acceptances.
 */
export const narrationBlockCandidates = pgTable(
  "narration_block_candidates",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    setId: uuid("set_id")
      .notNull()
      .references(() => narrationSets.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => narrationBlocks.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    text: text("text").notNull(),
    estimatedWords: integer("estimated_words").notNull(),
    sourceRefs: jsonb("source_refs").notNull(),
    generatedAdditions: jsonb("generated_additions").notNull(),
    generated: boolean("generated").notNull().default(true),
    status: text("status").notNull().default("pending"),
    blockRevision: integer("block_revision").notNull(),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("narration_candidates_block_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.blockId,
      table.idempotencyKey,
    ),
    index("narration_candidates_set_block_status_idx").on(
      table.setId,
      table.blockId,
      table.status,
    ),
  ],
);

/**
 * One archived narration block revision used for rollback. Every narration
 * mutation archives the previous current revision before advancing the block;
 * restoring a revision clones it into a new current revision rather than
 * mutating history.
 */
export const narrationBlockRevisions = pgTable(
  "narration_block_revisions",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    setId: uuid("set_id")
      .notNull()
      .references(() => narrationSets.id, { onDelete: "cascade" }),
    blockId: uuid("block_id")
      .notNull()
      .references(() => narrationBlocks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    text: text("text").notNull(),
    estimatedWords: integer("estimated_words").notNull(),
    sourceRefs: jsonb("source_refs").notNull(),
    generatedAdditions: jsonb("generated_additions").notNull(),
    generated: boolean("generated").notNull().default(true),
    origin: text("origin").notNull(),
    modelCallId: uuid("model_call_id").references(() => modelCalls.id, {
      onDelete: "restrict",
    }),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("narration_block_revisions_block_revision_unique").on(
      table.blockId,
      table.revision,
    ),
    index("narration_block_revisions_set_idx").on(table.setId),
  ],
);

export const lessonSpecStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const lessonSpecStatus = pgEnum(
  "lesson_spec_status",
  lessonSpecStatusValues,
);

/**
 * One storyboard draft per generation (ST-050). The payload is the canonical
 * ordered scene collection plus top-level lesson metadata, each scene stored
 * normalized in `scenes` for the review route and later editor operations.
 * The approved narration-set content hash binds the storyboard to the exact
 * narration revision it visualizes, and the approved outline-set content hash
 * records the outline it covers. The tenant-unique idempotency key makes
 * generation retries idempotent end to end.
 */
export const lessonSpecs = pgTable(
  "lesson_specs",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    schemaVersion: text("schema_version").notNull(),
    basedOnNarrationSetId: uuid("based_on_narration_set_id")
      .notNull()
      .references(() => narrationSets.id, { onDelete: "restrict" }),
    narrationSetContentHash: text("narration_set_content_hash").notNull(),
    outlineSetId: uuid("outline_set_id")
      .notNull()
      .references(() => lessonOutlineSets.id, { onDelete: "restrict" }),
    outlineSetContentHash: text("outline_set_content_hash").notNull(),
    configurationVersion: integer("configuration_version").notNull(),
    promptId: text("prompt_id").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "restrict" }),
    status: lessonSpecStatus("status").notNull().default("draft"),
    revision: integer("revision").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    targetDurationSeconds: integer("target_duration_seconds").notNull(),
    totalDurationSeconds: integer("total_duration_seconds").notNull(),
    objectiveIds: jsonb("objective_ids").notNull(),
    contentHash: text("content_hash").notNull(),
    payload: jsonb("payload").notNull(),
    generatedAt: utcTimestamp("generated_at").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("lesson_specs_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("lesson_specs_owner_project_generated_idx").on(
      table.ownerUserId,
      table.projectId,
      table.generatedAt,
    ),
  ],
);

/**
 * One storyboard scene within a lesson spec. `stable_scene_id` stays constant
 * across ordinary edits; regenerated content increments `revision`.
 * `narration_block_ids` records which approved narration blocks the scene
 * covers, and `asset_requirements` the planned asset slots that are not yet
 * resolved to real bindings.
 */
export const scenes = pgTable(
  "scenes",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    lessonSpecId: uuid("lesson_spec_id")
      .notNull()
      .references(() => lessonSpecs.id, { onDelete: "cascade" }),
    stableSceneId: uuid("stable_scene_id").notNull(),
    order: integer("order").notNull(),
    template: text("template").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    narrationBlockIds: jsonb("narration_block_ids").notNull(),
    assetRequirements: jsonb("asset_requirements").notNull(),
    sceneJson: jsonb("scene_json").notNull(),
    revision: integer("revision").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("scenes_lesson_spec_order_unique").on(
      table.lessonSpecId,
      table.order,
    ),
    uniqueIndex("scenes_stable_scene_id_unique").on(table.stableSceneId),
    index("scenes_lesson_spec_idx").on(table.lessonSpecId),
  ],
);

/**
 * One generated scene candidate from a scene-regeneration job (ST-051). The
 * candidate stores the before/after scene for teacher comparison and records
 * the scene revision it was generated against so a stale storyboard revision
 * blocks application. The tenant-unique idempotency key makes regeneration
 * retries idempotent end to end.
 */
export const sceneCandidates = pgTable(
  "scene_candidates",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    lessonSpecId: uuid("lesson_spec_id")
      .notNull()
      .references(() => lessonSpecs.id, { onDelete: "cascade" }),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    beforeScene: jsonb("before_scene").notNull(),
    afterScene: jsonb("after_scene").notNull(),
    status: text("status").notNull().default("pending"),
    sceneRevision: integer("scene_revision").notNull(),
    modelCallId: uuid("model_call_id")
      .notNull()
      .references(() => modelCalls.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("scene_candidates_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.sceneId,
      table.idempotencyKey,
    ),
    index("scene_candidates_lesson_spec_scene_status_idx").on(
      table.lessonSpecId,
      table.sceneId,
      table.status,
    ),
  ],
);

/**
 * One grounding check result for a lesson or scene (ST-053).
 * Tied to exact lesson spec and source snapshot content hashes for reproducibility.
 * The tenant-unique idempotency key makes retries idempotent end to end.
 * Rows are inserted only on completion; job lifecycle state lives in `jobs`.
 */
export const groundingChecks = pgTable(
  "grounding_checks",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    lessonSpecId: uuid("lesson_spec_id")
      .notNull()
      .references(() => lessonSpecs.id, { onDelete: "cascade" }),
    lessonSpecRevision: integer("lesson_spec_revision").notNull(),
    lessonSpecContentHash: text("lesson_spec_content_hash").notNull(),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    sourceSnapshotContentHash: text("source_snapshot_content_hash").notNull(),
    scope: text("scope").notNull(),
    sceneId: uuid("scene_id").references(() => scenes.stableSceneId, {
      onDelete: "cascade",
    }),
    claims: jsonb("claims").notNull(),
    results: jsonb("results").notNull(),
    summary: jsonb("summary").notNull(),
    modelCallIds: jsonb("model_call_ids").notNull().default([]),
    idempotencyKey: text("idempotency_key").notNull(),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("grounding_checks_tenant_idempotency_unique").on(
      table.ownerUserId,
      table.projectId,
      table.idempotencyKey,
    ),
    index("grounding_checks_lesson_spec_idx").on(table.lessonSpecId),
    index("grounding_checks_scene_idx").on(table.sceneId),
  ],
);

/**
 * Citation history snapshot preserved with lesson versions (ST-053).
 * Records the grounding state at the time of version creation.
 * Note: lessonVersions table will be added in ST-060; for now we store the version ID as a UUID.
 */
export const citationHistorySnapshots = pgTable(
  "citation_history_snapshots",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    lessonVersionId: uuid("lesson_version_id").notNull(),
    lessonSpecId: uuid("lesson_spec_id")
      .notNull()
      .references(() => lessonSpecs.id, { onDelete: "restrict" }),
    lessonSpecRevision: integer("lesson_spec_revision").notNull(),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    sourceSnapshotContentHash: text("source_snapshot_content_hash").notNull(),
    sceneCitations: jsonb("scene_citations").notNull(),
    groundingCheckId: uuid("grounding_check_id").references(
      () => groundingChecks.id,
      { onDelete: "set null" },
    ),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("citation_history_snapshots_tenant_version_unique").on(
      table.ownerUserId,
      table.projectId,
      table.lessonVersionId,
    ),
    index("citation_history_snapshots_lesson_spec_idx").on(table.lessonSpecId),
  ],
);

/** Immutable, portable lesson snapshot created at an approval milestone or an
 * explicit teacher save. The JSON payload contains metadata and references to
 * immutable media objects only; binaries remain in private object storage. */
export const lessonVersionReasons = [
  "approval",
  "explicit_save",
  "before_render",
  "restore",
] as const;
export const lessonVersionReason = pgEnum(
  "lesson_version_reason",
  lessonVersionReasons,
);
export const lessonVersions = pgTable(
  "lesson_versions",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    versionNumber: integer("version_number").notNull(),
    parentVersionId: uuid("parent_version_id"),
    reason: lessonVersionReason("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    lessonSpecId: uuid("lesson_spec_id")
      .notNull()
      .references(() => lessonSpecs.id, { onDelete: "restrict" }),
    lessonSpecRevision: integer("lesson_spec_revision").notNull(),
    sourceSnapshotId: uuid("source_snapshot_id")
      .notNull()
      .references(() => sourceSnapshots.id, { onDelete: "restrict" }),
    configurationVersion: integer("configuration_version").notNull(),
    objectiveSetId: uuid("objective_set_id")
      .notNull()
      .references(() => learningObjectiveSets.id, { onDelete: "restrict" }),
    outlineSetId: uuid("outline_set_id")
      .notNull()
      .references(() => lessonOutlineSets.id, { onDelete: "restrict" }),
    narrationSetId: uuid("narration_set_id")
      .notNull()
      .references(() => narrationSets.id, { onDelete: "restrict" }),
    schemaVersion: text("schema_version").notNull(),
    sceneLibraryVersion: text("scene_library_version").notNull(),
    promptVersions: jsonb("prompt_versions").notNull(),
    contentHash: text("content_hash").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("lesson_versions_project_number_unique").on(
      table.projectId,
      table.versionNumber,
    ),
    uniqueIndex("lesson_versions_tenant_content_hash_unique").on(
      table.ownerUserId,
      table.projectId,
      table.contentHash,
    ),
    index("lesson_versions_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

/** Provider-neutral lesson voice settings. The approved application voice ID is
 * retained; private provider IDs are adapter configuration, never tenant data. */
export const voiceConfigurations = pgTable(
  "voice_configurations",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    version: integer("version").notNull().default(1),
    voiceId: text("voice_id").notNull(),
    speakingRate: real("speaking_rate").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("voice_configurations_project_unique").on(table.projectId),
    index("voice_configurations_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
    ),
  ],
);

export const pronunciationEntries = pgTable(
  "pronunciation_entries",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    voiceConfigurationId: uuid("voice_configuration_id")
      .notNull()
      .references(() => voiceConfigurations.id, { onDelete: "cascade" }),
    phrase: text("phrase").notNull(),
    replacement: text("replacement").notNull(),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("pronunciation_entries_configuration_phrase_unique").on(
      table.voiceConfigurationId,
      table.phrase,
    ),
    index("pronunciation_entries_owner_project_config_idx").on(
      table.ownerUserId,
      table.projectId,
      table.voiceConfigurationId,
    ),
  ],
);

export const sceneAudioStatuses = [
  "queued",
  "generating",
  "ready",
  "stale",
  "failed",
] as const;
export const sceneAudioStatus = pgEnum(
  "scene_audio_status",
  sceneAudioStatuses,
);
/** Placeholder lifecycle records are created by ST-063. They exist now so a
 * voice-config update can deterministically invalidate prior derived media. */
export const sceneAudio = pgTable(
  "scene_audio",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sceneId: uuid("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    status: sceneAudioStatus("status").notNull().default("stale"),
    voiceConfigurationVersion: integer("voice_configuration_version").notNull(),
    narrationHash: text("narration_hash"),
    voiceConfigurationHash: text("voice_configuration_hash"),
    contentHash: text("content_hash"),
    storageKey: text("storage_key"),
    /** Storage-verifier checksum; input `contentHash` is not a media checksum. */
    checksumSha256: text("checksum_sha256"),
    contentType: text("content_type"),
    durationMs: integer("duration_ms"),
    timing: jsonb("timing"),
    plannedDurationMs: integer("planned_duration_ms"),
    fitWarning: text("fit_warning"),
    jobId: uuid("job_id"),
    failureCode: text("failure_code"),
    createdAt: utcTimestamp("created_at").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("scene_audio_tenant_content_hash_unique").on(
      table.ownerUserId,
      table.projectId,
      table.sceneId,
      table.contentHash,
    ),
    index("scene_audio_owner_project_status_idx").on(
      table.ownerUserId,
      table.projectId,
      table.status,
    ),
    index("scene_audio_scene_idx").on(table.sceneId),
  ],
);

export const captionTracks = pgTable(
  "caption_tracks",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    sceneAudioId: uuid("scene_audio_id")
      .notNull()
      .references(() => sceneAudio.id, { onDelete: "cascade" }),
    status: sceneAudioStatus("status").notNull().default("stale"),
    contentHash: text("content_hash").notNull(),
    language: text("language").notNull().default("en"),
    createdAt: utcTimestamp("created_at").notNull(),
    updatedAt: utcTimestamp("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("caption_tracks_audio_content_hash_unique").on(
      table.sceneAudioId,
      table.contentHash,
    ),
    index("caption_tracks_owner_project_status_idx").on(
      table.ownerUserId,
      table.projectId,
      table.status,
    ),
    index("caption_tracks_audio_idx").on(table.sceneAudioId),
  ],
);

/** Immutable, ordered timed text derived only from the scene's approved narration. */
export const captionCues = pgTable(
  "caption_cues",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    trackId: uuid("track_id")
      .notNull()
      .references(() => captionTracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    text: text("text").notNull(),
    words: jsonb("words"),
    createdAt: utcTimestamp("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("caption_cues_track_position_unique").on(
      table.trackId,
      table.position,
    ),
    index("caption_cues_owner_project_track_idx").on(
      table.ownerUserId,
      table.projectId,
      table.trackId,
    ),
  ],
);

/** A deterministic ST-066 validation result, bound to one immutable lesson input. */
export const validationRunStatuses = ["passed", "failed"] as const;
export const validationRunStatus = pgEnum(
  "validation_run_status",
  validationRunStatuses,
);
export const validationRuns = pgTable(
  "validation_runs",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    lessonSpecId: uuid("lesson_spec_id")
      .notNull()
      .references(() => lessonSpecs.id, { onDelete: "cascade" }),
    lessonSpecRevision: integer("lesson_spec_revision").notNull(),
    lessonSpecContentHash: text("lesson_spec_content_hash").notNull(),
    inputHash: text("input_hash").notNull(),
    rulesetVersion: text("ruleset_version").notNull(),
    sceneLibraryVersion: text("scene_library_version").notNull(),
    artifactHashes: jsonb("artifact_hashes").notNull().default({}),
    status: validationRunStatus("status").notNull(),
    startedAt: utcTimestamp("started_at").notNull(),
    completedAt: utcTimestamp("completed_at").notNull(),
  },
  (table) => [
    uniqueIndex("validation_runs_tenant_input_hash_unique").on(
      table.ownerUserId,
      table.projectId,
      table.inputHash,
    ),
    index("validation_runs_owner_project_completed_idx").on(
      table.ownerUserId,
      table.projectId,
      table.completedAt,
    ),
    index("validation_runs_lesson_spec_idx").on(table.lessonSpecId),
  ],
);

/** Individual deep-linkable results. Acknowledgements are reserved for warnings. */
export const validationIssues = pgTable(
  "validation_issues",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    runId: uuid("run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    severity: text("severity").notNull(),
    code: text("code").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: uuid("scope_id"),
    sceneId: uuid("scene_id"),
    fieldPath: text("field_path").notNull(),
    message: text("message").notNull(),
    details: jsonb("details").notNull().default({}),
    acknowledgeable: boolean("acknowledgeable").notNull().default(false),
    acknowledgedAt: utcTimestamp("acknowledged_at"),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("validation_issues_owner_project_run_idx").on(
      table.ownerUserId,
      table.projectId,
      table.runId,
    ),
    index("validation_issues_run_severity_idx").on(table.runId, table.severity),
    index("validation_issues_scene_idx").on(table.sceneId),
  ],
);

/** Production renders remain bound to the immutable lesson-version and exact
 * validation run that authorized their creation. Generic `jobs` owns leases. */
export const renderStatuses = [
  "queued",
  "rendering",
  "completed",
  "failed",
  "cancelled",
] as const;
export const renderStatus = pgEnum("render_status", renderStatuses);
export const renderJobs = pgTable(
  "render_jobs",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    lessonVersionId: uuid("lesson_version_id")
      .notNull()
      .references(() => lessonVersions.id, { onDelete: "restrict" }),
    validationRunId: uuid("validation_run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "restrict" }),
    manifest: jsonb("manifest").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    status: renderStatus("status").notNull().default("queued"),
    progress: real("progress").notNull().default(0),
    attempt: integer("attempt").notNull().default(0),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: utcTimestamp("started_at"),
    completedAt: utcTimestamp("completed_at"),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
    updatedAt: utcTimestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("render_jobs_job_unique").on(table.jobId),
    uniqueIndex("render_jobs_tenant_manifest_unique").on(
      table.ownerUserId,
      table.projectId,
      table.manifestHash,
    ),
    index("render_jobs_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const renderedVideos = pgTable(
  "rendered_videos",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    renderJobId: uuid("render_job_id")
      .notNull()
      .references(() => renderJobs.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    durationMs: integer("duration_ms").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fps: integer("fps").notNull(),
    videoCodec: text("video_codec").notNull(),
    audioCodec: text("audio_codec").notNull(),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rendered_videos_render_job_unique").on(table.renderJobId),
    index("rendered_videos_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
    ),
  ],
);

export const renderThumbnails = pgTable(
  "render_thumbnails",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    renderedVideoId: uuid("rendered_video_id")
      .notNull()
      .references(() => renderedVideos.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull(),
    checksumSha256: text("checksum_sha256").notNull(),
    timestampMs: integer("timestamp_ms").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("render_thumbnails_video_unique").on(table.renderedVideoId),
    index("render_thumbnails_owner_project_idx").on(
      table.ownerUserId,
      table.projectId,
    ),
  ],
);

/** A public-view capability. The raw token is never persisted. */
export const shareLinkStatuses = ["active", "revoked"] as const;
export const shareLinkStatus = pgEnum("share_link_status", shareLinkStatuses);
export const shareLinks = pgTable(
  "share_links",
  {
    id: primaryId(),
    ...projectOwnershipColumns(),
    renderedVideoId: uuid("rendered_video_id")
      .notNull()
      .references(() => renderedVideos.id, { onDelete: "restrict" }),
    lessonVersionId: uuid("lesson_version_id")
      .notNull()
      .references(() => lessonVersions.id, { onDelete: "restrict" }),
    tokenHash: text("token_hash").notNull(),
    status: shareLinkStatus("status").notNull().default("active"),
    expiresAt: utcTimestamp("expires_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    revokedAt: utcTimestamp("revoked_at"),
    createdAt: utcTimestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("share_links_token_hash_unique").on(table.tokenHash),
    index("share_links_owner_project_created_idx").on(
      table.ownerUserId,
      table.projectId,
      table.createdAt,
    ),
    index("share_links_public_lookup_idx").on(
      table.tokenHash,
      table.status,
      table.expiresAt,
    ),
  ],
);
