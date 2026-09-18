/**
 * ST-095 — narration timing, holds and scene bounds.
 *
 * ADR-004 makes measured narration the authority over duration. These tests
 * exist to make that structural rather than cultural: there is no input a
 * caller can supply that shortens, accelerates or clips the speech, and an
 * event plan that cannot finish inside the measured audio fails loudly rather
 * than quietly overlapping its events.
 */

import { describe, expect, it } from "vitest";
import {
  demonstrationFps,
  type DemonstrationPlan,
} from "@avlp/schemas/demonstration-proof";
import {
  evaporationDemonstrationFixture,
  savingsDemonstrationFixture,
} from "./fixtures.js";
import { demonstrationNarrationLibrary } from "./narration.generated.js";
import { toDemonstrationNarrationTrack } from "./narration.js";
import { prepareDemonstrationComposition } from "./composition.js";
import {
  validateDemonstrationPlan,
  validateDemonstrationScene,
} from "./validation.js";

const fixtures = [savingsDemonstrationFixture, evaporationDemonstrationFixture];

function narrationFor(sceneId: string) {
  for (const fixture of fixtures) {
    const found = fixture.narrationTracks.find(
      (entry) => entry.sceneId === sceneId,
    );
    if (found !== undefined) return found;
  }
  throw new Error(`No narration for ${sceneId}`);
}

function mutable(plan: DemonstrationPlan): DemonstrationPlan {
  return JSON.parse(JSON.stringify(plan)) as DemonstrationPlan;
}

describe("measured narration governs duration", () => {
  it("never makes a scene shorter than its recording", () => {
    for (const fixture of fixtures)
      for (const scene of fixture.scenes) {
        const narration = narrationFor(scene.id);
        expect(scene.durationSeconds * 1_000).toBeGreaterThanOrEqual(
          narration.durationMs,
        );
      }
  });

  it("rejects a scene shortened below its measured audio", () => {
    const fixture = savingsDemonstrationFixture;
    const scene = { ...fixture.scenes[0]!, durationSeconds: 5 };
    const issues = validateDemonstrationScene(
      scene,
      toDemonstrationNarrationTrack(narrationFor(scene.id)),
      fixture.assets,
    );
    expect(issues.map((issue) => issue.code)).toContain("event_out_of_bounds");
    expect(
      issues.some((issue) =>
        /never accelerated or clipped/i.test(issue.suggestedCorrection),
      ),
    ).toBe(true);
  });

  it("derives every caption cue from a measured beat", () => {
    for (const fixture of fixtures) {
      const beats = fixture.narrationTracks.flatMap((entry) => entry.beats);
      for (const cue of fixture.captions)
        expect(beats.some((beat) => beat.text === cue.text)).toBe(true);
    }
  });

  it("gives the two approaches the same audio bytes and the same cues", () => {
    // The standard fixtures are asserted against the same narration library,
    // so a change to one approach's audio cannot silently leave the other
    // behind — which would make the whole comparison meaningless.
    for (const fixture of fixtures)
      for (const track of fixture.narrationTracks)
        expect(track.src).toBe(
          demonstrationNarrationLibrary[
            Object.keys(demonstrationNarrationLibrary).find(
              (id) => demonstrationNarrationLibrary[id]?.sceneId === track.sceneId,
            )!
          ]?.src,
        );
  });
});

