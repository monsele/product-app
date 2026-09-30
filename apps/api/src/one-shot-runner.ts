/**
 * ST-105 — the prompt-to-video runner's state machine (ADR-013 §5).
 *
 * One call to {@link advanceOneShotRun} is one tick. A tick:
 *
 * 1. re-reads the real artifact state through {@link OneShotStageGateway}
 *    from the first step, so a manual edit made in the wizard mid-run is seen
 *    and a stale downstream artifact is regenerated;
 * 2. performs **at most one** action (a generate, an approval, a save);
 * 3. returns the patch to persist and whether to tick again.
 *
 * It holds no database transaction and has no I/O of its own: persistence,
 * scheduling and the tick lease belong to `one-shot.ts`. That keeps every step,
 * stop condition, timeout and resume path unit-testable against a fake
 * gateway.
 *
 * ST-107 adds, for runs with a confirmed brief:
 *
 * - a budget guard before every paid action: a call that would take actual
 *   spend past the reservation's cap stops the run with ONE_SHOT_BUDGET_CAP
 *   before the call, and proposes a new estimate to accept;
 * - bounded self-repair after validation (at most two rounds of at most four
 *   scenes, through the existing scene-regeneration job), where validation
 *   alone decides what is wrong and whether a round helped;
 * - the brief-promise check before the preview (coverage by citation, the
 *   duration band, and the pinned style pack and sound bed);
 * - decision-log entries for every automatic decision, and the ST-103 render
 *   review on the render it tracks.
 *
 * ST-112 adds the `visual_plan` step between storyboard and illustrations
 * for a lesson with a v2 design (ADR-015). Planning and its pictures are
 * optional polish: a failure, a refusal or a budget shortfall keeps a valid
 * authored design and the run continues without asking anyone.
 *
 * The runner is a *client* of the existing services. It never bypasses their
 * checks (snapshot staleness, `expectedRevision`, grounding, validation,
 * version and render requirements); a service refusal becomes
 * `needs_attention` at the stage that refused. It never acknowledges a
 * validation warning and never renders: rendering waits for
 * `POST one-shot/render`.
 */

import { PublicError, type Identifier } from "@avlp/config";
import {
  currentSceneRegenerationCompatibility,
  type CreativeDesignPackId,
  type ObjectiveFocusCoverage,
  type SoundBedChoice,
} from "@avlp/schemas";
import type {
  OneShotAttentionStage,
  OneShotAudience,
  OneShotBriefCoveragePoint,
  OneShotDecisionDraft,
  OneShotErrorCode,
  OneShotEstimate,
  OneShotLedgerStep,
  OneShotRunStatus,
  OneShotStep,
  OneShotStepDetail,
  OneShotStepRecord,
} from "@avlp/schemas/one-shot";
import { z } from "zod";
import {
  oneShotMaxRepairRounds,
  oneShotMaxRepairScenesPerRound,
  paidActionEstimateUsd,
  proposedBudgetUsd,
  wouldExceedCap,
  type OneShotPaidAction,
} from "./one-shot-budget.js";
import {
  checkBriefPromises,
  classifyFindings,
  nextRepairRound,
  planCoverageRepair,
  planRepairRound,
  type PlannedRepair,
  type RepairFinding,
  type RepairObjective,
  type RepairScene,
} from "./one-shot-repair.js";

/** A step with no progress for this long fails with ONE_SHOT_STEP_TIMEOUT. */
export const oneShotStepTimeoutMs = 20 * 60 * 1_000;

export type OneShotScope = { ownerUserId: Identifier; projectId: Identifier };

/** Everything a gateway action needs to act for the run's owner. */
export type OneShotCallContext = OneShotScope & {
  correlationId: Identifier;
  oneShotRunId: Identifier;
  /** Deterministic request key for this step and resume generation. */
  requestKey: string;
};

export type OneShotJobState =
  | "queued"
  | "running"
  | "retry_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

export type OneShotJobStatus = {
  id: Identifier;
  state: OneShotJobState;
  errorCode: string | null;
};

export type ApprovalStage = "objectives" | "outline" | "narration";

/** The real state of objectives, outline or narration. */
export type ApprovalStageState = {
  state: "idle" | "generating" | "draft" | "approved" | "failed";
  /** The working set was generated from inputs that have since changed. */
  stale: boolean;
  revision: number | null;
  canApprove: boolean;
  latestJob: OneShotJobStatus | null;
  /** Objectives only. */
  focusCoverage?: ObjectiveFocusCoverage | null;
};

export type StoryboardState = {
  state: "idle" | "generating" | "draft" | "approved" | "failed";
  stale: boolean;
  lessonSpecId: Identifier | null;
  revision: number | null;
  latestJob: OneShotJobStatus | null;
};

export type AcceptableIllustration = {
  candidateId: Identifier;
  sceneId: Identifier;
  slot: string;
  sceneRevision: number;
  storyboardRevision: number;
};

export type IllustrationState = {
  /** Candidates still generating or awaiting moderation in unbound slots. */
  pending: number;
  /** Unbound decorative slots with a selectable candidate (ST-059 rules). */
  acceptable: AcceptableIllustration[];
};

/** ST-112. The design the current storyboard's draft holds. */
export type VisualDesignState = {
  /** `null` when the lesson has no design and renders the legacy look. */
  release: "v1" | "v2" | null;
  /** The draft is the design the lesson previews and renders with. */
  applied: boolean;
  /** v2 only. What the design resolved to, for the run's record. */
  summary?: {
    /** Scenes per composition family, as `family:count` pairs. */
    families: string;
    /** Scenes showing a pinned picture, and how many of those were generated. */
    pictures: number;
    generatedPictures: number;
  };
};

/** ST-112. A visual-plan job the run queued, and how it left the design. */
export type VisualPlanStatus = {
  job: OneShotJobStatus | null;
  /** `null` until the job succeeds. `authored` is the job's own fallback. */
  outcome: "model" | "authored" | "superseded" | null;
  fallbackReason: string | null;
};

export type GroundingState = {
  /** A check exists for exactly this lesson spec revision. */
  current: boolean;
  latestJob: OneShotJobStatus | null;
};

export type AudioState = {
  total: number;
  ready: number;
  pending: number;
  failed: number;
  /** Scenes with no current audio (never generated, or stale). */
  missing: number;
};

export type ValidationOutcome = {
  runId: Identifier;
  status: "passed" | "failed";
  errors: number;
  warnings: number;
  /** ST-107. Every unacknowledged error and warning, for the repair map. */
  findings?: RepairFinding[];
};

/** ST-103's post-render review, as the runner needs it. */
export type RenderReviewState = {
  outcome: "passed" | "failed";
  findings: { code: string; severity: "error" | "warning"; detail: string }[];
};

export type RenderState = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  errorCode: string | null;
  /** ST-107. `null` until the render has been reviewed. */
  review?: RenderReviewState | null;
};

/** ST-107. What repair planning needs to know about the working storyboard. */
export type RepairContext = {
  scenes: (RepairScene & { sectionIds: readonly string[] })[];
  objectives: RepairObjective[];
};

/** ST-107. A scene-regeneration job the run queued, and its candidate. */
export type SceneRepairStatus = {
  job: OneShotJobStatus | null;
  candidate: {
    id: Identifier;
    /** `accepted` or `rejected` when a tick that settled it died before
     * saving; the runner then records the settlement without acting again. */
    status: "pending" | "accepted" | "rejected";
    /** Every source block the scene cited before is still cited. */
    keepsSourceRefs: boolean;
    costUsd: number;
    modelCallId: Identifier;
  } | null;
};

/** ST-107. What the brief-promise check reads. */
export type PromiseState = {
  sceneSections: { sceneId: string; order: number; sectionIds: string[] }[];
  sectionOrder: ReadonlyMap<string, number>;
  measuredDurationSeconds: number;
  toleranceSeconds: number;
  /** What a lesson version saved now would pin (the configuration). */
  pinned: { stylePackId: string | null; soundBed: string | null };
};

export type IngestionState =
  | { state: "pending" }
  | { state: "ready" }
  | { state: "failed"; errorCode: string };

export type ConfigurationState = {
  version: number;
  focusPrompt: string | null;
  ageBand: string;
  difficulty: string;
  targetDurationSeconds: number;
  /** ST-107. */
  creativeStylePack?: string | null;
  soundBed?: string;
};

