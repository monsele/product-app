/**
 * ST-105 — the prompt-to-video ("one-shot") pilot's API and runner host
 * (ADR-013).
 *
 * - **One authorisation.** `POST one-shot` is the single explicit, idempotent
 *   authorisation for every paid call in the run. It is refused when the
 *   accepted estimate is below the current one.
 * - **One human gate.** The run stops at `awaiting_render_approval`; nothing
 *   is versioned for render or rendered until `POST one-shot/render`.
 * - **The server decides.** Cohort membership is checked on every read and
 *   write; the flag gates only the commands that start new runs, so turning it
 *   off drains runs already in flight.
 * - **One tick chain per run.** Each `oneshot.advance` job claims the run's
 *   tick lease, performs one runner tick with no transaction open, persists
 *   the result, and enqueues the next tick with a key derived from the tick
 *   sequence. A replayed job re-claims its own lease; a stray job no-ops.
 * - **Never logged:** the focus prompt, source text, tokens or signed URLs.
 */

import { createHash } from "node:crypto";
import {
  createId,
  identifierSchema,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  oneShotRuns,
  outboxEvents,
  sourceDocuments,
  usageRecords,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  createJobEnvelope,
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  narrationWordCountRange,
  objectiveFocusCoverageSchema,
  type ObjectiveFocusCoverage,
} from "@avlp/schemas";
import {
  oneShotActiveRunStatusValues,
  oneShotAdvanceJobType,
  oneShotAdvancePayloadSchema,
  oneShotAttentionStageSchema,
  oneShotAudienceSchema,
  oneShotCreateInputSchema,
  oneShotEligibilitySchema,
  oneShotErrorCodeSchema,
  oneShotEstimateInputSchema,
  oneShotEstimateSchema,
  oneShotResponseSchema,
  oneShotStepSchema,
  oneShotStepsSchema,
  oneShotTickingStatusValues,
  type OneShotEligibility,
  type OneShotEstimate,
  type OneShotResponse,
  type OneShotRunStatus,
  type OneShotRunView,
} from "@avlp/schemas/one-shot";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { maximumModelCallCostUsd } from "./model-call-approval.js";
import {
  advanceOneShotRun,
  resumedStatus,
  type OneShotRunState,
  type OneShotStageGateway,
  type OneShotTickResult,
} from "./one-shot-runner.js";

type Scope = { ownerUserId: Identifier; projectId: Identifier };
type RunRow = typeof oneShotRuns.$inferSelect;

/** Delay between ticks while a run is working. */
export const oneShotTickDelayMs = 3_000;
/** How long one tick may hold the run before another job may claim it. */
const tickLeaseMs = 5 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Cohort
// ---------------------------------------------------------------------------

/**
 * Who may see and start prompt-to-video runs. An interface, like
 * `DemonstrationPilotCohort`, so tests drive both sides without process
 * environment.
 */
export interface OneShotPilotCohort {
  /** False rejects new runs; runs already in flight still finish. */
  enabled(): boolean;
  includes(userId: Identifier): boolean;
}