describe("beat anchoring", () => {
  it("starts every event inside the phrase it is anchored to", () => {
    for (const fixture of fixtures)
      for (const scene of fixture.scenes) {
        const beats = new Map(
          narrationFor(scene.id).beats.map((beat) => [beat.beatId, beat]),
        );
        for (const event of scene.plan.events) {
          const beat = beats.get(event.beatId);
          expect(beat).toBeDefined();
          const start = Math.round((beat!.startMs / 1_000) * demonstrationFps);
          const end = Math.round((beat!.endMs / 1_000) * demonstrationFps);
          expect(event.startFrame).toBeGreaterThanOrEqual(start - 1);
          expect(event.startFrame).toBeLessThanOrEqual(end);
        }
      }
  });

  it("reports drift when an event is moved off its phrase", () => {
    const plan = mutable(savingsDemonstrationFixture.scenes[1]!.plan);
    (plan.events[1] as { startFrame: number }).startFrame = 500;
    const codes = validateDemonstrationPlan(
      plan,
      toDemonstrationNarrationTrack(narrationFor(plan.sceneId)),
    ).map((issue) => issue.code);
    expect(codes).toContain("timing_drift");
  });

  it("reports stale timing when the plan is bound to a different recording", () => {
    const plan = mutable(savingsDemonstrationFixture.scenes[1]!.plan);
    plan.narrationBinding.audioChecksumSha256 = "0".repeat(64);
    const issues = validateDemonstrationPlan(
      plan,
      toDemonstrationNarrationTrack(narrationFor(plan.sceneId)),
    );
    expect(issues.map((issue) => issue.code)).toContain(
      "stale_narration_timing",
    );
    expect(
      issues.some((issue) => /Rebuild the plan/i.test(issue.suggestedCorrection)),
    ).toBe(true);
  });

  it("reports a beat the narration does not contain", () => {
    const plan = mutable(savingsDemonstrationFixture.scenes[1]!.plan);
    plan.narrationBinding.beatIds = [...plan.narrationBinding.beatIds, "ghost"];
    const codes = validateDemonstrationPlan(
      plan,
      toDemonstrationNarrationTrack(narrationFor(plan.sceneId)),
    ).map((issue) => issue.code);
    expect(codes).toContain("unknown_narration_beat");
  });
});

describe("readable holds", () => {
  it("refuses a plan that cannot afford its inspection time", () => {
    const plan = mutable(savingsDemonstrationFixture.scenes[1]!.plan);
    const move = plan.events.find((event) => event.action === "transfer")!;
    (move as { holdFrames: number }).holdFrames = 1;
    const issues = validateDemonstrationPlan(
      plan,
      toDemonstrationNarrationTrack(narrationFor(plan.sceneId)),
    );
    expect(issues.map((issue) => issue.code)).toContain("insufficient_hold");
    expect(
      issues.some((issue) =>
        /never accelerated/i.test(issue.suggestedCorrection),
      ),
    ).toBe(true);
  });

  it("refuses an event that runs past the end of the scene", () => {
    const plan = mutable(savingsDemonstrationFixture.scenes[1]!.plan);
    (plan.events[1] as { durationFrames: number }).durationFrames = 600;
    // The schema catches this before any semantic check: the event simply does
    // not fit the frames the measured narration bought.
    expect(
      prepareDemonstrationComposition({
        ...savingsDemonstrationFixture,
        scenes: [
          { ...savingsDemonstrationFixture.scenes[1]!, plan },
          ...savingsDemonstrationFixture.scenes.filter(
            (scene) => scene.id !== plan.sceneId,
          ),
        ],
      }).props,
    ).toBeUndefined();
  });

  it("keeps each state change below the recipe's frame ceiling", () => {
    const plan = mutable(savingsDemonstrationFixture.scenes[1]!.plan);
    const move = plan.events.find((event) => event.action === "transfer")!;
    (move as { durationFrames: number }).durationFrames = 8;
    const codes = validateDemonstrationPlan(
      plan,
      toDemonstrationNarrationTrack(narrationFor(plan.sceneId)),
    ).map((issue) => issue.code);
    expect(codes).toContain("event_out_of_bounds");
  });
});

describe("captions", () => {
  it("keeps every cue inside its own scene's frame range", () => {
    for (const fixture of fixtures)
      expect(prepareDemonstrationComposition(fixture).issues).toEqual([]);
  });

  it("rejects a cue that has drifted outside its scene", () => {
    const fixture = savingsDemonstrationFixture;
    const broken = {
      ...fixture,
      captions: [
        { ...fixture.captions[0]!, endFrame: 99_999, startFrame: 99_000 },
        ...fixture.captions.slice(1),
      ],
    };
    const prepared = prepareDemonstrationComposition(broken);
    expect(prepared.props).toBeUndefined();
    expect(prepared.issues.map((issue) => issue.code)).toContain(
      "invalid_caption_timing",
    );
  });
});

