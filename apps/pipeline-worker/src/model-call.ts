import { createId, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  modelCalls,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type JobHandler,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  PostgresAuditWriter,
  PostgresUsageMeter,
  type UsageMeter,
} from "@avlp/observability";
import {
  computeGenerationInputVersion,
  estimateCostUsd,
  generateStructuredOutput,
  ProviderCallError,
  QuotaExceededError,
  renderPrompt,
  stableJsonHash,
  StructuredOutputError,
  type LanguageModelProvider,
  type ModelPricingTable,
  type PromptRegistry,
  type PromptRenderVariables,
  type ProviderCompletionResponse,
  type QuotaGuard,
  type StructuredOutputResult,
} from "@avlp/provider-adapters";
import {
  buildSourcePackage,
  modelCallJobPayloadSchema,
  modelCallRecordSchema,
  sourceSnapshotSchema,
  type ModelCallJobPayload,
  type ModelCallOperation,
  type ModelCallParams,
  type ModelCallRecord,
  type SourcePackage,
  type SourceSnapshot,
} from "@avlp/schemas";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { type ZodType } from "zod";

function createAuditWriter(executor: DatabaseExecutor) {
  return new PostgresAuditWriter(executor);
}

export type { ModelCallOperation, ModelCallParams, ModelCallRecord };

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
  ) {}

  public async assertCanGenerate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    operationType: string;
    now?: Date;
  }): Promise<void> {
    const limit = this.limits[input.operationType as ModelCallOperation];
    if (limit === undefined) return;
    const at = input.now ?? this.now();
    const since = new Date(at.getTime() - 60 * 60 * 1000);
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
}

export type ApprovedSourceSnapshotResult =
  | { status: "ok"; snapshot: SourceSnapshot }
  | { status: "missing" }
  | { status: "stale" };

/**
 * Loads an approved source snapshot for a tenant. Generation must reference
 * the latest approved snapshot for the project; referencing an older snapshot
 * (or a missing one) is rejected before any provider call.
 */
export async function loadApprovedSourceSnapshot(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  snapshotId: Identifier;
}): Promise<ApprovedSourceSnapshotResult> {
  const [row] = await input.executor
    .select()
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.id, input.snapshotId),
        eq(sourceSnapshots.ownerUserId, input.ownerUserId),
        eq(sourceSnapshots.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (row === undefined) return { status: "missing" };
  const [latest] = await input.executor
    .select({ snapshotVersion: sourceSnapshots.snapshotVersion })
    .from(sourceSnapshots)
    .where(
      and(
        eq(sourceSnapshots.ownerUserId, input.ownerUserId),
        eq(sourceSnapshots.projectId, input.projectId),
      ),
    )
    .orderBy(desc(sourceSnapshots.snapshotVersion))
    .limit(1);
  if (latest === undefined || latest.snapshotVersion !== row.snapshotVersion)
    return { status: "stale" };
  return { status: "ok", snapshot: sourceSnapshotSchema.parse(row.payload) };
}

export type ModelCallHandlerOptions<T> = {
  jobType: string;
  payloadVersion: number;
  operationType: ModelCallOperation;
  outputSchema: ZodType<T>;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  database: DatabaseClient;
  sourceSnapshotLoader?: (input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    snapshotId: Identifier;
  }) => Promise<ApprovedSourceSnapshotResult>;
  modelCalls?: ModelCallRepository;
  usageMeter?: UsageMeter;
  auditWriter?: Pick<ReturnType<typeof createAuditWriter>, "write">;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  deterministicChecks?: (
    value: T,
    sourcePackage: SourcePackage,
    operationContext: unknown,
  ) => void;
  renderVariables?: (input: {
    sourcePackage: SourcePackage;
    params: ModelCallParams;
  }) => PromptRenderVariables;
  /**
   * Optional asynchronous operation-context loader that runs after the
   * approved snapshot is loaded and the bounded source package is built (for
   * example, to load the approved objective set an outline must cover). The
   * returned `variables` are merged into the prompt render variables, and the
   * returned `context` is passed to deterministic checks and candidate
   * persistence so operations can validate against project-owned data that is
   * not part of the source package.
   */
  loadOperationContext?: (input: {
    snapshot: SourceSnapshot;
    sourcePackage: SourcePackage;
    params: ModelCallParams;
    context: {
      ownerUserId: Identifier;
      projectId: Identifier;
      correlationId: Identifier;
      idempotencyKey: string;
    };
  }) => Promise<{
    variables?: PromptRenderVariables;
    context?: unknown;
  }>;
  /**
   * Optional domain persistence hook run by operation-specific handlers after
   * the model call is recorded and metered. It must be idempotent (same
   * job idempotency key returns the existing candidate). Failures are
   * classified retryable so the job platform retries them.
   */
  persistCandidate?: (input: {
    value: T;
    sourcePackage: SourcePackage;
    params: ModelCallParams;
    modelCall: ModelCallRecord;
    snapshot: SourceSnapshot;
    operationContext?: unknown;
    context: {
      ownerUserId: Identifier;
      projectId: Identifier;
      correlationId: Identifier;
      idempotencyKey: string;
    };
    now: Date;
  }) => Promise<{ id: Identifier }>;
  now?: () => Date;
};

