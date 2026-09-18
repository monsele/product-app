/**
 * ST-095 — the ST-096 integration contract, exercised by an example consumer.
 *
 * The consumer below is written the way ST-096's selector will have to be
 * written: it starts from a tenant-owned record of its own shape, asks whether
 * a recipe can explain it, builds a plan, and renders through the shared
 * composition — without importing a fixture, reaching into a recipe, or
 * reimplementing any of the runtime.
 *
 * If this file ever needs to import from `./fixtures.js` to do its job, the
 * contract has a hole in it, and that is the point of writing it this way.
 */

import { describe, expect, it } from "vitest";
import type {
  DemonstrationCompositionProps,
  DemonstrationInitialState,
} from "@avlp/schemas/demonstration-proof";
import { demonstrationNarrationTrack } from "./narration.js";
import {
  buildDemonstrationPlan,
  listDemonstrationRecipes,
  profileInitialState,
  queryDemonstrationSupport,
  type DemonstrationEventDraft,
} from "./plan-builder.js";
import {
  demonstrationDurationInFrames,
  demonstrationTimeline,
  prepareDemonstrationComposition,
} from "./composition.js";
import {
  compileDemonstrationPlan,
  evaluateDemonstrationState,
} from "./state.js";
import { demonstrationAssetLibrary } from "./assets.generated.js";

/** A stand-in for a tenant-owned record: not this package's shape. */
type TenantLessonRecord = Readonly<{
  lessonSceneId: string;
  headline: string;
  narrationTrackId: string;
  moneyModel: DemonstrationInitialState;
  moves: readonly DemonstrationEventDraft[];
  declaredTotals: readonly Readonly<{
    containerId: string;
    totalMinor: number;
  }>[];
}>;

const narration = demonstrationNarrationTrack;

/**
 * The example consumer.
 *
 * Six steps, each one a public function of this package: query support, build
 * a plan, get the reasons back if it fails, assemble composition props, check
 * they are renderable, and read the identity. That is the whole integration
 * surface.
 */
function adaptTenantRecord(
  record: TenantLessonRecord,
  recipeId: "savings.transfer-accumulate",
):
  | Readonly<{ ok: true; props: DemonstrationCompositionProps }>
  | Readonly<{ ok: false; reasons: readonly string[] }> {
  const track = narration(record.narrationTrackId);
  const durationSeconds = Math.ceil(track.durationMs / 1_000) + 1;

  const support = queryDemonstrationSupport(
    recipeId,
    profileInitialState(record.moneyModel, durationSeconds),
  );
  if (!support.supported)
    return {
      ok: false,
      reasons: support.reasons.map(
        (reason) => `${reason.code}: ${reason.suggestedCorrection}`,
      ),
    };

  const built = buildDemonstrationPlan(
    {
      durationSeconds,
      events: record.moves,
      expectedFinalState: {
        containerTotals: record.declaredTotals.map((entry) => ({ ...entry })),
        particlePhases: [],
      },
      initialState: record.moneyModel,
      recipeId,
      sceneId: record.lessonSceneId,
      seed: 7,
    },
    track,
  );
  if (built.plan === undefined)
    return {
      ok: false,
      reasons: built.issues.map(
        (issue) => `${issue.code}: ${issue.suggestedCorrection}`,
      ),
    };

  const props: unknown = {
    approach: "demonstration",
    assets: {
      "naira-note": demonstrationAssetLibrary["naira-note"],
      "savings-jar": demonstrationAssetLibrary["savings-jar"],
    },
    captions: track.beats.map((beat) => ({
      endFrame: Math.round((beat.endMs / 1_000) * 30),
      sceneId: record.lessonSceneId,
      startFrame: Math.round((beat.startMs / 1_000) * 30),
      text: beat.text,
    })),
    fixtureId: "tenant-example",
    narrationTracks: [track],
    scenes: [
      {
        assetBySlot: { coin: "naira-note", "savings-jar": "savings-jar" },
        durationSeconds,
        id: record.lessonSceneId,
        narration: track.beats.map((beat) => beat.text).join(" "),
        order: 1,
        plan: built.plan,
        title: record.headline,
      },
    ],
  };

  const prepared = prepareDemonstrationComposition(props);
  return prepared.props === undefined
    ? {
        ok: false,
        reasons: prepared.issues.map(
          (issue) => `${issue.code}: ${issue.suggestedCorrection}`,
        ),
      }
    : { ok: true, props: prepared.props };
}

const track = narration("savings-transfer");
const sceneId = track.sceneId;

const workingModel: DemonstrationInitialState = {
  objects: [
    { id: "income", kind: "container", label: "Income", role: "source" },
    { id: "savings", kind: "container", label: "Savings", role: "destination" },
    ...Array.from({ length: 6 }, (_unused, index) => ({
      amountMinor: 100_000,
      containerId: "income",
      id: `cash-${index + 1}`,
      kind: "token" as const,
      label: `₦1,000 note ${index + 1}`,
      unit: "NGN-minor" as const,
    })),
  ],
  readouts: [
    {
      containerId: "income",
      display: "balance",
      id: "income-balance",
      kind: "readout",
      label: "Income",
    },
  ],
};

