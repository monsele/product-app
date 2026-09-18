/**
 * ST-095 — contract and validation tests.
 *
 * These cover the rejection side of the contract: the inputs a caller might
 * plausibly produce that must not become an animation. Each case names the
 * structured code it expects, because the code is what a client branches on —
 * a test that only asserted "it failed" would pass just as happily if every
 * failure collapsed into one unactionable category.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalDemonstrationJson,
  demonstrationPlanSchema,
  demonstrationRecipeVersion,
  type DemonstrationEvent,
  type DemonstrationPlan,
} from "@avlp/schemas/demonstration-proof";
import {
  buildDemonstrationPlan,
  profileInitialState,
  queryDemonstrationSupport,
} from "./plan-builder.js";
import { demonstrationRecipes, findDemonstrationRecipe } from "./registry.js";
import { validateDemonstrationPlan } from "./validation.js";
import {
  evaporationDemonstrationFixture,
  savingsDemonstrationFixture,
} from "./fixtures.js";
import { demonstrationNarrationTrack, toDemonstrationNarrationTrack } from "./narration.js";

const savingsTrack = demonstrationNarrationTrack("savings-transfer");

const savingsPlan = savingsDemonstrationFixture.scenes[1]!.plan;
const evaporationPlan = evaporationDemonstrationFixture.scenes[1]!.plan;

/** Deep-clones a plan so a mutation in one test cannot leak into another. */
function mutablePlan(plan: DemonstrationPlan): DemonstrationPlan {
  return JSON.parse(JSON.stringify(plan)) as DemonstrationPlan;
}

function codesFor(plan: DemonstrationPlan): readonly string[] {
  return validateDemonstrationPlan(plan, savingsTrack).map(
    (issue) => issue.code,
  );
}

describe("the shipped fixtures", () => {
  it("validate cleanly against their own narration", () => {
    for (const fixture of [
      savingsDemonstrationFixture,
      evaporationDemonstrationFixture,
    ])
      for (const scene of fixture.scenes) {
        const narration = toDemonstrationNarrationTrack(fixture.narrationTracks.find(
            (entry) => entry.sceneId === scene.id,
          )!);
        expect(validateDemonstrationPlan(scene.plan, narration)).toEqual([]);
      }
  });

  it("carry timing provenance that is a measurement, never an estimate", () => {
    for (const track of savingsDemonstrationFixture.narrationTracks)
      expect(track.timingProvenance.method).toBe("measured-phrase-boundaries");
  });

  it("bind every plan to the checksum of the audio it was built against", () => {
    for (const scene of savingsDemonstrationFixture.scenes) {
      const narration = savingsDemonstrationFixture.narrationTracks.find(
        (entry) => entry.sceneId === scene.id,
      );
      expect(scene.plan.narrationBinding.audioChecksumSha256).toBe(
        narration?.checksumSha256,
      );
    }
  });
});

describe("recipe and version resolution", () => {
  it("rejects an unregistered recipe rather than picking a nearby one", () => {
    const plan = mutablePlan(savingsPlan);
    (plan.recipe as { id: string }).id = "savings.transfer-accumulate-v2";
    expect(codesFor(plan)).toContain("unknown_recipe");
  });

  it("rejects a version this implementation does not provide", () => {
    const plan = mutablePlan(savingsPlan);
    (plan.recipe as { version: string }).version = "9.9.9";
    expect(codesFor(plan)).toContain("unsupported_recipe_version");
  });

  it("refuses an action the recipe does not implement", () => {
    const plan = mutablePlan(evaporationPlan);
    plan.events = [
      {
        action: "transfer",
        beatId: plan.events[0]!.beatId,
        durationFrames: 60,
        fromContainerId: "liquid",
        holdFrames: 30,
        id: "not-supported",
        startFrame: plan.events[0]!.startFrame,
        toContainerId: "vapour",
        tokenIds: ["drop-01"],
      } as DemonstrationEvent,
    ];
    const narration = toDemonstrationNarrationTrack(evaporationDemonstrationFixture.narrationTracks[1]!);
    const codes = validateDemonstrationPlan(plan, narration).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("unsupported_content");
  });
});