/**
 * The standard model-call lifecycle as a pipeline worker generation handler:
 * authorize inputs → verify approved input versions → enforce quota → build a
 * bounded source package → render the versioned prompt → call the provider →
 * validate structured output with bounded repair → run deterministic checks →
 * persist the model-call record → record usage and cost. Provider response
 * types never enter the domain record.
 */
export function createModelCallGenerationHandler<T>(
  options: ModelCallHandlerOptions<T>,
): RegisteredJobHandler {
  const now = options.now ?? (() => new Date());
  const modelCallsRepository =
    options.modelCalls ?? new PostgresModelCallRepository(options.database);
  const usageMeter =
    options.usageMeter ?? new PostgresUsageMeter(options.database);
  const auditWriter =
    options.auditWriter ?? createAuditWriter(options.database);
  const pricing = options.pricing;
  const handler: JobHandler<ModelCallJobPayload> = async (payload, context) => {
    if (payload.operationType !== options.operationType)
      throw new JobExecutionError(
        "terminal",
        "MODEL_CALL_OPERATION_MISMATCH",
        "The job payload references a different AI operation than this handler.",
      );
    const timestamp = now();
    const loadSnapshot =
      options.sourceSnapshotLoader ??
      ((input: {
        ownerUserId: Identifier;
        projectId: Identifier;
        snapshotId: Identifier;
      }) =>
        loadApprovedSourceSnapshot({
          executor: options.database,
          ...input,
        }));
    const snapshotResult = await loadSnapshot({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      snapshotId: payload.sourceSnapshotId,
    });
    if (snapshotResult.status === "missing")
      throw new JobExecutionError(
        "terminal",
        "SOURCE_SNAPSHOT_NOT_FOUND",
        "The referenced approved source snapshot does not exist.",
      );
    if (snapshotResult.status === "stale")
      throw new JobExecutionError(
        "terminal",
        "SOURCE_SNAPSHOT_STALE",
        "The referenced source snapshot is no longer the approved version.",
      );
    const sourcePackage = buildSourcePackage(
      snapshotResult.snapshot,
      payload.narrowing ?? {},
    );
    const operationContext = await options.loadOperationContext?.({
      snapshot: snapshotResult.snapshot,
      sourcePackage,
      params: payload.params ?? {},
      context: {
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
      },
    });
    const prompt = options.promptRegistry.get(
      payload.promptId,
      payload.promptVersion,
    );
    const params: ModelCallParams = payload.params ?? {};
    const rendered = renderPrompt(prompt, {
      sourcePackage: JSON.stringify(sourcePackage),
      configuration: JSON.stringify(params),
      ...(options.renderVariables?.({
        sourcePackage,
        params,
      }) ?? {}),
      ...(operationContext?.variables ?? {}),
    });
    const paramsHash = stableJsonHash(params);
    const inputVersion = computeGenerationInputVersion({
      operationType: payload.operationType,
      promptId: payload.promptId,
      promptVersion: payload.promptVersion,
      model: payload.model,
      sourceSnapshotId: snapshotResult.snapshot.id,
      sourceSnapshotContentHash: snapshotResult.snapshot.contentHash,
      paramsHash,
    });
    const inputHash = stableJsonHash({
      sourcePackage,
      promptId: payload.promptId,
      promptVersion: payload.promptVersion,
      model: payload.model,
      params,
    });
    try {
      await options.quotaGuard.assertCanGenerate({
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        operationType: payload.operationType,
        now: timestamp,
      });
      const structured = await generateStructuredOutput<T>({
        provider: options.provider,
        request: {
          model: payload.model,
          messages: [
            { role: "system", content: rendered.system },
            { role: "user", content: rendered.user },
          ],
          responseFormat: "json_object",
        },
        schema: options.outputSchema,
        ...(options.maxRepairs === undefined
          ? {}
          : { maxRepairs: options.maxRepairs }),
      });
      try {
        options.deterministicChecks?.(
          structured.value,
          sourcePackage,
          operationContext?.context,
        );
      } catch {
        await recordFailedCall({
          context,
          payload,
          timestamp,
          inputVersion,
          inputHash,
          responses: structured.responses,
          providerId: options.provider.providerId,
          errorCode: "DETERMINISTIC_CHECK_FAILED",
          modelCallsRepository,
          usageMeter,
          ...(pricing === undefined ? {} : { pricing }),
        });
        throw new JobExecutionError(
          "terminal",
          "MODEL_OUTPUT_DETERMINISTIC_FAILURE",
          "The model output failed deterministic checks.",
        );
      }
      const record = buildSucceededRecord({
        context,
        payload,
        timestamp,
        inputVersion,
        inputHash,
        structured,
        providerId: options.provider.providerId,
        ...(pricing === undefined ? {} : { pricing }),
      });
      const modelCall = await modelCallsRepository.create({
        record,
        now: timestamp,
      });
      await recordUsage({
        context,
        payload,
        timestamp,
        record,
        status: "succeeded",
        usageMeter,
      });
      let candidateId: Identifier | undefined;
      if (options.persistCandidate !== undefined) {
        try {
          const candidate = await options.persistCandidate({
            value: structured.value,
            sourcePackage,
            params,
            modelCall: record,
            snapshot: snapshotResult.snapshot,
            operationContext: operationContext?.context,
            context: {
              ownerUserId: context.ownerUserId,
              projectId: context.projectId,
              correlationId: context.correlationId,
              idempotencyKey: context.idempotencyKey,
            },
            now: timestamp,
          });
          candidateId = candidate.id;
        } catch {
          throw new JobExecutionError(
            "retryable",
            "CANDIDATE_PERSIST_FAILED",
            "The generated candidate could not be persisted.",
          );
        }
      }
      await auditWriter.write({
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        actor: { type: "system" },
        eventType: "ai.generated",
        target: { type: "model_call", id: modelCall.id },
        correlationId: context.correlationId,
        metadata: {
          operationType: payload.operationType,
          promptId: payload.promptId,
          promptVersion: payload.promptVersion,
          model: payload.model,
          inputVersion,
        },
        occurredAt: timestamp,
      });
      return {
        modelCallId: modelCall.id,
        operationType: payload.operationType,
        promptId: payload.promptId,
        promptVersion: payload.promptVersion,
        inputVersion,
        validationStatus: record.validationStatus,
        inputUnits: record.inputUnits,
        outputUnits: record.outputUnits,
        estimatedCostUsd: record.estimatedCostUsd,
        ...(candidateId === undefined ? {} : { candidateId }),
      };
    } catch (error) {
      if (error instanceof JobExecutionError) throw error;
      if (error instanceof QuotaExceededError)
        throw new JobExecutionError(
          "terminal",
          "AI_QUOTA_EXCEEDED",
          "The AI generation quota for this project has been reached.",
        );
      if (error instanceof ProviderCallError) {
        await recordFailedCall({
          context,
          payload,
          timestamp,
          inputVersion,
          inputHash,
          responses: [],
          providerId: options.provider.providerId,
          errorCode: error.code,
          modelCallsRepository,
          usageMeter,
          ...(pricing === undefined ? {} : { pricing }),
        });
        throw new JobExecutionError(
          error.retryable ? "retryable" : "terminal",
          error.code,
          error.message,
        );
      }
      if (error instanceof StructuredOutputError) {
        await recordFailedCall({
          context,
          payload,
          timestamp,
          inputVersion,
          inputHash,
          responses: error.responses,
          providerId: options.provider.providerId,
          errorCode: "STRUCTURED_OUTPUT_INVALID",
          modelCallsRepository,
          usageMeter,
          ...(pricing === undefined ? {} : { pricing }),
        });
        throw new JobExecutionError(
          "terminal",
          "STRUCTURED_OUTPUT_INVALID",
          "The model output did not validate after the bounded repair policy.",
        );
      }
      throw error;
    }
  };
  return defineJobHandler(
    options.jobType,
    options.payloadVersion,
    modelCallJobPayloadSchema,
    handler,
  );
}

