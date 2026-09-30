/**
 * ST-112 — the runner's `visual_plan` step and the v2 illustration path
 * (ADR-015): planned once per storyboard, applied once, and never a reason
 * to stop the run. Driven against the in-memory pipeline.
 */

import { describe, expect, it } from "vitest";
import { PublicError, type Identifier } from "@avlp/config";
import type { OneShotStepRecord } from "@avlp/schemas/one-shot";
import {
  advanceOneShotRun,
  emptyOneShotRepairState,
  type OneShotRunState,
  type OneShotTickResult,
} from "./one-shot-runner.js";
import { estimateOneShotBrief } from "./one-shot-budget.js";
import { FakePipeline, fakeSpecId } from "./one-shot-test-pipeline.js";

const ownerUserId = "019ffc60-aaaa-7000-8000-000000000112" as Identifier;
const projectId = "019ffc60-bbbb-7000-8000-000000000112" as Identifier;
const runId = "019ffc60-cccc-7000-8000-000000000112" as Identifier;
const correlationId = "019ffc60-dddd-7000-8000-000000000112" as Identifier;

const estimate = estimateOneShotBrief({
  targetDurationSeconds: 180,
  plannedSceneCount: 6,
  pricing: {
    modelCallCostUsd: 1.08,
    imageCostUsd: 0.00225,
    ttsCostUsdPerMillionCharacters: 15,
    alignmentCostUsdPerAudioMinute: 0.0015,
  },
});

const sectionIds = [
  "019ffc60-5ec1-7000-8000-000000000001",
  "019ffc60-5ec1-7000-8000-000000000002",
];

function briefRun(overrides: Partial<OneShotRunState> = {}): OneShotRunState {
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
    lastProgressAt: new Date("2026-09-30T10:00:00.000Z"),
    renderJobId: null,
    brief: {
      revision: 1,
      subject: "Structural engineering",
      lessonTitle: "How trusses carry load",
      coverage: [
        { point: "How trusses spread load", sectionIds: [sectionIds[0]!] },
        { point: "Why triangles are rigid", sectionIds: [sectionIds[1]!] },
      ],
      stylePackId: "systems",
      soundBed: "none",
      estimate,
    },
    budget: { reservedUsd: estimate.totalUsd, capUsd: estimate.totalUsd * 1.25 },
    repair: emptyOneShotRepairState,
    coverageGaps: [],
    ...overrides,
  };
}

/** A pipeline whose storyboard job leaves a v2 design. */
function v2Pipeline(): FakePipeline {
  const fake = new FakePipeline();
  fake.designRelease = "v2";
  fake.promise = {
    ...fake.promise,
    sceneSections: [
      { sceneId: "s1", order: 1, sectionIds: [sectionIds[0]!] },
      { sceneId: "s2", order: 2, sectionIds: [sectionIds[1]!] },
    ],
    sectionOrder: new Map([
      [sectionIds[0]!, 0],
      [sectionIds[1]!, 1],
    ]),
  };
  return fake;
}

function apply(run: OneShotRunState, result: OneShotTickResult, now: Date): OneShotRunState {
  return {
    ...run,
    status: result.status,
    steps: result.steps,
    ...(result.progressed ? { lastProgressAt: now } : {}),
    ...(result.repair === undefined ? {} : { repair: result.repair }),
    ...(result.coverageGaps === undefined ? {} : { coverageGaps: result.coverageGaps }),
  };
}

async function drive(fake: FakePipeline, start: OneShotRunState, limit = 120) {
  let run = start;
  let last: OneShotTickResult | undefined;
  const decisions: OneShotTickResult["decisions"] = [];
  const proposals: (number | null)[] = [];
  let now = new Date("2026-09-30T10:00:00.000Z");
  for (let tick = 1; tick <= limit; tick += 1) {
    now = new Date(now.getTime() + 3_000);
    last = await advanceOneShotRun({ run, gateway: fake, now });
    decisions.push(...last.decisions);
    proposals.push(last.budgetProposalUsd);
    run = apply(run, last, now);
    if (!last.reschedule) return { run, last, decisions, proposals };
    fake.completeJobs();
  }
  throw new Error("The run did not stop.");
}

function step(result: { steps: OneShotStepRecord[] }, name: string) {
  return result.steps.find((entry) => entry.step === name);
}