/**
 * The runner's view of the existing services. Each method maps onto one
 * existing NestJS service call (see `one-shot-gateway.ts`); none bypasses
 * that service's checks.
 */
export interface OneShotStageGateway {
  ingestion(scope: OneShotScope): Promise<IngestionState>;
  sourceSnapshot(
    scope: OneShotScope,
  ): Promise<{ approved: boolean; stale: boolean }>;
  approveSourceSnapshot(context: OneShotCallContext): Promise<{
    snapshotId: Identifier;
  }>;
  configuration(scope: OneShotScope): Promise<ConfigurationState | null>;
  voiceConfigured(scope: OneShotScope): Promise<boolean>;
  inferIntent(
    context: OneShotCallContext,
    focusPrompt: string,
  ): Promise<{ subject: string; lessonTitle: string }>;
  saveConfiguration(
    context: OneShotCallContext,
    input: {
      expectedVersion: number;
      subject: string;
      lessonTitle: string;
      focusPrompt: string;
      audience: OneShotAudience;
      targetDurationSeconds: 180 | 300 | 420;
      /** ST-107. The confirmed brief's choices; omitted without a brief. */
      creativeStylePack?: CreativeDesignPackId;
      soundBed?: SoundBedChoice;
    },
  ): Promise<{ version: number }>;
  saveDefaultVoice(context: OneShotCallContext): Promise<void>;
  approvalStage(
    scope: OneShotScope,
    stage: ApprovalStage,
  ): Promise<ApprovalStageState>;
  generate(
    context: OneShotCallContext,
    stage: ApprovalStage | "storyboard",
    options?: { briefCoverage?: readonly string[] },
  ): Promise<{ jobId: Identifier }>;
  approve(
    context: OneShotCallContext,
    stage: ApprovalStage,
    expectedRevision: number,
  ): Promise<{ approvedId: Identifier; revision: number }>;
  storyboard(scope: OneShotScope): Promise<StoryboardState>;
  illustrations(scope: OneShotScope): Promise<IllustrationState>;
  /**
   * Requests the lesson's missing pictures. A v2 design asks for its
   * deduplicated presentation illustrations (`cinema`); any other lesson
   * fills its unbound decorative slots.
   */
  requestIllustrations(context: OneShotCallContext): Promise<{
    queued: number;
    skipped: number;
    cinema?: { reused: number; motif: number; budget: number };
  }>;
  /** ST-112. */
  visualDesign(scope: OneShotScope): Promise<VisualDesignState>;
  /** ST-112. Queues the visual planner; `null` when there is no v2 draft. */
  requestVisualPlan(
    context: OneShotCallContext,
  ): Promise<{ jobId: Identifier } | null>;
  visualPlan(scope: OneShotScope, jobId: Identifier): Promise<VisualPlanStatus>;
  /**
   * ST-112. Makes the draft (the plan and its pinned pictures) the design the
   * lesson renders with. `applied: false` when the draft no longer fits the
   * storyboard: the design already in use is kept.
   */
  applyVisualDesign(
    context: OneShotCallContext,
  ): Promise<{ applied: true; snapshotId: Identifier } | { applied: false }>;
  acceptIllustration(
    context: OneShotCallContext,
    candidate: AcceptableIllustration,
  ): Promise<void>;
  grounding(
    scope: OneShotScope,
    spec: { lessonSpecId: Identifier; revision: number },
  ): Promise<GroundingState>;
  requestGrounding(
    context: OneShotCallContext,
    spec: { lessonSpecId: Identifier; revision: number },
  ): Promise<{ jobId: Identifier }>;
  audio(scope: OneShotScope): Promise<AudioState>;
  requestAudio(context: OneShotCallContext): Promise<void>;
  validate(scope: OneShotScope): Promise<ValidationOutcome>;
  render(scope: OneShotScope, renderJobId: Identifier): Promise<RenderState>;
  /** Actual spend so far: usage records carrying the run's correlation id. */
  costSoFar(scope: OneShotScope, correlationId: Identifier): Promise<number>;
  /** ST-107. Scenes and objectives of the working storyboard. */
  repairContext(scope: OneShotScope): Promise<RepairContext>;
  /** ST-107. Queues the existing scene-regeneration job for one fix. */
  requestSceneRepair(
    context: OneShotCallContext,
    repair: { sceneId: string; mode: PlannedRepair["mode"]; instruction: string },
  ): Promise<{ jobId: Identifier }>;
  sceneRepairStatus(
    scope: OneShotScope,
    repair: { sceneId: string; jobId: Identifier },
  ): Promise<SceneRepairStatus>;
  applySceneRepair(
    context: OneShotCallContext,
    repair: { sceneId: string; candidateId: Identifier },
  ): Promise<void>;
  rejectSceneRepair(
    context: OneShotCallContext,
    repair: { sceneId: string; candidateId: Identifier },
  ): Promise<void>;
  /** ST-107. The inputs of the brief-promise check. */
  promiseState(scope: OneShotScope): Promise<PromiseState>;
  /**
   * Removes every narration sentence the current grounding check marked
   * unsupported from its scene, through the ordinary scene edit (so the
   * scene's audio and the grounding check go stale and are redone). A
   * sentence that is a scene's only sentence is kept. Returns what changed.
   */
  removeUnverifiedSentences(
    context: OneShotCallContext,
  ): Promise<{ removed: { sceneId: string; text: string }[]; kept: number }>;
  /** Records an automatic approval, actor `one_shot_run`. */
  auditApproval(
    context: OneShotCallContext,
    input: {
      step: OneShotStep;
      target: { type: string; id: string };
      revision?: number;
    },
  ): Promise<void>;
}

/** ST-107. The confirmed brief, as the runner uses it. */
export type OneShotRunBrief = {
  revision: number;
  subject: string;
  lessonTitle: string;
  coverage: OneShotBriefCoveragePoint[];
  stylePackId: CreativeDesignPackId;
  soundBed: SoundBedChoice;
  estimate: OneShotEstimate;
};

const repairItemSchema = z
  .object({
    sceneId: z.string().min(1).max(64),
    order: z.number().int().nonnegative(),
    code: z.string().min(1).max(64),
    mode: z.enum(["shorten", "regenerate"]),
    instruction: z.string().min(1).max(500),
    state: z.enum(["planned", "queued", "applied", "discarded"]),
    jobId: z.string().min(1).max(64).optional(),
  })
  .strict();