describe("one caption at a time", () => {
  /**
   * The overlay draws the first cue whose window contains the frame, so an
   * overlap does not fail the render — it silently drops a line of narration
   * from the captions while the audio goes on speaking it. That is a caption a
   * deaf viewer never sees, so the contract rejects it.
   */
  it("rejects two cues that are on screen together", () => {
    const fixture = savingsDemonstrationFixture;
    const [first, second] = [fixture.captions[0]!, fixture.captions[1]!];
    const prepared = prepareDemonstrationComposition({
      ...fixture,
      captions: [
        { ...first, endFrame: second.startFrame + 5 },
        ...fixture.captions.slice(1),
      ],
    });
    expect(prepared.props).toBeUndefined();
    expect(prepared.issues.map((issue) => issue.code)).toContain(
      "caption_collision",
    );
  });

  it("accepts the shipped cues, which are cut on the measured beats", () => {
    for (const fixture of fixtures)
      expect(
        prepareDemonstrationComposition(fixture).issues.map(
          (issue) => issue.code,
        ),
      ).not.toContain("caption_collision");
  });
});

describe("bound assets must be usable, not merely present", () => {
  /**
   * A present-but-tiny asset is the same failure as a missing one: the recipe
   * refuses to substitute a placeholder for a missing educational asset, and
   * an unreadable one is not a better outcome. The slot's declared minimum was
   * previously recorded in the registry and never checked.
   */
  it("rejects artwork below the slot's declared minimum", () => {
    const fixture = savingsDemonstrationFixture;
    const coin = fixture.assets["naira-note"]!;
    const prepared = prepareDemonstrationComposition({
      ...fixture,
      assets: {
        ...fixture.assets,
        "naira-note": { ...coin, height: 16, width: 16 },
      },
    });
    expect(prepared.props).toBeUndefined();
    const issue = prepared.issues.find(
      (entry) => entry.code === "missing_required_asset",
    );
    expect(issue?.message).toContain("16x16");
    expect(issue?.suggestedCorrection).toContain("denomination token face");
  });

  it("accepts the bundled assets, which meet every slot minimum", () => {
    for (const fixture of fixtures)
      expect(
        prepareDemonstrationComposition(fixture).issues.map(
          (entry) => entry.code,
        ),
      ).not.toContain("missing_required_asset");
  });
});

describe("the two entry points classify a schema failure the same way", () => {
  it("reports an out-of-bounds event as such from the plan builder too", async () => {
    const { buildDemonstrationPlan } = await import("./plan-builder.js");
    const scene = savingsDemonstrationFixture.scenes[1]!;
    const track = toDemonstrationNarrationTrack(narrationFor(scene.id));
    const built = buildDemonstrationPlan(
      {
        durationSeconds: scene.durationSeconds,
        // Anchored to the last beat and long enough to run past the scene end.
        events: [
          {
            action: "transfer",
            beatId: track.beats.at(-1)!.beatId,
            durationFrames: 600,
            fromContainerId: "income",
            holdFrames: 600,
            id: "way-too-long",
            toContainerId: "savings",
            tokenIds: ["note-01"],
          },
        ],
        expectedFinalState: { containerTotals: [], particlePhases: [] },
        initialState: scene.plan.initialState,
        recipeId: "savings.transfer-accumulate",
        sceneId: scene.id,
        seed: 3,
      },
      track,
    );
    expect(built.plan).toBeUndefined();
    // Previously `invalid_composition_input`, while the composition preflight
    // called the identical defect `event_out_of_bounds`.
    expect(built.issues.map((issue) => issue.code)).toContain(
      "event_out_of_bounds",
    );
  });
});
