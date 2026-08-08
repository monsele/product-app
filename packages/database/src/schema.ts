import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
    projectId: uuid("project_id").notNull(),
    ownerUserId: ownershipColumn(),
    inputVersion: text("input_version").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    payloadVersion: integer("payload_version").notNull(),
    payload: jsonb("payload").notNull(),
    state: jobState("state").notNull().default("queued"),
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
    ownerUserId: ownershipColumn(),
    projectId: uuid("project_id").notNull(),
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
