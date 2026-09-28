/**
 * ST-107 — the runner with a confirmed brief: no lesson-intent call, the
 * budget guard before paid actions, bounded self-repair through the existing
 * scene-regeneration job, the brief-promise check, decision-log entries and
 * the render review. Driven against the in-memory pipeline.
 */

import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  advanceOneShotRun,
  emptyOneShotRepairState,
  type OneShotRunState,
  type OneShotTickResult,
} from "./one-shot-runner.js";
import { estimateOneShotBrief } from "./one-shot-budget.js";
import { FakePipeline } from "./one-shot-test-pipeline.js";

const ownerUserId = "019ffc40-aaaa-7000-8000-000000000107" as Identifier;
const projectId = "019ffc40-bbbb-7000-8000-000000000107" as Identifier;
const runId = "019ffc40-cccc-7000-8000-000000000107" as Identifier;
const correlationId = "019ffc40-dddd-7000-8000-000000000107" as Identifier;
const renderJobId = "019ffc40-ffff-7000-8000-000000000107" as Identifier;

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

const coverage = [
  { point: "How trusses spread load", sectionIds: ["019ffc40-5ec1-7000-8000-000000000001"] },
  { point: "Why triangles are rigid", sectionIds: ["019ffc40-5ec1-7000-8000-000000000002"] },
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
    lastProgressAt: new Date("2026-09-27T10:00:00.000Z"),
    renderJobId: null,
    brief: {
      revision: 1,
      subject: "Structural engineering",
      lessonTitle: "How trusses carry load",
      coverage,
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

/** A pipeline whose promise state cites every brief section by default. */
function pipeline(): FakePipeline {
  const fake = new FakePipeline();
  fake.promise = {
    ...fake.promise,
    sceneSections: [
      { sceneId: "s1", order: 1, sectionIds: [coverage[0]!.sectionIds[0]!] },
      { sceneId: "s2", order: 2, sectionIds: [coverage[1]!.sectionIds[0]!] },
    ],
    sectionOrder: new Map([
      [coverage[0]!.sectionIds[0]!, 0],
      [coverage[1]!.sectionIds[0]!, 1],
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
  let now = new Date("2026-09-27T10:00:00.000Z");
  for (let tick = 1; tick <= limit; tick += 1) {
    now = new Date(now.getTime() + 3_000);
    last = await advanceOneShotRun({ run, gateway: fake, now });
    decisions.push(...last.decisions);
    run = apply(run, last, now);
    if (!last.reschedule) return { run, last, decisions };
    fake.completeJobs();
  }
  throw new Error("The run did not stop.");
}

describe("ST-107 runner with a confirmed brief", () => {
  it("takes subject and title from the brief, saves the confirmed choices and grounds objectives in the coverage", async () => {
    const fake = pipeline();
    const { last, decisions } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(fake.calls).not.toContain("inferIntent");
    expect(fake.config).toMatchObject({ creativeStylePack: "systems", soundBed: "none" });
    expect(fake.briefCoverageSeen).toEqual(coverage.map((entry) => entry.point));
    // Every automatic approval is in the decision log, in order.
    expect(decisions.filter((entry) => entry.kind === "auto_approval").map((entry) => entry.summary)).toEqual([
      "Approved the source review automatically.",
      "Approved the objectives automatically (revision 1).",
      "Approved the outline automatically (revision 1).",
      "Approved the narration automatically (revision 1).",
      expect.stringContaining("Accepted a generated illustration"),
    ]);
    expect(last.budgetProposalUsd).toBeNull();
  });

  it("stops before a paid call that would pass the cap, and proposes an estimate that covers it", async () => {
    const fake = pipeline();
    const run = briefRun({ budget: { reservedUsd: 4, capUsd: 5 } });
    fake.cost = 4.5; // one more model call (1.08) would pass the 5.00 cap
    const { last } = await drive(fake, run);

    expect(last.status).toBe("needs_attention");
    expect(last.needsAttention).toMatchObject({ stage: "objectives", errorCode: "ONE_SHOT_BUDGET_CAP" });
    expect(fake.calls).not.toContain("generate:objectives");
    expect(last.budgetProposalUsd).not.toBeNull();
    expect(last.budgetProposalUsd!).toBeGreaterThanOrEqual(4.5 + 1.08);
  });

  it("continues past the same step once a new reservation covers it", async () => {
    const fake = pipeline();
    fake.cost = 4.5;
    const { last } = await drive(fake, briefRun({ budget: { reservedUsd: 30, capUsd: 37.5 } }));
    expect(last.status).toBe("awaiting_render_approval");
  });

  it("repairs a text overflow and a monotonous run within two rounds, and logs every repair", async () => {
    const fake = pipeline();
    fake.findingsDriveValidation = true;
    fake.repairContextFake = {
      scenes: [1, 2, 3, 4].map((index) => ({
        sceneId: `s${index}`,
        order: index,
        template: "concept",
        blockIds: [`b${index}`],
        sectionIds: [],
      })),
      objectives: [],
    };
    fake.findings = [
      { code: "text_overflow", severity: "error", sceneId: "s1", scopeId: "s1", details: {} },
      {
        code: "scene_monotony",
        severity: "warning",
        sceneId: "s2",
        scopeId: "s2",
        details: { sceneIds: ["s2", "s3", "s4"], template: "concept" },
      },
    ];
    // Fixing s1 removes its overflow; regenerating s3 breaks the run.
    fake.onRepairApplied = (sceneId, pipeline) => {
      pipeline.findings = pipeline.findings.filter((entry) =>
        sceneId === "s1" ? entry.code !== "text_overflow" : entry.code !== "scene_monotony",
      );
    };
    const { last, decisions, run } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(fake.findings).toEqual([]);
    expect(fake.repairJobs.map((job) => [job.sceneId, job.mode])).toEqual([
      ["s1", "shorten"],
      ["s3", "regenerate"],
    ]);
    // Deterministic keys: run, round and scene.
    expect(fake.repairJobs.map((job) => job.key)).toEqual([
      `oneshot:${runId}:repair:1:s1`,
      `oneshot:${runId}:repair:1:s3`,
    ]);
    expect(run.repair).toMatchObject({ roundsDone: 1, active: null });
    const repairs = decisions.filter((entry) => entry.kind === "repair");
    expect(repairs.map((entry) => entry.summary)).toEqual([
      "Round 1: regenerating scene 1 because on-screen text overflowed its layout.",
      "Round 1: regenerating scene 3 because too many scenes in a row used the same template.",
      "Round 1: applied the regenerated scene 1.",
      "Round 1: applied the regenerated scene 3.",
    ]);
    expect(repairs.filter((entry) => entry.summary.includes("applied")).every((entry) => entry.costUsd === 0.01)).toBe(true);
    // Grounding and audio re-ran after the round, then validation passed.
    expect(fake.calls.filter((call) => call === "requestGrounding")).toHaveLength(2);
    expect(fake.keys).toContain(`oneshot:${runId}:audio:r0:repair:1`);
  });

  it("never repairs or acknowledges a grounding finding: it goes to the user", async () => {
    const fake = pipeline();
    fake.findingsDriveValidation = true;
    fake.findings = [
      { code: "grounding_missing", severity: "error", sceneId: "s1", scopeId: "s1", details: {} },
      { code: "text_overflow", severity: "error", sceneId: "s2", scopeId: "s2", details: {} },
    ];
    const { last } = await drive(fake, briefRun());

    expect(last.status).toBe("needs_attention");
    expect(last.needsAttention).toMatchObject({ stage: "preview", errorCode: "VALIDATION_BLOCKING" });
    expect(last.needsAttention?.message).toContain("source-grounding");
    expect(fake.repairJobs).toEqual([]);
  });

  it("ends repair and escalates when a round does not reduce the findings", async () => {
    const fake = pipeline();
    fake.findingsDriveValidation = true;
    fake.repairContextFake = {
      scenes: [{ sceneId: "s1", order: 1, template: "concept", blockIds: ["b1"], sectionIds: [] }],
      objectives: [],
    };
    fake.findings = [{ code: "text_overflow", severity: "error", sceneId: "s1", scopeId: "s1", details: {} }];
    fake.onRepairApplied = () => {}; // the fix does not help
    const { last, run, decisions } = await drive(fake, briefRun());

    expect(last.status).toBe("needs_attention");
    expect(last.needsAttention).toMatchObject({ errorCode: "VALIDATION_BLOCKING" });
    expect(fake.repairJobs).toHaveLength(1);
    expect(run.repair).toMatchObject({ roundsDone: 1, stopped: "no_progress" });
    expect(decisions.at(-1)).toMatchObject({ kind: "repair", summary: expect.stringContaining("did not reduce") });
  });

  it("stops after two rounds even when every round helps a little", async () => {
    const fake = pipeline();
    fake.findingsDriveValidation = true;
    fake.repairContextFake = {
      scenes: [1, 2, 3, 4, 5, 6, 7].map((index) => ({
        sceneId: `s${index}`,
        order: index,
        template: "concept",
        blockIds: [`b${index}`],
        sectionIds: [],
      })),
      objectives: [],
    };
    // Seven overflowing scenes: four fixed in round one, three in round two,
    // but each fix reveals a new overflow elsewhere (s9 never exists).
    fake.findings = [1, 2, 3, 4, 5, 6, 7].map((index) => ({
      code: "text_overflow",
      severity: "error" as const,
      sceneId: `s${index}`,
      scopeId: `s${index}`,
      details: {},
    }));
    let applied = 0;
    fake.onRepairApplied = (sceneId, pipeline) => {
      applied += 1;
      pipeline.findings = pipeline.findings.filter((entry) => entry.sceneId !== sceneId);
      if (applied % 2 === 0)
        pipeline.findings.push({ code: "text_overflow", severity: "error", sceneId: "s9", scopeId: "s9", details: {} });
    };
    const { last, run } = await drive(fake, briefRun());

    expect(last.status).toBe("needs_attention");
    expect(run.repair?.roundsDone).toBe(2);
    expect(fake.repairJobs.length).toBeLessThanOrEqual(8);
  });

  it("discards a fix that drops source references instead of applying it", async () => {
    const fake = pipeline();
    fake.findingsDriveValidation = true;
    fake.repairContextFake = {
      scenes: [{ sceneId: "s1", order: 1, template: "concept", blockIds: ["b1"], sectionIds: [] }],
      objectives: [],
    };
    fake.findings = [{ code: "text_overflow", severity: "error", sceneId: "s1", scopeId: "s1", details: {} }];
    fake.dropSourceRefsFor.add("s1");
    const { last, decisions } = await drive(fake, briefRun());

    expect(fake.calls).toContain("rejectRepair:s1");
    expect(fake.calls).not.toContain("applyRepair:s1");
    expect(decisions.some((entry) => entry.summary.includes("dropped source references"))).toBe(true);
    expect(last.status).toBe("needs_attention");
  });

  it("gives an unmet coverage point one repair round, then shows it as not covered", async () => {
    const fake = pipeline();
    fake.promise = {
      ...fake.promise,
      sceneSections: [{ sceneId: "s1", order: 1, sectionIds: [coverage[0]!.sectionIds[0]!] }],
    };
    fake.onRepairApplied = () => {}; // the scene still cites only its own section
    const { last, decisions, run } = await drive(fake, briefRun());

    expect(last.status).toBe("awaiting_render_approval");
    expect(fake.repairJobs).toHaveLength(1);
    expect(fake.repairJobs[0]!.instruction).toContain("Why triangles are rigid");
    expect(run.coverageGaps).toEqual(["Why triangles are rigid"]);
    expect(decisions.filter((entry) => entry.kind === "coverage_gap")).toEqual([
      expect.objectContaining({ summary: "Not covered: Why triangles are rigid" }),
    ]);
  });

  it("stops on a duration outside the band or a choice the lesson no longer pins", async () => {
    const fake = pipeline();
    fake.promise = { ...fake.promise, measuredDurationSeconds: 260 };
    const long = await drive(fake, briefRun());
    expect(long.last.needsAttention).toMatchObject({ stage: "preview", errorCode: "BRIEF_PROMISE_UNMET" });

    const repinned = pipeline();
    const first = await drive(repinned, briefRun());
    expect(first.last.status).toBe("awaiting_render_approval");
    repinned.promise = { ...repinned.promise, pinned: { stylePackId: "prism", soundBed: "none" } };
    const again = await advanceOneShotRun({
      run: { ...first.run, status: "running" },
      gateway: repinned,
      now: new Date("2026-09-27T11:00:00.000Z"),
    });
    expect(again.needsAttention).toMatchObject({ stage: "configuration", errorCode: "BRIEF_PROMISE_UNMET" });
  });
});

describe("ST-107 render review on one-shot runs", () => {
  const rendering = () =>
    briefRun({ status: "rendering", renderJobId, steps: [] });

  it("sends a render whose review failed back to the user at render, with the findings", async () => {
    const fake = pipeline();
    fake.renderFake = {
      status: "failed",
      progress: 1,
      errorCode: "RENDER_REVIEW_FAILED",
      review: {
        outcome: "failed",
        findings: [{ code: "NARRATION_SILENT", severity: "error", detail: "No narration between 0:12 and 0:40." }],
      },
    };
    const result = await advanceOneShotRun({ run: rendering(), gateway: fake, now: new Date("2026-09-27T10:00:03.000Z") });
    expect(result.status).toBe("needs_attention");
    expect(result.needsAttention).toMatchObject({ stage: "render", errorCode: "RENDER_REVIEW_FAILED" });
    expect(result.needsAttention?.message).toContain("NARRATION_SILENT");
    expect(result.decisions).toEqual([
      expect.objectContaining({ kind: "render_review", summary: expect.stringContaining("NARRATION_SILENT") }),
    ]);
  });

  it("lists review warnings in the decision log when the video is delivered", async () => {
    const fake = pipeline();
    fake.renderFake = {
      status: "completed",
      progress: 1,
      errorCode: null,
      review: {
        outcome: "passed",
        findings: [{ code: "LOUDNESS_OUT_OF_RANGE", severity: "warning", detail: "-20 LUFS" }],
      },
    };
    const result = await advanceOneShotRun({ run: rendering(), gateway: fake, now: new Date("2026-09-27T10:00:03.000Z") });
    expect(result.status).toBe("completed");
    expect(result.decisions).toEqual([
      expect.objectContaining({ kind: "render_review", summary: expect.stringContaining("LOUDNESS_OUT_OF_RANGE") }),
    ]);
  });
});
