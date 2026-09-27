import { describe, expect, it } from "vitest";
import { PublicError, type Identifier } from "@avlp/config";
import type { OneShotStepRecord } from "@avlp/schemas/one-shot";
import {
  advanceOneShotRun,
  oneShotStepTimeoutMs,
  resumedStatus,
  type OneShotRunState,
  type OneShotTickResult,
} from "./one-shot-runner.js";
import { FakePipeline, fakeSpecId, idleStage, nextId } from "./one-shot-test-pipeline.js";

const ownerUserId = "019ffc10-aaaa-7000-8000-000000000105" as Identifier;
const projectId = "019ffc10-bbbb-7000-8000-000000000105" as Identifier;
const runId = "019ffc10-cccc-7000-8000-000000000105" as Identifier;
const correlationId = "019ffc10-dddd-7000-8000-000000000105" as Identifier;
const specId = fakeSpecId;
const renderJobId = "019ffc10-ffff-7000-8000-000000000105" as Identifier;

function initialRun(overrides: Partial<OneShotRunState> = {}): OneShotRunState {
  return {
    id: runId,
    ownerUserId,
    projectId,
    correlationId,
    status: "queued",
    focusPrompt: "How do trusses carry load?",
    audience: { ageBand: "adult-professional", difficulty: "advanced", tone: "academic" },
    targetDurationSeconds: 180,
    steps: [],
    resumeCount: 0,
    lastProgressAt: new Date("2026-09-27T10:00:00.000Z"),
    renderJobId: null,
    ...overrides,
  };
}

function apply(run: OneShotRunState, result: OneShotTickResult, now: Date): OneShotRunState {
  return {
    ...run,
    status: result.status,
    steps: result.steps,
    ...(result.progressed ? { lastProgressAt: now } : {}),
  };
}

/** Ticks until the run stops asking to be rescheduled. */
async function drive(
  fake: FakePipeline,
  start: OneShotRunState,
  limit = 60,
): Promise<{ run: OneShotRunState; last: OneShotTickResult; ticks: number; actionsPerTick: number[] }> {
  let run = start;
  let last: OneShotTickResult | undefined;
  const actionsPerTick: number[] = [];
  let now = new Date("2026-09-27T10:00:00.000Z");
  for (let tick = 1; tick <= limit; tick += 1) {
    now = new Date(now.getTime() + 3_000);
    const before = fake.calls.filter(isAction).length;
    last = await advanceOneShotRun({ run, gateway: fake, now });
    actionsPerTick.push(fake.calls.filter(isAction).length - before);
    run = apply(run, last, now);
    if (!last.reschedule) return { run, last, ticks: tick, actionsPerTick };
    fake.completeJobs();
  }
  throw new Error("The run did not stop.");
}

/** Inferring the lesson intent is part of the configuration save it feeds. */
function isAction(call: string): boolean {
  return call !== "inferIntent" && call !== "validate";
}

function step(result: { steps: OneShotStepRecord[] }, name: string) {
  return result.steps.find((entry) => entry.step === name);
}

