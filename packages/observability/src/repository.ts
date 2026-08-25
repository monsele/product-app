import { createId, type Identifier } from "@avlp/config";
import {
  auditEvents,
  jobs,
  usageRecords,
  type DatabaseExecutor,
} from "@avlp/database";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  safeMetadataSchema,
  usageMeasurementSchema,
  writeAuditEventSchema,
  type AuditEventType,
  type UsageMeasurement,
  type UsageMeter,
  type UsageOperationType,
  type SafeMetadata,
  type SafeMetadataValue,
} from "./contracts.js";
import { redactSensitiveData } from "./redaction.js";

function sanitizedMetadata(value: unknown) {
  const redacted = redactSensitiveData(value ?? {});
  return safeMetadataSchema.parse(
    typeof redacted === "object" &&
      redacted !== null &&
      !Array.isArray(redacted)
      ? redacted
      : { value: redacted },
  );
}

function canonicalMetadata(metadata: SafeMetadata): string {
  const normalize = (value: SafeMetadataValue): SafeMetadataValue => {
    if (Array.isArray(value)) return value.map(normalize);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return JSON.stringify(normalize(metadata));
}

export class PostgresAuditWriter {
  public constructor(private readonly executor: DatabaseExecutor) {}

  public async write(input: unknown): Promise<{ id: Identifier }> {
    const event = writeAuditEventSchema.parse(input);
    const id = event.id ?? createId(event.occurredAt);
    const [created] = await this.executor
      .insert(auditEvents)
      .values({
        id,
        ownerUserId: event.ownerUserId,
        projectId: event.projectId ?? null,
        actorType: event.actor.type,
        actorUserId: event.actor.type === "user" ? event.actor.userId : null,
        eventType: event.eventType,
        targetType: event.target.type,
        targetId: event.target.id,
        correlationId: event.correlationId,
        metadata: sanitizedMetadata(event.metadata),
        occurredAt: event.occurredAt ?? new Date(),
      })
      .returning({ id: auditEvents.id });
    if (created === undefined)
      throw new Error("The audit event was not persisted.");
    return { id: created.id as Identifier };
  }
}

export class PostgresUsageMeter implements UsageMeter {
  public constructor(private readonly executor: DatabaseExecutor) {}

  public async record(
    rawMeasurement: UsageMeasurement,
  ): Promise<{ id: Identifier }> {
    const measurement = usageMeasurementSchema.parse(rawMeasurement);
    const id = measurement.id ?? createId(measurement.occurredAt);
    const metadata = sanitizedMetadata(measurement.metadata);
    const [created] = await this.executor
      .insert(usageRecords)
      .values({
        id,
        ownerUserId: measurement.ownerUserId,
        projectId: measurement.projectId,
        operationType: measurement.operationType,
        idempotencyKey: measurement.idempotencyKey,
        provider: measurement.provider ?? null,
        model: measurement.model ?? null,
        unit: measurement.unit,
        quantity: measurement.quantity.toFixed(4),
        inputUnits: measurement.inputUnits ?? null,
        outputUnits: measurement.outputUnits ?? null,
        estimatedCostUsd: measurement.estimatedCostUsd.toFixed(6),
        latencyMs: measurement.latencyMs ?? null,
        retryCount: measurement.retryCount,
        status: measurement.status,
        correlationId: measurement.correlationId,
        metadata,
        occurredAt: measurement.occurredAt ?? new Date(),
      })
      .onConflictDoNothing({
        target: [
          usageRecords.ownerUserId,
          usageRecords.projectId,
          usageRecords.idempotencyKey,
        ],
      })
      .returning({ id: usageRecords.id });
    if (created !== undefined) return { id: created.id as Identifier };
    const [existing] = await this.executor
      .select({
        id: usageRecords.id,
        ownerUserId: usageRecords.ownerUserId,
        projectId: usageRecords.projectId,
        operationType: usageRecords.operationType,
        provider: usageRecords.provider,
        model: usageRecords.model,
        unit: usageRecords.unit,
        quantity: usageRecords.quantity,
        inputUnits: usageRecords.inputUnits,
        outputUnits: usageRecords.outputUnits,
        estimatedCostUsd: usageRecords.estimatedCostUsd,
        latencyMs: usageRecords.latencyMs,
        retryCount: usageRecords.retryCount,
        status: usageRecords.status,
        correlationId: usageRecords.correlationId,
        metadata: usageRecords.metadata,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.ownerUserId, measurement.ownerUserId),
          eq(usageRecords.projectId, measurement.projectId),
          eq(usageRecords.idempotencyKey, measurement.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing === undefined)
      throw new Error("The idempotent usage record could not be read.");
    if (
      existing.ownerUserId !== measurement.ownerUserId ||
      existing.projectId !== measurement.projectId ||
      existing.operationType !== measurement.operationType ||
      existing.provider !== (measurement.provider ?? null) ||
      existing.model !== (measurement.model ?? null) ||
      existing.unit !== measurement.unit ||
      existing.quantity !== measurement.quantity.toFixed(4) ||
      existing.inputUnits !== (measurement.inputUnits ?? null) ||
      existing.outputUnits !== (measurement.outputUnits ?? null) ||
      existing.estimatedCostUsd !== measurement.estimatedCostUsd.toFixed(6) ||
      existing.latencyMs !== (measurement.latencyMs ?? null) ||
      existing.retryCount !== measurement.retryCount ||
      existing.status !== measurement.status ||
      existing.correlationId !== measurement.correlationId ||
      canonicalMetadata(safeMetadataSchema.parse(existing.metadata)) !==
        canonicalMetadata(metadata)
    )
      throw new Error(
        "A usage idempotency key was reused for a different measurement.",
      );
    return { id: existing.id as Identifier };
  }
}

export type UsageAggregate = {
  ownerUserId: string;
  projectId: string;
  operationType: UsageOperationType;
  quantity: string;
  estimatedCostUsd: string;
  inputUnits: number;
  outputUnits: number;
  records: number;
};

export type UserUsageAggregate = Omit<UsageAggregate, "projectId">;

export async function aggregateUserUsage(
  executor: DatabaseExecutor,
  input: { ownerUserId: Identifier },
): Promise<UserUsageAggregate[]> {
  return executor
    .select({
      ownerUserId: usageRecords.ownerUserId,
      operationType: usageRecords.operationType,
      quantity: sql<string>`coalesce(sum(${usageRecords.quantity}), 0)`,
      estimatedCostUsd: sql<string>`coalesce(sum(${usageRecords.estimatedCostUsd}), 0)`,
      inputUnits: sql<number>`coalesce(sum(${usageRecords.inputUnits}), 0)::int`,
      outputUnits: sql<number>`coalesce(sum(${usageRecords.outputUnits}), 0)::int`,
      records: sql<number>`count(*)::int`,
    })
    .from(usageRecords)
    .where(eq(usageRecords.ownerUserId, input.ownerUserId))
    .groupBy(usageRecords.ownerUserId, usageRecords.operationType);
}

export async function aggregateProjectUsage(
  executor: DatabaseExecutor,
  input: { ownerUserId: Identifier; projectId: Identifier },
): Promise<UsageAggregate[]> {
  return executor
    .select({
      ownerUserId: usageRecords.ownerUserId,
      projectId: usageRecords.projectId,
      operationType: usageRecords.operationType,
      quantity: sql<string>`coalesce(sum(${usageRecords.quantity}), 0)`,
      estimatedCostUsd: sql<string>`coalesce(sum(${usageRecords.estimatedCostUsd}), 0)`,
      inputUnits: sql<number>`coalesce(sum(${usageRecords.inputUnits}), 0)::int`,
      outputUnits: sql<number>`coalesce(sum(${usageRecords.outputUnits}), 0)::int`,
      records: sql<number>`count(*)::int`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.ownerUserId, input.ownerUserId),
        eq(usageRecords.projectId, input.projectId),
      ),
    )
    .groupBy(
      usageRecords.ownerUserId,
      usageRecords.projectId,
      usageRecords.operationType,
    );
}

export async function listProjectAuditEvents(
  executor: DatabaseExecutor,
  input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    eventType?: AuditEventType;
    limit?: number;
  },
) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError("Audit-event limit must be between 1 and 100.");
  return executor
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.ownerUserId, input.ownerUserId),
        eq(auditEvents.projectId, input.projectId),
        ...(input.eventType === undefined
          ? []
          : [eq(auditEvents.eventType, input.eventType)]),
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);
}