function buildSucceededRecord<T>(input: {
  context: ModelCallJobContext;
  payload: ModelCallJobPayload;
  timestamp: Date;
  inputVersion: string;
  inputHash: string;
  structured: StructuredOutputResult<T>;
  providerId: string;
  pricing?: ModelPricingTable;
}): ModelCallRecord {
  const usage = aggregateResponses(input.structured.responses);
  return modelCallRecordSchema.parse({
    id: createId(input.timestamp),
    projectId: input.context.projectId,
    ownerUserId: input.context.ownerUserId,
    operationType: input.payload.operationType,
    idempotencyKey: modelCallIdempotencyKey(input.context, input.payload),
    promptId: input.payload.promptId,
    promptVersion: input.payload.promptVersion,
    provider: input.providerId,
    model: input.payload.model,
    inputVersion: input.inputVersion,
    inputHash: input.inputHash,
    inputUnits: usage.inputUnits,
    outputUnits: usage.outputUnits,
    estimatedCostUsd: estimateCostUsd({
      model: input.payload.model,
      inputTokens: usage.inputUnits,
      outputTokens: usage.outputUnits,
      ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    }),
    latencyMs: aggregateResponseLatency(input.structured.responses),
    retryCount: Math.max(0, input.structured.responses.length - 1),
    validationStatus:
      input.structured.repairAttempts > 0 ? "repaired" : "validated",
    status: "succeeded",
    errorCode: null,
    correlationId: input.context.correlationId,
    createdAt: serializeUtcTimestamp(input.timestamp),
  });
}

