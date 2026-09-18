/**
 * ST-094 — proof contract, resolver, validation, fixture and manifest tests.
 *
 * These run in plain Node. Actual wrapped-text measurement needs a browser with
 * the pinned fonts loaded and lives in `style-proof-layout.test.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  canonicalStyleProofJson,
  styleProofCompositionPropsSchema,
  styleProofPackVersion,
  styleProofTreatmentIdValues,
} from "@avlp/schemas/style-proof";
import { styleProofPacks } from "@avlp/design-system/style-proof-tokens";
import {
  buildStyleProofManifest,
  hashStyleProofInput,
} from "./manifest.js";
import {
  conductionDurationInFrames,
  conductionFactInventory,
  conductionProofFixtures,
  conductionScenes,
  denseComparisonBoundaryFixture,
  extendedSceneBoundaryFixture,
  getStyleProofIntervals,
  leafProofFixtures,
  leafScenes,
  longHeadingBoundaryFixture,
  mismatchedTreatmentFixture,
  missingAssetBoundaryFixture,
  objectSettle,
  portraitMediaBoundaryFixture,
  prepareStyleProofComposition,
  resolveStyleProofScenes,
  sequentialEmphasisIndex,
  shortSceneBoundaryFixture,
  styleProofAssetLibrary,
  styleProofDefaultMotion,
  styleProofDurationInFrames,
  styleProofTimeline,
  styleProofTreatmentComponents,
  styleProofTreatments,
  undersizedMediaBoundaryFixture,
  validateStyleProofScenes,
} from "./index.js";

const packIds = ["essential", "editorial", "everyday"] as const;

describe("proof pack and treatment registration", () => {
  it("registers exactly nine treatments, three per pack and one per scene type", () => {
    expect(styleProofTreatments).toHaveLength(9);
    expect(new Set(styleProofTreatments.map((t) => t.id)).size).toBe(9);
    for (const packId of packIds) {
      const forPack = styleProofTreatments.filter((t) => t.packId === packId);
      expect(forPack.map((t) => t.sceneType).sort()).toEqual([
        "comparison",
        "definition",
        "hook",
      ]);
    }
    expect([...styleProofTreatmentIdValues].sort()).toEqual(
      styleProofTreatments.map((t) => t.id).sort(),
    );
  });

  it("gives every registered treatment a component", () => {
    for (const treatment of styleProofTreatments)
      expect(typeof styleProofTreatmentComponents[treatment.id]).toBe(
        "function",
      );
  });

  it("declares one distinct motion signature per pack", () => {
    const signatures = packIds.map((packId) => styleProofPacks[packId].motionSignature);
    expect(new Set(signatures).size).toBe(3);
    // Each treatment inherits its pack's declared signature, so a muted-excerpt
    // reviewer is judging the pack, not a per-scene accident.
    for (const treatment of styleProofTreatments)
      expect(treatment.motionSignature).toBe(
        styleProofPacks[treatment.packId].motionSignature,
      );
  });
});

describe("resolver — valid selection", () => {
  it.each(packIds)("resolves all three %s scenes with their assets", (packId) => {
    const fixture = conductionProofFixtures[packId];
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      fixture.selection,
      fixture.assets,
    );
    expect(resolution.issues).toEqual([]);
    expect(resolution.scenes).toHaveLength(3);
    for (const resolved of resolution.scenes) {
      expect(resolved.treatment.packId).toBe(packId);
      expect(resolved.treatment.sceneType).toBe(resolved.scene.template);
      for (const slot of resolved.treatment.assetSlots)
        if (slot.required) expect(resolved.assets[slot.slot]).toBeDefined();
    }
  });

  it("never selects a newer pack version for an unknown requested version", () => {
    const fixture = conductionProofFixtures.essential;
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      {
        ...fixture.selection,
        pack: { ...fixture.selection.pack, version: "9.9.9" as never },
      },
      fixture.assets,
    );
    expect(resolution.scenes).toEqual([]);
    expect(resolution.issues.map((issue) => issue.code)).toEqual([
      "unsupported_pack_version",
    ]);
    expect(resolution.issues[0]?.suggestedCorrection).toContain(
      "never selected automatically",
    );
  });

  it("rejects an unknown treatment ID rather than guessing a nearby one", () => {
    const fixture = conductionProofFixtures.essential;
    const sceneId = conductionScenes[0]!.id;
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      {
        ...fixture.selection,
        sceneDesigns: {
          ...fixture.selection.sceneDesigns,
          [sceneId]: {
            ...fixture.selection.sceneDesigns[sceneId]!,
            treatmentId: "essential.hook.made-up" as never,
          },
        },
      },
      fixture.assets,
    );
    expect(
      resolution.issues.some((issue) => issue.code === "unknown_treatment"),
    ).toBe(true);
    expect(resolution.scenes.map((scene) => scene.scene.id)).not.toContain(
      sceneId,
    );
  });

  it("rejects an unsupported treatment version", () => {
    const fixture = conductionProofFixtures.everyday;
    const sceneId = conductionScenes[1]!.id;
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      {
        ...fixture.selection,
        sceneDesigns: {
          ...fixture.selection.sceneDesigns,
          [sceneId]: {
            ...fixture.selection.sceneDesigns[sceneId]!,
            treatmentVersion: "0.9.0" as never,
          },
        },
      },
      fixture.assets,
    );
    expect(resolution.issues.map((issue) => issue.code)).toContain(
      "unsupported_treatment_version",
    );
  });

  it("rejects a cross-type treatment/scene mismatch", () => {
    const prepared = prepareStyleProofComposition(mismatchedTreatmentFixture);
    expect(prepared.props).toBeUndefined();
    expect(prepared.issues.map((issue) => issue.code)).toContain(
      "treatment_scene_type_mismatch",
    );
  });

  it("rejects a treatment borrowed from another pack", () => {
    const fixture = conductionProofFixtures.essential;
    const sceneId = conductionScenes[0]!.id;
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      {
        ...fixture.selection,
        sceneDesigns: {
          ...fixture.selection.sceneDesigns,
          [sceneId]: {
            ...fixture.selection.sceneDesigns[sceneId]!,
            treatmentId: "editorial.hook.headline-beside-frame",
          },
        },
      },
      fixture.assets,
    );
    expect(resolution.issues[0]?.message).toContain("editorial pack");
  });

  it("blocks a missing required asset with an actionable correction", () => {
    const prepared = prepareStyleProofComposition(missingAssetBoundaryFixture);
    expect(prepared.props).toBeUndefined();
    const issue = prepared.issues.find(
      (entry) => entry.code === "missing_required_asset",
    );
    expect(issue?.fieldPath).toContain("assetBySlot.evidence");
    expect(issue?.suggestedCorrection).toContain("raster");
  });

  it("blocks media below the slot's minimum useful resolution", () => {
    const prepared = prepareStyleProofComposition(
      undersizedMediaBoundaryFixture,
    );
    expect(prepared.props).toBeUndefined();
    expect(prepared.issues.map((issue) => issue.code)).toContain(
      "asset_resolution_too_low",
    );
  });

  it("rejects a vector asset bound to a raster-only evidence slot", () => {
    const fixture = conductionProofFixtures.editorial;
    const sceneId = conductionScenes[0]!.id;
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      {
        ...fixture.selection,
        sceneDesigns: {
          ...fixture.selection.sceneDesigns,
          [sceneId]: {
            ...fixture.selection.sceneDesigns[sceneId]!,
            assetBySlot: { evidence: "essential-subject-metal" },
          },
        },
      },
      { ...fixture.assets, "essential-subject-metal": styleProofAssetLibrary["essential-subject-metal"]! },
    );
    expect(resolution.issues.map((issue) => issue.code)).toContain(
      "unsupported_asset_kind",
    );
  });

  it("never returns a scene it reported an issue for", () => {
    // The invariant that lets `StyleProofStill` and the composition render
    // everything in `scenes` without re-reading `issues`.
    const fixture = conductionProofFixtures.essential;
    const sceneId = conductionScenes[0]!.id;
    const design = fixture.selection.sceneDesigns[sceneId]!;
    const cases = [
      { ...design, assetBySlot: { ...design.assetBySlot, "rogue-slot": "essential-subject-wood" } },
      { ...design, assetBySlot: {} },
      { ...design, treatmentId: "essential.comparison.sequential-emphasis" as const },
    ];
    for (const sceneDesign of cases) {
      const resolution = resolveStyleProofScenes(
        fixture.scenes,
        {
          ...fixture.selection,
          sceneDesigns: { ...fixture.selection.sceneDesigns, [sceneId]: sceneDesign },
        },
        fixture.assets,
      );
      expect(resolution.issues.length).toBeGreaterThan(0);
      const flagged = new Set(resolution.issues.map((issue) => issue.sceneId));
      for (const resolved of resolution.scenes)
        expect(flagged.has(resolved.scene.id)).toBe(false);
    }
  });

  it("rejects an asset bound to a slot the treatment does not declare", () => {
    const fixture = conductionProofFixtures.essential;
    const sceneId = conductionScenes[0]!.id;
    const resolution = resolveStyleProofScenes(
      fixture.scenes,
      {
        ...fixture.selection,
        sceneDesigns: {
          ...fixture.selection.sceneDesigns,
          [sceneId]: {
            ...fixture.selection.sceneDesigns[sceneId]!,
            assetBySlot: {
              ...fixture.selection.sceneDesigns[sceneId]!.assetBySlot,
              "background-layer": "essential-subject-wood",
            },
          },
        },
      },
      fixture.assets,
    );
    expect(resolution.issues.map((issue) => issue.code)).toContain(
      "unsupported_design_instruction",
    );
  });
});

describe("design instructions the contract must refuse", () => {
  const base = conductionProofFixtures.everyday;
  const sceneId = conductionScenes[0]!.id;

  it.each([
    ["JSX", "<div style={{left: 40}} />"],
    ["CSS", "position:absolute;left:40px"],
    ["an expression", "frame => frame * 2"],
    ["a coordinate", "x=120,y=300"],
  ])("refuses %s supplied as a treatment ID", (_label, payload) => {
    const parsed = styleProofCompositionPropsSchema.safeParse({
      ...base,
      selection: {
        ...base.selection,
        sceneDesigns: {
          ...base.selection.sceneDesigns,
          [sceneId]: {
            ...base.selection.sceneDesigns[sceneId]!,
            treatmentId: payload,
          },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses an extra key smuggled into a scene design", () => {
    const parsed = styleProofCompositionPropsSchema.safeParse({
      ...base,
      selection: {
        ...base.selection,
        sceneDesigns: {
          ...base.selection.sceneDesigns,
          [sceneId]: {
            ...base.selection.sceneDesigns[sceneId]!,
            layout: { left: 40, top: 12 },
          },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a remote asset URL in place of a bundled asset", () => {
    const asset = styleProofAssetLibrary["essential-subject-wood"]!;
    const parsed = styleProofCompositionPropsSchema.safeParse({
      ...conductionProofFixtures.essential,
      assets: {
        ...conductionProofFixtures.essential.assets,
        "essential-subject-wood": {
          ...asset,
          src: "https://images.example.test/photo.png",
        },
      },
    });
    expect(parsed.success).toBe(false);
  });
});

describe("schema failure taxonomy", () => {
  const base = conductionProofFixtures.essential;
  const sceneId = conductionScenes[0]!.id;

  it("reports an uncovered scene type as a scene-type mismatch", () => {
    const prepared = prepareStyleProofComposition({
      ...base,
      scenes: base.scenes.map((scene, index) =>
        index === 0
          ? { ...scene, template: "summary", visual: { takeaways: [{ text: "A takeaway" }] } }
          : scene,
      ),
    });
    expect(prepared.issues.map((issue) => issue.code)).toContain(
      "treatment_scene_type_mismatch",
    );
    // Attributed to the scene, not to the lesson.
    expect(prepared.issues[0]?.sceneId).toBe(sceneId);
  });

  it("reports an unrecognised field as an unsupported design instruction", () => {
    const prepared = prepareStyleProofComposition({
      ...base,
      selection: {
        ...base.selection,
        sceneDesigns: {
          ...base.selection.sceneDesigns,
          [sceneId]: {
            ...base.selection.sceneDesigns[sceneId]!,
            layout: { left: 40, top: 12 },
          },
        },
      },
    });
    expect(prepared.issues.map((issue) => issue.code)).toContain(
      "unsupported_design_instruction",
    );
  });

  it.each([
    ["selection.pack.id", { pack: { id: "prism", version: "1.0.0" } }, "unknown_pack"],
    [
      "selection.pack.version",
      { pack: { id: "essential", version: "2.0.0" } },
      "unsupported_pack_version",
    ],
  ])("reports %s with its own category", (_label, patch, expected) => {
    const prepared = prepareStyleProofComposition({
      ...base,
      selection: { ...base.selection, ...patch },
    });
    expect(prepared.issues.map((issue) => issue.code)).toContain(expected);
  });

  it("reports a caption cue outside its scene as a timing fault, not a collision", () => {
    const prepared = prepareStyleProofComposition({
      ...base,
      captions: base.captions.map((cue, index) =>
        index === 0 ? { ...cue, startFrame: 10_000, endFrame: 10_050 } : cue,
      ),
    });
    const codes = prepared.issues.map((issue) => issue.code);
    expect(codes).toContain("invalid_caption_timing");
    expect(codes).not.toContain("caption_collision");
  });

  it("gives every reported issue an actionable correction", () => {
    const prepared = prepareStyleProofComposition({ ...base, motion: {} });
    expect(prepared.issues.length).toBeGreaterThan(0);
    for (const issue of prepared.issues) {
      expect(issue.suggestedCorrection.length).toBeGreaterThan(20);
      expect(issue.fieldPath.length).toBeGreaterThan(0);
    }
  });
});

describe("fixtures", () => {
  it("runs 28 seconds, inside the 20-30 second requirement", () => {
    expect(conductionDurationInFrames).toBe(840);
    expect(conductionDurationInFrames / 30).toBeGreaterThanOrEqual(20);
    expect(conductionDurationInFrames / 30).toBeLessThanOrEqual(30);
  });

  it("shares identical content, order, narration, captions and durations across all three styles", () => {
    const [essential, editorial, everyday] = packIds.map(
      (packId) => conductionProofFixtures[packId],
    );
    for (const other of [editorial!, everyday!]) {
      expect(canonicalStyleProofJson(other.scenes)).toBe(
        canonicalStyleProofJson(essential!.scenes),
      );
      expect(canonicalStyleProofJson(other.captions)).toBe(
        canonicalStyleProofJson(essential!.captions),
      );
      expect(canonicalStyleProofJson(other.narrationTracks)).toBe(
        canonicalStyleProofJson(essential!.narrationTracks),
      );
      expect(canonicalStyleProofJson(other.motion)).toBe(
        canonicalStyleProofJson(essential!.motion),
      );
    }
    // Only the resolved design differs.
    expect(canonicalStyleProofJson(editorial!.selection)).not.toBe(
      canonicalStyleProofJson(essential!.selection),
    );
  });

  it("keeps every inventoried fact in the shared scene content (AC3)", () => {
    const content = JSON.stringify(conductionScenes);
    for (const fact of [
      conductionFactInventory.question,
      ...conductionFactInventory.definition,
      ...conductionFactInventory.subjects,
      ...conductionFactInventory.comparisonFacts,
    ])
      expect(content).toContain(fact);
  });

  it("matches every narration track's duration to its scene duration (ADR-004)", () => {
    for (const packId of packIds) {
      const fixture = conductionProofFixtures[packId];
      for (const track of fixture.narrationTracks) {
        const scene = fixture.scenes.find((entry) => entry.id === track.sceneId);
        expect(track.durationMs).toBe(scene!.durationSeconds * 1_000);
      }
    }
  });

  it("keeps caption cues inside their own scene's frame range", () => {
    const fixture = conductionProofFixtures.editorial;
    const timeline = styleProofTimeline(fixture.scenes);
    for (const cue of fixture.captions) {
      const segment = timeline.find((entry) => entry.sceneId === cue.sceneId)!;
      expect(cue.startFrame).toBeGreaterThanOrEqual(segment.startFrame);
      expect(cue.endFrame).toBeLessThanOrEqual(segment.endFrameExclusive);
    }
  });

  it("presents the second subject through the same nine treatments (AC8)", () => {
    const primary = new Set(
      packIds.flatMap((packId) =>
        Object.values(conductionProofFixtures[packId].selection.sceneDesigns).map(
          (design) => design.treatmentId,
        ),
      ),
    );
    const secondary = new Set(
      packIds.flatMap((packId) =>
        Object.values(leafProofFixtures[packId].selection.sceneDesigns).map(
          (design) => design.treatmentId,
        ),
      ),
    );
    expect([...secondary].sort()).toEqual([...primary].sort());
    expect(primary.size).toBe(9);
    for (const packId of packIds)
      expect(prepareStyleProofComposition(leafProofFixtures[packId]).issues).toEqual(
        [],
      );
  });

  it("keeps the second subject's clip inside the supported duration band", () => {
    expect(styleProofDurationInFrames(leafScenes) / 30).toBe(24);
  });
});

describe("content limits and timing validation", () => {
  it.each(packIds)("accepts an 80-character heading in %s", (packId) => {
    const longHeading = "a".repeat(80);
    const fixture = conductionProofFixtures[packId];
    const scenes = fixture.scenes.map((scene) =>
      scene.template === "hook"
        ? { ...scene, visual: { ...scene.visual, question: longHeading } }
        : scene,
    );
    const resolution = resolveStyleProofScenes(
      scenes as typeof fixture.scenes,
      fixture.selection,
      fixture.assets,
    );
    expect(
      validateStyleProofScenes(resolution.scenes, fixture.motion),
    ).toEqual([]);
  });

  it("reports the offending field when a heading exceeds its treatment limit", () => {
    const fixture = conductionProofFixtures.editorial;
    const scenes = fixture.scenes.map((scene) =>
      scene.template === "hook"
        ? { ...scene, visual: { ...scene.visual, question: "a".repeat(140) } }
        : scene,
    );
    const resolution = resolveStyleProofScenes(
      scenes as typeof fixture.scenes,
      fixture.selection,
      fixture.assets,
    );
    const issues = validateStyleProofScenes(resolution.scenes, fixture.motion);
    expect(issues[0]?.code).toBe("text_overflow");
    expect(issues[0]?.fieldPath).toBe("visual.question");
    // The correction names an explicit editorial action and states that the
    // proof will not silently shrink or truncate to make the text fit.
    expect(issues[0]?.suggestedCorrection).toContain("Shorten this field to 80");
    expect(issues[0]?.suggestedCorrection).toContain(
      "does not shrink type below its authored size or truncate",
    );
  });

  it("accepts the densest valid comparison every treatment claims to lay out", () => {
    expect(prepareStyleProofComposition(denseComparisonBoundaryFixture).issues).toEqual(
      [],
    );
  });

  it("accepts a heading at the schema ceiling", () => {
    expect(prepareStyleProofComposition(longHeadingBoundaryFixture).issues).toEqual(
      [],
    );
  });

  it("accepts portrait media in a cover-fit evidence slot", () => {
    expect(
      prepareStyleProofComposition(portraitMediaBoundaryFixture).issues,
    ).toEqual([]);
  });

  it("contains-fits every slot whose artwork carries meaning to its edges", () => {
    for (const treatment of styleProofTreatments)
      for (const slot of treatment.assetSlots)
        if (slot.acceptedKinds.includes("vector"))
          expect(slot.fit).toBe("contain");
  });

  it("reports, rather than absorbs, a scene too short for its required hold", () => {
    const prepared = prepareStyleProofComposition(shortSceneBoundaryFixture);
    expect(prepared.props).toBeUndefined();
    const issue = prepared.issues.find(
      (entry) => entry.code === "invalid_motion_interval",
    );
    expect(issue?.suggestedCorrection).toContain(
      "Narration is never accelerated",
    );
  });

  it("extends only the explanation interval when a scene gets longer (CR-05)", () => {
    const short = getStyleProofIntervals(11, styleProofDefaultMotion);
    const long = getStyleProofIntervals(24, styleProofDefaultMotion);
    expect(long.entranceEndFrame).toBe(short.entranceEndFrame);
    expect(long.durationInFrames - long.exitStartFrame).toBe(
      short.durationInFrames - short.exitStartFrame,
    );
    expect(long.exitStartFrame - long.entranceEndFrame).toBeGreaterThan(
      short.exitStartFrame - short.entranceEndFrame,
    );
    expect(long.holdSatisfied).toBe(true);
    expect(prepareStyleProofComposition(extendedSceneBoundaryFixture).issues).toEqual(
      [],
    );
  });

  it.each([3, 7, 11, 24, 60])(
    "keeps intervals ordered at a %ss scene",
    (seconds) => {
      const intervals = getStyleProofIntervals(seconds, styleProofDefaultMotion);
      expect(intervals.entranceEndFrame).toBeGreaterThanOrEqual(0);
      expect(intervals.holdStartFrame).toBeGreaterThanOrEqual(
        intervals.entranceEndFrame,
      );
      expect(intervals.exitStartFrame).toBeGreaterThanOrEqual(
        intervals.holdStartFrame,
      );
      expect(intervals.durationInFrames).toBeGreaterThanOrEqual(
        intervals.exitStartFrame,
      );
    },
  );
});

describe("frame determinism (CR-04)", () => {
  const intervals = getStyleProofIntervals(11, styleProofDefaultMotion);

  it("returns the same motion state for a frame regardless of visit order", () => {
    const forward = [0, 10, 40, 120, 250].map((frame) =>
      objectSettle(frame, intervals, 0, 2, 140),
    );
    const backward = [250, 120, 40, 10, 0]
      .map((frame) => objectSettle(frame, intervals, 0, 2, 140))
      .reverse();
    expect(backward).toEqual(forward);
  });

  it("is fully settled for every frame of the hold", () => {
    for (
      let frame = intervals.holdStartFrame;
      frame < intervals.exitStartFrame;
      frame++
    )
      expect(objectSettle(frame, intervals, 0, 2, 140)).toEqual({
        offset: 0,
        rotation: 0,
      });
  });

  it("emphasises exactly one difference at a time, in order", () => {
    const seen: number[] = [];
    for (let frame = 0; frame < intervals.durationInFrames; frame++) {
      const index = sequentialEmphasisIndex(frame, intervals, 3);
      if (seen.at(-1) !== index) seen.push(index);
    }
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe("manifest and hashing (CR-02, CR-06)", () => {
  it("records treatments, assets, audio, fonts, timing and renderer identity", () => {
    const manifest = buildStyleProofManifest(conductionProofFixtures.everyday);
    expect(manifest.pack).toEqual({
      id: "everyday",
      version: styleProofPackVersion,
    });
    expect(manifest.treatments).toHaveLength(3);
    expect(manifest.assets.length).toBeGreaterThan(0);
    expect(manifest.audio).toHaveLength(3);
    expect(manifest.fonts.length).toBeGreaterThan(0);
    expect(manifest.timeline.at(-1)?.endFrameExclusive).toBe(840);
    expect(manifest.implementation.remotionVersion).toBe("4.0.507");
    expect(manifest.outputProfile.videoCodec).toBe("h264");
  });

  it("hashes stably across key order and unstably across a render-affecting change", () => {
    const fixture = conductionProofFixtures.essential;
    const reordered = {
      selection: fixture.selection,
      scenes: fixture.scenes,
      narrationTracks: fixture.narrationTracks,
      motion: fixture.motion,
      fixtureId: fixture.fixtureId,
      captions: fixture.captions,
      assets: fixture.assets,
    };
    expect(hashStyleProofInput(reordered)).toBe(hashStyleProofInput(fixture));
    expect(
      hashStyleProofInput({
        ...fixture,
        motion: { ...fixture.motion, entranceFrames: 21 },
      }),
    ).not.toBe(hashStyleProofInput(fixture));
    expect(hashStyleProofInput(conductionProofFixtures.editorial)).not.toBe(
      hashStyleProofInput(fixture),
    );
  });

  it("refuses to build a manifest for an unresolved composition", () => {
    expect(() =>
      buildStyleProofManifest(missingAssetBoundaryFixture),
    ).toThrowError(/unresolved/i);
  });

  it("rejects a non-finite value rather than hashing it", () => {
    expect(() => canonicalStyleProofJson({ a: Number.NaN })).toThrowError(
      /Non-finite/,
    );
  });
});

describe("production isolation (AC7)", () => {
  it("keeps the proof pack IDs out of the production theme", async () => {
    const { videoTheme } = await import("@avlp/design-system/video-theme");
    expect(videoTheme.id).toBe("mvp-default");
    expect(packIds).not.toContain(videoTheme.id as never);
  });

  it("keeps the production lesson contract unable to accept a proof pack", async () => {
    const { lessonConfigurationSchema } = await import("@avlp/schemas");
    const configured = lessonConfigurationSchema.safeParse({ theme: "editorial" });
    expect(configured.success).toBe(false);
  });
});