describe("object references and quantities", () => {
  it("rejects a transfer of a token that does not exist", () => {
    const plan = mutablePlan(savingsPlan);
    const move = plan.events.find((event) => event.action === "transfer")!;
    (move as { tokenIds: string[] }).tokenIds = ["note-99"];
    expect(codesFor(plan)).toContain("unknown_object_reference");
  });

  it("rejects a transfer out of a container the token is not in", () => {
    const plan = mutablePlan(savingsPlan);
    const move = plan.events.find((event) => event.action === "transfer")!;
    (move as { fromContainerId: string }).fromContainerId = "savings";
    (move as { toContainerId: string }).toContainerId = "income";
    expect(codesFor(plan)).toContain("source_unavailable");
  });

  it("rejects a non-integer or non-positive amount at the schema boundary", () => {
    for (const amount of [0, -100, 12.5, Number.NaN]) {
      const plan = mutablePlan(savingsPlan);
      const token = plan.initialState.objects.find(
        (object) => object.kind === "token",
      )!;
      (token as { amountMinor: number }).amountMinor = amount;
      expect(demonstrationPlanSchema.safeParse(plan).success).toBe(false);
    }
  });

  it("rejects a non-finite value before it can reach a frame", () => {
    const plan = mutablePlan(savingsPlan);
    (plan.events[0] as { startFrame: number }).startFrame = Number.POSITIVE_INFINITY;
    expect(demonstrationPlanSchema.safeParse(plan).success).toBe(false);
  });
});

describe("impossible transitions", () => {
  it("refuses a deposit that does not come out of a named origin", () => {
    const plan = mutablePlan(savingsDemonstrationFixture.scenes[2]!.plan);
    const deposit = plan.events.find((event) => event.action === "introduce")!;
    (deposit as { fromOriginId: string }).fromOriginId = "income";
    const narration = toDemonstrationNarrationTrack(savingsDemonstrationFixture.narrationTracks[2]!);
    const codes = validateDemonstrationPlan(plan, narration).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("impossible_transition");
  });

  it("refuses condensation under the evaporation recipe", () => {
    const plan = mutablePlan(evaporationPlan);
    const detach = plan.events.find((event) => event.action === "detach")!;
    (detach as { fromRegionId: string }).fromRegionId = "vapour";
    (detach as { toRegionId: string }).toRegionId = "liquid";
    const narration = toDemonstrationNarrationTrack(evaporationDemonstrationFixture.narrationTracks[1]!);
    const codes = validateDemonstrationPlan(plan, narration).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("impossible_transition");
  });

  it("refuses a dispersal that would pack particles tighter", () => {
    const plan = mutablePlan(evaporationDemonstrationFixture.scenes[2]!.plan);
    // The *second* dispersal, which follows one that already reached level 2:
    // asking for level 1 there would tighten the spread, which is not what the
    // action means.
    const spread = plan.events.filter(
      (event) => event.action === "disperse",
    )[1]!;
    (spread as { toDispersion: number }).toDispersion = 1;
    const narration = toDemonstrationNarrationTrack(evaporationDemonstrationFixture.narrationTracks[2]!);
    const codes = validateDemonstrationPlan(plan, narration).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("impossible_transition");
  });
});

describe("conflicting events", () => {
  it("refuses two state changes that grab the same object at once", () => {
    const plan = mutablePlan(savingsDemonstrationFixture.scenes[2]!.plan);
    const first = plan.events.find((event) => event.id === "wages-week-2")!;
    const second = plan.events.find((event) => event.id === "save-week-2")!;
    (second as { startFrame: number }).startFrame = first.startFrame + 1;
    const narration = toDemonstrationNarrationTrack(savingsDemonstrationFixture.narrationTracks[2]!);
    const codes = validateDemonstrationPlan(plan, narration).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("conflicting_events");
  });
});

describe("declared end state", () => {
  it("refuses a plan whose transfers do not produce the declared total", () => {
    const plan = mutablePlan(savingsPlan);
    plan.expectedFinalState.containerTotals = [
      { containerId: "savings", totalMinor: 999_999 },
    ];
    expect(codesFor(plan)).toContain("final_state_mismatch");
  });

  it("refuses a plan whose particle phases do not add up", () => {
    const plan = mutablePlan(evaporationPlan);
    plan.expectedFinalState.particlePhases = [
      { count: 1, phase: "vapour" },
      { count: 1, phase: "liquid" },
    ];
    const narration = toDemonstrationNarrationTrack(evaporationDemonstrationFixture.narrationTracks[1]!);
    const codes = validateDemonstrationPlan(plan, narration).map(
      (issue) => issue.code,
    );
    expect(codes).toContain("final_state_mismatch");
  });
});