/** ST-107. Bounded self-repair bookkeeping, persisted on the run. */
export const oneShotRepairStateSchema = z
  .object({
    /** Validation repair rounds started (at most `oneShotMaxRepairRounds`). */
    roundsDone: z.number().int().nonnegative(),
    /** Repairable findings when the last round started. */
    countBeforeLastRound: z.number().int().nonnegative().nullable(),
    coverageRoundUsed: z.boolean(),
    /** Why repair ended, once it has. It never restarts after that. */
    stopped: z
      .enum(["exhausted", "no_progress", "nothing_to_repair", "failed"])
      .nullable(),
    active: z
      .object({
        round: z.number().int().positive(),
        kind: z.enum(["validation", "coverage"]),
        items: z.array(repairItemSchema).max(oneShotMaxRepairScenesPerRound),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type OneShotRepairState = z.infer<typeof oneShotRepairStateSchema>;

export const emptyOneShotRepairState: OneShotRepairState = {
  roundsDone: 0,
  countBeforeLastRound: null,
  coverageRoundUsed: false,
  stopped: null,
  active: null,
};

/** Reads persisted repair state; anything unreadable starts empty. */
export function readOneShotRepairState(value: unknown): OneShotRepairState {
  const parsed = oneShotRepairStateSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyOneShotRepairState;
}

/** The persisted run state a tick starts from. */
export type OneShotRunState = {
  id: Identifier;
  ownerUserId: Identifier;
  projectId: Identifier;
  correlationId: Identifier;
  status: OneShotRunStatus;
  focusPrompt: string;
  audience: OneShotAudience;
  targetDurationSeconds: 180 | 300 | 420;
  steps: OneShotStepRecord[];
  resumeCount: number;
  lastProgressAt: Date;
  renderJobId: Identifier | null;
  /** ST-107. `null` (or absent) for runs from before briefs existed. */
  brief?: OneShotRunBrief | null;
  budget?: { reservedUsd: number; capUsd: number } | null;
  repair?: OneShotRepairState;
  coverageGaps?: readonly string[];
};

/** What a tick asks the service to persist. */
export type OneShotTickResult = {
  status: OneShotRunStatus;
  currentStep: OneShotStep | null;
  steps: OneShotStepRecord[];
  /** True when something observably moved: an action or a state change. */
  progressed: boolean;
  needsAttention: {
    stage: OneShotAttentionStage;
    errorCode: OneShotErrorCode;
    message: string;
  } | null;
  focusCoverage?: ObjectiveFocusCoverage | null;
  actualCostUsd: number;
  /** Schedule another tick. False for every terminal or waiting status. */
  reschedule: boolean;
  /** ST-107. Decisions to append to the run's log, in order. */
  decisions: OneShotDecisionDraft[];
  /** ST-107. Present when the repair state changed this tick. */
  repair?: OneShotRepairState;
  /** ST-107. Present when the unmet coverage points changed this tick. */
  coverageGaps?: string[];
  /** ST-107. The estimate to accept after ONE_SHOT_BUDGET_CAP; `null`
   * otherwise. */
  budgetProposalUsd: number | null;
};

type Outcome =
  | { kind: "done"; detail?: OneShotStepDetail }
  | { kind: "wait"; jobId?: Identifier; detail?: OneShotStepDetail }
  | { kind: "acted"; jobId?: Identifier; detail?: OneShotStepDetail }
  | {
      kind: "attention";
      stage: OneShotAttentionStage;
      errorCode: OneShotErrorCode;
      message: string;
      jobId?: Identifier;
      terminal?: boolean;
    };

/** Ledger lines still ahead of each pipeline step, for a budget proposal. */
const ledgerOrder: readonly OneShotLedgerStep[] = [
  "objectives",
  "outline",
  "narration",
  "storyboard",
  "visual_plan",
  "illustrations",
  "grounding",
  "audio",
  "repair",
];

function remainingLedgerSteps(step: OneShotStep): OneShotLedgerStep[] {
  const from: OneShotLedgerStep | null =
    step === "objectives" ||
    step === "outline" ||
    step === "narration" ||
    step === "storyboard" ||
    step === "visual_plan" ||
    step === "illustrations" ||
    step === "grounding" ||
    step === "audio"
      ? step
      : step === "validation"
        ? "repair"
        : null;
  if (from === null) return [...ledgerOrder];
  return ledgerOrder.slice(ledgerOrder.indexOf(from));
}

const repairCodeLabels: Readonly<Record<string, string>> = {
  text_overflow: "on-screen text overflowed its layout",
  scene_monotony: "too many scenes in a row used the same template",
  scene_duration_out_of_range: "the scene length did not match its allocation",
  objective_uncovered: "a learning objective was not covered",
  brief_coverage: "a confirmed brief point was not covered",
};

/** "Round 1", "Round 2", or "Coverage fix" for the brief-coverage round. */
function roundLabel(active: { round: number; kind: "validation" | "coverage" }): string {
  return active.kind === "coverage" ? "Coverage fix" : `Round ${active.round}`;
}

const pipelineSteps = [
  "ingestion",
  "source_snapshot",
  "configuration",
  "objectives",
  "outline",
  "narration",
  "storyboard",
  "visual_plan",
  "illustrations",
  "grounding",
  "audio",
  "validation",
] as const satisfies readonly OneShotStep[];

function isActive(job: OneShotJobStatus | null): boolean {
  return (
    job !== null &&
    (job.state === "queued" ||
      job.state === "running" ||
      job.state === "retry_wait")
  );
}

function jobFailed(job: OneShotJobStatus | null): boolean {
  return job !== null && (job.state === "failed" || job.state === "cancelled");
}

/** The runner's own job for a step, as recorded in the step's record. */
function recordedJobId(
  steps: readonly OneShotStepRecord[],
  step: OneShotStep,
): Identifier | undefined {
  return steps.find((entry) => entry.step === step)?.jobId as
    | Identifier
    | undefined;
}

/**
 * Job failures that mean "this draft was rejected by the automatic checks",
 * not "something is wrong with the inputs": a fresh generation usually
 * passes, so the run regenerates once before asking for help.
 */
const regenerableJobErrorCodes: ReadonlySet<string> = new Set([
  "MODEL_OUTPUT_DETERMINISTIC_FAILURE",
  "STRUCTURED_OUTPUT_INVALID",
]);

/**
 * Rounds of removing sentences grounding could not verify, per resume. One
 * round normally clears them; a second covers a re-check that flags a
 * sentence the first check did not reach.
 */
export const oneShotMaxSentenceRemovalRounds = 2;
const sentenceRemovalResumeKey = "sentenceRemovalResume";
const sentenceRemovalRoundsKey = "sentenceRemovalRounds";

/** Step-detail key holding the resume generation whose automatic retry was used. */
const autoRetryDetailKey = "autoRetriedAtResume";

/**
 * The step names the run page shows (its seven display steps), so a message
 * never names an internal stage the user did not see.
 */
const userStepName: Record<OneShotAttentionStage, string> = {
  ingestion: "Reading document",
  source_snapshot: "Reading document",
  configuration: "Planning",
  objectives: "Planning",
  outline: "Outline",
  narration: "Narration",
  storyboard: "Visuals",
  visual_plan: "Visuals",
  illustrations: "Visuals",
  grounding: "Visuals",
  audio: "Audio",
  validation: "Checks",
  preview: "Checks",
  render: "Render",
};

/**
 * A stop after automatic recovery ran out. The job's error code stays in the
 * step record and job row; the user only reads what happened and what to do.
 * A draft rejected by the checks only reaches here after the automatic
 * regeneration (see `failedStage`), so "tried again" is always true.
 */
function stageFailure(
  stage: OneShotAttentionStage,
  job: OneShotJobStatus,
): Outcome {
  const name = userStepName[stage];
  const message =
    job.errorCode !== null && regenerableJobErrorCodes.has(job.errorCode)
      ? `The ${name} step didn't pass our quality checks, even after we tried again automatically. Select Try again for a fresh attempt. Nothing has been lost.`
      : `The ${name} step couldn't finish on our side. Select Try again. Nothing has been lost. If it keeps happening, open the editor to check this step.`;
  return {
    kind: "attention",
    stage,
    errorCode: "STAGE_JOB_FAILED",
    message,
    jobId: job.id,
  };
}

/** Maps a service refusal to a stop the user can act on. Conflicts from a
 * concurrent edit are not a stop: the next tick re-reads and continues. */
function refusal(stage: OneShotAttentionStage, error: unknown): Outcome | null {
  if (!(error instanceof PublicError)) return null;
  if (error.code === "edit_conflict") return null;
  if (error.statusCode >= 500 || error.code === "rate_limited") return null;
  return {
    kind: "attention",
    stage,
    errorCode: "STAGE_BLOCKED",
    message: error.message.slice(0, 500),
  };
}

export async function advanceOneShotRun(input: {
  run: OneShotRunState;
  gateway: OneShotStageGateway;
  now: Date;
}): Promise<OneShotTickResult> {
  const { run, gateway, now } = input;
  const scope: OneShotScope = {
    ownerUserId: run.ownerUserId,
    projectId: run.projectId,
  };
  const steps = run.steps.map((entry) => ({ ...entry }));
  const timestamp = now.toISOString();
  let progressed = false;
  let focusCoverage: ObjectiveFocusCoverage | null | undefined;
  const brief = run.brief ?? null;
  const budget = run.budget ?? null;
  const decisions: OneShotDecisionDraft[] = [];
  // Never mutated in place: every change builds new objects (`setRepair`, and
  // `continueRepair` copies the items it updates).
  let repair: OneShotRepairState = run.repair ?? emptyOneShotRepairState;
  let repairChanged = false;
  let coverageGaps: string[] | undefined;
  let budgetProposalUsd: number | null = null;
  const setRepair = (next: OneShotRepairState) => {
    repair = next;
    repairChanged = true;
  };

  const context = (step: OneShotStep, suffix = ""): OneShotCallContext => ({
    ...scope,
    correlationId: run.correlationId,
    oneShotRunId: run.id,
    requestKey: `oneshot:${run.id}:${step}:r${run.resumeCount}${suffix}`,
  });

  const record = (
    step: OneShotStep,
    state: OneShotStepRecord["state"],
    extra: { jobId?: Identifier; detail?: OneShotStepDetail } = {},
  ) => {
    const index = steps.findIndex((entry) => entry.step === step);
    const existing = index === -1 ? undefined : steps[index];
    const finished = state === "done" || state === "failed";
    // A done step that real state reopens (a manual edit made it stale)
    // starts again; otherwise the original start time is kept.
    const reopened = existing?.state === "done" && state !== "done";
    const next: OneShotStepRecord = {
      step,
      state,
      startedAt:
        existing === undefined || reopened ? timestamp : existing.startedAt,
      ...(extra.jobId !== undefined
        ? { jobId: extra.jobId }
        : existing?.jobId !== undefined
          ? { jobId: existing.jobId }
          : {}),
      ...(finished
        ? {
            finishedAt:
              existing?.state === state && existing.finishedAt !== undefined
                ? existing.finishedAt
                : timestamp,
          }
        : {}),
      ...(extra.detail !== undefined
        ? { detail: extra.detail }
        : existing?.detail !== undefined
          ? { detail: existing.detail }
          : {}),
    };
    const changed =
      existing === undefined ||
      existing.state !== next.state ||
      existing.jobId !== next.jobId;
    if (changed) progressed = true;
    if (index === -1) steps.push(next);
    else steps[index] = next;
  };

  const finish = async (
    partial: Omit<
      OneShotTickResult,
      | "steps"
      | "progressed"
      | "actualCostUsd"
      | "focusCoverage"
      | "decisions"
      | "repair"
      | "coverageGaps"
      | "budgetProposalUsd"
    >,
  ): Promise<OneShotTickResult> => {
    const actualCostUsd = await gateway.costSoFar(scope, run.correlationId);
    const ordered = [...pipelineSteps, "render" as const]
      .map((step) => steps.find((entry) => entry.step === step))
      .filter((entry): entry is OneShotStepRecord => entry !== undefined);
    return {
      ...partial,
      steps: ordered,
      progressed,
      actualCostUsd,
      decisions,
      budgetProposalUsd,
      ...(focusCoverage === undefined ? {} : { focusCoverage }),
      ...(repairChanged ? { repair } : {}),
      ...(coverageGaps === undefined ? {} : { coverageGaps }),
    };
  };

  /**
   * ST-107. Stops before a paid action that would take actual spend past the
   * cap. Runs without a brief have no reservation and are never stopped here.
   */
  const guard = async (
    step: OneShotStep,
    action: OneShotPaidAction,
  ): Promise<Outcome | null> => {
    if (brief === null || budget === null) return null;
    const next = paidActionEstimateUsd(brief.estimate, action);
    const actualUsd = await gateway.costSoFar(scope, run.correlationId);
    if (!wouldExceedCap({ actualUsd, nextCallEstimateUsd: next, capUsd: budget.capUsd }))
      return null;
    budgetProposalUsd = proposedBudgetUsd({
      actualUsd,
      estimate: brief.estimate,
      remainingSteps: remainingLedgerSteps(step),
      blockedCallEstimateUsd: next,
    });
    return {
      kind: "attention",
      stage: step === "validation" ? "preview" : step,
      errorCode: "ONE_SHOT_BUDGET_CAP",
      message: `The next step would take this video past its budget cap of $${budget.capUsd.toFixed(2)} ($${actualUsd.toFixed(2)} spent so far). Accept the new estimate of $${budgetProposalUsd.toFixed(2)} to continue.`,
    };
  };

  /**
   * The run's own job for a stage failed. When the model's draft was merely
   * rejected by the automatic checks, regenerate once per resume (budget
   * permitting, and logged) before stopping for the user.
   */
  const failedStage = async (
    stage: ApprovalStage | "storyboard" | "grounding",
    failed: OneShotJobStatus,
    regenerate: (suffix: string) => Promise<{ jobId: Identifier }> = (
      suffix,
    ) =>
      gateway.generate(
        context(stage, suffix),
        stage as ApprovalStage | "storyboard",
        stage === "objectives" && brief !== null
          ? { briefCoverage: brief.coverage.map((entry) => entry.point) }
          : undefined,
      ),
  ): Promise<Outcome> => {
    const detail = steps.find((entry) => entry.step === stage)?.detail;
    if (
      failed.errorCode === null ||
      !regenerableJobErrorCodes.has(failed.errorCode) ||
      detail?.[autoRetryDetailKey] === run.resumeCount
    )
      return stageFailure(stage, failed);
    const stop = await guard(stage, "model_call");
    if (stop !== null) return stop;
    const queued = await regenerate(":auto1");
    decisions.push({
      kind: "repair",
      summary: `Regenerated the ${userStepName[stage]} step automatically after its first draft failed the quality checks.`,
      reason: failed.errorCode,
      relatedIds: [failed.id, queued.jobId],
    });
    return {
      kind: "acted",
      jobId: queued.jobId,
      detail: { ...detail, [autoRetryDetailKey]: run.resumeCount },
    };
  };

  // A tick acts at most once and then returns, so one read serves the tick.
  let designRead: Promise<VisualDesignState> | undefined;
  const visualDesign = () => (designRead ??= gateway.visualDesign(scope));

  const autoApproval = (summary: string, relatedIds: Identifier[]) => {
    decisions.push({ kind: "auto_approval", summary, relatedIds });
  };

  const timedOut = () =>
    !progressed &&
    now.getTime() - run.lastProgressAt.getTime() > oneShotStepTimeoutMs;

  const timeout = (step: OneShotStep) => {
    record(step, "failed");
    return finish({
      status: "failed",
      currentStep: step,
      needsAttention: {
        stage: step,
        errorCode: "ONE_SHOT_STEP_TIMEOUT",
        message:
          "This step made no progress for 20 minutes. Check the stage in the wizard, then resume the run.",
      },
      reschedule: false,
    });
  };

  // ---- Rendering: the only phase after the human gate. -------------------
  if (run.status === "rendering") {
    if (run.renderJobId === null)
      return finish({
        status: "awaiting_render_approval",
        currentStep: "render",
        needsAttention: null,
        reschedule: false,
      });
    const render = await gateway.render(scope, run.renderJobId);
    const previous = steps.find((entry) => entry.step === "render")?.detail
      ?.progress;
    if (render.status === "completed") {
      record("render", "done", {
        jobId: run.renderJobId,
        detail: { progress: 1 },
      });
      const warnings =
        render.review?.findings.filter((finding) => finding.severity === "warning") ??
        [];
      if (warnings.length > 0)
        decisions.push({
          kind: "render_review",
          summary: `The finished video passed its review with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}: ${warnings.map((finding) => finding.code).join(", ")}.`.slice(0, 500),
          reason: warnings.map((finding) => finding.detail).join(" ").slice(0, 500),
          relatedIds: [run.renderJobId],
        });
      return finish({
        status: "completed",
        currentStep: null,
        needsAttention: null,
        reschedule: false,
      });
    }
    if (
      (render.status === "failed" || render.status === "cancelled") &&
      render.review?.outcome === "failed"
    ) {
      // ST-103 review found an error: the render goes back to the user with
      // the findings; resuming leads to a new render approval.
      const errors = render.review.findings.filter(
        (finding) => finding.severity === "error",
      );
      record("render", "needs_attention", { jobId: run.renderJobId });
      decisions.push({
        kind: "render_review",
        summary: `The finished video failed its review: ${errors.map((finding) => finding.code).join(", ")}.`.slice(0, 500),
        reason: errors.map((finding) => finding.detail).join(" ").slice(0, 500),
        relatedIds: [run.renderJobId],
      });
      return finish({
        status: "needs_attention",
        currentStep: "render",
        needsAttention: {
          stage: "render",
          errorCode: "RENDER_REVIEW_FAILED",
          // The review is deterministic and render identity is content-
          // addressed: the same lesson renders to the same result, so the
          // lesson must change before a retry can succeed. That instruction
          // leads, so trimming long findings never cuts it.
          message: `The finished video failed its quality review. Fix these in the editor, then retry the render: ${errors
            .map((finding) => `${finding.code}: ${finding.detail}`)
            .join("; ")}`.slice(0, 500),
        },
        reschedule: false,
      });
    }
    if (render.status === "failed" || render.status === "cancelled") {
      record("render", "failed", { jobId: run.renderJobId });
      return finish({
        status: "failed",
        currentStep: "render",
        needsAttention: {
          stage: "render",
          errorCode: "RENDER_FAILED",
          message:
            "The render couldn't finish on our side. Select Try again to approve a new render. Nothing has been lost.",
        },
        reschedule: false,
      });
    }
    record("render", "running", {
      jobId: run.renderJobId,
      detail: { progress: render.progress },
    });
    if (typeof previous !== "number" || render.progress > previous)
      progressed = true;
    if (timedOut()) return timeout("render");
    return finish({
      status: "rendering",
      currentStep: "render",
      needsAttention: null,
      reschedule: true,
    });
  }

  // ---- The pipeline, re-evaluated from the first step every tick. --------
  for (const step of pipelineSteps) {
    // A repair round changes scenes one at a time; grounding and audio wait
    // for the whole round, then re-run once for every touched scene.
    if (
      repair.active !== null &&
      (step === "visual_plan" ||
        step === "illustrations" ||
        step === "grounding" ||
        step === "audio")
    )
      continue;
    let outcome: Outcome;
    try {
      outcome = await evaluateStep(step);
    } catch (error) {
      const stop = refusal(step === "validation" ? "preview" : step, error);
      if (stop === null) {
        // Transient (conflict, rate limit, outage): try again next tick. The
        // step timeout stops a run that never recovers.
        if (timedOut()) return timeout(step);
        return finish({
          status: "running",
          currentStep: step,
          needsAttention: null,
          reschedule: true,
        });
      }
      outcome = stop;
    }

    if (outcome.kind === "done") {
      record(step, "done", outcome.detail === undefined ? {} : { detail: outcome.detail });
      continue;
    }
    if (outcome.kind === "attention") {
      record(
        step,
        outcome.terminal === true ? "failed" : "needs_attention",
        outcome.jobId === undefined ? {} : { jobId: outcome.jobId },
      );
      return finish({
        status: "needs_attention",
        currentStep: step,
        needsAttention: {
          stage: outcome.stage,
          errorCode: outcome.errorCode,
          message: outcome.message,
        },
        reschedule: false,
      });
    }
    record(step, "running", {
      ...(outcome.jobId === undefined ? {} : { jobId: outcome.jobId }),
      ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
    });
    if (outcome.kind === "acted") progressed = true;
    if (outcome.kind === "wait" && timedOut()) return timeout(step);
    return finish({
      status: "running",
      currentStep: step,
      needsAttention: null,
      reschedule: true,
    });
  }

  // Every stage is done and validation passed: the single human gate.
  return finish({
    status: "awaiting_render_approval",
    currentStep: "render",
    needsAttention: null,
    reschedule: false,
  });

  // -------------------------------------------------------------------------

  async function evaluateStep(step: (typeof pipelineSteps)[number]): Promise<Outcome> {
    switch (step) {
      case "ingestion":
        return evaluateIngestion();
      case "source_snapshot":
        return evaluateSourceSnapshot();
      case "configuration":
        return evaluateConfiguration();
      case "objectives":
      case "outline":
      case "narration":
        return evaluateApprovalStage(step);
      case "storyboard":
        return evaluateStoryboard();
      case "visual_plan":
        return evaluateVisualPlan();
      case "illustrations":
        return evaluateIllustrations();
      case "grounding":
        return evaluateGrounding();
      case "audio":
        return evaluateAudio();
      case "validation":
        return evaluateValidation();
    }
  }

  async function evaluateIngestion(): Promise<Outcome> {
    const ingestion = await gateway.ingestion(scope);
    if (ingestion.state === "ready") return { kind: "done" };
    if (ingestion.state === "failed")
      return {
        kind: "attention",
        stage: "ingestion",
        errorCode: "INGESTION_FAILED",
        message:
          "We couldn't read this document. Replace it with a clearer copy (a PDF with selectable text works best), then select Resume.",
      };
    return { kind: "wait" };
  }

  async function evaluateSourceSnapshot(): Promise<Outcome> {
    const status = await gateway.sourceSnapshot(scope);
    if (status.approved && !status.stale) return { kind: "done" };
    const approved = await gateway.approveSourceSnapshot(
      context("source_snapshot"),
    );
    await gateway.auditApproval(context("source_snapshot"), {
      step: "source_snapshot",
      target: { type: "source_snapshot", id: approved.snapshotId },
    });
    autoApproval("Approved the source review automatically.", [
      approved.snapshotId,
    ]);
    return { kind: "acted" };
  }

  async function evaluateConfiguration(): Promise<Outcome> {
    const [configuration, voice] = await Promise.all([
      gateway.configuration(scope),
      gateway.voiceConfigured(scope),
    ]);
    // Once this run has configured the lesson, a configuration with a focus is
    // the real state to continue from, including the user's own edits since.
    // Before that, only one that already matches this run's request counts
    // (a tick that died after saving). A configuration left by an earlier run
    // on the same project, as after "Edit prompt", is replaced by this run's.
    const ownConfiguration = steps.some((entry) => entry.step === "configuration");
    const matchesRequest =
      configuration !== null &&
      configuration.focusPrompt === run.focusPrompt &&
      configuration.ageBand === run.audience.ageBand &&
      configuration.difficulty === run.audience.difficulty &&
      configuration.targetDurationSeconds === run.targetDurationSeconds &&
      (brief === null ||
        (configuration.creativeStylePack === brief.stylePackId &&
          configuration.soundBed === brief.soundBed));
    const configured =
      configuration !== null &&
      configuration.focusPrompt !== null &&
      (ownConfiguration || matchesRequest);
    if (!configured) {
      // ST-107: the confirmed brief already names the subject and title, so
      // a run with a brief makes no lesson-intent call.
      const intent =
        brief === null
          ? await gateway.inferIntent(
              context("configuration", ":intent"),
              run.focusPrompt,
            )
          : { subject: brief.subject, lessonTitle: brief.lessonTitle };
      const saved = await gateway.saveConfiguration(context("configuration"), {
        expectedVersion: configuration?.version ?? 0,
        subject: intent.subject,
        lessonTitle: intent.lessonTitle,
        focusPrompt: run.focusPrompt,
        audience: run.audience,
        targetDurationSeconds: run.targetDurationSeconds,
        ...(brief === null
          ? {}
          : { creativeStylePack: brief.stylePackId, soundBed: brief.soundBed }),
      });
      return { kind: "acted", detail: { configurationVersion: saved.version } };
    }
    if (!voice) {
      await gateway.saveDefaultVoice(context("configuration", ":voice"));
      return { kind: "acted" };
    }
    return { kind: "done", detail: { configurationVersion: configuration.version } };
  }

  async function evaluateApprovalStage(stage: ApprovalStage): Promise<Outcome> {
    const current = await gateway.approvalStage(scope, stage);
    if (stage === "objectives" && current.focusCoverage !== undefined)
      focusCoverage = current.focusCoverage;
    const ownJob = recordedJobId(steps, stage);
    if (isActive(current.latestJob))
      return {
        kind: "wait",
        ...(current.latestJob === null ? {} : { jobId: current.latestJob.id }),
      };
    // A job this run queued failed: stop rather than pay again.
    if (
      current.latestJob !== null &&
      jobFailed(current.latestJob) &&
      current.latestJob.id === ownJob
    )
      return failedStage(stage, current.latestJob);

    if (current.state === "approved" && !current.stale) return { kind: "done" };

    if (current.state === "draft" && !current.stale) {
      if (
        stage === "objectives" &&
        current.focusCoverage?.status === "not_covered"
      )
        return {
          kind: "attention",
          stage: "objectives",
          errorCode: "FOCUS_NOT_COVERED",
          message: `The document does not cover this focus: ${current.focusCoverage.reason}`.slice(
            0,
            500,
          ),
        };
      if (!current.canApprove || current.revision === null)
        return {
          kind: "attention",
          stage,
          errorCode: "STAGE_BLOCKED",
          message: `The ${stage} draft cannot be approved as generated. Review it in the wizard, then resume the run.`,
        };
      const approved = await gateway.approve(
        context(stage),
        stage,
        current.revision,
      );
      await gateway.auditApproval(context(stage), {
        step: stage,
        target: { type: approvalTarget[stage], id: approved.approvedId },
        revision: approved.revision,
      });
      autoApproval(
        `Approved the ${stage} automatically (revision ${approved.revision}).`,
        [approved.approvedId],
      );
      return { kind: "acted" };
    }

    // Idle, failed without a set, or stale: (re)generate.
    const stop = await guard(stage, "model_call");
    if (stop !== null) return stop;
    const queued = await gateway.generate(
      context(stage),
      stage,
      stage === "objectives" && brief !== null
        ? { briefCoverage: brief.coverage.map((entry) => entry.point) }
        : undefined,
    );
    return { kind: "acted", jobId: queued.jobId };
  }

  async function evaluateStoryboard(): Promise<Outcome> {
    const current = await gateway.storyboard(scope);
    const ownJob = recordedJobId(steps, "storyboard");
    if (isActive(current.latestJob))
      return {
        kind: "wait",
        ...(current.latestJob === null ? {} : { jobId: current.latestJob.id }),
      };
    if (
      current.latestJob !== null &&
      jobFailed(current.latestJob) &&
      current.latestJob.id === ownJob
    )
      return failedStage("storyboard", current.latestJob);
    if (
      (current.state === "draft" || current.state === "approved") &&
      !current.stale &&
      current.lessonSpecId !== null
    )
      return {
        kind: "done",
        detail: { lessonSpecId: current.lessonSpecId },
      };
    const stop = await guard("storyboard", "model_call");
    if (stop !== null) return stop;
    const queued = await gateway.generate(context("storyboard"), "storyboard");
    return { kind: "acted", jobId: queued.jobId };
  }

  /**
   * ST-112. Between storyboard and illustrations, a v2 design (ADR-015) gets
   * one bounded visual-plan call per storyboard. Nothing here can stop the
   * run: the storyboard already holds a valid authored v2 design, so an
   * unavailable, refused, failed or unaffordable plan keeps that design, and
   * the choice is logged.
   */
  async function evaluateVisualPlan(): Promise<Outcome> {
    const storyboard = await gateway.storyboard(scope);
    const lessonSpecId = storyboard.lessonSpecId;
    if (lessonSpecId === null) return { kind: "wait" };
    const previous = steps.find((entry) => entry.step === "visual_plan");
    const settle = (
      outcome: NonNullable<VisualPlanStatus["outcome"]>,
      reason: string | null,
      jobId?: Identifier,
    ): Outcome => {
      decisions.push({
        kind: "style_pack",
        summary:
          outcome === "model"
            ? "Planned the visuals: a composition, short on-screen wording, picture briefs and narration-timed reveals for each scene."
            : outcome === "superseded"
              ? "Kept the current visual design: it was changed while the visual plan was being prepared."
              : "Kept the standard visual design for this style: the visual plan was not available.",
        ...(reason === null ? {} : { reason: reason.slice(0, 500) }),
        ...(outcome === "model" ? { promptVersion: "visual-plan/v1" } : {}),
        ...(jobId === undefined ? {} : { relatedIds: [jobId] }),
      });
      return {
        kind: "done",
        detail: {
          plannedFor: lessonSpecId,
          visualPlan: outcome,
          ...(reason === null ? {} : { fallbackReason: reason.slice(0, 300) }),
        },
      };
    };
    // One plan per storyboard: a settled plan is never paid for again.
    if (previous?.detail?.plannedFor === lessonSpecId) {
      if (previous.detail.visualPlan !== undefined)
        return { kind: "done", detail: previous.detail };
      const jobId = previous.jobId as Identifier | undefined;
      if (jobId === undefined) return settle("authored", "job_missing");
      const status = await gateway.visualPlan(scope, jobId);
      if (isActive(status.job)) return { kind: "wait", jobId };
      if (status.outcome !== null)
        return settle(status.outcome, status.fallbackReason, jobId);
      return settle("authored", status.job?.errorCode ?? "job_failed", jobId);
    }
    const design = await visualDesign();
    // A v1 or legacy lesson has nothing to plan. Not recorded against the
    // storyboard, so a later upgrade to v2 is still planned.
    if (design.release !== "v2") return { kind: "done" };
    if ((await guard("visual_plan", "model_call")) !== null) {
      budgetProposalUsd = null;
      return settle("authored", "budget_cap");
    }
    let queued: { jobId: Identifier } | null;
    try {
      queued = await gateway.requestVisualPlan(
        context("visual_plan", `:${lessonSpecId}`),
      );
    } catch (error) {
      // Transient failures retry on the next tick; a refusal is final.
      if (refusal("visual_plan", error) === null) throw error;
      return settle("authored", "request_refused");
    }
    if (queued === null) return settle("authored", "not_available");
    return {
      kind: "acted",
      jobId: queued.jobId,
      detail: { plannedFor: lessonSpecId },
    };
  }

  async function evaluateIllustrations(): Promise<Outcome> {
    const storyboard = await gateway.storyboard(scope);
    if (storyboard.lessonSpecId === null) return { kind: "wait" };
    const previous = steps.find((entry) => entry.step === "illustrations");
    const design = await visualDesign();
    const v2 = design.release === "v2";
    // Missing illustrations are requested once per storyboard. Accepting a
    // candidate changes the scene revision, so re-requesting after that would
    // pay for the same slot again.
    const requestedFor = previous?.detail?.requestedFor;
    if (requestedFor !== storyboard.lessonSpecId) {
      const stop = await guard("illustrations", "illustrations");
      if (stop !== null) {
        if (!v2) return stop;
        // ST-112. A v2 design's pictures are optional: over the cap, every
        // scene keeps its authored motif, which costs nothing (ADR-015 §7).
        budgetProposalUsd = null;
        decisions.push({
          kind: "style_pack",
          summary:
            "Skipped generated pictures to stay within the budget cap: scenes use the style's own drawn motifs instead.",
          reason: "budget_cap",
        });
        return {
          kind: "acted",
          detail: {
            requestedFor: storyboard.lessonSpecId,
            queued: 0,
            skipped: 0,
            pictureFallback: "budget_cap",
          },
        };
      }
      const requested = await gateway.requestIllustrations(
        context("illustrations", `:${storyboard.lessonSpecId}`),
      );
      if (requested.cinema !== undefined && requested.cinema.motif > 0)
        decisions.push({
          kind: "style_pack",
          summary: `${requested.cinema.motif} scene${requested.cinema.motif === 1 ? " uses" : "s use"} the style's own drawn motif instead of a generated picture.`,
          reason: `Up to ${requested.cinema.budget} generated pictures are allowed for a video of this length, and evidence pictures are never replaced.`,
        });
      return {
        kind: "acted",
        detail: {
          requestedFor: storyboard.lessonSpecId,
          queued: requested.queued,
          skipped: requested.skipped,
          ...(requested.cinema === undefined
            ? {}
            : {
                reused: requested.cinema.reused,
                motif: requested.cinema.motif,
                pictureBudget: requested.cinema.budget,
              }),
        },
      };
    }
    const illustrations = await gateway.illustrations(scope);
    if (illustrations.pending > 0)
      return { kind: "wait", detail: { ...previous?.detail, pending: illustrations.pending } };
    const [next] = illustrations.acceptable;
    if (next !== undefined) {
      await gateway.acceptIllustration(context("illustrations"), next);
      await gateway.auditApproval(context("illustrations"), {
        step: "illustrations",
        target: { type: "illustration_candidate", id: next.candidateId },
        revision: next.sceneRevision,
      });
      autoApproval(
        `Accepted a generated illustration for a decorative "${next.slot}" slot.`,
        [next.candidateId, next.sceneId],
      );
      return { kind: "acted" };
    }
    // ST-112. Once per storyboard, the planned design and the pictures pinned
    // to it become the design the lesson renders with. A picture that failed
    // simply is not pinned: its scenes keep their authored motif.
    if (
      v2 &&
      !design.applied &&
      previous?.detail?.designSettledFor !== storyboard.lessonSpecId
    ) {
      const result = await gateway.applyVisualDesign(
        context("illustrations", `:design:${storyboard.lessonSpecId}`),
      );
      if (result.applied) {
        await gateway.auditApproval(context("illustrations"), {
          step: "illustrations",
          target: { type: "creative_design_snapshot", id: result.snapshotId },
        });
        autoApproval("Applied the planned visual design automatically.", [
          result.snapshotId,
        ]);
      } else
        decisions.push({
          kind: "style_pack",
          summary:
            "Kept the visual design already in use: the planned design no longer fitted the storyboard.",
          reason: "design_invalid",
        });
      return {
        kind: "acted",
        detail: {
          ...previous?.detail,
          designSettledFor: storyboard.lessonSpecId,
          designApplied: result.applied,
        },
      };
    }
    // Slots without an acceptable candidate stay empty for validation to
    // report; a guarded (grounding-critical) slot is never filled here.
    const detail: OneShotStepDetail = {
      ...previous?.detail,
      ...(design.summary === undefined
        ? {}
        : {
            families: design.summary.families.slice(0, 300),
            pictures: design.summary.pictures,
            generatedPictures: design.summary.generatedPictures,
          }),
    };
    return {
      kind: "done",
      ...(Object.keys(detail).length === 0 ? {} : { detail }),
    };
  }

  async function evaluateGrounding(): Promise<Outcome> {
    const storyboard = await gateway.storyboard(scope);
    if (storyboard.lessonSpecId === null || storyboard.revision === null)
      return { kind: "wait" };
    const spec = {
      lessonSpecId: storyboard.lessonSpecId,
      revision: storyboard.revision,
    };
    const current = await gateway.grounding(scope, spec);
    if (current.current) return { kind: "done" };
    if (isActive(current.latestJob))
      return {
        kind: "wait",
        ...(current.latestJob === null ? {} : { jobId: current.latestJob.id }),
      };
    const ownJob = recordedJobId(steps, "grounding");
    if (
      current.latestJob !== null &&
      jobFailed(current.latestJob) &&
      current.latestJob.id === ownJob
    )
      return failedStage("grounding", current.latestJob, (suffix) =>
        gateway.requestGrounding(
          context("grounding", `:${spec.lessonSpecId}:${spec.revision}${suffix}`),
          spec,
        ),
      );
    const stop = await guard("grounding", "model_call");
    if (stop !== null) return stop;
    const queued = await gateway.requestGrounding(
      context("grounding", `:${spec.lessonSpecId}:${spec.revision}`),
      spec,
    );
    return { kind: "acted", jobId: queued.jobId };
  }

  async function evaluateAudio(): Promise<Outcome> {
    const audio = await gateway.audio(scope);
    const detail = {
      total: audio.total,
      ready: audio.ready,
      pending: audio.pending,
      failed: audio.failed,
    };
    if (audio.total > 0 && audio.ready === audio.total)
      return { kind: "done", detail };
    if (audio.pending > 0) {
      const previous = steps.find((entry) => entry.step === "audio")?.detail
        ?.ready;
      if (typeof previous === "number" && audio.ready > previous)
        progressed = true;
      return { kind: "wait", detail };
    }
    if (audio.failed > 0 && audio.missing === 0)
      return {
        kind: "attention",
        stage: "audio",
        errorCode: "STAGE_JOB_FAILED",
        message: `Narration audio failed for ${audio.failed} scene${audio.failed === 1 ? "" : "s"}. Retry it in the wizard, then resume the run.`,
      };
    const stop = await guard("audio", "audio");
    if (stop !== null) return stop;
    // After a repair round only the touched scenes are missing audio, so this
    // re-voices exactly those; the key changes with the round.
    await gateway.requestAudio(
      context("audio", repair.roundsDone > 0 || repair.coverageRoundUsed ? `:repair:${repairRoundCount()}` : ""),
    );
    return { kind: "acted", detail };
  }

  /** Repair rounds started so far, validation and coverage together. */
  function repairRoundCount(): number {
    return repair.roundsDone + (repair.coverageRoundUsed ? 1 : 0);
  }

  async function evaluateValidation(): Promise<Outcome> {
    // ST-107: a repair round in progress finishes before anything is
    // validated again.
    if (brief !== null && repair.active !== null) return continueRepair();
    const result = await gateway.validate(scope);
    const detail: OneShotStepDetail = {
      validationRunId: result.runId,
      errors: result.errors,
      warnings: result.warnings,
      ...(brief === null ? {} : { repairRounds: repairRoundCount() }),
    };
    const blocking = (errors: number): Outcome => ({
      kind: "attention",
      stage: "preview",
      errorCode: "VALIDATION_BLOCKING",
      message: `Validation found ${errors} blocking issue${errors === 1 ? "" : "s"}. Fix ${errors === 1 ? "it" : "them"} from the preview, then resume the run.`,
    });
    if (brief === null) {
      if (result.status === "passed") return { kind: "done", detail };
      // Warnings are recorded, never acknowledged; errors always block.
      return blocking(result.errors);
    }

    const { repairable, blockingUnrepairable } = classifyFindings(
      result.findings ?? [],
    );
    // Sentences grounding could not verify are never acknowledged or
    // rewritten here: they are taken out of the narration, so the video never
    // states them. Bounded per resume; each removal is logged. They are
    // warnings, so any the removal could not take out reach the preview for
    // the user to decide rather than stopping the run.
    const previous = steps.find((entry) => entry.step === "validation")?.detail;
    const removalRounds =
      previous?.[sentenceRemovalResumeKey] === run.resumeCount &&
      typeof previous[sentenceRemovalRoundsKey] === "number"
        ? previous[sentenceRemovalRoundsKey]
        : 0;
    detail[sentenceRemovalResumeKey] = run.resumeCount;
    detail[sentenceRemovalRoundsKey] = removalRounds;
    const unsupportedClaims = (result.findings ?? []).filter(
      (finding) => finding.code === "grounding_unsupported_claim",
    );
    const onlyUnsupportedClaims =
      (unsupportedClaims.length > 0 || blockingUnrepairable.length > 0) &&
      blockingUnrepairable.every((finding) => finding.code === "grounding_missing");
    if (onlyUnsupportedClaims && removalRounds < oneShotMaxSentenceRemovalRounds) {
      const outcome = await gateway.removeUnverifiedSentences(
        context("validation", `:unverified:${removalRounds + 1}`),
      );
      if (outcome.removed.length > 0) {
        detail[sentenceRemovalRoundsKey] = removalRounds + 1;
        for (const sentence of outcome.removed)
          decisions.push({
            kind: "repair",
            summary: `Removed a sentence we couldn't verify against your document: "${sentence.text}"`.slice(0, 500),
            reason: "grounding_unsupported",
          });
        return { kind: "acted", detail };
      }
    }
    // Anything else outside the repair map goes to the user.
    if (blockingUnrepairable.length > 0)
      return {
        kind: "attention",
        stage: "preview",
        errorCode: "VALIDATION_BLOCKING",
        message: `${blockingUnrepairable.length === 1 ? "One issue" : `${blockingUnrepairable.length} issues`} in the finished lesson need${blockingUnrepairable.length === 1 ? "s" : ""} your decision before it can be previewed. Open the preview to see ${blockingUnrepairable.length === 1 ? "it" : "them"}, then select Resume.`,
      };

    if (repairable.length > 0 && repair.stopped === null) {
      const next = nextRepairRound({
        roundsDone: repair.roundsDone,
        maxRounds: oneShotMaxRepairRounds,
        countBeforeLastRound: repair.countBeforeLastRound,
        countNow: repairable.length,
      });
      if (next.action === "start") {
        const repairContext = await gateway.repairContext(scope);
        const planned = planRepairRound({
          findings: repairable,
          scenes: repairContext.scenes,
          objectives: repairContext.objectives,
          maxScenes: oneShotMaxRepairScenesPerRound,
        });
        if (planned.length > 0) {
          setRepair({
            ...repair,
            roundsDone: next.round,
            countBeforeLastRound: repairable.length,
            active: {
              round: next.round,
              kind: "validation",
              items: planned.map((entry) => ({
                ...entry,
                order:
                  repairContext.scenes.find((scene) => scene.sceneId === entry.sceneId)
                    ?.order ?? 0,
                state: "planned" as const,
              })),
            },
          });
          return continueRepair();
        }
        stopRepair("nothing_to_repair", repairable.length);
      } else stopRepair(next.reason, repairable.length);
    }

    // Repair is over or was never needed: what remains decides. Warnings are
    // listed, never acknowledged; an error the repairs did not fix blocks.
    const errorsLeft = Math.max(
      repairable.filter((finding) => finding.severity === "error").length,
      result.errors,
    );
    if (errorsLeft > 0 || result.status !== "passed")
      return {
        kind: "attention",
        stage: "preview",
        errorCode: "VALIDATION_BLOCKING",
        message: `Automatic fixes did not resolve ${errorsLeft} blocking issue${errorsLeft === 1 ? "" : "s"}. Fix ${errorsLeft === 1 ? "it" : "them"} from the preview, then resume the run.`,
      };
    return checkPromises(detail);
  }

  function stopRepair(
    reason: NonNullable<OneShotRepairState["stopped"]>,
    remaining: number,
  ) {
    setRepair({ ...repair, stopped: reason, active: null });
    if (reason === "nothing_to_repair" && remaining === 0) return;
    decisions.push({
      kind: "repair",
      summary:
        reason === "exhausted"
          ? `Stopped automatic fixes after ${repair.roundsDone} rounds with ${remaining} finding${remaining === 1 ? "" : "s"} left.`
          : reason === "no_progress"
            ? `Stopped automatic fixes: the last round did not reduce the findings (${remaining} left).`
            : reason === "failed"
              ? "Stopped automatic fixes: a fix did not finish."
              : `Stopped automatic fixes: no scene could be regenerated for the ${remaining} remaining finding${remaining === 1 ? "" : "s"}.`,
      reason: "Repair is bounded to two rounds of at most four scenes, and a round must reduce the findings to continue.",
    });
  }

  /**
   * One repair action per tick: queue the next planned fix, else wait for or
   * apply the next queued one. When every fix of the round is settled, the
   * round ends; the next ticks re-run grounding and audio for the touched
   * scenes, then validation decides whether the round helped.
   */
  async function continueRepair(): Promise<Outcome> {
    const active = repair.active;
    if (active === null) return { kind: "wait" };
    const items = active.items.map((item) => ({ ...item }));
    const save = () => setRepair({ ...repair, active: { ...active, items } });
    const planned = items.find((item) => item.state === "planned");
    if (planned !== undefined) {
      const stop = await guard("validation", "repair_scene");
      if (stop !== null) return stop;
      const queued = await gateway.requestSceneRepair(
        {
          ...scope,
          correlationId: run.correlationId,
          oneShotRunId: run.id,
          requestKey: `oneshot:${run.id}:repair:${active.round}:${planned.sceneId}`,
        },
        planned,
      );
      planned.state = "queued";
      planned.jobId = queued.jobId;
      save();
      decisions.push({
        kind: "repair",
        summary: `${roundLabel(active)}: regenerating scene ${planned.order} because ${repairCodeLabels[planned.code] ?? planned.code}.`,
        reason: planned.instruction,
        model: currentSceneRegenerationCompatibility.model,
        promptVersion: `${currentSceneRegenerationCompatibility.promptId}/${currentSceneRegenerationCompatibility.promptVersion}`,
        relatedIds: [queued.jobId],
      });
      return { kind: "acted", jobId: queued.jobId };
    }
    for (const item of items) {
      if (item.state !== "queued" || item.jobId === undefined) continue;
      const status = await gateway.sceneRepairStatus(scope, {
        sceneId: item.sceneId,
        jobId: item.jobId as Identifier,
      });
      if (isActive(status.job)) return { kind: "wait" };
      if (status.candidate === null) {
        stopRepair("failed", 0);
        return {
          kind: "attention",
          stage: "preview",
          errorCode: "VALIDATION_BLOCKING",
          message: `An automatic fix for scene ${item.order} couldn't finish on our side. Select Try again, or fix the scene from the preview.`,
        };
      }
      const repairContext = context("validation", `:repair:${active.round}:${item.sceneId}`);
      if (status.candidate.status !== "pending") {
        item.state = status.candidate.status === "accepted" ? "applied" : "discarded";
        save();
        continue;
      }
      if (!status.candidate.keepsSourceRefs) {
        // Repairs must never remove source references: discard the fix.
        await gateway.rejectSceneRepair(repairContext, {
          sceneId: item.sceneId,
          candidateId: status.candidate.id,
        });
        item.state = "discarded";
        save();
        decisions.push({
          kind: "repair",
          summary: `${roundLabel(active)}: discarded the fix for scene ${item.order} because it dropped source references.`,
          model: currentSceneRegenerationCompatibility.model,
          costUsd: status.candidate.costUsd,
          relatedIds: [status.candidate.id, status.candidate.modelCallId],
        });
        return { kind: "acted" };
      }
      await gateway.applySceneRepair(repairContext, {
        sceneId: item.sceneId,
        candidateId: status.candidate.id,
      });
      item.state = "applied";
      save();
      decisions.push({
        kind: "repair",
        summary: `${roundLabel(active)}: applied the regenerated scene ${item.order}.`,
        reason: repairCodeLabels[item.code] ?? item.code,
        model: currentSceneRegenerationCompatibility.model,
        promptVersion: `${currentSceneRegenerationCompatibility.promptId}/${currentSceneRegenerationCompatibility.promptVersion}`,
        costUsd: status.candidate.costUsd,
        relatedIds: [status.candidate.id, status.candidate.modelCallId],
      });
      return { kind: "acted" };
    }
    // Every fix of the round is settled.
    setRepair({ ...repair, active: null });
    return { kind: "acted" };
  }

  /**
   * ST-107 brief-promise check, deterministic. An unmet coverage point gets
   * one repair round; if it is still unmet, the preview lists it and the user
   * decides. A duration or pinning mismatch is an error for the user.
   */
  async function checkPromises(detail: OneShotStepDetail): Promise<Outcome> {
    if (brief === null) return { kind: "done", detail };
    const state = await gateway.promiseState(scope);
    const checked = checkBriefPromises({
      coverage: brief.coverage,
      sceneSections: state.sceneSections,
      measuredDurationSeconds: state.measuredDurationSeconds,
      targetDurationSeconds: run.targetDurationSeconds,
      toleranceSeconds: state.toleranceSeconds,
      confirmed: { stylePackId: brief.stylePackId, soundBed: brief.soundBed },
      pinned: state.pinned,
    });
    if (checked.unmetCoverage.length > 0 && !repair.coverageRoundUsed) {
      const planned = planCoverageRepair({
        unmet: checked.unmetCoverage,
        sceneSections: state.sceneSections,
        sectionOrder: state.sectionOrder,
        maxScenes: oneShotMaxRepairScenesPerRound,
      });
      setRepair({
        ...repair,
        coverageRoundUsed: true,
        active:
          planned.length === 0
            ? null
            : {
                round: oneShotMaxRepairRounds + 1,
                kind: "coverage",
                items: planned.map((entry) => ({
                  ...entry,
                  order:
                    state.sceneSections.find((scene) => scene.sceneId === entry.sceneId)
                      ?.order ?? 0,
                  state: "planned" as const,
                })),
              },
      });
      if (planned.length > 0) return continueRepair();
    }
    if (!checked.durationWithinBand)
      return {
        kind: "attention",
        stage: "preview",
        errorCode: "BRIEF_PROMISE_UNMET",
        message: `The video runs ${Math.round(state.measuredDurationSeconds)} s, outside the ${state.toleranceSeconds} s band around the ${run.targetDurationSeconds} s the brief promised. Adjust the scenes from the preview, then resume the run.`,
      };
    if (!checked.stylePackPinned || !checked.soundBedPinned)
      return {
        kind: "attention",
        stage: "configuration",
        errorCode: "BRIEF_PROMISE_UNMET",
        message: !checked.stylePackPinned
          ? "The lesson no longer uses the style pack confirmed in the brief. Choose it again in the storyboard's appearance settings, then resume the run."
          : "The lesson setup no longer uses the sound bed confirmed in the brief. Restore it in the setup, then resume the run.",
      };
    const gaps = checked.unmetCoverage.map((entry) => entry.point);
    const previous = run.coverageGaps ?? [];
    if (
      gaps.length !== previous.length ||
      gaps.some((point, index) => point !== previous[index])
    ) {
      coverageGaps = gaps;
      for (const point of gaps.filter((entry) => !previous.includes(entry)))
        decisions.push({
          kind: "coverage_gap",
          summary: `Not covered: ${point}`.slice(0, 500),
          reason:
            "No scene cites the document sections behind this brief point, even after one repair attempt. You decide whether to render.",
        });
    }
    return { kind: "done", detail };
  }
}

const approvalTarget: Record<ApprovalStage, string> = {
  objectives: "learning_objective_set",
  outline: "lesson_outline_set",
  narration: "narration_set",
};

/** The status a run returns to when the user resumes it. */
export function resumedStatus(status: OneShotRunStatus): OneShotRunStatus | null {
  return status === "needs_attention" || status === "failed" ? "running" : null;
}