export function createEnvironmentOneShotCohort(environment: {
  ONE_SHOT_PILOT_ENABLED?: boolean;
  ONE_SHOT_PILOT_USER_IDS?: string;
}): OneShotPilotCohort {
  const members = new Set(
    (environment.ONE_SHOT_PILOT_USER_IDS ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );
  const enabled = environment.ONE_SHOT_PILOT_ENABLED === true;
  return {
    enabled: () => enabled,
    includes: (userId) => members.has(userId.toLowerCase()),
  };
}

export const closedOneShotPilotCohort: OneShotPilotCohort = {
  enabled: () => false,
  includes: () => false,
};

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

export type OneShotPricing = {
  /** Upper-bound cost of one structured model call. */
  modelCallCostUsd: number;
  imageCostUsd: number;
  ttsCostUsdPerMillionCharacters: number;
  alignmentCostUsdPerAudioMinute: number;
};

export const oneShotPricingVersion = "one-shot-estimate-v1";
/** Planning assumption: one scene per 30 seconds of target duration. */
const secondsPerScene = 30;
/** Planning assumption: characters per narrated word, including spacing. */
const charactersPerWord = 6;

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * An itemised upper bound for the whole chain: the six model calls at their
 * bounded per-call estimate, one illustration per scene, and narration audio
 * at the top of the word budget.
 */
export function estimateOneShotRun(input: {
  targetDurationSeconds: 180 | 300 | 420;
  pricing: OneShotPricing;
}): OneShotEstimate {
  const { pricing } = input;
  const estimatedScenes = Math.ceil(
    input.targetDurationSeconds / secondsPerScene,
  );
  const words = narrationWordCountRange(input.targetDurationSeconds).max;
  const characters = words * charactersPerWord;
  const modelCalls: { key: string; label: string }[] = [
    { key: "ai.lesson-intent", label: "Lesson subject and title" },
    { key: "ai.objectives", label: "Learning objectives" },
    { key: "ai.outline", label: "Lesson outline" },
    { key: "ai.narration", label: "Narration script" },
    { key: "ai.storyboard", label: "Storyboard" },
    { key: "ai.grounding", label: "Grounding check" },
  ];
  const items = [
    ...modelCalls.map((call) => ({
      ...call,
      quantity: 1,
      unitCostUsd: roundUsd(pricing.modelCallCostUsd),
      costUsd: roundUsd(pricing.modelCallCostUsd),
    })),
    {
      key: "image.generation",
      label: "Scene illustrations",
      quantity: estimatedScenes,
      unitCostUsd: roundUsd(pricing.imageCostUsd),
      costUsd: roundUsd(pricing.imageCostUsd * estimatedScenes),
    },
    {
      key: "tts.generation",
      label: "Narration audio",
      quantity: estimatedScenes,
      unitCostUsd: roundUsd(
        (characters / estimatedScenes / 1_000_000) *
          pricing.ttsCostUsdPerMillionCharacters,
      ),
      costUsd: roundUsd(
        (characters / 1_000_000) * pricing.ttsCostUsdPerMillionCharacters,
      ),
    },
    {
      key: "tts.alignment",
      label: "Caption alignment",
      quantity: Math.ceil(input.targetDurationSeconds / 60),
      unitCostUsd: roundUsd(pricing.alignmentCostUsdPerAudioMinute),
      costUsd: roundUsd(
        Math.ceil(input.targetDurationSeconds / 60) *
          pricing.alignmentCostUsdPerAudioMinute,
      ),
    },
  ];
  return oneShotEstimateSchema.parse({
    pricingVersion: oneShotPricingVersion,
    currency: "USD",
    targetDurationSeconds: input.targetDurationSeconds,
    estimatedScenes,
    items,
    totalUsd: roundUsd(items.reduce((sum, item) => sum + item.costUsd, 0)),
  });
}

/** Default pricing from the configured model and Together media prices. */
export function oneShotPricingFromEnvironment(environment: {
  TOGETHER_LLM_MODEL?: string;
  TOGETHER_IMAGE_COST_USD?: number;
  TOGETHER_TTS_COST_USD_PER_MILLION_CHARACTERS?: number;
}): OneShotPricing {
  const model = environment.TOGETHER_LLM_MODEL ?? "moonshotai/Kimi-K3";
  const modelCallCostUsd = maximumModelCallCostUsd(model);
  if (modelCallCostUsd === undefined)
    throw new RangeError(
      `No bounded provider-cost estimate is configured for ${model}.`,
    );
  return {
    modelCallCostUsd,
    imageCostUsd: environment.TOGETHER_IMAGE_COST_USD ?? 0.00225,
    ttsCostUsdPerMillionCharacters:
      environment.TOGETHER_TTS_COST_USD_PER_MILLION_CHARACTERS ?? 15,
    alignmentCostUsdPerAudioMinute: 0.0015,
  };
}

// ---------------------------------------------------------------------------
// Ports used by the service
// ---------------------------------------------------------------------------

/**
 * Enqueues one tick of a run through the transactional outbox. Keys are
 * deterministic, so a replay of the same scheduling decision creates no second
 * job. Callers pass the transaction that changes the run, so a run can never
 * be committed into a ticking status without the job that advances it.
 */
export interface OneShotTickScheduler {
  schedule(
    input: {
      run: Pick<RunRow, "id" | "ownerUserId" | "projectId" | "correlationId">;
      key: string;
      delayMs: number;
    },
    executor: DatabaseExecutor,
  ): Promise<void>;
}

export class OutboxOneShotTickScheduler implements OneShotTickScheduler {
  public constructor(private readonly now: () => Date = () => new Date()) {}

  public async schedule(
    input: {
      run: Pick<RunRow, "id" | "ownerUserId" | "projectId" | "correlationId">;
      key: string;
      delayMs: number;
    },
    executor: DatabaseExecutor,
  ): Promise<void> {
    const now = this.now();
    const envelope = createJobEnvelope(oneShotAdvancePayloadSchema, {
      jobId: createId(now),
      jobType: oneShotAdvanceJobType,
      projectId: input.run.projectId as Identifier,
      ownerUserId: input.run.ownerUserId as Identifier,
      inputVersion: `oneshot:${input.run.id}`,
      idempotencyKey: input.key,
      correlationId: input.run.correlationId as Identifier,
      payloadVersion: 1,
      payload: { runId: input.run.id as Identifier, schemaVersion: 1 },
      requestedAt: now,
    });
    const [created] = await executor
      .insert(jobs)
      .values({
        id: envelope.jobId,
        jobType: envelope.jobType,
        queueName: "orchestration",
        projectId: envelope.projectId,
        ownerUserId: envelope.ownerUserId,
        inputVersion: envelope.inputVersion,
        idempotencyKey: envelope.idempotencyKey,
        correlationId: envelope.correlationId,
        payloadVersion: envelope.payloadVersion,
        payload: envelope.payload,
        maxAttempts: oneShotTickRetryPolicy.maxAttempts,
        retryDelayMs: oneShotTickRetryPolicy.retryDelayMs,
      })
      .onConflictDoNothing({
        target: [jobs.ownerUserId, jobs.projectId, jobs.idempotencyKey],
      })
      .returning({ id: jobs.id });
    if (created === undefined) return;
    await executor.insert(outboxEvents).values({
      id: createId(now),
      jobId: created.id,
      eventType: "oneshot.advance.requested.v1",
      queueName: "orchestration",
      envelope,
      deliveryOptions: {
        maxAttempts: oneShotTickRetryPolicy.maxAttempts,
        retryDelayMs: oneShotTickRetryPolicy.retryDelayMs,
      },
      availableAt: new Date(now.getTime() + input.delayMs),
    });
  }
}

const oneShotTickRetryPolicy = {
  maxAttempts: 5,
  retryDelayMs: 10_000,
  leaseDurationMs: 120_000,
};

/** The human gate's two calls: an immutable lesson version, then a render. */
export interface OneShotRenderGate {
  saveLessonVersion(
    scope: Scope & { correlationId: Identifier },
  ): Promise<{ lessonVersionId: Identifier }>;
  startRender(
    scope: Scope & {
      correlationId: Identifier;
      lessonVersionId: Identifier;
      idempotencyKey: string;
    },
  ): Promise<{ renderJobId: Identifier }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface OneShotService {
  eligibility(input: Scope): Promise<OneShotEligibility>;
  estimate(input: Scope & { body: unknown }): Promise<OneShotEstimate>;
  create(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<OneShotResponse>;
  current(input: Scope): Promise<OneShotResponse>;
  render(
    input: Scope & { correlationId: Identifier },
  ): Promise<OneShotResponse>;
  resume(
    input: Scope & { correlationId: Identifier },
  ): Promise<OneShotResponse>;
  cancel(
    input: Scope & { correlationId: Identifier },
  ): Promise<OneShotResponse>;
}

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}

function conflict(message: string): PublicError {
  return new PublicError("bad_request", message, 409);
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const candidate = error as {
    code?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
  if (candidate?.code === "23505")
    return (
      candidate.constraint === undefined || candidate.constraint === constraint
    );
  return (
    candidate?.cause !== undefined &&
    isUniqueViolation(candidate.cause, constraint)
  );
}

const activeStatuses = [...oneShotActiveRunStatusValues];
const tickingStatuses = [...oneShotTickingStatusValues];

export class PostgresOneShotService implements OneShotService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly cohort: OneShotPilotCohort,
    private readonly scheduler: OneShotTickScheduler,
    private readonly renderGate: OneShotRenderGate,
    private readonly options: {
      pricing: OneShotPricing;
      maxRunsPerHour: number;
    },
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async eligibility(input: Scope): Promise<OneShotEligibility> {
    if (!this.cohort.includes(input.ownerUserId))
      return oneShotEligibilitySchema.parse({
        visible: false,
        canStart: false,
        reasons: [
          {
            code: "not_in_cohort",
            message:
              "Prompt-to-video is an invited pilot and is not enabled for this account.",
          },
        ],
      });
    if (!this.cohort.enabled())
      return oneShotEligibilitySchema.parse({
        visible: true,
        canStart: false,
        reasons: [
          {
            code: "pilot_disabled",
            message:
              "Prompt-to-video is paused, so no new runs can start. Runs already in progress will finish.",
          },
        ],
      });
    return oneShotEligibilitySchema.parse({
      visible: true,
      canStart: true,
      reasons: [],
    });
  }

  public async estimate(
    input: Scope & { body: unknown },
  ): Promise<OneShotEstimate> {
    this.assertCanStart(input.ownerUserId);
    const body = parseBody(oneShotEstimateInputSchema, input.body);
    return estimateOneShotRun({
      targetDurationSeconds: body.targetDurationSeconds,
      pricing: this.options.pricing,
    });
  }

  public async create(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<OneShotResponse> {
    this.assertCanStart(input.ownerUserId);
    const key = input.idempotencyKey?.trim();
    if (key === undefined || key.length === 0 || key.length > 200)
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to start a prompt-to-video run.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const body = parseBody(oneShotCreateInputSchema, input.body);
    const hash = requestHash(body);

    // Replay: the same key returns the same run, whatever its status now.
    const replay = await this.findByKey(input, key);
    if (replay !== undefined) {
      if (replay.requestHash !== hash)
        throw conflict(
          "This idempotency key was already used for a different prompt-to-video request.",
        );
      return this.respond(input, replay);
    }

    // A run needs a document to read. Without one it could only wait at
    // ingestion until it timed out, blocking the project meanwhile.
    const [source] = await this.database
      .select({ id: sourceDocuments.id })
      .from(sourceDocuments)
      .where(
        and(
          eq(sourceDocuments.ownerUserId, input.ownerUserId),
          eq(sourceDocuments.projectId, input.projectId),
          inArray(sourceDocuments.status, [
            "pending_validation",
            "validating",
            "active",
          ]),
        ),
      )
      .limit(1);
    if (source === undefined)
      throw conflict(
        "Upload a source document to this project before starting a prompt-to-video run.",
      );

    const estimate = estimateOneShotRun({
      targetDurationSeconds: body.targetDurationSeconds,
      pricing: this.options.pricing,
    });
    if (body.acceptedEstimateUsd + 1e-9 < estimate.totalUsd)
      throw new PublicError(
        "bad_request",
        "The accepted estimate is below the current estimate. Review the new estimate and accept it to start.",
        409,
        false,
        {
          acceptedEstimateUsd: `The current estimate is ${estimate.totalUsd} USD.`,
        },
      );

    const timestamp = this.now();
    const [recent] = await this.database
      .select({ count: sql<number>`count(*)::int` })
      .from(oneShotRuns)
      .where(
        and(
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          gte(oneShotRuns.createdAt, new Date(timestamp.getTime() - 3_600_000)),
        ),
      );
    if ((recent?.count ?? 0) >= this.options.maxRunsPerHour)
      throw new PublicError(
        "rate_limited",
        "You have reached the hourly limit for prompt-to-video runs. Try again later.",
        429,
      );

    const runId = createId(timestamp);
    let created: RunRow | undefined;
    try {
      created = await this.database.transaction(async (transaction) => {
        const [row] = await transaction
          .insert(oneShotRuns)
          .values({
            id: runId,
            ownerUserId: input.ownerUserId,
            projectId: input.projectId,
            idempotencyKey: key,
            requestHash: hash,
            focusPrompt: body.focusPrompt,
            audience: body.audience,
            targetDurationSeconds: body.targetDurationSeconds,
            acceptedEstimateUsd: body.acceptedEstimateUsd.toFixed(6),
            status: "queued",
            correlationId: input.correlationId,
            lastProgressAt: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
          .returning();
        if (row === undefined) throw new Error("The run was not created.");
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "one_shot.run_started",
          target: { type: "one_shot_run", id: runId },
          correlationId: input.correlationId,
          // Never the focus prompt: it is user content.
          metadata: {
            audience: body.audience,
            targetDurationSeconds: body.targetDurationSeconds,
            acceptedEstimateUsd: body.acceptedEstimateUsd,
            estimateUsd: estimate.totalUsd,
            pricingVersion: estimate.pricingVersion,
          },
          occurredAt: timestamp,
        });
        await this.scheduler.schedule(
          { run: row, key: `oneshot:${row.id}:start`, delayMs: 0 },
          transaction,
        );
        return row;
      });
    } catch (error) {
      // A concurrent replay of the same key won the insert.
      if (isUniqueViolation(error, "one_shot_runs_request_unique")) {
        const raced = await this.findByKey(input, key);
        if (raced !== undefined && raced.requestHash === hash)
          return this.respond(input, raced);
      }
      if (
        isUniqueViolation(error, "one_shot_runs_one_active_per_project") ||
        isUniqueViolation(error, "one_shot_runs_request_unique")
      )
        throw conflict(
          "This project already has a prompt-to-video run in progress. Finish or cancel it before starting another.",
        );
      throw error;
    }
    return this.respond(input, created);
  }

  public async current(input: Scope): Promise<OneShotResponse> {
    const eligibility = await this.eligibility(input);
    if (!eligibility.visible)
      return oneShotResponseSchema.parse({ eligibility, run: null });
    const run = await this.latest(input);
    return oneShotResponseSchema.parse({
      eligibility,
      run: run === undefined ? null : toView(run),
    });
  }

  public async render(
    input: Scope & { correlationId: Identifier },
  ): Promise<OneShotResponse> {
    this.assertCohort(input.ownerUserId);
    const run = await this.requireLatest(input);
    if (run.status !== "awaiting_render_approval")
      throw conflict(
        "The lesson is not ready to render yet. Wait until the run is awaiting your render approval.",
      );
    // Both calls re-check everything the normal wizard checks: version
    // readiness and current, passing validation.
    const { lessonVersionId } = await this.renderGate.saveLessonVersion(input);
    const { renderJobId } = await this.renderGate.startRender({
      ...input,
      lessonVersionId,
      idempotencyKey: `oneshot:${run.id}:render:r${run.resumeCount}`,
    });
    const timestamp = this.now();
    const updated = await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(oneShotRuns)
        .set({
          status: "rendering",
          currentStep: "render",
          lessonVersionId,
          renderJobId,
          lastProgressAt: timestamp,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(oneShotRuns.id, run.id),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
            eq(oneShotRuns.status, "awaiting_render_approval"),
          ),
        )
        .returning();
      if (updated === undefined)
        throw conflict(
          "The run changed while the render was being approved. Refresh and try again.",
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "one_shot.render_approved",
        target: { type: "render_job", id: renderJobId },
        correlationId: input.correlationId,
        metadata: { oneShotRunId: run.id, lessonVersionId },
        occurredAt: timestamp,
      });
      await this.scheduler.schedule(
        {
          run: updated,
          key: `oneshot:${run.id}:render:r${run.resumeCount}`,
          delayMs: oneShotTickDelayMs,
        },
        transaction,
      );
      return updated;
    });
    return this.respond(input, updated);
  }

  public async resume(
    input: Scope & { correlationId: Identifier },
  ): Promise<OneShotResponse> {
    this.assertCohort(input.ownerUserId);
    const run = await this.requireLatest(input);
    const next = resumedStatus(run.status);
    if (next === null)
      throw conflict(
        "Only a run that needs attention or has failed can be resumed.",
      );
    const timestamp = this.now();
    // Resuming is the user's explicit retry: the stopped step forgets the job
    // it stopped on, so the stage runs again under the next resume key.
    const steps = oneShotStepsSchema
      .parse(run.steps)
      .map((entry) =>
        entry.state === "needs_attention" || entry.state === "failed"
          ? {
              step: entry.step,
              state: "pending" as const,
              startedAt: entry.startedAt,
            }
          : entry,
      );
    const updated = await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(oneShotRuns)
        .set({
          status: next,
          steps,
          needsAttentionStage: null,
          errorCode: null,
          errorMessage: null,
          resumeCount: sql`${oneShotRuns.resumeCount} + 1`,
          lastProgressAt: timestamp,
          tickLeaseExpiresAt: null,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(oneShotRuns.id, run.id),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
            eq(oneShotRuns.status, run.status),
          ),
        )
        .returning();
      if (updated === undefined)
        throw conflict("The run changed. Refresh and try again.");
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "one_shot.run_resumed",
        target: { type: "one_shot_run", id: run.id },
        correlationId: input.correlationId,
        metadata: { fromStatus: run.status, resumeCount: updated.resumeCount },
        occurredAt: timestamp,
      });
      await this.scheduler.schedule(
        {
          run: updated,
          key: `oneshot:${run.id}:resume:${updated.resumeCount}`,
          delayMs: 0,
        },
        transaction,
      );
      return updated;
    });
    return this.respond(input, updated);
  }

  public async cancel(
    input: Scope & { correlationId: Identifier },
  ): Promise<OneShotResponse> {
    this.assertCohort(input.ownerUserId);
    const run = await this.requireLatest(input);
    if (run.status === "completed" || run.status === "cancelled")
      throw conflict("This run has already finished.");
    const timestamp = this.now();
    const updated = await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(oneShotRuns)
        .set({
          status: "cancelled",
          tickLeaseExpiresAt: null,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(oneShotRuns.id, run.id),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
            inArray(oneShotRuns.status, activeStatuses),
          ),
        )
        .returning();
      if (updated === undefined)
        throw conflict("The run changed. Refresh and try again.");
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "one_shot.run_cancelled",
        target: { type: "one_shot_run", id: run.id },
        correlationId: input.correlationId,
        metadata: { fromStatus: run.status },
        occurredAt: timestamp,
      });
      return updated;
    });
    return this.respond(input, updated);
  }

  // -------------------------------------------------------------------------

  private assertCohort(userId: Identifier): void {
    if (!this.cohort.includes(userId))
      throw conflict("Prompt-to-video is not enabled for this account.");
  }

  private assertCanStart(userId: Identifier): void {
    this.assertCohort(userId);
    if (!this.cohort.enabled())
      throw conflict(
        "Prompt-to-video is paused, so no new runs can start. Runs already in progress will finish.",
      );
  }

  private async respond(input: Scope, run: RunRow): Promise<OneShotResponse> {
    return oneShotResponseSchema.parse({
      eligibility: await this.eligibility(input),
      run: toView(run),
    });
  }

  private async findByKey(
    input: Scope,
    key: string,
  ): Promise<RunRow | undefined> {
    const [row] = await this.database
      .select()
      .from(oneShotRuns)
      .where(
        and(
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          eq(oneShotRuns.projectId, input.projectId),
          eq(oneShotRuns.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row;
  }

  private async latest(input: Scope): Promise<RunRow | undefined> {
    const [row] = await this.database
      .select()
      .from(oneShotRuns)
      .where(
        and(
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          eq(oneShotRuns.projectId, input.projectId),
        ),
      )
      .orderBy(desc(oneShotRuns.createdAt), desc(oneShotRuns.id))
      .limit(1);
    return row;
  }

  private async requireLatest(input: Scope): Promise<RunRow> {
    const run = await this.latest(input);
    if (run === undefined)
      throw new PublicError(
        "not_found",
        "This project has no prompt-to-video run.",
        404,
      );
    return run;
  }
}

// ---------------------------------------------------------------------------
// Runner host: one tick per `oneshot.advance` job
// ---------------------------------------------------------------------------

export type OneShotTickOutcome =
  "advanced" | "stopped" | "not_ticking" | "lease_held" | "cancelled_mid_tick";

export class OneShotRunnerHost {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly gateway: OneShotStageGateway,
    private readonly scheduler: OneShotTickScheduler,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * One tick. Scoped by the job's owner and project, so a job can only ever
   * advance a run of its own tenant.
   */
  public async tick(
    input: Scope & {
      runId: Identifier;
      jobId: Identifier;
    },
  ): Promise<OneShotTickOutcome> {
    const claimedAt = this.now();
    const [claimed] = await this.database
      .update(oneShotRuns)
      .set({
        tickSequence: sql`${oneShotRuns.tickSequence} + 1`,
        tickLeaseExpiresAt: new Date(claimedAt.getTime() + tickLeaseMs),
        tickJobId: input.jobId,
      })
      .where(
        and(
          eq(oneShotRuns.id, input.runId),
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          eq(oneShotRuns.projectId, input.projectId),
          inArray(oneShotRuns.status, tickingStatuses),
          or(
            isNull(oneShotRuns.tickLeaseExpiresAt),
            lt(oneShotRuns.tickLeaseExpiresAt, claimedAt),
            // The same job retried after a crash reclaims its own lease.
            eq(oneShotRuns.tickJobId, input.jobId),
          ),
        ),
      )
      .returning();
    if (claimed === undefined) {
      const [run] = await this.database
        .select({ status: oneShotRuns.status })
        .from(oneShotRuns)
        .where(
          and(
            eq(oneShotRuns.id, input.runId),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
          ),
        )
        .limit(1);
      return run !== undefined &&
        (tickingStatuses as string[]).includes(run.status)
        ? "lease_held"
        : "not_ticking";
    }

    // No transaction is open here: the tick calls services and providers.
    const result = await advanceOneShotRun({
      run: toRunState(claimed),
      gateway: this.gateway,
      now: this.now(),
    });
    const savedAt = this.now();
    // The save and the next tick's job commit together, so a saved ticking
    // run always has the job that advances it.
    return this.database.transaction(async (transaction) => {
      const [saved] = await transaction
        .update(oneShotRuns)
        .set(tickPatch(result, savedAt))
        .where(
          and(
            eq(oneShotRuns.id, claimed.id),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
            eq(oneShotRuns.tickSequence, claimed.tickSequence),
            // A cancel or render approval made during the tick wins.
            eq(oneShotRuns.status, claimed.status),
          ),
        )
        .returning();
      if (saved === undefined) return "cancelled_mid_tick" as const;
      if (!result.reschedule) return "stopped" as const;
      await this.scheduler.schedule(
        {
          run: saved,
          key: `oneshot:${saved.id}:tick:${saved.tickSequence}`,
          delayMs: oneShotTickDelayMs,
        },
        transaction,
      );
      return "advanced" as const;
    });
  }
}

function tickPatch(result: OneShotTickResult, now: Date): Partial<RunRow> {
  return {
    status: result.status,
    currentStep: result.currentStep,
    steps: oneShotStepsSchema.parse(result.steps),
    needsAttentionStage: result.needsAttention?.stage ?? null,
    errorCode: result.needsAttention?.errorCode ?? null,
    errorMessage: result.needsAttention?.message ?? null,
    actualCostUsd: result.actualCostUsd.toFixed(6),
    tickLeaseExpiresAt: null,
    updatedAt: now,
    ...(result.progressed ? { lastProgressAt: now } : {}),
    ...(result.focusCoverage === undefined
      ? {}
      : { focusCoverage: result.focusCoverage }),
  };
}

export function createOneShotAdvanceJobHandler(
  host: OneShotRunnerHost,
): RegisteredJobHandler {
  return defineJobHandler(
    oneShotAdvanceJobType,
    1,
    oneShotAdvancePayloadSchema,
    async (payload, context) => {
      try {
        const outcome = await host.tick({
          runId: payload.runId,
          ownerUserId: context.ownerUserId,
          projectId: context.projectId,
          jobId: context.jobId,
        });
        return { outcome };
      } catch (error) {
        if (error instanceof JobExecutionError) throw error;
        throw new JobExecutionError(
          "retryable",
          "ONE_SHOT_TICK_FAILED",
          "The prompt-to-video tick failed and will be retried.",
        );
      }
    },
    oneShotTickRetryPolicy,
  );
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toRunState(row: RunRow): OneShotRunState {
  return {
    id: identifierSchema.parse(row.id),
    ownerUserId: identifierSchema.parse(row.ownerUserId),
    projectId: identifierSchema.parse(row.projectId),
    correlationId: identifierSchema.parse(row.correlationId),
    status: row.status,
    focusPrompt: row.focusPrompt,
    audience: oneShotAudienceSchema.parse(row.audience),
    targetDurationSeconds: row.targetDurationSeconds as 180 | 300 | 420,
    steps: oneShotStepsSchema.parse(row.steps),
    resumeCount: row.resumeCount,
    lastProgressAt: row.lastProgressAt,
    renderJobId:
      row.renderJobId === null ? null : identifierSchema.parse(row.renderJobId),
  };
}

function toView(row: RunRow): OneShotRunView {
  const coverage = objectiveFocusCoverageSchema.safeParse(row.focusCoverage);
  const needsAttention =
    row.needsAttentionStage !== null &&
    row.errorCode !== null &&
    row.errorMessage !== null
      ? {
          stage: oneShotAttentionStageSchema.parse(row.needsAttentionStage),
          errorCode: oneShotErrorCodeSchema.parse(row.errorCode),
          message: row.errorMessage,
        }
      : null;
  return {
    id: row.id as Identifier,
    projectId: row.projectId as Identifier,
    status: row.status as OneShotRunStatus,
    currentStep:
      row.currentStep === null
        ? null
        : oneShotStepSchema.parse(row.currentStep),
    steps: oneShotStepsSchema.parse(row.steps),
    focusPrompt: row.focusPrompt,
    audience: oneShotAudienceSchema.parse(row.audience),
    targetDurationSeconds: row.targetDurationSeconds as 180 | 300 | 420,
    acceptedEstimateUsd: Number(row.acceptedEstimateUsd),
    actualCostUsd: Number(row.actualCostUsd),
    focusCoverage: coverage.success
      ? (coverage.data as ObjectiveFocusCoverage)
      : null,
    needsAttention,
    lessonVersionId: row.lessonVersionId as Identifier | null,
    renderJobId: row.renderJobId as Identifier | null,
    correlationId: row.correlationId as Identifier,
    createdAt: serializeUtcTimestamp(row.createdAt),
    updatedAt: serializeUtcTimestamp(row.updatedAt),
  };
}

/** Sum of the usage records the run's correlation id produced. */
export async function oneShotCostSoFar(
  database: DatabaseClient,
  scope: Scope,
  correlationId: Identifier,
): Promise<number> {
  const [row] = await database
    .select({
      total: sql<string>`coalesce(sum(${usageRecords.estimatedCostUsd}), 0)`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.ownerUserId, scope.ownerUserId),
        eq(usageRecords.projectId, scope.projectId),
        eq(usageRecords.correlationId, correlationId),
      ),
    );
  return Number(row?.total ?? 0);
}