const count = (fake: FakePipeline, call: string) =>
  fake.calls.filter((entry) => entry === call).length;

describe("ST-112 runner: visual planning for a v2 design", () => {
  it("plans between storyboard and illustrations, then applies the planned design once", async () => {
    const fake = v2Pipeline();
    const { last, decisions } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    const order = (call: string) => fake.calls.indexOf(call);
    expect(order("generate:storyboard")).toBeLessThan(order("requestVisualPlan"));
    expect(order("requestVisualPlan")).toBeLessThan(order("requestIllustrations"));
    expect(order("requestIllustrations")).toBeLessThan(order("applyVisualDesign"));
    expect(order("applyVisualDesign")).toBeLessThan(order("requestGrounding"));
    expect(count(fake, "requestVisualPlan")).toBe(1);
    expect(count(fake, "requestIllustrations")).toBe(1);
    expect(count(fake, "applyVisualDesign")).toBe(1);
    // Both requests are keyed by the run, the step and the storyboard.
    expect(fake.keys).toContain(`oneshot:${runId}:visual_plan:r0:${fakeSpecId}`);
    expect(fake.keys).toContain(`oneshot:${runId}:illustrations:r0:${fakeSpecId}`);

    expect(step(last, "visual_plan")).toMatchObject({
      state: "done",
      jobId: fake.visualPlanJob?.id,
      detail: { plannedFor: fakeSpecId, visualPlan: "model" },
    });
    // What the design resolved to is recorded on the step (AC4).
    expect(step(last, "illustrations")?.detail).toMatchObject({
      requestedFor: fakeSpecId,
      queued: 2,
      reused: 1,
      motif: 1,
      pictureBudget: 5,
      designSettledFor: fakeSpecId,
      designApplied: true,
      families: "sequence:1,statement:2",
      pictures: 2,
      generatedPictures: 2,
    });
    expect(decisions.map((entry) => entry.summary)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Planned the visuals"),
        expect.stringContaining("1 scene uses the style's own drawn motif"),
        "Applied the planned visual design automatically.",
      ]),
    );
    expect(fake.audits).toContainEqual({
      step: "illustrations",
      targetType: "creative_design_snapshot",
    });
  });

  it("does nothing for a lesson without a v2 design", async () => {
    for (const release of ["v1", null] as const) {
      const fake = v2Pipeline();
      fake.designRelease = release;
      const { last } = await drive(fake, briefRun());

      expect(last.status).toBe("awaiting_render_approval");
      expect(fake.calls).not.toContain("requestVisualPlan");
      expect(fake.calls).not.toContain("applyVisualDesign");
      expect(step(last, "visual_plan")).toMatchObject({ state: "done" });
      expect(step(last, "visual_plan")?.detail).toBeUndefined();
      // The v1 path still fills and accepts decorative slots.
      expect(fake.calls).toContain("acceptIllustration:019ffc10-1111-7000-8000-000000000105");
    }
  });

  it("never plans the same storyboard twice, across ticks and a resume", async () => {
    const fake = v2Pipeline();
    const first = await drive(fake, briefRun());
    const resumed = await drive(fake, {
      ...first.run,
      status: "running",
      resumeCount: 1,
    });

    expect(resumed.last.status).toBe("awaiting_render_approval");
    expect(count(fake, "requestVisualPlan")).toBe(1);
    expect(count(fake, "requestIllustrations")).toBe(1);
    expect(count(fake, "applyVisualDesign")).toBe(1);
    expect(resumed.decisions).toEqual([]);
  });

  it("leaves a teacher's later unapplied design edit alone", async () => {
    const fake = v2Pipeline();
    const first = await drive(fake, briefRun());
    // The teacher edits the design draft in the panel and does not apply it.
    fake.designApplied = false;
    const again = await drive(fake, { ...first.run, status: "running", resumeCount: 1 });

    expect(again.last.status).toBe("awaiting_render_approval");
    expect(count(fake, "applyVisualDesign")).toBe(1);
  });
});

