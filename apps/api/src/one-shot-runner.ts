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
 * The runner is a *client* of the existing services. It never bypasses their
 * checks (snapshot staleness, `expectedRevision`, grounding, validation,
 * version and render requirements); a service refusal becomes
 * `needs_attention` at the stage that refused. It never acknowledges a
 * validation warning and never renders: rendering waits for
 * `POST one-shot/render`.
 */

import { PublicError, type Identifier } from "@avlp/config";
import type { ObjectiveFocusCoverage } from "@avlp/schemas";
import type {
  OneShotAttentionStage,
  OneShotAudience,
  OneShotErrorCode,
  OneShotRunStatus,
  OneShotStep,
  OneShotStepDetail,
  OneShotStepRecord,
} from "@avlp/schemas/one-shot";

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
};

export type RenderState = {
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  errorCode: string | null;
};

export type IngestionState =
  | { state: "pending" }
  | { state: "ready" }
  | { state: "failed"; errorCode: string };

export type ConfigurationState = {
  version: number;
  focusPrompt: string | null;
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
  ): Promise<{ jobId: Identifier }>;
  approve(
    context: OneShotCallContext,
    stage: ApprovalStage,
    expectedRevision: number,
  ): Promise<{ approvedId: Identifier; revision: number }>;
  storyboard(scope: OneShotScope): Promise<StoryboardState>;
  illustrations(scope: OneShotScope): Promise<IllustrationState>;
  requestIllustrations(
    context: OneShotCallContext,
  ): Promise<{ queued: number; skipped: number }>;
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

const pipelineSteps = [
  "ingestion",
  "source_snapshot",
  "configuration",
  "objectives",
  "outline",
  "narration",
  "storyboard",
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

function stageFailure(
  stage: OneShotAttentionStage,
  job: OneShotJobStatus,
): Outcome {
  return {
    kind: "attention",
    stage,
    errorCode: "STAGE_JOB_FAILED",
    message: `The ${stageLabel(stage)} job did not finish${job.errorCode === null ? "" : ` (${job.errorCode})`}. Fix it in the wizard, then resume the run.`,
    jobId: job.id,
  };
}

function stageLabel(stage: OneShotAttentionStage): string {
  return stage.replace("_", " ");
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
      "steps" | "progressed" | "actualCostUsd" | "focusCoverage"
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
      ...(focusCoverage === undefined ? {} : { focusCoverage }),
    };
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
      return finish({
        status: "completed",
        currentStep: null,
        needsAttention: null,
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
          message: `The render did not finish${render.errorCode === null ? "" : ` (${render.errorCode})`}. Resume the run to approve a new render.`,
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
        message: `The document could not be ingested (${ingestion.errorCode}). Fix or replace the source, then resume the run.`,
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
    return { kind: "acted" };
  }

  async function evaluateConfiguration(): Promise<Outcome> {
    const [configuration, voice] = await Promise.all([
      gateway.configuration(scope),
      gateway.voiceConfigured(scope),
    ]);
    // A configuration that carries a focus was written by this run or edited
    // by the user since; either way it is the real state to continue from.
    const configured =
      configuration !== null && configuration.focusPrompt !== null;
    if (!configured) {
      const intent = await gateway.inferIntent(
        context("configuration", ":intent"),
        run.focusPrompt,
      );
      const saved = await gateway.saveConfiguration(context("configuration"), {
        expectedVersion: configuration?.version ?? 0,
        subject: intent.subject,
        lessonTitle: intent.lessonTitle,
        focusPrompt: run.focusPrompt,
        audience: run.audience,
        targetDurationSeconds: run.targetDurationSeconds,
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
      return stageFailure(stage, current.latestJob);

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
      return { kind: "acted" };
    }

    // Idle, failed without a set, or stale: (re)generate.
    const queued = await gateway.generate(context(stage), stage);
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
      return stageFailure("storyboard", current.latestJob);
    if (
      (current.state === "draft" || current.state === "approved") &&
      !current.stale &&
      current.lessonSpecId !== null
    )
      return {
        kind: "done",
        detail: { lessonSpecId: current.lessonSpecId },
      };
    const queued = await gateway.generate(context("storyboard"), "storyboard");
    return { kind: "acted", jobId: queued.jobId };
  }

  async function evaluateIllustrations(): Promise<Outcome> {
    const storyboard = await gateway.storyboard(scope);
    if (storyboard.lessonSpecId === null) return { kind: "wait" };
    const previous = steps.find((entry) => entry.step === "illustrations");
    // Missing illustrations are requested once per storyboard. Accepting a
    // candidate changes the scene revision, so re-requesting after that would
    // pay for the same slot again.
    const requestedFor = previous?.detail?.requestedFor;
    if (requestedFor !== storyboard.lessonSpecId) {
      const requested = await gateway.requestIllustrations(
        context("illustrations", `:${storyboard.lessonSpecId}`),
      );
      return {
        kind: "acted",
        detail: {
          requestedFor: storyboard.lessonSpecId,
          queued: requested.queued,
          skipped: requested.skipped,
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
      return { kind: "acted" };
    }
    // Slots without an acceptable candidate stay empty for validation to
    // report; a guarded (grounding-critical) slot is never filled here.
    return { kind: "done", ...(previous?.detail === undefined ? {} : { detail: previous.detail }) };
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
      return stageFailure("grounding", current.latestJob);
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
    await gateway.requestAudio(context("audio"));
    return { kind: "acted", detail };
  }

  async function evaluateValidation(): Promise<Outcome> {
    const result = await gateway.validate(scope);
    const detail = {
      validationRunId: result.runId,
      errors: result.errors,
      warnings: result.warnings,
    };
    if (result.status === "passed") return { kind: "done", detail };
    // Warnings are recorded, never acknowledged; errors always block.
    return {
      kind: "attention",
      stage: "preview",
      errorCode: "VALIDATION_BLOCKING",
      message: `Validation found ${result.errors} blocking issue${result.errors === 1 ? "" : "s"}. Fix ${result.errors === 1 ? "it" : "them"} from the preview, then resume the run.`,
    };
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
