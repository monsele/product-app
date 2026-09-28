/**
 * ST-107 — the repair map, round termination and the brief-promise check.
 * All deterministic: validation findings and citations decide, never a model.
 */

import { describe, expect, it } from "vitest";
import {
  checkBriefPromises,
  classifyFindings,
  nextRepairRound,
  planCoverageRepair,
  planRepairRound,
  repairForFinding,
  repairInstructionMaxLength,
  type RepairFinding,
  type RepairScene,
} from "./one-shot-repair.js";

const scene = (index: number, template = "concept", blockIds = [`b${index}`]): RepairScene => ({
  sceneId: `s${index}`,
  order: index,
  template,
  blockIds,
});
const scenes = [1, 2, 3, 4, 5, 6].map((index) => scene(index));
const finding = (overrides: Partial<RepairFinding>): RepairFinding => ({
  code: "text_overflow",
  severity: "error",
  sceneId: "s1",
  scopeId: "s1",
  details: {},
  ...overrides,
});

describe("ST-107 repair map", () => {
  it("repairs only the four mapped codes; grounding and everything else goes to the user", () => {
    const { repairable, blockingUnrepairable } = classifyFindings([
      finding({ code: "text_overflow" }),
      finding({ code: "scene_monotony", severity: "warning" }),
      finding({ code: "scene_duration_out_of_range" }),
      finding({ code: "objective_uncovered", sceneId: null }),
      finding({ code: "grounding_missing" }),
      finding({ code: "grounding_recheck_required" }),
      finding({ code: "asset_required" }),
      finding({ code: "audio_missing", severity: "warning" }),
      finding({ code: "lesson_duration_mismatch", severity: "info" }),
    ]);
    expect(repairable.map((entry) => entry.code)).toEqual([
      "text_overflow",
      "scene_monotony",
      "scene_duration_out_of_range",
      "objective_uncovered",
    ]);
    expect(blockingUnrepairable.map((entry) => entry.code)).toEqual([
      "grounding_missing",
      "grounding_recheck_required",
      "asset_required",
    ]);
  });

  it("maps each code to the existing scene-regeneration job with a templated instruction", () => {
    const context = {
      scenes,
      objectives: [{ objectiveId: "o1", statement: "Explain how trusses spread load.", blockIds: ["b4"] }],
    };
    expect(repairForFinding(finding({ code: "text_overflow", sceneId: "s2" }), context)).toMatchObject({
      sceneId: "s2",
      mode: "shorten",
      instruction: expect.stringContaining("Shorten the on-screen text"),
    });
    // The middle scene of a monotonous run.
    expect(
      repairForFinding(
        finding({
          code: "scene_monotony",
          severity: "warning",
          sceneId: "s2",
          details: { sceneIds: ["s2", "s3", "s4"], template: "concept" },
        }),
        context,
      ),
    ).toMatchObject({ sceneId: "s3", mode: "regenerate", instruction: expect.stringContaining('"concept"') });
    expect(
      repairForFinding(
        finding({
          code: "scene_duration_out_of_range",
          sceneId: "s5",
          details: { sceneDurationSeconds: 40, storyboardDurationSeconds: 30 },
        }),
        context,
      ),
    ).toMatchObject({ sceneId: "s5", mode: "shorten", instruction: expect.stringContaining("exactly 30 seconds") });
    // The closest scene: the one citing the objective's blocks.
    expect(
      repairForFinding(finding({ code: "objective_uncovered", sceneId: null, scopeId: "o1" }), context),
    ).toMatchObject({ sceneId: "s4", instruction: expect.stringContaining("Explain how trusses spread load.") });
    expect(repairForFinding(finding({ code: "grounding_missing" }), context)).toBeNull();
  });

  it("bounds instructions to the jobs' 500 characters", () => {
    const repair = repairForFinding(finding({ code: "objective_uncovered", sceneId: null, scopeId: "o1" }), {
      scenes,
      objectives: [{ objectiveId: "o1", statement: "x".repeat(2_000), blockIds: ["b1"] }],
    });
    expect(repair?.instruction.length).toBeLessThanOrEqual(repairInstructionMaxLength);
  });

  it("plans at most four scenes a round, errors first, one fix per scene", () => {
    const findings = [
      finding({ code: "scene_monotony", severity: "warning", sceneId: "s1", details: { sceneIds: ["s1", "s2", "s3"], template: "concept" } }),
      ...[1, 2, 3, 4, 5, 6].map((index) => finding({ sceneId: `s${index}` })),
    ];
    const planned = planRepairRound({ findings, scenes, objectives: [], maxScenes: 4 });
    expect(planned).toHaveLength(4);
    expect(planned.map((entry) => entry.code)).toEqual([
      "text_overflow",
      "text_overflow",
      "text_overflow",
      "text_overflow",
    ]);
    expect(new Set(planned.map((entry) => entry.sceneId)).size).toBe(4);
  });
});

