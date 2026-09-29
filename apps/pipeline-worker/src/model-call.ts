import { createId, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type JobHandler,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  PostgresAuditWriter,
  PostgresGenerationQuotaGuard,
  PostgresModelCallRepository,
  PostgresUsageMeter,
  type ModelCallQuotaLimits,
  type ModelCallRepository,
  type UsageMeter,
} from "@avlp/observability";
import {
  computeGenerationInputVersion,
  estimateCostUsd,
  focusAudienceVariables,
  generateStructuredOutput,
  ApprovedProviderUnavailableError,
  ProviderEnvelopeViolationError,
  ProviderCallError,
  QuotaExceededError,
  renderPrompt,
  stableJsonHash,
  StructuredOutputError,
  resolveJobAdapter,
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
import { and, desc, eq } from "drizzle-orm";
import { type ZodType, type ZodTypeDef } from "zod";

function createAuditWriter(executor: DatabaseExecutor) {
  return new PostgresAuditWriter(executor);
}

export type { ModelCallOperation, ModelCallParams, ModelCallRecord };

// ST-104: the model-call repository and quota guard moved to
// `@avlp/observability` so the API process (ai.lesson-intent) records and
// meters model calls through the same code. Re-exported for existing callers.
export {
  PostgresGenerationQuotaGuard,
  PostgresModelCallRepository,
  type ModelCallQuotaLimits,
  type ModelCallRepository,
};

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

/**
 * A rule an accepted generation still violates. Operations return these from
 * their deterministic checks for guidance a reviewer weighs — pacing, house
 * style — as opposed to invariants the pipeline depends on, which throw.
 */
export type DeterministicWarning = {
  code: string;
  message: string;
};

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
  /**
   * Pure, deterministic post-processing applied to every schema-valid output
   * before deterministic checks, for values code computes more reliably than
   * the model (such as rescaling duration estimates to an exact total, or
   * clamping character offsets to the text they index).
   */
  normalizeOutput?: (
    value: T,
    operationContext: unknown,
    sourcePackage: SourcePackage,
  ) => T;
  /**
   * Throws to reject the generation outright; may instead return warnings for
   * rules the draft may violate while remaining usable, which are reported on
   * the completed job rather than discarding the work.
   */
  deterministicChecks?: (
    value: T,
    sourcePackage: SourcePackage,
    operationContext: unknown,
  ) => readonly DeterministicWarning[] | void;
  /**
   * Returns one operation-specific instruction for correcting a deterministic
   * failure, or undefined to fall back to the generic instruction built from
   * the failed rule's message. Each corrective round is one provider call,
   * checked again by the same rules, so a correction can never let a
   * violation through; see `maxDeterministicRepairs`.
   */
  deterministicRepairInstruction?: (input: {
    error: unknown;
    value: T;
    sourcePackage: SourcePackage;
    operationContext: unknown;
  }) => string | undefined;
  /** A bounded patch response decoded into a complete candidate before rechecking. */
  deterministicRepair?: (input: { error: unknown; value: T }) =>
    | {
        instruction: string;
        schema: ZodType<T, ZodTypeDef, unknown>;
      }
    | undefined;
  /**
   * Optional instruction for one improvement round when a draft passed every
   * check but returned warnings worth fixing; undefined skips the round. The
   * improvement is kept only if it passes every check.
   */
  warningRepairInstruction?: (input: {
    warnings: readonly DeterministicWarning[];
    value: T;
    operationContext: unknown;
  }) => string | undefined;
  /**
   * Corrective rounds allowed after a deterministic failure. Each round is one
   * provider call, checked again. Default `defaultMaxDeterministicRepairs`;
   * 0 disables correction.
   */
  maxDeterministicRepairs?: number;
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
      // ST-104: `{{focus}}` ("none" without one) and `{{audience}}`, derived
      // from the pinned params. Prompt versions without these slots ignore them.
      ...focusAudienceVariables(params),
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
      const resolvedProvider = resolveJobAdapter({
        jobType: options.jobType,
        adapterFamily: "language-model",
        adapter: options.provider,
        approvedProvider: payload.providerApproval.providerId,
        approvedModel: payload.providerApproval.model,
        executingModel: payload.model,
        approvalReference: payload.providerApproval.approvalReference,
        estimatedCostUsd: payload.providerApproval.estimatedCostUsd,
        selectionReason: payload.providerApproval.selectionReason,
        ...(payload.providerApproval.oneShotRunId === undefined
          ? {}
          : { oneShotRunId: payload.providerApproval.oneShotRunId }),
      });
      await options.quotaGuard.assertCanGenerate({
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        operationType: payload.operationType,
        now: timestamp,
      });
      const generationRequest = {
        model: payload.model,
        messages: [
          { role: "system" as const, content: rendered.system },
          { role: "user" as const, content: rendered.user },
        ],
        responseFormat: "json_object" as const,
      };
      const normalize = (
        result: StructuredOutputResult<T>,
      ): StructuredOutputResult<T> =>
        options.normalizeOutput === undefined
          ? result
          : {
              ...result,
              value: options.normalizeOutput(
                result.value,
                operationContext?.context,
                sourcePackage,
              ),
            };
      let structured = await generateStructuredOutput<T>({
        provider: resolvedProvider.adapter,
        request: generationRequest,
        schema: options.outputSchema,
        ...(options.maxRepairs === undefined
          ? {}
          : { maxRepairs: options.maxRepairs }),
      });
      structured = normalize(structured);
      const executed = structured.responses.at(-1);
      if (
        executed === undefined ||
        executed.providerId !== resolvedProvider.adapter.providerId ||
        executed.model !== payload.model
      )
        throw new ApprovedProviderUnavailableError({
          approvedProvider: resolvedProvider.adapter.providerId,
          approvedModel: payload.model,
          foundProvider: executed?.providerId ?? "unknown",
          ...(executed?.model === undefined
            ? {}
            : { foundModel: executed.model }),
        });
      let warnings: readonly DeterministicWarning[] = [];
      try {
        warnings =
          options.deterministicChecks?.(
            structured.value,
            sourcePackage,
            operationContext?.context,
          ) ?? [];
      } catch (initialError) {
        // Each round sends the latest response back with the instruction for
        // its violations, then re-checks. Bounded: a failure that survives
        // every round remains a clear failure rather than an unbounded loop.
        let error: unknown = initialError;
        let repairedSuccessfully = false;
        const maxRounds =
          options.maxDeterministicRepairs ?? defaultMaxDeterministicRepairs;
        for (let round = 0; round < maxRounds; round += 1) {
          const patchRepair = options.deterministicRepair?.({
            error,
            value: structured.value,
          });
          const repairInstruction =
            patchRepair?.instruction ??
            options.deterministicRepairInstruction?.({
              error,
              value: structured.value,
              sourcePackage,
              operationContext: operationContext?.context,
            }) ??
            genericDeterministicRepairInstruction(error);
          if (repairInstruction === undefined) break;
          let repaired: Awaited<ReturnType<typeof generateStructuredOutput<T>>>;
          try {
            repaired = await generateStructuredOutput<T>({
              provider: resolvedProvider.adapter,
              request: {
                ...generationRequest,
                messages: [
                  ...generationRequest.messages,
                  {
                    role: "user",
                    content:
                      patchRepair?.instruction ??
                      "Correct the previous JSON response. " +
                        `${repairInstruction} Preserve every other valid field and return JSON only.
` +
                        `Previous JSON response:
${JSON.stringify(structured.value)}`,
                  },
                ],
              },
              schema: patchRepair?.schema ?? options.outputSchema,
              // One corrective completion per round; schema repair of the
              // correction itself is not attempted.
              maxRepairs: 0,
            });
          } catch (repairError) {
            if (repairError instanceof StructuredOutputError)
              structured = {
                ...structured,
                responses: [...structured.responses, ...repairError.responses],
              };
            break;
          }
          const repairedExecuted = repaired.responses.at(-1);
          if (
            repairedExecuted === undefined ||
            repairedExecuted.providerId !==
              resolvedProvider.adapter.providerId ||
            repairedExecuted.model !== payload.model
          )
            break;
          structured = normalize({
            value: repaired.value,
            rawText: repaired.rawText,
            repairAttempts:
              structured.repairAttempts + repaired.repairAttempts + 1,
            responses: [...structured.responses, ...repaired.responses],
          });
          try {
            warnings =
              options.deterministicChecks?.(
                structured.value,
                sourcePackage,
                operationContext?.context,
              ) ?? [];
            repairedSuccessfully = true;
            break;
          } catch (recheckError) {
            error = recheckError;
          }
        }
        if (!repairedSuccessfully) {
          await recordFailedCall({
            context,
            payload,
            timestamp,
            inputVersion,
            inputHash,
            responses: structured.responses,
            providerId: resolvedProvider.adapter.providerId,
            errorCode: "DETERMINISTIC_CHECK_FAILED",
            modelCallsRepository,
            usageMeter,
            ...(pricing === undefined ? {} : { pricing }),
          });
          // The rule that rejected the output is the only actionable part of
          // this failure: without it a caller cannot tell an uncited source
          // block from an over-long sentence, and the generation is already
          // discarded. Provider text never enters the details.
          throw new JobExecutionError(
            "terminal",
            "MODEL_OUTPUT_DETERMINISTIC_FAILURE",
            "The model output failed deterministic checks.",
            deterministicFailureDetails(error),
          );
        }
      }
      // One optional improvement round for a draft that passed every check
      // but carries a warning the job can ask the model to fix (a script well
      // under its word budget). The improvement is kept only if it passes
      // every check too; otherwise the checked draft stands, so this round can
      // never fail a job. Its provider calls are metered either way.
      const improvement =
        warnings.length === 0
          ? undefined
          : options.warningRepairInstruction?.({
              warnings,
              value: structured.value,
              operationContext: operationContext?.context,
            });
      if (improvement !== undefined) {
        let improved:
          Awaited<ReturnType<typeof generateStructuredOutput<T>>> | undefined;
        try {
          improved = await generateStructuredOutput<T>({
            provider: resolvedProvider.adapter,
            request: {
              ...generationRequest,
              messages: [
                ...generationRequest.messages,
                {
                  role: "user",
                  content:
                    "Improve the previous JSON response. " +
                    `${improvement} Preserve every other valid field and return JSON only.
` +
                    `Previous JSON response:
${JSON.stringify(structured.value)}`,
                },
              ],
            },
            schema: options.outputSchema,
            maxRepairs: 0,
          });
        } catch (improvementError) {
          if (improvementError instanceof StructuredOutputError)
            structured = {
              ...structured,
              responses: [
                ...structured.responses,
                ...improvementError.responses,
              ],
            };
        }
        if (improved !== undefined) {
          const responses = [...structured.responses, ...improved.responses];
          const executedImprovement = improved.responses.at(-1);
          let accepted = false;
          if (
            executedImprovement?.providerId ===
              resolvedProvider.adapter.providerId &&
            executedImprovement.model === payload.model
          ) {
            const candidate = normalize({
              value: improved.value,
              rawText: improved.rawText,
              repairAttempts:
                structured.repairAttempts + improved.repairAttempts + 1,
              responses,
            });
            try {
              warnings =
                options.deterministicChecks?.(
                  candidate.value,
                  sourcePackage,
                  operationContext?.context,
                ) ?? [];
              structured = candidate;
              accepted = true;
            } catch {
              // The improvement broke a rule: keep the checked draft.
            }
          }
          if (!accepted) structured = { ...structured, responses };
        }
      }
      const record = buildSucceededRecord({
        context,
        payload,
        timestamp,
        inputVersion,
        inputHash,
        structured,
        providerId: resolvedProvider.adapter.providerId,
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
        } catch (error) {
          if (error instanceof JobExecutionError) throw error;
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
          providerSelection: {
            ...resolvedProvider.selection,
            model: payload.model,
            approvalReference: payload.providerApproval.approvalReference,
            estimatedCostUsd: payload.providerApproval.estimatedCostUsd,
            actualCostUsd: record.estimatedCostUsd,
          },
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
        ...(warnings.length === 0
          ? {}
          : {
              warnings: warnings.map((warning) => ({
                code: warning.code,
                message: warning.message,
              })),
            }),
      };
    } catch (error) {
      if (error instanceof JobExecutionError) throw error;
      if (error instanceof QuotaExceededError)
        throw new JobExecutionError(
          "terminal",
          "AI_QUOTA_EXCEEDED",
          "The AI generation quota for this project has been reached.",
        );
      if (
        error instanceof ProviderEnvelopeViolationError ||
        error instanceof ApprovedProviderUnavailableError
      ) {
        await auditWriter.write({
          ownerUserId: context.ownerUserId,
          projectId: context.projectId,
          actor: { type: "system" },
          eventType: "ai.generated",
          target: { type: "job", id: context.jobId },
          correlationId: context.correlationId,
          metadata: {
            event: "provider.envelope_violation",
            jobType: options.jobType,
            requestedAdapter: "language-model",
            code: error.code,
          },
          occurredAt: timestamp,
        });
        throw new JobExecutionError(
          "terminal",
          error.code,
          "The configured provider is unavailable for this operation.",
        );
      }
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

/**
 * Extracts the reportable part of a deterministic-check failure: the rule code
 * carried by operation-specific check errors, plus the message identifying the
 * offending block. Both are authored by this repository's checks, never by the
 * provider, so neither can leak model or source text into job metadata.
 */
/**
 * Corrective rounds a deterministic failure gets unless a job says otherwise.
 * A model slip (an offset past the end of a sentence, a copied phrase, a
 * duration off by a few seconds) is usually fixed by one pointed correction,
 * and stopping the user's video for it costs far more than a second call.
 */
export const defaultMaxDeterministicRepairs = 2;

/**
 * The fallback correction: the failed rule's own message. Deterministic check
 * messages are written by our code from IDs, indexes and counts, never from
 * source or provider text, so nothing new is sent to the provider.
 */
export function genericDeterministicRepairInstruction(
  error: unknown,
): string | undefined {
  if (!(error instanceof Error) || error.message.trim().length === 0)
    return undefined;
  return `It failed this automatic check: ${error.message.slice(0, 1_000)} Fix only what the check names.`;
}

function deterministicFailureDetails(error: unknown): JobMetadata | undefined {
  if (!(error instanceof Error)) return undefined;
  const reason = (error as { code?: unknown }).code;
  return {
    ...(typeof reason === "string" && reason.length > 0 ? { reason } : {}),
    message: error.message.slice(0, 500),
  };
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
      // ST-105. Which authorisation paid for this call.
      providerSelection: {
        selectionReason: input.payload.providerApproval.selectionReason,
        approvalReference: input.payload.providerApproval.approvalReference,
        ...(input.payload.providerApproval.oneShotRunId === undefined
          ? {}
          : { oneShotRunId: input.payload.providerApproval.oneShotRunId }),
      },
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