describe("ST-112 runner: the run never waits on a person for visuals (AC4)", () => {
  const authoredCases: {
    name: string;
    arrange: (fake: FakePipeline) => void;
    reason: string;
  }[] = [
    {
      name: "the job's own authored fallback",
      arrange: (fake) => {
        fake.visualPlanResult = { outcome: "authored", fallbackReason: "PROVIDER_UNAVAILABLE" };
      },
      reason: "PROVIDER_UNAVAILABLE",
    },
    {
      name: "a job that fails outright",
      arrange: (fake) => {
        fake.visualPlanResult = { failed: "VISUAL_PLAN_FALLBACK_INVALID" };
      },
      reason: "VISUAL_PLAN_FALLBACK_INVALID",
    },
    {
      name: "a draft that is not available to plan",
      arrange: (fake) => {
        fake.visualPlanUnavailable = true;
      },
      reason: "not_available",
    },
    {
      name: "a refused request",
      arrange: (fake) => {
        fake.throwOn = {
          method: "requestVisualPlan",
          error: new PublicError("bad_request", "An approved source is required.", 409),
        };
      },
      reason: "request_refused",
    },
  ];

  for (const entry of authoredCases)
    it(`keeps the authored design after ${entry.name}`, async () => {
      const fake = v2Pipeline();
      entry.arrange(fake);
      const { last, decisions } = await drive(fake, briefRun());

      expect(last.status).toBe("awaiting_render_approval");
      expect(last.needsAttention).toBeNull();
      expect(step(last, "visual_plan")).toMatchObject({
        state: "done",
        detail: { plannedFor: fakeSpecId, visualPlan: "authored", fallbackReason: entry.reason },
      });
      expect(decisions).toContainEqual(
        expect.objectContaining({
          kind: "style_pack",
          summary: expect.stringContaining("Kept the standard visual design"),
          reason: entry.reason,
        }),
      );
      // The pictures still follow, and the run reaches the render gate.
      expect(count(fake, "requestIllustrations")).toBe(1);
    });

  it("retries a transient request failure instead of falling back", async () => {
    const fake = v2Pipeline();
    fake.throwOn = {
      method: "requestVisualPlan",
      error: new PublicError("internal_error", "Temporarily unavailable.", 503, true),
    };
    const { last } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(step(last, "visual_plan")?.detail).toMatchObject({ visualPlan: "model" });
  });

  it("records a plan superseded by an edit without overwriting it", async () => {
    const fake = v2Pipeline();
    fake.visualPlanResult = { outcome: "superseded" };
    const { last, decisions } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(step(last, "visual_plan")?.detail).toMatchObject({ visualPlan: "superseded" });
    expect(decisions).toContainEqual(
      expect.objectContaining({ summary: expect.stringContaining("Kept the current visual design") }),
    );
  });

  it("continues with authored motifs when no picture could be generated", async () => {
    const fake = v2Pipeline();
    fake.cinemaRequest = { queued: 0, reused: 0, motif: 3, budget: 5 };
    // No model plan either, so the draft is already the design in use.
    fake.visualPlanResult = { outcome: "authored", fallbackReason: "QUOTA_EXCEEDED" };
    const { last } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(fake.calls).not.toContain("applyVisualDesign");
    expect(step(last, "illustrations")?.detail).toMatchObject({ queued: 0, motif: 3, pictures: 0 });
  });

  it("keeps the design in use when the planned one no longer fits the storyboard", async () => {
    const fake = v2Pipeline();
    fake.designInvalid = true;
    const { last, decisions } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    // Tried once, not on every tick.
    expect(count(fake, "applyVisualDesign")).toBe(1);
    expect(step(last, "illustrations")?.detail).toMatchObject({ designApplied: false });
    expect(decisions).toContainEqual(
      expect.objectContaining({ reason: "design_invalid" }),
    );
  });
});

