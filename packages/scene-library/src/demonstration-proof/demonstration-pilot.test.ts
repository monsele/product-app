/**
 * ST-096 — the registered pilot bindings, and what they promise the API.
 *
 * The API's eligibility check, its variant builder and its seeding path all
 * rest on three claims made in `pilot-bindings.ts`. Each is asserted here
 * rather than trusted:
 *
 * 1. Rebuilding a plan from the registered narration reproduces the plan
 *    ST-095 proved — so "we rebuild rather than copy" costs nothing in
 *    fidelity, and a drifted rebuild would fail loudly.
 * 2. A lesson is matched by its stable scene IDs, never by its title.
 * 3. Narration that is not the registered recording produces actionable
 *    issues and no plan, never a plan timed to audio the lesson does not have.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalDemonstrationJson,
  type DemonstrationNarrationTrack,
} from "@avlp/schemas/demonstration-proof";
import {
  buildDemonstrationPilotPlans,
  demonstrationBindingVersion,
  demonstrationPilotBindings,
  findDemonstrationPilotBinding,
  resolveDemonstrationPilotBinding,
} from "./pilot-bindings.js";
import { demonstrationSubjects } from "./fixtures.js";
import { demonstrationNarrationTrack } from "./narration.js";

/** The scene IDs a seeded lesson would mint, in the binding's scene order. */
function lessonSceneIds(
  binding: (typeof demonstrationPilotBindings)[number],
): string[] {
  return binding.scenes.map((scene) => scene.sceneId);
}

function registeredNarration(
  binding: (typeof demonstrationPilotBindings)[number],
  sceneIds: readonly string[] = lessonSceneIds(binding),
): Record<string, DemonstrationNarrationTrack> {
  return Object.fromEntries(
    binding.scenes.map((scene, index) => [
      sceneIds[index]!,
      demonstrationNarrationTrack(scene.narrationTrackId),
    ]),
  );
}

/** The ordered narration checksums a lesson presents for matching. */
function narrationChecksums(
  binding: (typeof demonstrationPilotBindings)[number],
): string[] {
  return binding.scenes.map((scene) => scene.narrationChecksumSha256);
}

describe("the registered pilot bindings", () => {
  it("registers both curated subjects with their assets and standard equivalents", () => {
    expect(demonstrationPilotBindings.map((binding) => binding.subject)).toEqual(
      ["savings", "evaporation"],
    );
    for (const binding of demonstrationPilotBindings) {
      expect(binding.bindingVersion).toBe(demonstrationBindingVersion);
      expect(binding.scenes.length).toBeGreaterThan(0);
      expect(binding.assets.length).toBeGreaterThan(0);
      expect(binding.standardScenes).toHaveLength(binding.scenes.length);
      expect(binding.facts.length).toBeGreaterThan(0);
      for (const asset of binding.assets) {
        expect(asset.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(asset.bytes).toBeGreaterThan(0);
        expect(asset.provenance.length).toBeGreaterThan(20);
      }
    }
  });

  it("keeps ST-095's scene IDs, so a seeded lesson inherits its timing identity", () => {
    for (const binding of demonstrationPilotBindings) {
      const fixture =
        demonstrationSubjects[binding.subject as "savings" | "evaporation"];
      expect(binding.scenes.map((scene) => scene.sceneId)).toEqual(
        fixture.demonstration.scenes.map((scene) => scene.id),
      );
      expect(binding.scenes.map((scene) => scene.durationSeconds)).toEqual(
        fixture.standard.props.lesson.scenes.map(
          (scene) => scene.durationSeconds,
        ),
      );
    }
  });

  it("rebuilds the exact plan ST-095 proved, rather than copying one", () => {
    for (const binding of demonstrationPilotBindings) {
      const built = buildDemonstrationPilotPlans(
        binding,
        lessonSceneIds(binding),
        registeredNarration(binding),
      );
      expect(built.issues).toEqual([]);
      expect(built.plans).toHaveLength(binding.scenes.length);
      const fixture =
        demonstrationSubjects[binding.subject as "savings" | "evaporation"];
      for (const [index, entry] of (built.plans ?? []).entries())
        expect(canonicalDemonstrationJson(entry.plan)).toBe(
          canonicalDemonstrationJson(
            fixture.demonstration.scenes[index]!.plan,
          ),
        );
    }
  });
});

describe("resolving a lesson to a binding", () => {
  it("matches on the ordered narration recordings, not on scene IDs", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    expect(
      resolveDemonstrationPilotBinding(narrationChecksums(savings))?.subject,
    ).toBe("savings");
    // Scene IDs are minted per project, so they must not be what decides this.
    expect(
      resolveDemonstrationPilotBinding(lessonSceneIds(savings)),
    ).toBeUndefined();
  });

  it("refuses a reordered, truncated or extended lesson", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    const sums = narrationChecksums(savings);
    expect(resolveDemonstrationPilotBinding([...sums].reverse())).toBeUndefined();
    expect(resolveDemonstrationPilotBinding(sums.slice(1))).toBeUndefined();
    expect(
      resolveDemonstrationPilotBinding([...sums, sums[0]!]),
    ).toBeUndefined();
  });

  it("is not a title or subject keyword match", () => {
    const evaporation = findDemonstrationPilotBinding("evaporation")!;
    expect(
      resolveDemonstrationPilotBinding(narrationChecksums(evaporation))
        ?.subject,
    ).toBe("evaporation");
    expect(resolveDemonstrationPilotBinding([])).toBeUndefined();
    expect(findDemonstrationPilotBinding("Savings")).toBeUndefined();
  });

  it("keeps the two subjects distinct", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    const evaporation = findDemonstrationPilotBinding("evaporation")!;
    expect(narrationChecksums(savings)).not.toEqual(
      narrationChecksums(evaporation),
    );
  });
});