async function recordFailedCall(input: {
  context: ModelCallJobContext;
  payload: ModelCallJobPayload;
  timestamp: Date;
  inputVersion: string;
  inputHash: string;
  responses: readonly ProviderCompletionResponse[];
  providerId: string;
  errorCode: string;
  modelCallsRepository: ModelCallRepository;
  usageMeter: UsageMeter;
  pricing?: ModelPricingTable;
}): Promise<void> {
  const usage = aggregateResponses(input.responses);
  const record = modelCallRecordSchema.parse({
    id: createId(input.timestamp),
    projectId: input.context.projectId,
    ownerUserId: input.context.ownerUserId,
    operationType: input.payload.operationType,
    idempotencyKey: modelCallIdempotencyKey(input.context, input.payload),
    promptId: input.payload.promptId,
    promptVersion: input.payload.promptVersion,
    provider: input.providerId,
    model: input.payload.model,
    inputVersion: input.inputVersion,
    inputHash: input.inputHash,
    inputUnits: usage.inputUnits,
    outputUnits: usage.outputUnits,
    estimatedCostUsd: estimateCostUsd({
      model: input.payload.model,
      inputTokens: usage.inputUnits,
      outputTokens: usage.outputUnits,
      ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    }),
    latencyMs: aggregateResponseLatency(input.responses),
    retryCount: Math.max(0, input.responses.length - 1),
    validationStatus: "invalid",
    status: "failed",
    errorCode: input.errorCode,
    correlationId: input.context.correlationId,
    createdAt: serializeUtcTimestamp(input.timestamp),
  });
  await input.modelCallsRepository
    .create({ record, now: input.timestamp })
    .catch(() => undefined);
  await recordUsage({
    context: input.context,
    payload: input.payload,
    timestamp: input.timestamp,
    record,
    status: "failed",
    usageMeter: input.usageMeter,
  }).catch(() => undefined);
}

async function recordUsage(input: {
  context: ModelCallJobContext;
  payload: ModelCallJobPayload;
  timestamp: Date;
  record: ModelCallRecord;
  status: "succeeded" | "failed";
  usageMeter: UsageMeter;
}): Promise<void> {
  await input.usageMeter.record({
    ownerUserId: input.context.ownerUserId,
    projectId: input.context.projectId,
    operationType: input.payload.operationType,
    idempotencyKey: modelCallIdempotencyKey(input.context, input.payload),
    provider: input.record.provider,
    model: input.payload.model,
    unit: "token",
    quantity: input.record.inputUnits + input.record.outputUnits,
    inputUnits: input.record.inputUnits,
    outputUnits: input.record.outputUnits,
    estimatedCostUsd: input.record.estimatedCostUsd,
    latencyMs: input.record.latencyMs,
    retryCount: input.record.retryCount,
    status: input.status,
    correlationId: input.context.correlationId,
    metadata: {
      promptId: input.payload.promptId,
      promptVersion: input.payload.promptVersion,
      modelCallId: input.record.id,
    },
    occurredAt: input.timestamp,
  });
}

type ModelCallJobContext = {
  ownerUserId: Identifier;
  projectId: Identifier;
  correlationId: Identifier;
  idempotencyKey: string;
  attempt: number;
};

function modelCallIdempotencyKey(
  context: { idempotencyKey: string; attempt: number },
  payload: ModelCallJobPayload,
): string {
  const source = stableJsonHash({
    jobIdempotencyKey: context.idempotencyKey,
    attempt: context.attempt,
    operationType: payload.operationType,
  });
  return `model-call:${source}:${payload.operationType}`;
}

function aggregateResponses(responses: readonly ProviderCompletionResponse[]): {
  inputUnits: number;
  outputUnits: number;
} {
  return responses.reduce(
    (total, response) => ({
      inputUnits: total.inputUnits + response.usage.inputTokens,
      outputUnits: total.outputUnits + response.usage.outputTokens,
    }),
    { inputUnits: 0, outputUnits: 0 },
  );
}

function aggregateResponseLatency(
  responses: readonly ProviderCompletionResponse[],
): number {
  return responses.reduce((total, response) => total + response.latencyMs, 0);
}