describe("ST-107 repair rounds terminate", () => {
  it("starts the first round, continues only while findings drop, and stops after two", () => {
    expect(nextRepairRound({ roundsDone: 0, maxRounds: 2, countBeforeLastRound: null, countNow: 3 })).toEqual({
      action: "start",
      round: 1,
    });
    expect(nextRepairRound({ roundsDone: 1, maxRounds: 2, countBeforeLastRound: 3, countNow: 1 })).toEqual({
      action: "start",
      round: 2,
    });
    expect(nextRepairRound({ roundsDone: 1, maxRounds: 2, countBeforeLastRound: 3, countNow: 3 })).toEqual({
      action: "stop",
      reason: "no_progress",
    });
    expect(nextRepairRound({ roundsDone: 1, maxRounds: 2, countBeforeLastRound: 3, countNow: 4 })).toEqual({
      action: "stop",
      reason: "no_progress",
    });
    expect(nextRepairRound({ roundsDone: 2, maxRounds: 2, countBeforeLastRound: 3, countNow: 1 })).toEqual({
      action: "stop",
      reason: "exhausted",
    });
    expect(nextRepairRound({ roundsDone: 2, maxRounds: 2, countBeforeLastRound: 3, countNow: 0 })).toEqual({
      action: "stop",
      reason: "nothing_to_repair",
    });
  });

  it("can never run more than the maximum, whatever the findings do", () => {
    let rounds = 0;
    let before: number | null = null;
    let count = 100;
    for (;;) {
      const next = nextRepairRound({ roundsDone: rounds, maxRounds: 2, countBeforeLastRound: before, countNow: count });
      if (next.action === "stop") break;
      rounds = next.round;
      before = count;
      count -= 1; // always "progress"
    }
    expect(rounds).toBe(2);
  });
});

describe("ST-107 brief-promise check", () => {
  const coverage = [
    { point: "How trusses spread load", sectionIds: ["sec-1"] },
    { point: "Why triangles are rigid", sectionIds: ["sec-2", "sec-3"] },
    { point: "Famous truss bridges", sectionIds: ["sec-9"] },
  ];
  const base = {
    coverage,
    sceneSections: [
      { sceneId: "s1", sectionIds: ["sec-1"] },
      { sceneId: "s2", sectionIds: ["sec-3"] },
    ],
    measuredDurationSeconds: 190,
    targetDurationSeconds: 180,
    toleranceSeconds: 30,
    confirmed: { stylePackId: "systems", soundBed: "calm-desk" },
    pinned: { stylePackId: "systems", soundBed: "calm-desk" },
  };

  it("covers a point when any scene cites any of its sections", () => {
    const result = checkBriefPromises(base);
    expect(result.unmetCoverage.map((entry) => entry.point)).toEqual(["Famous truss bridges"]);
    expect(result).toMatchObject({ durationWithinBand: true, stylePackPinned: true, soundBedPinned: true });
  });

  it("checks the duration band inclusively and the pinned choices by identity", () => {
    expect(checkBriefPromises({ ...base, measuredDurationSeconds: 210 }).durationWithinBand).toBe(true);
    expect(checkBriefPromises({ ...base, measuredDurationSeconds: 211 }).durationWithinBand).toBe(false);
    expect(checkBriefPromises({ ...base, pinned: { stylePackId: "prism", soundBed: "calm-desk" } }).stylePackPinned).toBe(false);
    expect(checkBriefPromises({ ...base, pinned: { stylePackId: "systems", soundBed: "none" } }).soundBedPinned).toBe(false);
  });

  it("plans one coverage fix per unmet point on the scene nearest its sections", () => {
    const planned = planCoverageRepair({
      unmet: [{ point: "Famous truss bridges", sectionIds: ["sec-9"] }],
      sceneSections: [
        { sceneId: "s1", order: 1, sectionIds: ["sec-1"] },
        { sceneId: "s2", order: 2, sectionIds: ["sec-8"] },
      ],
      sectionOrder: new Map([
        ["sec-1", 0],
        ["sec-8", 7],
        ["sec-9", 8],
      ]),
      maxScenes: 4,
    });
    expect(planned).toEqual([
      expect.objectContaining({
        sceneId: "s2",
        code: "brief_coverage",
        instruction: expect.stringContaining("Famous truss bridges"),
      }),
    ]);
  });
});
