import type { Identifier } from "@avlp/config";
import { modelCalls, type DatabaseExecutor } from "@avlp/database";
import { QuotaExceededError, type QuotaGuard } from "@avlp/provider-adapters";
import {
  modelCallRecordSchema,
  type ModelCallOperation,
  type ModelCallRecord,
} from "@avlp/schemas";
import { and, eq, gte, sql } from "drizzle-orm";

/**
 * Model-call persistence and per-project call quotas, shared by the pipeline
 * worker's queued generation jobs and the API's synchronous `ai.lesson-intent`
 * call (ST-104). One immutable record per provider interaction, idempotent on
 * the tenant-scoped idempotency key.
 */
export interface ModelCallRepository {
  create(input: {
    record: ModelCallRecord;
    now?: Date;
  }): Promise<{ id: Identifier }>;
}

export class PostgresModelCallRepository implements ModelCallRepository {
  public constructor(private readonly executor: DatabaseExecutor) {}

  public async create(input: {
    record: ModelCallRecord;
    now?: Date;
  }): Promise<{ id: Identifier }> {
    const record = modelCallRecordSchema.parse(input.record);
    const [created] = await this.executor
      .insert(modelCalls)
      .values({
        id: record.id,
        projectId: record.projectId,
        ownerUserId: record.ownerUserId,
        operationType: record.operationType,
        idempotencyKey: record.idempotencyKey,
        promptId: record.promptId,
        promptVersion: record.promptVersion,
        provider: record.provider,
        model: record.model,
        inputVersion: record.inputVersion,
        inputHash: record.inputHash,
        inputUnits: record.inputUnits,
        outputUnits: record.outputUnits,
        estimatedCostUsd: record.estimatedCostUsd.toFixed(6),
        latencyMs: record.latencyMs,
        retryCount: record.retryCount,
        validationStatus: record.validationStatus,
        status: record.status,
        errorCode: record.errorCode,
        correlationId: record.correlationId,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.createdAt),
      })
      .onConflictDoNothing({
        target: [
          modelCalls.ownerUserId,
          modelCalls.projectId,
          modelCalls.idempotencyKey,
        ],
      })
      .returning({ id: modelCalls.id });
    if (created !== undefined) return { id: created.id as Identifier };
    const [existing] = await this.executor
      .select({ id: modelCalls.id })
      .from(modelCalls)
      .where(
        and(
          eq(modelCalls.ownerUserId, record.ownerUserId),
          eq(modelCalls.projectId, record.projectId),
          eq(modelCalls.idempotencyKey, record.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing === undefined)
      throw new Error("The idempotent model-call record could not be read.");
    return { id: existing.id as Identifier };
  }
}

export type ModelCallQuotaLimits = Partial<
  Record<ModelCallOperation, { maxCallsPerHour: number }>
>;

/** Quota guard that counts recent model calls per project and operation. */
export class PostgresGenerationQuotaGuard implements QuotaGuard {
  public constructor(
    private readonly executor: DatabaseExecutor,
    private readonly limits: ModelCallQuotaLimits,
    private readonly now: () => Date = () => new Date(),
    private readonly maxTotalCallsPerHour = 60,
  ) {}

  public async assertCanGenerate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    operationType: string;
    now?: Date;
  }): Promise<void> {
    const limit = this.limits[input.operationType as ModelCallOperation];
    const at = input.now ?? this.now();
    const since = new Date(at.getTime() - 60 * 60 * 1000);
    if (limit !== undefined) {
      const [row] = await this.executor
        .select({ count: sql<number>`count(*)` })
        .from(modelCalls)
        .where(
          and(
            eq(modelCalls.ownerUserId, input.ownerUserId),
            eq(modelCalls.projectId, input.projectId),
            eq(modelCalls.operationType, input.operationType),
            gte(modelCalls.createdAt, since),
          ),
        );
      if ((row?.count ?? 0) >= limit.maxCallsPerHour)
        throw new QuotaExceededError(
          `The ${input.operationType} generation quota for this project has been reached.`,
        );
    }
    const [total] = await this.executor
      .select({ count: sql<number>`count(*)` })
      .from(modelCalls)
      .where(
        and(
          eq(modelCalls.ownerUserId, input.ownerUserId),
          eq(modelCalls.projectId, input.projectId),
          gte(modelCalls.createdAt, since),
        ),
      );
    if ((total?.count ?? 0) >= this.maxTotalCallsPerHour)
      throw new QuotaExceededError(
        "The total AI provider-call quota for this project has been reached.",
      );
  }
}