const workingRecord: TenantLessonRecord = {
  declaredTotals: [
    { containerId: "income", totalMinor: 400_000 },
    { containerId: "savings", totalMinor: 200_000 },
  ],
  headline: "Two notes into savings",
  lessonSceneId: sceneId,
  moneyModel: workingModel,
  moves: [
    {
      action: "transfer",
      beatId: "move",
      durationFrames: 90,
      fromContainerId: "income",
      holdFrames: 45,
      id: "move-two",
      toContainerId: "savings",
      tokenIds: ["cash-1", "cash-2"],
    },
  ],
  narrationTrackId: "savings-transfer",
};

describe("the ST-096 integration contract", () => {
  it("adapts a tenant-shaped record end to end without touching fixtures", () => {
    const result = adaptTenantRecord(
      workingRecord,
      "savings.transfer-accumulate",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(demonstrationTimeline(result.props.scenes)).toHaveLength(1);
    expect(demonstrationDurationInFrames(result.props.scenes)).toBeGreaterThan(0);
  });

  it("renders the same resolved plan without recomputing recipe selection", () => {
    const result = adaptTenantRecord(
      workingRecord,
      "savings.transfer-accumulate",
    );
    if (!result.ok) throw new Error("expected a supported record");
    const plan = result.props.scenes[0]!.plan;
    const compiled = compileDemonstrationPlan(plan);
    const final = evaluateDemonstrationState(
      compiled,
      plan.durationInFrames - 1,
    );
    expect(final.ledger.settledByContainer.savings).toBe(200_000);
    expect(final.ledger.settledByContainer.income).toBe(400_000);
  });

  it("returns reasons, never fallback output, for unsupported content", () => {
    const result = adaptTenantRecord(
      {
        ...workingRecord,
        declaredTotals: [],
        moneyModel: {
          objects: [
            { id: "income", kind: "container", label: "Income", role: "source" },
          ],
          readouts: [],
        },
        moves: [],
      },
      "savings.transfer-accumulate",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.length).toBeGreaterThan(0);
    for (const reason of result.reasons)
      expect(reason).toMatch(/^[a-z_]+: .{20,}/);
  });

  it("returns reasons when the declared arithmetic does not hold", () => {
    const result = adaptTenantRecord(
      {
        ...workingRecord,
        declaredTotals: [{ containerId: "savings", totalMinor: 500_000 }],
      },
      "savings.transfer-accumulate",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasons.join(" ")).toMatch(/final_state_mismatch/);
  });

  it("publishes a catalogue a selector can render without importing a recipe", () => {
    const catalogue = listDemonstrationRecipes();
    expect(catalogue.length).toBeGreaterThan(0);
    for (const recipe of catalogue) {
      expect(typeof recipe.id).toBe("string");
      expect(typeof recipe.version).toBe("string");
      expect(recipe.title.length).toBeGreaterThan(0);
      expect(recipe.description.length).toBeGreaterThan(40);
      expect(recipe.assetSlots.length).toBeGreaterThan(0);
      expect(recipe.timing.minimumSceneSeconds).toBeGreaterThan(0);
    }
  });
});

describe("the standard equivalents", () => {
  it("pass the production scene validator, as any real lesson must", async () => {
    // Imported lazily so this suite's main contract tests stay free of fixture
    // imports; the standard side is the one place they are unavoidable,
    // because the claim under test is about those specific fixtures.
    const { validateScene } = await import("../scene-registry.js");
    const { savingsStandardFixture, evaporationStandardFixture } = await import(
      "./fixtures.js"
    );
    for (const fixture of [savingsStandardFixture, evaporationStandardFixture])
      for (const scene of fixture.props.lesson.scenes)
        expect({
          fixture: fixture.fixtureId,
          issues: validateScene(scene),
          template: scene.template,
        }).toEqual({
          fixture: fixture.fixtureId,
          issues: [],
          template: scene.template,
        });
  });

  it("share every narration recording and caption cue with the demonstration", async () => {
    const {
      savingsStandardFixture,
      savingsDemonstrationFixture,
      evaporationStandardFixture,
      evaporationDemonstrationFixture,
    } = await import("./fixtures.js");
    for (const [standard, demonstration] of [
      [savingsStandardFixture, savingsDemonstrationFixture],
      [evaporationStandardFixture, evaporationDemonstrationFixture],
    ] as const) {
      expect(standard.props.captions).toEqual(
        demonstration.captions.map((cue) => ({ ...cue })),
      );
      expect(
        standard.props.narrationTracks.map((entry) =>
          entry.kind === "browser-audio" ? entry.src : null,
        ),
      ).toEqual(demonstration.narrationTracks.map((entry) => entry.src));
      expect(
        standard.props.lesson.scenes.map((scene) => [
          scene.id,
          scene.durationSeconds,
        ]),
      ).toEqual(
        demonstration.scenes.map((scene) => [scene.id, scene.durationSeconds]),
      );
    }
  });
});
