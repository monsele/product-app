/**
 * ST-105 — the prompt-to-video ("one-shot") pilot's API and runner host
 * (ADR-013).
 *
 * - **Brief first (ST-107).** `POST one-shot/brief` prepares (or revises, a
 *   bounded number of times) a video brief with one small, metered model
 *   call. The run exists from that moment, in `brief_pending`/`brief_ready`.
 * - **One authorisation.** `POST one-shot` confirms one brief revision and
 *   its deterministic estimate. That is the single explicit authorisation for
 *   every paid call after the brief. It reserves the estimate, sets the cap
 *   (reserved × tolerance), and is refused for a stale revision or an accepted
 *   estimate below the brief's.
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
  oneShotRunBriefs,
  oneShotRunDecisions,
  oneShotRunLedgerEntries,
  oneShotRuns,
  outboxEvents,
  soundBedTracks,
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
  creativeDesignPackIdSchema,
  objectiveFocusCoverageSchema,
  soundBedChoiceSchema,
  soundBedNone,
  type ObjectiveFocusCoverage,
} from "@avlp/schemas";
import {
  oneShotActiveRunStatusValues,
  oneShotAdvanceJobType,
  oneShotAdvancePayloadSchema,
  oneShotAttentionStageSchema,
  oneShotAudienceSchema,
  oneShotBriefCoveragePointSchema,
  oneShotBriefInputSchema,
  oneShotBriefResponseSchema,
  oneShotBriefSchema,
  oneShotBudgetAcceptInputSchema,
  oneShotCreateInputSchema,
  oneShotDecisionDraftSchema,
  oneShotDecisionsResponseSchema,
  oneShotEligibilitySchema,
  oneShotErrorCodeSchema,
  oneShotEstimateSchema,
  oneShotLedgerStepValues,
  oneShotResponseSchema,
  oneShotStepSchema,
  oneShotStepsSchema,
  oneShotStylePackIds,
  oneShotTickingStatusValues,
  type OneShotBrief,
  type OneShotBriefResponse,
  type OneShotDecisionDraft,
  type OneShotDecisionsResponse,
  type OneShotEligibility,
  type OneShotEstimate,
  type OneShotLedgerStep,
  type OneShotResponse,
  type OneShotRunStatus,
  type OneShotRunView,
} from "@avlp/schemas/one-shot";
import { and, asc, desc, eq, gte, inArray, isNull, lt, max, or, sql } from "drizzle-orm";
import { z } from "zod";
import { maximumModelCallCostUsd } from "./model-call-approval.js";
import type { OneShotBriefGenerator } from "./one-shot-brief.js";
import {
  budgetCapUsd,
  estimateOneShotBrief,
  ledgerEstimates,
  ledgerStepForOperation,
  roundUsd,
  type OneShotPricing,
} from "./one-shot-budget.js";
import {
  advanceOneShotRun,
  readOneShotRepairState,
  resumedStatus,
  type OneShotRunBrief,
  type OneShotRunState,
  type OneShotStageGateway,
  type OneShotTickResult,
} from "./one-shot-runner.js";

export {
  estimateOneShotBrief,
  oneShotPricingVersion,
  type OneShotPricing,
} from "./one-shot-budget.js";

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
    // While the pilot is on it is open to every account; the allowlist only
    // matters once it is paused, keeping earlier work readable to its testers.
    includes: (userId) => enabled || members.has(userId.toLowerCase()),
  };
}

export const closedOneShotPilotCohort: OneShotPilotCohort = {
  enabled: () => false,
  includes: () => false,
};

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

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
  /** ST-107. Prepares or revises the run's video brief (one paid call). */
  brief(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<OneShotBriefResponse>;
  currentBrief(input: Scope): Promise<OneShotBriefResponse>;
  /** ST-107. Accepts a raised estimate after ONE_SHOT_BUDGET_CAP. */
  acceptBudget(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<OneShotResponse>;
  decisions(input: Scope): Promise<OneShotDecisionsResponse>;
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

function parseBody<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
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
      briefs: OneShotBriefGenerator;
      /** Cap = reserved × tolerance (ONE_SHOT_BUDGET_TOLERANCE). */
      budgetTolerance: number;
      /** Brief calls per run (ONE_SHOT_MAX_BRIEF_REVISIONS). */
      maxBriefRevisions: number;
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

  /**
   * ST-107. Prepares the first brief, or a revision of it, for the project's
   * run. The first call creates the run in `brief_pending`; each call counts
   * against ONE_SHOT_MAX_BRIEF_REVISIONS before the model is called, so the
   * paid calls per run are bounded even when a call fails. Replaying an
   * idempotency key returns the brief it prepared.
   */
  public async brief(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<OneShotBriefResponse> {
    this.assertCanStart(input.ownerUserId);
    const key = requireIdempotencyKey(
      input.idempotencyKey,
      "An idempotency key is required to prepare a video brief.",
    );
    const body = parseBody(oneShotBriefInputSchema, input.body);
    const hash = requestHash(body);

    const replay = await this.findBriefByKey(input, key);
    if (replay !== undefined) {
      if (replay.requestHash !== hash)
        throw conflict(
          "This idempotency key was already used for a different brief request.",
        );
      return this.briefResponse(input, replay.runId as Identifier);
    }

    // A brief reads the document. Without one there is nothing to plan.
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
        "Upload a source document to this project before preparing a video brief.",
      );
    // Before any run or brief call is counted: a document still being read
    // answers 409 without using up one of the run's brief calls.
    await this.options.briefs.assertReady(input);

    const run = await this.briefRun(input, key, hash, body);
    const timestamp = this.now();
    // Count the call before making it: a failed or interrupted call still
    // costs, so it still uses one of the run's brief calls.
    const [claimed] = await this.database
      .update(oneShotRuns)
      .set({
        briefAttempts: sql`${oneShotRuns.briefAttempts} + 1`,
        status: "brief_pending",
        focusPrompt: body.focusPrompt,
        audience: body.audience,
        targetDurationSeconds: body.targetDurationSeconds,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(oneShotRuns.id, run.id),
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          eq(oneShotRuns.projectId, input.projectId),
          inArray(oneShotRuns.status, ["brief_pending", "brief_ready"]),
          lt(oneShotRuns.briefAttempts, this.options.maxBriefRevisions),
        ),
      )
      .returning();
    if (claimed === undefined) {
      const [current] = await this.database
        .select({ status: oneShotRuns.status })
        .from(oneShotRuns)
        .where(eq(oneShotRuns.id, run.id))
        .limit(1);
      if (current !== undefined && !briefStatuses.includes(current.status))
        throw conflict(
          "This video has already been confirmed. Cancel it to prepare a new brief.",
        );
      throw conflict(
        `The brief can be prepared at most ${this.options.maxBriefRevisions} times for one video. Confirm the current brief, or cancel and start again.`,
      );
    }

    let prepared: Awaited<ReturnType<OneShotBriefGenerator["prepare"]>>;
    try {
      prepared = await this.options.briefs.prepare({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        runId: claimed.id as Identifier,
        correlationId: claimed.correlationId as Identifier,
        idempotencyKey: `oneshot:${claimed.id}:brief:${claimed.briefAttempts}`,
        focusPrompt: body.focusPrompt,
        audience: body.audience,
        targetDurationSeconds: body.targetDurationSeconds,
      });
    } catch (error) {
      // An earlier brief stays confirmable after a failed revision.
      const [latest] = await this.database
        .select({ revision: oneShotRunBriefs.revision })
        .from(oneShotRunBriefs)
        .where(eq(oneShotRunBriefs.runId, claimed.id))
        .limit(1);
      if (latest !== undefined)
        await this.database
          .update(oneShotRuns)
          .set({ status: "brief_ready", updatedAt: this.now() })
          .where(
            and(
              eq(oneShotRuns.id, claimed.id),
              eq(oneShotRuns.status, "brief_pending"),
            ),
          );
      throw error;
    }

    const estimate = estimateOneShotBrief({
      targetDurationSeconds: body.targetDurationSeconds,
      plannedSceneCount: prepared.output.plannedSceneCount,
      pricing: this.options.pricing,
    });
    const savedAt = this.now();
    try {
      await this.database.transaction(async (transaction) => {
        const [previous] = await transaction
          .select({ revision: max(oneShotRunBriefs.revision) })
          .from(oneShotRunBriefs)
          .where(eq(oneShotRunBriefs.runId, claimed.id));
        const revision = (previous?.revision ?? 0) + 1;
        await transaction.insert(oneShotRunBriefs).values({
          id: createId(savedAt),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          runId: claimed.id,
          revision,
          idempotencyKey: key,
          requestHash: hash,
          focusPrompt: body.focusPrompt,
          audience: body.audience,
          targetDurationSeconds: body.targetDurationSeconds,
          brief: {
            subject: prepared.output.subject,
            lessonTitle: prepared.output.lessonTitle,
            coverage: prepared.output.coverage,
            notCovered: prepared.output.notCovered,
            sections: prepared.sections,
            plannedSceneCount: prepared.output.plannedSceneCount,
            stylePackId: prepared.output.stylePackId,
            stylePackReason: prepared.output.stylePackReason,
            soundBed: prepared.output.soundBed,
            soundBedReason: prepared.output.soundBedReason,
            model: prepared.model,
            promptVersion: prepared.promptVersion,
          },
          estimate,
          modelCallId: prepared.modelCallId,
          createdAt: savedAt,
          updatedAt: savedAt,
        });
        const [ready] = await transaction
          .update(oneShotRuns)
          .set({
            status: "brief_ready",
            decisionSequence: sql`${oneShotRuns.decisionSequence} + 1`,
            updatedAt: savedAt,
          })
          .where(
            and(
              eq(oneShotRuns.id, claimed.id),
              eq(oneShotRuns.ownerUserId, input.ownerUserId),
              eq(oneShotRuns.projectId, input.projectId),
              inArray(oneShotRuns.status, ["brief_pending", "brief_ready"]),
            ),
          )
          .returning();
        if (ready === undefined)
          throw conflict("The run changed while the brief was prepared.");
        await insertDecisions(
          transaction,
          ready,
          [
            {
              kind: "brief",
              summary: `Prepared brief revision ${revision}: ${prepared.output.coverage.length} coverage points, ${prepared.output.plannedSceneCount} scenes planned, estimate $${estimate.totalUsd.toFixed(2)}.`,
              model: prepared.model,
              promptVersion: prepared.promptVersion,
              costUsd: prepared.costUsd,
              relatedIds: [prepared.modelCallId],
            },
          ],
          savedAt,
        );
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          actor: { type: "user", userId: input.ownerUserId },
          eventType: "one_shot.brief_prepared",
          target: { type: "one_shot_run", id: claimed.id },
          correlationId: input.correlationId,
          // Never the focus prompt or the brief text: both are user content.
          metadata: {
            revision,
            modelCallId: prepared.modelCallId,
            estimateUsd: estimate.totalUsd,
            pricingVersion: estimate.pricingVersion,
            plannedSceneCount: prepared.output.plannedSceneCount,
          },
          occurredAt: savedAt,
        });
      });
    } catch (error) {
      // A concurrent replay of the same key stored the brief first.
      if (isUniqueViolation(error, "one_shot_run_briefs_request_unique")) {
        const raced = await this.findBriefByKey(input, key);
        if (raced !== undefined && raced.requestHash === hash)
          return this.briefResponse(input, raced.runId as Identifier);
      }
      // Two different revisions raced: the other one took this revision
      // number. Both calls were made and metered; show the stored brief.
      if (isUniqueViolation(error, "one_shot_run_briefs_run_revision_unique"))
        throw conflict(
          "Another brief for this video was prepared at the same time. Review it before preparing another.",
        );
      throw error;
    }
    return this.briefResponse(input, claimed.id as Identifier);
  }

  public async currentBrief(input: Scope): Promise<OneShotBriefResponse> {
    const eligibility = await this.eligibility(input);
    if (!eligibility.visible)
      throw new PublicError(
        "not_found",
        "Prompt-to-video is not enabled for this account.",
        404,
      );
    const run = await this.latest(input);
    if (run === undefined)
      return oneShotBriefResponseSchema.parse({
        brief: null,
        revisionsUsed: 0,
        maxRevisions: this.options.maxBriefRevisions,
        stylePackIds: oneShotStylePackIds,
      });
    return this.briefResponse(input, run.id as Identifier);
  }

  /**
   * ST-107. Confirms one brief revision: the single explicit authorisation
   * for the paid chain. Only the latest revision of a `brief_ready` run can be
   * confirmed. Confirmation is a conditional status change, so two racing
   * confirms produce one run, and a replay returns it.
   */
  public async create(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<OneShotResponse> {
    this.assertCanStart(input.ownerUserId);
    const body = parseBody(oneShotCreateInputSchema, input.body);
    const run = await this.latest(input);
    if (run === undefined)
      throw conflict("Prepare a video brief before creating the video.");
    const brief = await this.briefRow(input, run.id as Identifier, body.briefRevision);
    if (brief === undefined)
      throw conflict(
        "That brief revision does not exist. Review the current brief and confirm it.",
      );
    if (!briefStatuses.includes(run.status)) {
      // A replay, or the loser of a race, sees the run it confirmed.
      if (run.confirmedBriefRevision === body.briefRevision)
        return this.respond(input, run);
      throw conflict("This video has already been started.");
    }
    if (run.status === "brief_pending")
      throw conflict(
        "The brief is being revised. Wait for the new brief, then confirm it.",
      );
    const [latest] = await this.database
      .select({ revision: max(oneShotRunBriefs.revision) })
      .from(oneShotRunBriefs)
      .where(eq(oneShotRunBriefs.runId, run.id));
    if (latest?.revision !== body.briefRevision)
      throw conflict(
        "A newer brief has been prepared. Review it, then confirm it.",
      );
    const view = toBriefView(brief);
    if (body.acceptedEstimateUsd + 1e-9 < view.estimate.totalUsd)
      throw new PublicError(
        "bad_request",
        "The accepted estimate is below the brief's estimate. Review the estimate and accept it to start.",
        409,
        false,
        {
          acceptedEstimateUsd: `The brief's estimate is ${view.estimate.totalUsd} USD.`,
        },
      );
    const stylePackId = body.stylePackId ?? view.stylePackId;
    const soundBed = body.soundBed ?? view.soundBed;
    if (soundBed !== soundBedNone) {
      const [track] = await this.database
        .select({ trackId: soundBedTracks.trackId })
        .from(soundBedTracks)
        .where(
          and(
            eq(soundBedTracks.trackId, soundBed),
            eq(soundBedTracks.status, "active"),
          ),
        )
        .limit(1);
      if (track === undefined)
        throw new PublicError(
          "validation_failed",
          "Choose a sound bed from the catalog, or none.",
          400,
          false,
          { soundBed: "This track is not available." },
        );
    }

    const reservedUsd = roundUsd(body.acceptedEstimateUsd);
    const capUsd = budgetCapUsd(reservedUsd, this.options.budgetTolerance);
    const timestamp = this.now();
    const decisions: OneShotDecisionDraft[] = [
      {
        kind: "style_pack",
        summary: `Style pack: ${stylePackId}.`,
        reason:
          stylePackId === view.stylePackId
            ? view.stylePackReason
            : `Chosen by you in the brief (the brief suggested ${view.stylePackId}).`,
        ...(stylePackId === view.stylePackId
          ? { model: view.model, promptVersion: view.promptVersion }
          : {}),
      },
      {
        kind: "sound_bed",
        summary:
          soundBed === soundBedNone
            ? "Sound bed: none."
            : `Sound bed: ${soundBed}.`,
        reason:
          soundBed === view.soundBed
            ? view.soundBedReason
            : `Chosen by you in the brief (the brief suggested ${view.soundBed}).`,
        ...(soundBed === view.soundBed
          ? { model: view.model, promptVersion: view.promptVersion }
          : {}),
      },
      {
        kind: "budget_reservation",
        summary: `Reserved $${reservedUsd.toFixed(2)} for brief revision ${body.briefRevision}; the run stops before any step that would pass $${capUsd.toFixed(2)}.`,
        reason: `The cap is the accepted estimate times ${this.options.budgetTolerance}.`,
      },
    ];
    const confirmed = await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(oneShotRuns)
        .set({
          status: "queued",
          confirmedBriefRevision: body.briefRevision,
          focusPrompt: brief.focusPrompt,
          audience: brief.audience,
          targetDurationSeconds: brief.targetDurationSeconds,
          acceptedEstimateUsd: reservedUsd.toFixed(6),
          reservedUsd: reservedUsd.toFixed(6),
          capUsd: capUsd.toFixed(6),
          reservationRevision: 1,
          stylePackId,
          soundBed,
          decisionSequence: sql`${oneShotRuns.decisionSequence} + ${decisions.length}`,
          lastProgressAt: timestamp,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(oneShotRuns.id, run.id),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
            eq(oneShotRuns.status, "brief_ready"),
            eq(oneShotRuns.briefAttempts, run.briefAttempts),
          ),
        )
        .returning();
      if (updated === undefined) return undefined;
      await insertDecisions(transaction, updated, decisions, timestamp);
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "one_shot.run_started",
        target: { type: "one_shot_run", id: run.id },
        correlationId: input.correlationId,
        // Never the focus prompt: it is user content.
        metadata: {
          audience: brief.audience,
          targetDurationSeconds: brief.targetDurationSeconds,
          acceptedEstimateUsd: reservedUsd,
          estimateUsd: view.estimate.totalUsd,
          pricingVersion: view.estimate.pricingVersion,
          briefRevision: body.briefRevision,
          capUsd,
        },
        occurredAt: timestamp,
      });
      await this.scheduler.schedule(
        { run: updated, key: `oneshot:${run.id}:start`, delayMs: 0 },
        transaction,
      );
      return updated;
    });
    if (confirmed !== undefined) return this.respond(input, confirmed);
    // Lost a race: the winner may have confirmed this same revision.
    const [current] = await this.database
      .select()
      .from(oneShotRuns)
      .where(
        and(
          eq(oneShotRuns.id, run.id),
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          eq(oneShotRuns.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (
      current !== undefined &&
      current.confirmedBriefRevision === body.briefRevision
    )
      return this.respond(input, current);
    throw conflict("The brief changed while it was being confirmed. Review it and try again.");
  }

  /** ST-107. Accepts the raised estimate a budget-capped run proposes. */
  public async acceptBudget(
    input: Scope & { body: unknown; correlationId: Identifier },
  ): Promise<OneShotResponse> {
    this.assertCohort(input.ownerUserId);
    const body = parseBody(oneShotBudgetAcceptInputSchema, input.body);
    const run = await this.requireLatest(input);
    if (run.status !== "needs_attention" || run.errorCode !== "ONE_SHOT_BUDGET_CAP")
      throw conflict("This run is not waiting for a new budget.");
    if (run.reservationRevision !== body.reservationRevision)
      throw conflict("The budget changed. Refresh and review the new estimate.");
    const proposal = Number(run.budgetProposalUsd ?? 0);
    if (body.acceptedEstimateUsd + 1e-9 < proposal)
      throw new PublicError(
        "bad_request",
        "The accepted estimate is below the new estimate. Review it and accept it to continue.",
        409,
        false,
        { acceptedEstimateUsd: `The new estimate is ${proposal} USD.` },
      );
    const reservedUsd = roundUsd(body.acceptedEstimateUsd);
    const capUsd = budgetCapUsd(reservedUsd, this.options.budgetTolerance);
    const timestamp = this.now();
    const steps = oneShotStepsSchema
      .parse(run.steps)
      .map((entry) =>
        entry.state === "needs_attention" || entry.state === "failed"
          ? { step: entry.step, state: "pending" as const, startedAt: entry.startedAt }
          : entry,
      );
    const decisions: OneShotDecisionDraft[] = [
      {
        kind: "budget_reservation",
        summary: `Raised the reservation to $${reservedUsd.toFixed(2)} (revision ${run.reservationRevision + 1}); the run stops before any step that would pass $${capUsd.toFixed(2)}.`,
        reason: "You accepted a new estimate after the run reached its budget cap.",
      },
    ];
    const updated = await this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(oneShotRuns)
        .set({
          status: "running",
          steps,
          needsAttentionStage: null,
          errorCode: null,
          errorMessage: null,
          reservedUsd: reservedUsd.toFixed(6),
          capUsd: capUsd.toFixed(6),
          acceptedEstimateUsd: reservedUsd.toFixed(6),
          reservationRevision: sql`${oneShotRuns.reservationRevision} + 1`,
          budgetProposalUsd: null,
          decisionSequence: sql`${oneShotRuns.decisionSequence} + ${decisions.length}`,
          lastProgressAt: timestamp,
          tickLeaseExpiresAt: null,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(oneShotRuns.id, run.id),
            eq(oneShotRuns.ownerUserId, input.ownerUserId),
            eq(oneShotRuns.projectId, input.projectId),
            eq(oneShotRuns.status, "needs_attention"),
            eq(oneShotRuns.reservationRevision, body.reservationRevision),
          ),
        )
        .returning();
      if (updated === undefined)
        throw conflict("The run changed. Refresh and try again.");
      await insertDecisions(transaction, updated, decisions, timestamp);
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "one_shot.budget_accepted",
        target: { type: "one_shot_run", id: run.id },
        correlationId: input.correlationId,
        metadata: {
          reservationRevision: updated.reservationRevision,
          acceptedEstimateUsd: reservedUsd,
          capUsd,
          proposedEstimateUsd: proposal,
        },
        occurredAt: timestamp,
      });
      await this.scheduler.schedule(
        {
          run: updated,
          key: `oneshot:${run.id}:budget:${updated.reservationRevision}`,
          delayMs: 0,
        },
        transaction,
      );
      return updated;
    });
    return this.respond(input, updated);
  }

  /** ST-107. The latest run's decision log, ledger and budget. */
  public async decisions(input: Scope): Promise<OneShotDecisionsResponse> {
    const eligibility = await this.eligibility(input);
    const empty = oneShotDecisionsResponseSchema.parse({
      runId: null,
      decisions: [],
      ledger: [],
      budget: null,
    });
    if (!eligibility.visible) return empty;
    const run = await this.latest(input);
    if (run === undefined) return empty;
    const [decisionRows, ledgerRows] = await Promise.all([
      this.database
        .select()
        .from(oneShotRunDecisions)
        .where(
          and(
            eq(oneShotRunDecisions.runId, run.id),
            eq(oneShotRunDecisions.ownerUserId, input.ownerUserId),
            eq(oneShotRunDecisions.projectId, input.projectId),
          ),
        )
        .orderBy(asc(oneShotRunDecisions.seq)),
      this.database
        .select()
        .from(oneShotRunLedgerEntries)
        .where(
          and(
            eq(oneShotRunLedgerEntries.runId, run.id),
            eq(oneShotRunLedgerEntries.ownerUserId, input.ownerUserId),
            eq(oneShotRunLedgerEntries.projectId, input.projectId),
          ),
        ),
    ]);
    const order = new Map<string, number>(
      oneShotLedgerStepValues.map((step, index) => [step, index]),
    );
    return oneShotDecisionsResponseSchema.parse({
      runId: run.id,
      decisions: decisionRows.map((row) => ({
        runId: row.runId,
        seq: row.seq,
        kind: row.kind,
        summary: row.summary,
        reason: row.reason,
        model: row.model,
        promptVersion: row.promptVersion,
        costUsd: row.costUsd === null ? null : Number(row.costUsd),
        relatedIds: row.relatedIds,
        createdAt: serializeUtcTimestamp(row.createdAt),
      })),
      ledger: ledgerRows
        .map((row) => ({
          step: row.step,
          estimateUsd: Number(row.estimateUsd),
          actualUsd: Number(row.actualUsd),
          usageRecordIds: row.usageRecordIds,
        }))
        .sort(
          (left, right) =>
            (order.get(left.step) ?? 99) - (order.get(right.step) ?? 99),
        ),
      budget: toView(run).budget,
    });
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
          budgetProposalUsd: null,
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

  /**
   * The run a brief call belongs to: the project's `brief_*` run, or a new
   * one. A project with any other active run cannot start a brief.
   */
  private async briefRun(
    input: Scope & { correlationId: Identifier },
    key: string,
    hash: string,
    body: z.infer<typeof oneShotBriefInputSchema>,
  ): Promise<RunRow> {
    const latest = await this.latest(input);
    if (latest !== undefined && briefStatuses.includes(latest.status))
      return latest;
    if (
      latest !== undefined &&
      (activeStatuses as string[]).includes(latest.status)
    )
      throw conflict(
        "This project already has a prompt-to-video run in progress. Finish or cancel it before starting another.",
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
    try {
      const [created] = await this.database
        .insert(oneShotRuns)
        .values({
          id: createId(timestamp),
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          idempotencyKey: key,
          requestHash: hash,
          focusPrompt: body.focusPrompt,
          audience: body.audience,
          targetDurationSeconds: body.targetDurationSeconds,
          acceptedEstimateUsd: "0",
          status: "brief_pending",
          correlationId: input.correlationId,
          lastProgressAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning();
      if (created === undefined) throw new Error("The run was not created.");
      return created;
    } catch (error) {
      // A concurrent first brief on the same project created the run.
      if (
        isUniqueViolation(error, "one_shot_runs_one_active_per_project") ||
        isUniqueViolation(error, "one_shot_runs_request_unique")
      ) {
        const raced = await this.latest(input);
        if (raced !== undefined && briefStatuses.includes(raced.status))
          return raced;
        throw conflict(
          "This project already has a prompt-to-video run in progress. Finish or cancel it before starting another.",
        );
      }
      throw error;
    }
  }

  private async findBriefByKey(
    input: Scope,
    key: string,
  ): Promise<BriefRow | undefined> {
    const [row] = await this.database
      .select()
      .from(oneShotRunBriefs)
      .where(
        and(
          eq(oneShotRunBriefs.ownerUserId, input.ownerUserId),
          eq(oneShotRunBriefs.projectId, input.projectId),
          eq(oneShotRunBriefs.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row;
  }

  private async briefRow(
    input: Scope,
    runId: Identifier,
    revision?: number,
  ): Promise<BriefRow | undefined> {
    const [row] = await this.database
      .select()
      .from(oneShotRunBriefs)
      .where(
        and(
          eq(oneShotRunBriefs.runId, runId),
          eq(oneShotRunBriefs.ownerUserId, input.ownerUserId),
          eq(oneShotRunBriefs.projectId, input.projectId),
          ...(revision === undefined
            ? []
            : [eq(oneShotRunBriefs.revision, revision)]),
        ),
      )
      .orderBy(desc(oneShotRunBriefs.revision))
      .limit(1);
    return row;
  }

  private async briefResponse(
    input: Scope,
    runId: Identifier,
  ): Promise<OneShotBriefResponse> {
    const [run] = await this.database
      .select({ briefAttempts: oneShotRuns.briefAttempts })
      .from(oneShotRuns)
      .where(
        and(
          eq(oneShotRuns.id, runId),
          eq(oneShotRuns.ownerUserId, input.ownerUserId),
          eq(oneShotRuns.projectId, input.projectId),
        ),
      )
      .limit(1);
    const row = await this.briefRow(input, runId);
    return oneShotBriefResponseSchema.parse({
      brief: row === undefined ? null : toBriefView(row),
      revisionsUsed: run?.briefAttempts ?? 0,
      maxRevisions: this.options.maxBriefRevisions,
      stylePackIds: oneShotStylePackIds,
    });
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
    const brief = await loadConfirmedBrief(this.database, claimed);
    const result = await advanceOneShotRun({
      run: toRunState(claimed, brief),
      gateway: this.gateway,
      now: this.now(),
    });
    // ST-107. Reconciled from the usage records before the save; written in
    // the save transaction only if the save wins.
    const ledger =
      brief === null
        ? null
        : await reconcileLedger(this.database, claimed, brief.estimate);
    const savedAt = this.now();
    // The save and the next tick's job commit together, so a saved ticking
    // run always has the job that advances it.
    return this.database.transaction(async (transaction) => {
      const [saved] = await transaction
        .update(oneShotRuns)
        .set({
          ...tickPatch(result, savedAt),
          decisionSequence: sql`${oneShotRuns.decisionSequence} + ${result.decisions.length}`,
        })
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
      await insertDecisions(transaction, saved, result.decisions, savedAt);
      if (ledger !== null)
        await writeLedger(transaction, saved, ledger, savedAt);
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
    budgetProposalUsd:
      result.budgetProposalUsd === null
        ? null
        : result.budgetProposalUsd.toFixed(6),
    ...(result.repair === undefined ? {} : { repairState: result.repair }),
    ...(result.coverageGaps === undefined
      ? {}
      : { coverageGaps: result.coverageGaps }),
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

function toRunState(row: RunRow, brief: OneShotRunBrief | null): OneShotRunState {
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
    brief,
    budget:
      brief === null || row.reservedUsd === null || row.capUsd === null
        ? null
        : { reservedUsd: Number(row.reservedUsd), capUsd: Number(row.capUsd) },
    repair: readOneShotRepairState(row.repairState),
    coverageGaps: readCoverageGaps(row.coverageGaps),
  };
}

function readCoverageGaps(value: unknown): string[] {
  const parsed = z.array(z.string().min(1).max(300)).max(10).safeParse(value);
  return parsed.success ? parsed.data : [];
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
    briefRevision: row.confirmedBriefRevision,
    budget:
      row.reservedUsd === null || row.capUsd === null
        ? null
        : {
            reservedUsd: Number(row.reservedUsd),
            capUsd: Number(row.capUsd),
            actualUsd: Number(row.actualCostUsd),
            reservationRevision: row.reservationRevision,
            proposedEstimateUsd:
              row.budgetProposalUsd === null
                ? null
                : Number(row.budgetProposalUsd),
          },
    coverageGaps: readCoverageGaps(row.coverageGaps),
    stylePackId: creativeDesignPackIdSchema.safeParse(row.stylePackId).data ?? null,
    soundBed: soundBedChoiceSchema.safeParse(row.soundBed).data ?? null,
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

// ---------------------------------------------------------------------------
// ST-107: briefs, the ledger and the decision log
// ---------------------------------------------------------------------------

type BriefRow = typeof oneShotRunBriefs.$inferSelect;

const briefStatuses: readonly OneShotRunStatus[] = ["brief_pending", "brief_ready"];

function requireIdempotencyKey(value: string | undefined, message: string): string {
  const key = value?.trim();
  if (key === undefined || key.length === 0 || key.length > 200)
    throw new PublicError("validation_failed", message, 400, false, {
      "idempotency-key": "Provide a non-empty key up to 200 characters.",
    });
  return key;
}

const storedBriefSchema = z
  .object({
    subject: z.string(),
    lessonTitle: z.string(),
    coverage: z.array(oneShotBriefCoveragePointSchema),
    notCovered: z.array(z.string()),
    sections: z.array(z.object({ sectionId: z.string(), heading: z.string() })),
    plannedSceneCount: z.number(),
    stylePackId: z.string(),
    stylePackReason: z.string(),
    soundBed: z.string(),
    soundBedReason: z.string(),
    model: z.string(),
    promptVersion: z.string(),
  })
  .passthrough();

/** A stored brief revision as its owner sees it. */
function toBriefView(row: BriefRow): OneShotBrief {
  const stored = storedBriefSchema.parse(row.brief);
  return oneShotBriefSchema.parse({
    runId: row.runId,
    revision: row.revision,
    focusPrompt: row.focusPrompt,
    audience: oneShotAudienceSchema.parse(row.audience),
    targetDurationSeconds: row.targetDurationSeconds,
    subject: stored.subject,
    lessonTitle: stored.lessonTitle,
    coverage: stored.coverage,
    notCovered: stored.notCovered,
    sections: stored.sections,
    plannedSceneCount: stored.plannedSceneCount,
    stylePackId: stored.stylePackId,
    stylePackReason: stored.stylePackReason,
    soundBed: stored.soundBed,
    soundBedReason: stored.soundBedReason,
    estimate: oneShotEstimateSchema.parse(row.estimate),
    model: stored.model,
    promptVersion: stored.promptVersion,
    modelCallId: row.modelCallId,
    createdAt: serializeUtcTimestamp(row.createdAt),
  });
}

/** The confirmed brief a run's ticks work from; `null` before ST-107. The
 * run's own confirmed style pack and sound bed override the brief's
 * suggestions. */
async function loadConfirmedBrief(
  database: DatabaseClient,
  run: RunRow,
): Promise<OneShotRunBrief | null> {
  if (run.confirmedBriefRevision === null) return null;
  const [row] = await database
    .select()
    .from(oneShotRunBriefs)
    .where(
      and(
        eq(oneShotRunBriefs.runId, run.id),
        eq(oneShotRunBriefs.ownerUserId, run.ownerUserId),
        eq(oneShotRunBriefs.projectId, run.projectId),
        eq(oneShotRunBriefs.revision, run.confirmedBriefRevision),
      ),
    )
    .limit(1);
  if (row === undefined) return null;
  const view = toBriefView(row);
  return {
    revision: view.revision,
    subject: view.subject,
    lessonTitle: view.lessonTitle,
    coverage: view.coverage,
    stylePackId:
      creativeDesignPackIdSchema.safeParse(run.stylePackId).data ??
      view.stylePackId,
    soundBed: soundBedChoiceSchema.safeParse(run.soundBed).data ?? view.soundBed,
    estimate: view.estimate,
  };
}

type LedgerLine = {
  step: OneShotLedgerStep;
  estimateUsd: number;
  actualUsd: number;
  usageRecordIds: string[];
};

/**
 * Every usage record the run's correlation id produced, by ledger line, next
 * to that line's accepted estimate. Tenant-scoped on owner and project.
 */
export async function reconcileLedger(
  database: DatabaseClient,
  run: Pick<RunRow, "ownerUserId" | "projectId" | "correlationId">,
  estimate: OneShotEstimate,
): Promise<LedgerLine[]> {
  const records = await database
    .select({
      id: usageRecords.id,
      operationType: usageRecords.operationType,
      costUsd: usageRecords.estimatedCostUsd,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.ownerUserId, run.ownerUserId),
        eq(usageRecords.projectId, run.projectId),
        eq(usageRecords.correlationId, run.correlationId),
      ),
    )
    .orderBy(asc(usageRecords.occurredAt), asc(usageRecords.id));
  const estimates = ledgerEstimates(estimate);
  const lines = new Map<OneShotLedgerStep, LedgerLine>();
  const line = (step: OneShotLedgerStep) => {
    let entry = lines.get(step);
    if (entry === undefined) {
      entry = {
        step,
        estimateUsd: estimates[step] ?? 0,
        actualUsd: 0,
        usageRecordIds: [],
      };
      lines.set(step, entry);
    }
    return entry;
  };
  for (const step of Object.keys(estimates) as OneShotLedgerStep[]) line(step);
  for (const record of records) {
    const entry = line(ledgerStepForOperation(record.operationType));
    entry.actualUsd = roundUsd(entry.actualUsd + Number(record.costUsd));
    entry.usageRecordIds.push(record.id);
  }
  return [...lines.values()];
}

/** One row per `(run, step)`, updated in place as spend is reconciled. */
async function writeLedger(
  executor: DatabaseExecutor,
  run: Pick<RunRow, "id" | "ownerUserId" | "projectId">,
  lines: readonly LedgerLine[],
  now: Date,
): Promise<void> {
  if (lines.length === 0) return;
  await executor
    .insert(oneShotRunLedgerEntries)
    .values(
      lines.map((entry) => ({
        id: createId(now),
        ownerUserId: run.ownerUserId,
        projectId: run.projectId,
        runId: run.id,
        step: entry.step,
        estimateUsd: entry.estimateUsd.toFixed(6),
        actualUsd: entry.actualUsd.toFixed(6),
        usageRecordIds: entry.usageRecordIds,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: [oneShotRunLedgerEntries.runId, oneShotRunLedgerEntries.step],
      set: {
        estimateUsd: sql`excluded.estimate_usd`,
        actualUsd: sql`excluded.actual_usd`,
        usageRecordIds: sql`excluded.usage_record_ids`,
        updatedAt: now,
      },
    });
}

/**
 * Appends decisions after the caller bumped `decision_sequence` by their
 * count in the same transaction; `run` is the row that update returned, so
 * the row lock orders every writer and `seq` never collides.
 */
export async function insertDecisions(
  executor: DatabaseExecutor,
  run: Pick<RunRow, "id" | "ownerUserId" | "projectId" | "decisionSequence">,
  drafts: readonly OneShotDecisionDraft[],
  now: Date,
): Promise<void> {
  if (drafts.length === 0) return;
  const first = run.decisionSequence - drafts.length + 1;
  await executor.insert(oneShotRunDecisions).values(
    drafts.map((draft, index) => {
      const decision = oneShotDecisionDraftSchema.parse(draft);
      return {
        id: createId(now),
        ownerUserId: run.ownerUserId,
        projectId: run.projectId,
        runId: run.id,
        seq: first + index,
        kind: decision.kind,
        summary: decision.summary,
        reason: decision.reason ?? null,
        model: decision.model ?? null,
        promptVersion: decision.promptVersion ?? null,
        costUsd: decision.costUsd === undefined ? null : decision.costUsd.toFixed(6),
        relatedIds: decision.relatedIds,
        createdAt: now,
      };
    }),
  );
}