describe("canonical serialisation", () => {
  it("sorts object keys but preserves event order", () => {
    const left = canonicalDemonstrationJson({ b: 1, a: [3, 2, 1] });
    expect(left).toBe('{"a":[3,2,1],"b":1}');
    expect(canonicalDemonstrationJson({ a: [3, 2, 1], b: 1 })).toBe(left);
  });

  it("refuses to hash a non-finite number", () => {
    expect(() =>
      canonicalDemonstrationJson({ amount: Number.POSITIVE_INFINITY }),
    ).toThrow(/Non-finite/);
  });
});

describe("the support query", () => {
  const profile = profileInitialState(savingsPlan.initialState, 18);

  it("accepts content whose structure the recipe animates", () => {
    const result = queryDemonstrationSupport(
      "savings.transfer-accumulate",
      profile,
    );
    expect(result).toMatchObject({ supported: true, reasons: [] });
  });

  it("does not infer support from a title keyword", () => {
    // The profile carries no title, narration or topic at all — the only way
    // to be supported is to have the objects the recipe moves.
    expect(Object.keys(profile)).toEqual([
      "durationSeconds",
      "objectKindCounts",
      "containerRoleCounts",
      "regionRoleCounts",
    ]);
  });

  it("returns actionable reasons rather than falling back", () => {
    const result = queryDemonstrationSupport("evaporation.surface-to-vapour", {
      ...profile,
      durationSeconds: 3,
    });
    expect(result.supported).toBe(false);
    expect(result.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining([
        "missing_object_kind",
        "missing_region_role",
        "scene_too_short",
      ]),
    );
    for (const reason of result.reasons)
      expect(reason.suggestedCorrection.length).toBeGreaterThan(20);
  });

  it("reports an unknown recipe without guessing", () => {
    const result = queryDemonstrationSupport("nope.at-all", profile);
    expect(result.supported).toBe(false);
    expect(result.reasons[0]?.code).toBe("unknown_recipe");
  });

  /**
   * The recipe lays out by role and has one place per role. Content carrying
   * two destinations would previously report as supported and then draw both
   * in the same rectangle — tokens stacked on each other while the readouts
   * went on stating the correct balances, which is the fluent-and-wrong clip
   * the whole contract exists to prevent.
   */
  it("refuses content with more containers of a role than it can place", () => {
    const result = queryDemonstrationSupport("savings.transfer-accumulate", {
      ...profile,
      containerRoleCounts: { ...profile.containerRoleCounts, destination: 2 },
    });
    expect(result.supported).toBe(false);
    const overflow = result.reasons.find(
      (reason) => reason.code === "too_many_for_recipe",
    );
    expect(overflow?.message).toContain("destination");
    expect(overflow?.message).toContain("declares 2");
  });

  it("refuses content with a role the recipe draws nowhere", () => {
    const result = queryDemonstrationSupport("savings.transfer-accumulate", {
      ...profile,
      regionRoleCounts: { "liquid-body": 1 },
    });
    expect(result.supported).toBe(false);
    expect(
      result.reasons.some(
        (reason) =>
          reason.code === "too_many_for_recipe" &&
          reason.suggestedCorrection.includes("draws no"),
      ),
    ).toBe(true);
  });

  it("reports an unsupported version", () => {
    const result = queryDemonstrationSupport(
      "savings.transfer-accumulate",
      profile,
      "0.9.0",
    );
    expect(result.reasons.map((reason) => reason.code)).toContain(
      "unsupported_recipe_version",
    );
  });
});

describe("the recipe catalogue", () => {
  it("declares a stable ID, version, inputs, assets and timing for each recipe", () => {
    expect(demonstrationRecipes).toHaveLength(2);
    for (const recipe of demonstrationRecipes) {
      expect(recipe.version).toBe(demonstrationRecipeVersion);
      expect(recipe.supportedActions.length).toBeGreaterThan(0);
      expect(recipe.assetSlots.length).toBeGreaterThan(0);
      expect(recipe.timing.minimumSceneSeconds).toBeGreaterThan(0);
      expect(recipe.subjectRules.length).toBeGreaterThan(0);
      for (const slot of recipe.assetSlots)
        expect(slot.expects.length).toBeGreaterThan(10);
    }
  });

  it("finds a recipe by ID and nothing by a near miss", () => {
    expect(findDemonstrationRecipe("savings.transfer-accumulate")).toBeDefined();
    expect(findDemonstrationRecipe("savings.transfer")).toBeUndefined();
  });
});

