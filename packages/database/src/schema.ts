import {
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
  "share.created",
  "share.revoked",
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
