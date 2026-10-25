import {
  pgTable,
  text,
  integer,
  uuid,
  jsonb,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  users,
  primaryId,
  ownershipColumn,
  utcTimestamp,
  auditColumns,
  revisionColumn,
} from "./schema.js";

export const designSystems = pgTable(
  "design_systems",
  {
    id: primaryId(),
    ownerUserId: ownershipColumn().references(() => users.id, {
      onDelete: "restrict",
    }),
    name: text("name").notNull(),
    revision: revisionColumn(),
    definition: jsonb("definition").notNull(),
    archivedAt: utcTimestamp("archived_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("design_systems_owner_id_unique").on(
      table.ownerUserId,
      table.id,
    ),
    index("design_systems_owner_idx").on(table.ownerUserId, table.createdAt),
    check("design_systems_revision_positive", sql`${table.revision} > 0`),
  ],
);

export const designSystemVersions = pgTable(
  "design_system_versions",
  {
    id: primaryId(),
    ownerUserId: ownershipColumn(),
    systemId: uuid("system_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerUserId, table.systemId],
      foreignColumns: [designSystems.ownerUserId, designSystems.id],
    }).onDelete("restrict"),
    uniqueIndex("design_system_versions_revision_unique").on(
      table.ownerUserId,
      table.systemId,
      table.sourceRevision,
    ),
  ],
);

export const designSystemAssets = pgTable(
  "design_system_assets",
  {
    id: primaryId(),
    ownerUserId: ownershipColumn(),
    systemId: uuid("system_id").notNull(),
    /** Origin context only; project deletion must not cascade into reusable assets. */
    projectId: uuid("project_id").notNull(),
    kind: text("kind").notNull(),
    mediaType: text("media_type").notNull(),
    originalName: text("original_name").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    rightsConfirmedAt: utcTimestamp("rights_confirmed_at")
      .notNull()
      .defaultNow(),
    uploadKey: text("upload_key").notNull(),
    storageKey: text("storage_key"),
    validatedSha256: text("validated_sha256"),
    status: text("status").default("uploading").notNull(),
    expiresAt: utcTimestamp("expires_at").notNull(),
    jobId: uuid("job_id"),
    inspection: jsonb("inspection"),
    rejectionCode: text("rejection_code"),
    ...auditColumns(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerUserId, table.systemId],
      foreignColumns: [designSystems.ownerUserId, designSystems.id],
    }).onDelete("restrict"),
    index("design_system_assets_owner_system_idx").on(
      table.ownerUserId,
      table.systemId,
    ),
    check(
      "design_system_assets_status_check",
      sql`${table.status} in ('uploading', 'pending_validation', 'active', 'rejected')`,
    ),
    check(
      "design_system_assets_size_check",
      sql`${table.sizeBytes} > 0 and ${table.sizeBytes} <= 10485760`,
    ),
    check(
      "design_system_assets_active_check",
      sql`${table.status} <> 'active' or (${table.storageKey} is not null and ${table.validatedSha256} is not null and ${table.inspection} is not null)`,
    ),
  ],
);

/** Paid dispatch receipt and reviewable result. No educational content is stored here. */
export const designSystemInterpretations = pgTable(
  "design_system_interpretations",
  {
    id: primaryId(),
    ownerUserId: ownershipColumn(),
    systemId: uuid("system_id").notNull(),
    projectId: uuid("project_id").notNull(),
    jobId: uuid("job_id").notNull(),
    inputRevision: integer("input_revision").notNull(),
    inputHash: text("input_hash").notNull(),
    input: jsonb("input").notNull(),
    dispatchState: text("dispatch_state").notNull().default("pending"),
    response: jsonb("response"),
    proposal: jsonb("proposal"),
    acceptedRevision: integer("accepted_revision"),
    ...auditColumns(),
  },
  (t) => [
    foreignKey({
      columns: [t.ownerUserId, t.systemId],
      foreignColumns: [designSystems.ownerUserId, designSystems.id],
    }).onDelete("restrict"),
    uniqueIndex("design_interpretations_input_unique").on(
      t.ownerUserId,
      t.systemId,
      t.inputHash,
    ),
    uniqueIndex("design_interpretations_job_unique").on(t.jobId),
    check(
      "design_interpretations_dispatch_check",
      sql`${t.dispatchState} in ('pending','calling','received','failed')`,
    ),
    check("design_interpretations_revision_check", sql`${t.inputRevision} > 0`),
  ],
);