describe("the plan builder", () => {
  it("reports a beat the narration does not contain", () => {
    const result = buildDemonstrationPlan(
      {
        durationSeconds: 18,
        events: [
          {
            action: "emphasise",
            beatId: "not-a-beat",
            durationFrames: 30,
            holdFrames: 24,
            id: "e1",
            objectIds: ["note-01"],
          },
        ],
        expectedFinalState: { containerTotals: [], particlePhases: [] },
        initialState: savingsPlan.initialState,
        recipeId: "savings.transfer-accumulate",
        sceneId: savingsPlan.sceneId,
        seed: 1,
      },
      savingsTrack,
    );
    expect(result.plan).toBeUndefined();
    expect(result.issues[0]?.code).toBe("unknown_narration_beat");
  });

  it("derives event frames from the measured beat rather than the author", () => {
    const beat = savingsTrack.beats[1]!;
    const result = buildDemonstrationPlan(
      {
        durationSeconds: 18,
        events: [
          {
            action: "transfer",
            beatId: beat.beatId,
            durationFrames: 96,
            fromContainerId: "income",
            holdFrames: 48,
            id: "move",
            toContainerId: "savings",
            tokenIds: ["note-01", "note-02"],
          },
        ],
        expectedFinalState: {
          containerTotals: [
            { containerId: "income", totalMinor: 800_000 },
            { containerId: "savings", totalMinor: 200_000 },
          ],
          particlePhases: [],
        },
        initialState: savingsPlan.initialState,
        recipeId: "savings.transfer-accumulate",
        sceneId: savingsPlan.sceneId,
        seed: 1,
      },
      savingsTrack,
    );
    expect(result.issues).toEqual([]);
    expect(result.plan?.events[0]?.startFrame).toBe(
      Math.round((beat.startMs / 1_000) * 30),
    );
  });
});

describe("references name the right kind of object", () => {
  /**
   * Naming a real object of the wrong kind is a different mistake from naming
   * one that does not exist, and it has a different correction: the author has
   * declared the object, they have just pointed the wrong field at it. Both
   * used to report as `unknown_object_reference`, which told them to declare
   * something that was already there.
   */
  it("distinguishes a wrong-kind reference from a missing one", () => {
    const plan = mutablePlan(savingsPlan);
    const transfer = plan.events.find((event) => event.action === "transfer");
    if (transfer === undefined || transfer.action !== "transfer")
      throw new Error("fixture has no transfer");
    // "income" exists — it is a container, not a token.
    transfer.tokenIds = ["income"];
    const issues = validateDemonstrationPlan(plan, savingsTrack);
    const mismatch = issues.find(
      (issue) => issue.code === "object_kind_mismatch",
    );
    expect(mismatch?.message).toContain("income is a container");
    expect(issues.map((issue) => issue.code)).not.toContain(
      "unknown_object_reference",
    );
  });

  it("still reports a genuinely missing object as unknown", () => {
    const plan = mutablePlan(savingsPlan);
    const transfer = plan.events.find((event) => event.action === "transfer");
    if (transfer === undefined || transfer.action !== "transfer")
      throw new Error("fixture has no transfer");
    transfer.tokenIds = ["note-that-does-not-exist"];
    expect(codesFor(plan)).toContain("unknown_object_reference");
  });
});

describe("the stage has a fixed number of places", () => {
  it("refuses a plan with two containers in the same role", () => {
    const plan = mutablePlan(savingsPlan);
    plan.initialState.objects.push({
      id: "second-pot",
      kind: "container",
      label: "Another savings pot",
      role: "destination",
    });
    const issues = validateDemonstrationPlan(plan, savingsTrack);
    const overflow = issues.find(
      (issue) =>
        issue.code === "unsupported_content" &&
        issue.message.includes("destination"),
    );
    expect(overflow?.message).toContain("declares 2");
    expect(overflow?.suggestedCorrection).toMatch(/will not improvise/);
  });

  it("refuses a region role the savings recipe draws nowhere", () => {
    const plan = mutablePlan(savingsPlan);
    plan.initialState.objects.push({
      id: "stray-region",
      kind: "region",
      label: "Somewhere else",
      role: "liquid-body",
    });
    expect(
      validateDemonstrationPlan(plan, savingsTrack).some(
        (issue) =>
          issue.code === "unsupported_content" &&
          issue.suggestedCorrection.includes("draws no"),
      ),
    ).toBe(true);
  });
});