describe("ST-105 prompt-to-video runner", () => {
  it("drives every stage to the render gate, one action per tick, without rendering", async () => {
    const fake = new FakePipeline();
    const { last, actionsPerTick } = await drive(fake, initialRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(last.currentStep).toBe("render");
    expect(last.reschedule).toBe(false);
    expect(Math.max(...actionsPerTick)).toBeLessThanOrEqual(1);
    expect(fake.calls).toEqual([
      "approveSourceSnapshot",
      "inferIntent",
      "saveConfiguration",
      "saveDefaultVoice",
      "generate:objectives",
      "approve:objectives",
      "generate:outline",
      "approve:outline",
      "generate:narration",
      "approve:narration",
      "generate:storyboard",
      "requestIllustrations",
      "acceptIllustration:019ffc10-1111-7000-8000-000000000105",
      "requestGrounding",
      "requestAudio",
      "validate",
    ]);
    // Every automatic approval is audited as the run.
    expect(fake.audits.map((audit) => audit.step)).toEqual([
      "source_snapshot",
      "objectives",
      "outline",
      "narration",
      "illustrations",
    ]);
    // Deterministic keys carry the run, the step and the resume generation.
    expect(fake.keys).toContain(`oneshot:${runId}:objectives:r0`);
    expect(fake.keys).toContain(`oneshot:${runId}:configuration:r0:intent`);
    expect(last.steps.map((entry) => entry.step)).toEqual([
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
    ]);
    expect(last.steps.every((entry) => entry.state === "done")).toBe(true);
    expect(step(last, "validation")?.detail).toMatchObject({ errors: 0, warnings: 1 });
    expect(last.focusCoverage).toEqual({ status: "covered" });
    expect(last.actualCostUsd).toBe(0.42);
  });

  it("skips every step whose artifact is already current", async () => {
    const fake = new FakePipeline();
    fake.snapshot = { approved: true, stale: false };
    fake.config = {
      version: 2,
      focusPrompt: "How do trusses carry load?",
      ageBand: "adult-professional",
      difficulty: "advanced",
      targetDurationSeconds: 180,
    };
    fake.voice = true;
    for (const stage of ["objectives", "outline", "narration"] as const)
      fake.stages[stage] = { ...idleStage(), state: "approved", revision: 3 };
    fake.storyboardFake = { ...idleStage(), state: "draft", revision: 4, lessonSpecId: specId };
    fake.groundingCurrent = true;
    fake.audioFake = { total: 2, ready: 2, pending: 0, failed: 0, missing: 0 };
    const run = initialRun({
      steps: [
        {
          step: "illustrations",
          state: "done",
          startedAt: "2026-09-27T09:00:00.000Z",
          finishedAt: "2026-09-27T09:00:00.000Z",
          detail: { requestedFor: specId },
        },
      ],
    });
    const result = await advanceOneShotRun({ run, gateway: fake, now: new Date("2026-09-27T10:00:03.000Z") });

    expect(result.status).toBe("awaiting_render_approval");
    expect(fake.calls).toEqual(["validate"]);
  });

  it("waits while ingestion runs and stops when it fails", async () => {
    const fake = new FakePipeline();
    fake.ingestionState = "pending";
    const waiting = await advanceOneShotRun({ run: initialRun(), gateway: fake, now: new Date("2026-09-27T10:00:03.000Z") });
    expect(waiting).toMatchObject({ status: "running", currentStep: "ingestion", reschedule: true });

    fake.ingestionState = "failed";
    const stopped = await advanceOneShotRun({ run: initialRun(), gateway: fake, now: new Date("2026-09-27T10:00:06.000Z") });
    expect(stopped.status).toBe("needs_attention");
    expect(stopped.needsAttention).toMatchObject({ stage: "ingestion", errorCode: "INGESTION_FAILED" });
    expect(stopped.reschedule).toBe(false);
  });

  it("stops after objectives when the source does not cover the focus", async () => {
    const fake = new FakePipeline();
    fake.coverageOnGenerate = { status: "not_covered", reason: "The document is about bridges, not trusses." };
    const { last } = await drive(fake, initialRun());

    expect(last.status).toBe("needs_attention");
    expect(last.needsAttention).toMatchObject({ stage: "objectives", errorCode: "FOCUS_NOT_COVERED" });
    expect(last.focusCoverage).toMatchObject({ status: "not_covered" });
    expect(fake.calls).not.toContain("approve:objectives");
    for (const call of ["generate:storyboard", "requestIllustrations", "requestAudio", "requestGrounding"])
      expect(fake.calls).not.toContain(call);
  });

  it("stops at preview on a blocking validation issue and continues the same run on resume", async () => {
    const fake = new FakePipeline();
    fake.validation = { runId: nextId(), status: "failed", errors: 2, warnings: 0 };
    const { run, last } = await drive(fake, initialRun());
    expect(last.status).toBe("needs_attention");
    expect(last.needsAttention).toMatchObject({ stage: "preview", errorCode: "VALIDATION_BLOCKING" });
    expect(step(last, "validation")?.state).toBe("needs_attention");

    // The user fixes the issue in the wizard, then resumes.
    fake.validation = { runId: nextId(), status: "passed", errors: 0, warnings: 0 };
    expect(resumedStatus(run.status)).toBe("running");
    const generationsBefore = fake.calls.filter((call) => call.startsWith("generate:")).length;
    const resumed = await drive(fake, { ...run, status: "running", resumeCount: 1 });
    expect(resumed.last.status).toBe("awaiting_render_approval");
    // Nothing already done was paid for again.
    expect(fake.calls.filter((call) => call.startsWith("generate:")).length).toBe(generationsBefore);
  });

  it("stops at the stage whose job failed instead of paying again", async () => {
    const fake = new FakePipeline();
    fake.failNext.add("outline");
    const { last } = await drive(fake, initialRun());
    expect(last.status).toBe("needs_attention");
    expect(last.needsAttention).toMatchObject({ stage: "outline", errorCode: "STAGE_JOB_FAILED" });
    expect(fake.calls.filter((call) => call === "generate:outline")).toHaveLength(1);
  });

  it("fails a step with no progress for 20 minutes, and the run can be resumed", async () => {
    const fake = new FakePipeline();
    fake.snapshot = { approved: true, stale: false };
    fake.config = {
      version: 1,
      focusPrompt: "x",
      ageBand: "adult-professional",
      difficulty: "advanced",
      targetDurationSeconds: 180,
    };
    fake.voice = true;
    const stuckJob = nextId();
    fake.stages.objectives = {
      ...idleStage(),
      state: "generating",
      latestJob: { id: stuckJob, state: "running", errorCode: null },
    };
    const earlier = "2026-09-27T09:00:00.000Z";
    const stalled = initialRun({
      status: "running",
      steps: [
        ...(["ingestion", "source_snapshot", "configuration"] as const).map((name) => ({
          step: name,
          state: "done" as const,
          startedAt: earlier,
          finishedAt: earlier,
          ...(name === "configuration" ? { detail: { configurationVersion: 1 } } : {}),
        })),
        { step: "objectives", state: "running", startedAt: earlier, jobId: stuckJob },
      ],
      lastProgressAt: new Date(earlier),
    });
    const within = await advanceOneShotRun({
      run: stalled,
      gateway: fake,
      now: new Date(stalled.lastProgressAt.getTime() + oneShotStepTimeoutMs - 1_000),
    });
    expect(within.status).toBe("running");

    const result = await advanceOneShotRun({
      run: stalled,
      gateway: fake,
      now: new Date(stalled.lastProgressAt.getTime() + oneShotStepTimeoutMs + 1_000),
    });
    expect(result.status).toBe("failed");
    expect(result.needsAttention).toMatchObject({ stage: "objectives", errorCode: "ONE_SHOT_STEP_TIMEOUT" });
    expect(result.reschedule).toBe(false);
    expect(resumedStatus("failed")).toBe("running");
  });

  it("sees a manual edit mid-run and regenerates the artifact it made stale", async () => {
    const fake = new FakePipeline();
    let run = initialRun();
    let result: OneShotTickResult | undefined;
    // Advance until the outline has been approved.
    for (let tick = 0; tick < 40 && fake.stages.outline.state !== "approved"; tick += 1) {
      result = await advanceOneShotRun({ run, gateway: fake, now: new Date("2026-09-27T10:01:00.000Z") });
      run = apply(run, result, new Date("2026-09-27T10:01:00.000Z"));
      fake.completeJobs();
    }
    expect(fake.stages.outline.state).toBe("approved");

    // The user edits the configuration in the wizard: objectives are stale.
    fake.stages.objectives.stale = true;
    const next = await advanceOneShotRun({ run, gateway: fake, now: new Date("2026-09-27T10:02:00.000Z") });
    expect(next.currentStep).toBe("objectives");
    expect(fake.calls.filter((call) => call === "generate:objectives")).toHaveLength(2);
    expect(step(next, "objectives")?.state).toBe("running");
  });

  it("replaces a configuration an earlier run left behind with this run's request", async () => {
    // ST-106 "Edit prompt": a cancelled run configured the project with a
    // focus the document did not cover; the new run must use its own.
    const fake = new FakePipeline();
    fake.snapshot = { approved: true, stale: false };
    fake.config = {
      version: 3,
      focusPrompt: "How do volcanoes erupt?",
      ageBand: "adult-intermediate",
      difficulty: "intermediate",
      targetDurationSeconds: 300,
    };
    fake.voice = true;
    let run = initialRun();
    for (let tick = 0; tick < 4 && step(run, "configuration")?.state !== "done"; tick += 1) {
      const result = await advanceOneShotRun({ run, gateway: fake, now: new Date("2026-09-27T10:00:30.000Z") });
      run = apply(run, result, new Date("2026-09-27T10:00:30.000Z"));
      fake.completeJobs();
    }
    expect(fake.calls).toContain("saveConfiguration");
    expect(fake.config).toMatchObject({
      version: 4,
      focusPrompt: "How do trusses carry load?",
      ageBand: "adult-professional",
      difficulty: "advanced",
      targetDurationSeconds: 180,
    });
  });

  it("keeps the user's own configuration edits once this run has configured the lesson", async () => {
    const fake = new FakePipeline();
    fake.snapshot = { approved: true, stale: false };
    fake.voice = true;
    fake.config = {
      version: 5,
      focusPrompt: "How do trusses carry wind load?",
      ageBand: "adult-professional",
      difficulty: "advanced",
      targetDurationSeconds: 180,
    };
    const run = initialRun({
      status: "running",
      steps: [
        { step: "ingestion", state: "done", startedAt: "2026-09-27T09:00:00.000Z" },
        { step: "source_snapshot", state: "done", startedAt: "2026-09-27T09:00:00.000Z" },
        {
          step: "configuration",
          state: "done",
          startedAt: "2026-09-27T09:00:00.000Z",
          detail: { configurationVersion: 4 },
        },
      ],
    });
    await advanceOneShotRun({ run, gateway: fake, now: new Date("2026-09-27T10:00:30.000Z") });
    expect(fake.calls).not.toContain("saveConfiguration");
    expect(fake.config?.focusPrompt).toBe("How do trusses carry wind load?");
  });

  it("does not stop on a concurrent-edit conflict and stops on a refusal", async () => {
    const fake = new FakePipeline();
    fake.throwOn = {
      method: "approveSourceSnapshot",
      error: new PublicError("edit_conflict", "Changed.", 409),
    };
    const retried = await advanceOneShotRun({ run: initialRun(), gateway: fake, now: new Date("2026-09-27T10:00:03.000Z") });
    expect(retried).toMatchObject({ status: "running", reschedule: true, needsAttention: null });

    fake.throwOn = {
      method: "approveSourceSnapshot",
      error: new PublicError("bad_request", "Review at least one section before approving.", 409),
    };
    const stopped = await advanceOneShotRun({ run: initialRun(), gateway: fake, now: new Date("2026-09-27T10:00:06.000Z") });
    expect(stopped.status).toBe("needs_attention");
    expect(stopped.needsAttention).toEqual({
      stage: "source_snapshot",
      errorCode: "STAGE_BLOCKED",
      message: "Review at least one section before approving.",
    });
  });

  it("requests missing illustrations once per storyboard", async () => {
    const fake = new FakePipeline();
    await drive(fake, initialRun());
    expect(fake.calls.filter((call) => call === "requestIllustrations")).toHaveLength(1);
  });

  it("tracks an approved render to completed or failed", async () => {
    const fake = new FakePipeline();
    const rendering = initialRun({ status: "rendering", renderJobId });

    const inFlight = await advanceOneShotRun({ run: rendering, gateway: fake, now: new Date("2026-09-27T10:00:03.000Z") });
    expect(inFlight).toMatchObject({ status: "rendering", reschedule: true, progressed: true });

    fake.renderFake = { status: "completed", progress: 1, errorCode: null };
    const completed = await advanceOneShotRun({ run: rendering, gateway: fake, now: new Date("2026-09-27T10:00:06.000Z") });
    expect(completed).toMatchObject({ status: "completed", reschedule: false });
    expect(step(completed, "render")?.state).toBe("done");

    fake.renderFake = { status: "failed", progress: 0.4, errorCode: "RENDER_TIMEOUT" };
    const failed = await advanceOneShotRun({ run: rendering, gateway: fake, now: new Date("2026-09-27T10:00:09.000Z") });
    expect(failed.status).toBe("failed");
    expect(failed.needsAttention).toMatchObject({ stage: "render", errorCode: "RENDER_FAILED" });
    // No pipeline stage is touched while rendering.
    expect(fake.calls).toEqual([]);
  });

  it("only resumes a stopped run", () => {
    expect(resumedStatus("needs_attention")).toBe("running");
    expect(resumedStatus("failed")).toBe("running");
    for (const status of ["queued", "running", "awaiting_render_approval", "rendering", "completed", "cancelled"] as const)
      expect(resumedStatus(status)).toBeNull();
  });
});