describe("ST-112 runner: fallbacks never exceed the approved cap", () => {
  /** The cap leaves room for exactly `calls` more model calls, and nothing else. */
  const capFor = (fake: FakePipeline, calls: number) => ({
    reservedUsd: fake.cost,
    capUsd: fake.cost + calls * 1.08,
  });

  it("skips the visual plan and the pictures over the cap, without asking for more budget", async () => {
    const fake = v2Pipeline();
    // Objectives, outline, narration and the storyboard fit; nothing after.
    fake.cost = 0;
    const budget = capFor(fake, 4);
    // Each generation job meters its call when the worker finishes it.
    const complete = fake.completeJobs.bind(fake);
    fake.completeJobs = () => {
      const active = [
        fake.stages.objectives,
        fake.stages.outline,
        fake.stages.narration,
        fake.storyboardFake,
      ].filter((stage) => stage.latestJob?.state === "queued").length;
      fake.cost = Math.round((fake.cost + active * 1.08) * 1_000_000) / 1_000_000;
      complete();
    };

    let run = briefRun({ budget });
    const decisions: OneShotTickResult["decisions"] = [];
    let now = new Date("2026-09-30T10:00:00.000Z");
    let last: OneShotTickResult | undefined;
    for (let tick = 0; tick < 60; tick += 1) {
      now = new Date(now.getTime() + 3_000);
      last = await advanceOneShotRun({ run, gateway: fake, now });
      decisions.push(...last.decisions);
      // An optional step over the cap never asks for more budget.
      if (last.status === "running") expect(last.budgetProposalUsd).toBeNull();
      run = apply(run, last, now);
      // Stop at the first paid step after the pictures: that one is required.
      if (!last.reschedule) break;
      fake.completeJobs();
    }

    expect(fake.calls).not.toContain("requestVisualPlan");
    expect(fake.calls).not.toContain("requestIllustrations");
    expect(step(last!, "visual_plan")).toMatchObject({
      state: "done",
      detail: { visualPlan: "authored", fallbackReason: "budget_cap" },
    });
    expect(step(last!, "illustrations")).toMatchObject({
      state: "done",
      detail: { queued: 0, pictureFallback: "budget_cap" },
    });
    expect(decisions.filter((entry) => entry.reason === "budget_cap")).toHaveLength(2);
    // The optional steps asked for nothing; grounding, which is required, does.
    expect(last).toMatchObject({
      status: "needs_attention",
      currentStep: "grounding",
      needsAttention: { errorCode: "ONE_SHOT_BUDGET_CAP" },
    });
    expect(fake.cost).toBeLessThanOrEqual(budget.capUsd);
  });

  it("drops only the plan when the pictures still fit the cap", async () => {
    const fake = readyForVisuals("v2");
    // Room for the pictures (about a cent), not for a model call.
    const result = await advanceOneShotRun({
      run: briefRun({ budget: { reservedUsd: fake.cost, capUsd: fake.cost + 0.5 } }),
      gateway: fake,
      now: new Date("2026-09-30T10:00:03.000Z"),
    });

    expect(fake.calls).toEqual(["requestIllustrations"]);
    expect(result).toMatchObject({ status: "running", currentStep: "illustrations", needsAttention: null });
    expect(result.budgetProposalUsd).toBeNull();
    expect(step(result, "visual_plan")?.detail).toMatchObject({ fallbackReason: "budget_cap" });
  });

  it("still stops a v1 lesson whose required pictures do not fit the cap", async () => {
    const fake = readyForVisuals("v1");
    const result = await advanceOneShotRun({
      run: briefRun({ budget: { reservedUsd: fake.cost, capUsd: fake.cost } }),
      gateway: fake,
      now: new Date("2026-09-30T10:00:03.000Z"),
    });

    expect(result).toMatchObject({
      status: "needs_attention",
      currentStep: "illustrations",
      needsAttention: { errorCode: "ONE_SHOT_BUDGET_CAP" },
    });
    expect(result.budgetProposalUsd).not.toBeNull();
  });

  /** Everything up to the storyboard is current; the visuals come next. */
  function readyForVisuals(release: "v1" | "v2"): FakePipeline {
    const fake = v2Pipeline();
    fake.designRelease = release;
    fake.storyboardFake = {
      state: "draft",
      stale: false,
      revision: 4,
      canApprove: false,
      latestJob: null,
      lessonSpecId: fakeSpecId,
    };
    fake.snapshot = { approved: true, stale: false };
    fake.voice = true;
    fake.config = {
      version: 1,
      focusPrompt: "How do trusses carry load?",
      ageBand: "adult-professional",
      difficulty: "advanced",
      targetDurationSeconds: 180,
      creativeStylePack: "systems",
      soundBed: "none",
    };
    for (const stage of ["objectives", "outline", "narration"] as const)
      fake.stages[stage] = { state: "approved", stale: false, revision: 1, canApprove: true, latestJob: null };
    return fake;
  }
});