describe("building against narration the lesson does not have", () => {
  it("returns actionable issues and no plan when a scene's audio is missing", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    const narration = registeredNarration(savings);
    delete narration[savings.scenes[1]!.sceneId];
    const built = buildDemonstrationPilotPlans(
      savings,
      lessonSceneIds(savings),
      narration,
    );
    expect(built.plans).toBeUndefined();
    expect(built.issues.map((issue) => issue.code)).toContain(
      "missing_narration_track",
    );
    for (const issue of built.issues)
      expect(issue.suggestedCorrection.length).toBeGreaterThan(20);
  });

  it("refuses narration whose beats no longer carry the authored anchors", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    const narration = registeredNarration(savings);
    const first = savings.scenes[0]!;
    const original = narration[first.sceneId]!;
    narration[first.sceneId] = {
      ...original,
      beats: original.beats.map((beat, index) => ({
        ...beat,
        beatId: `renamed-${index}`,
      })),
    };
    const built = buildDemonstrationPilotPlans(
      savings,
      lessonSceneIds(savings),
      narration,
    );
    expect(built.plans).toBeUndefined();
    expect(built.issues.map((issue) => issue.code)).toContain(
      "unknown_narration_beat",
    );
    expect(
      built.issues.every((issue) => issue.sceneId === first.sceneId),
    ).toBe(true);
  });

  it("refuses a recording whose beats no longer fit the authored scene", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    const narration = registeredNarration(savings);
    const first = savings.scenes[0]!;
    const original = narration[first.sceneId]!;
    // A longer read of the same words. ADR-004 makes the recording the
    // authority, so the honest outcome is a refusal naming the conflict, not
    // an animation quietly squeezed into the old scene bound.
    const shift = first.durationSeconds * 1_000;
    narration[first.sceneId] = {
      ...original,
      durationMs: original.durationMs + shift,
      beats: original.beats.map((beat) => ({
        ...beat,
        endMs: beat.endMs + shift,
        startMs: beat.startMs + shift,
      })),
    };
    const built = buildDemonstrationPilotPlans(
      savings,
      lessonSceneIds(savings),
      narration,
    );
    expect(built.plans).toBeUndefined();
    expect(built.issues.length).toBeGreaterThan(0);
    for (const issue of built.issues)
      expect(issue.suggestedCorrection.length).toBeGreaterThan(20);
  });

  it("stamps every plan with the checksum of the audio it was timed to", () => {
    // The stored plan's narration binding is what later makes a swapped
    // recording detectable as stale rather than merely mistimed. A plan can
    // therefore never claim provenance it does not have.
    for (const binding of demonstrationPilotBindings) {
      const narration = registeredNarration(binding);
      const built = buildDemonstrationPilotPlans(
        binding,
        lessonSceneIds(binding),
        narration,
      );
      for (const entry of built.plans ?? [])
        expect(entry.plan.narrationBinding.audioChecksumSha256).toBe(
          narration[entry.sceneId]!.checksumSha256,
        );
    }
  });
});

describe("a lesson whose scene count does not match", () => {
  it("is refused before any plan is built", () => {
    const savings = findDemonstrationPilotBinding("savings")!;
    const built = buildDemonstrationPilotPlans(
      savings,
      lessonSceneIds(savings).slice(1),
      registeredNarration(savings),
    );
    expect(built.plans).toBeUndefined();
    expect(built.issues.map((issue) => issue.code)).toEqual([
      "scene_count_mismatch",
    ]);
  });
});