export async function investigateCorrelation(
  executor: DatabaseExecutor,
  input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    correlationId: Identifier;
    limit?: number;
  },
) {
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError("Investigation limit must be between 1 and 100.");
  const tenant = and(
    eq(jobs.ownerUserId, input.ownerUserId),
    eq(jobs.projectId, input.projectId),
    eq(jobs.correlationId, input.correlationId),
  );
  const auditTenant = and(
    eq(auditEvents.ownerUserId, input.ownerUserId),
    eq(auditEvents.projectId, input.projectId),
    eq(auditEvents.correlationId, input.correlationId),
  );
  const usageTenant = and(
    eq(usageRecords.ownerUserId, input.ownerUserId),
    eq(usageRecords.projectId, input.projectId),
    eq(usageRecords.correlationId, input.correlationId),
  );
  const [jobRows, auditRows, usageRows] = await Promise.all([
    executor
      .select({
        id: jobs.id,
        jobType: jobs.jobType,
        queueName: jobs.queueName,
        projectId: jobs.projectId,
        ownerUserId: jobs.ownerUserId,
        correlationId: jobs.correlationId,
        state: jobs.state,
        attempts: jobs.attempts,
        maxAttempts: jobs.maxAttempts,
        startedAt: jobs.startedAt,
        completedAt: jobs.completedAt,
        heartbeatAt: jobs.heartbeatAt,
        errorClassification: jobs.errorClassification,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(tenant)
      .orderBy(desc(jobs.createdAt))
      .limit(limit),
    executor
      .select({
        id: auditEvents.id,
        ownerUserId: auditEvents.ownerUserId,
        projectId: auditEvents.projectId,
        actorType: auditEvents.actorType,
        actorUserId: auditEvents.actorUserId,
        eventType: auditEvents.eventType,
        targetType: auditEvents.targetType,
        targetId: auditEvents.targetId,
        correlationId: auditEvents.correlationId,
        metadata: auditEvents.metadata,
        occurredAt: auditEvents.occurredAt,
      })
      .from(auditEvents)
      .where(auditTenant)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(limit),
    executor
      .select({
        id: usageRecords.id,
        ownerUserId: usageRecords.ownerUserId,
        projectId: usageRecords.projectId,
        operationType: usageRecords.operationType,
        provider: usageRecords.provider,
        model: usageRecords.model,
        unit: usageRecords.unit,
        quantity: usageRecords.quantity,
        inputUnits: usageRecords.inputUnits,
        outputUnits: usageRecords.outputUnits,
        estimatedCostUsd: usageRecords.estimatedCostUsd,
        latencyMs: usageRecords.latencyMs,
        retryCount: usageRecords.retryCount,
        status: usageRecords.status,
        correlationId: usageRecords.correlationId,
        metadata: usageRecords.metadata,
        occurredAt: usageRecords.occurredAt,
      })
      .from(usageRecords)
      .where(usageTenant)
      .orderBy(desc(usageRecords.occurredAt))
      .limit(limit),
  ]);
  return { jobs: jobRows, auditEvents: auditRows, usageRecords: usageRows };
}
