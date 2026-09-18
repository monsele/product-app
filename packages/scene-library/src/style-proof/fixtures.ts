/**
 * ST-094 — proof fixtures.
 *
 * The primary fixture is one 28-second lesson with a hook, a definition and a
 * comparison. Its facts, scene order, narration, captions and durations are
 * defined **once** here and shared byte-identically by all three styles: the
 * only thing that changes between the three clips is the resolved selection.
 * That is what makes the contact sheet and the clarity ratings a comparison of
 * presentation rather than of content.
 *
 * The fact inventory each version must preserve is stated explicitly in
 * `conductionFactInventory`, and asserted by the contract tests (AC3).
 */

import { sceneSpecSchema } from "@avlp/schemas";
import type {
  StyleProofCompositionProps,
  StyleProofPackId,
  StyleProofScene,
} from "@avlp/schemas/style-proof";
import { styleProofAssetLibrary } from "./assets.generated.js";
import { styleProofNarrationLibrary } from "./narration.generated.js";
import { styleProofDefaultMotion, styleProofSecondsToFrames } from "./motion.js";
import { selectionForPack } from "./resolver.js";
import { styleProofTimeline } from "./composition.js";

const documentId = "00000000-0000-7000-8000-00000000c001";

/**
 * Fixtures are parsed through the production scene contract rather than cast
 * into it, matching `full-lesson.fixture.ts`. A typo in this file's factual
 * content then fails at module load, where it is obvious, instead of silently
 * typechecking and failing later inside a render.
 */
const proofScene = (scene: unknown): StyleProofScene =>
  sceneSpecSchema.parse(scene);

const sourceRef = (page: number, block: number) =>
  Object.freeze({
    blockIds: [
      `00000000-0000-7000-8000-00000000c1${block.toString().padStart(2, "0")}`,
    ],
    documentId,
    pageStart: page,
    parsedDocumentVersion: 1,
  });

const sceneBase = (
  id: string,
  order: number,
  narration: string,
  durationSeconds: number,
  page: number,
) =>
  ({
    assetBindings: [],
    durationSeconds,
    generatedAdditions: [],
    id,
    narration,
    onScreenText: [],
    order,
    sourceRefs: [sourceRef(page, order)],
    transition: "cut",
  }) as const;

// ---------------------------------------------------------------------------
// Primary fixture — thermal conduction
// ---------------------------------------------------------------------------

const conductionHookId = "00000000-0000-7000-8000-00000000c201";
const conductionDefinitionId = "00000000-0000-7000-8000-00000000c202";
const conductionComparisonId = "00000000-0000-7000-8000-00000000c203";

export const conductionScenes: readonly StyleProofScene[] = Object.freeze([
  proofScene({
    ...sceneBase(
      conductionHookId,
      1,
      styleProofNarrationLibrary["conduction-hook"]!.text,
      7,
      1,
    ),
    template: "hook",
    title: "Two blocks, one ice cube each",
    visual: {
      question: "Why does ice melt faster on metal than on wood?",
      prompt: "Same room. Same ice. Different result.",
      supportingElements: ["Metal", "Wood", "Ice"],
    },
  }),
  proofScene({
    ...sceneBase(
      conductionDefinitionId,
      2,
      styleProofNarrationLibrary["conduction-definition"]!.text,
      11,
      2,
    ),
    template: "definition",
    title: "Conduction",
    visual: {
      term: "Conduction",
      definition:
        "Thermal energy moving between materials in contact, as particles collide and pass energy on.",
      exampleLabel: "In the demo",
      exampleText: "Heat moves from the block into the ice.",
    },
  }),
  proofScene({
    ...sceneBase(
      conductionComparisonId,
      3,
      styleProofNarrationLibrary["conduction-comparison"]!.text,
      10,
      3,
    ),
    template: "comparison",
    title: "Metal against wood",
    visual: {
      leftSubject: { label: "Metal block" },
      rightSubject: { label: "Wooden block" },
      similarities: [
        "Both start at room temperature",
        "Both receive the same ice cube",
      ],
      differences: [
        "Metal conducts heat quickly",
        "Wood conducts heat slowly",
        "The cube on metal melts first",
      ],
    },
  }),
]);

/**
 * The explicit content inventory for AC3. Every item must be visible or
 * narrated in all three versions; the contract tests assert each string is
 * present in the shared scene content, so a treatment cannot quietly drop one.
 */
export const conductionFactInventory: Readonly<{
  question: string;
  definition: readonly string[];
  subjects: readonly string[];
  comparisonFacts: readonly string[];
}> = Object.freeze({
  question: "Why does ice melt faster on metal than on wood?",
  definition: Object.freeze([
    "Conduction",
    "Thermal energy moving between materials in contact, as particles collide and pass energy on.",
  ]),
  subjects: Object.freeze(["Metal block", "Wooden block"]),
  comparisonFacts: Object.freeze([
    "Metal conducts heat quickly",
    "Wood conducts heat slowly",
    "The cube on metal melts first",
    "Both start at room temperature",
    "Both receive the same ice cube",
  ]),
});

const conductionAssetsByPack: Readonly<
  Record<StyleProofPackId, Readonly<Record<string, Readonly<Record<string, string>>>>>
> = Object.freeze({
  essential: {
    [conductionHookId]: { subject: "essential-subject-icecube" },
    [conductionDefinitionId]: { subject: "essential-subject-metal" },
    [conductionComparisonId]: {
      "subject-left": "essential-subject-metal",
      "subject-right": "essential-subject-wood",
    },
  },
  editorial: {
    [conductionHookId]: { evidence: "editorial-photo-hook" },
    [conductionDefinitionId]: { evidence: "editorial-photo-evidence" },
    [conductionComparisonId]: {
      "evidence-left": "editorial-photo-metal",
      "evidence-right": "editorial-photo-wood",
    },
  },
  everyday: {
    [conductionHookId]: { situation: "everyday-illustration-kitchen" },
    [conductionDefinitionId]: { objects: "everyday-illustration-particles" },
    [conductionComparisonId]: {
      "scenario-left": "everyday-illustration-metal",
      "scenario-right": "everyday-illustration-wood",
    },
  },
});

// ---------------------------------------------------------------------------
// Second subject — leaf adaptation (AC8: the same nine treatments, no forks)
// ---------------------------------------------------------------------------

const leafHookId = "00000000-0000-7000-8000-00000000c301";
const leafDefinitionId = "00000000-0000-7000-8000-00000000c302";
const leafComparisonId = "00000000-0000-7000-8000-00000000c303";

export const leafScenes: readonly StyleProofScene[] = Object.freeze([
  proofScene({
    ...sceneBase(leafHookId, 1, styleProofNarrationLibrary["leaf-hook"]!.text, 6, 1),
    template: "hook",
    title: "Two very different leaves",
    visual: {
      question: "Why do a cactus and a fern have such different leaves?",
      prompt: "Both are plants. Both need water.",
      supportingElements: ["Cactus", "Fern"],
    },
  }),
  proofScene({
    ...sceneBase(
      leafDefinitionId,
      2,
      styleProofNarrationLibrary["leaf-definition"]!.text,
      9,
      2,
    ),
    template: "definition",
    title: "Transpiration",
    visual: {
      term: "Transpiration",
      definition:
        "Water vapour escaping through tiny pores in a leaf whenever those pores open to take in carbon dioxide.",
      exampleLabel: "On a leaf",
      exampleText: "Every open pore loses a little water.",
    },
  }),
  proofScene({
    ...sceneBase(
      leafComparisonId,
      3,
      styleProofNarrationLibrary["leaf-comparison"]!.text,
      9,
      3,
    ),
    template: "comparison",
    title: "Cactus against fern",
    visual: {
      leftSubject: { label: "Cactus" },
      rightSubject: { label: "Fern" },
      similarities: ["Both lose water through pores", "Both need carbon dioxide"],
      differences: [
        "A cactus has few, sunken pores",
        "A fern has many pores on broad fronds",
        "A cactus stores water in its stem",
      ],
    },
  }),
]);

const leafAssetsByPack: Readonly<
  Record<StyleProofPackId, Readonly<Record<string, Readonly<Record<string, string>>>>>
> = Object.freeze({
  essential: {
    [leafHookId]: { subject: "essential-subject-leaf" },
    [leafDefinitionId]: { subject: "essential-subject-fern" },
    [leafComparisonId]: {
      "subject-left": "essential-subject-cactus",
      "subject-right": "essential-subject-fern",
    },
  },
  editorial: {
    [leafHookId]: { evidence: "editorial-photo-desert" },
    [leafDefinitionId]: { evidence: "editorial-photo-fern" },
    [leafComparisonId]: {
      "evidence-left": "editorial-photo-cactus",
      "evidence-right": "editorial-photo-fern",
    },
  },
  everyday: {
    [leafHookId]: { situation: "everyday-illustration-desert" },
    [leafDefinitionId]: { objects: "everyday-illustration-pores" },
    [leafComparisonId]: {
      "scenario-left": "everyday-illustration-cactus",
      "scenario-right": "everyday-illustration-fern",
    },
  },
});

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Caption cues follow the narration, not the style. Each scene's narration is
 * split into cues of at most ~90 characters spread evenly across the scene's
 * frames, so all three styles carry identical caption text at identical frames.
 */
function captionsForScenes(
  scenes: readonly StyleProofScene[],
): StyleProofCompositionProps["captions"] {
  const timeline = styleProofTimeline(scenes);
  return timeline.flatMap((segment) => {
    const scene = scenes.find((entry) => entry.id === segment.sceneId);
    if (scene === undefined) return [];
    const words = scene.narration.split(/\s+/).filter(Boolean);
    const cues: string[] = [];
    let current = "";
    for (const word of words) {
      if ((current + " " + word).trim().length > 90) {
        cues.push(current.trim());
        current = word;
      } else current = `${current} ${word}`.trim();
    }
    if (current.length > 0) cues.push(current);
    const slot = Math.floor(segment.durationInFrames / Math.max(1, cues.length));
    return cues.map((text, index) => ({
      endFrame:
        index === cues.length - 1
          ? segment.endFrameExclusive
          : segment.startFrame + slot * (index + 1),
      sceneId: segment.sceneId,
      startFrame: segment.startFrame + slot * index,
      text,
    }));
  });
}

function narrationTracksFor(
  scenes: readonly StyleProofScene[],
  trackIds: readonly string[],
): StyleProofCompositionProps["narrationTracks"] {
  return scenes.map((scene, index) => {
    const trackId = trackIds[index];
    const track = trackId === undefined ? undefined : styleProofNarrationLibrary[trackId];
    if (track === undefined)
      throw new Error(`Missing narration track for scene ${scene.id}.`);
    if (track.durationMs !== scene.durationSeconds * 1_000)
      throw new Error(
        `Narration ${trackId} is ${track.durationMs}ms but scene ${scene.id} is ${scene.durationSeconds}s. Measured narration is the timing authority; the scene must match it.`,
      );
    return {
      durationMs: track.durationMs,
      sceneId: scene.id,
      src: track.src,
    };
  });
}

function assetsFor(
  assetsBySceneId: Readonly<Record<string, Readonly<Record<string, string>>>>,
): StyleProofCompositionProps["assets"] {
  const used = new Set(
    Object.values(assetsBySceneId).flatMap((slots) => Object.values(slots)),
  );
  const assets: StyleProofCompositionProps["assets"] = {};
  for (const assetId of used) {
    const asset = styleProofAssetLibrary[assetId];
    if (asset === undefined)
      throw new Error(`Proof asset "${assetId}" is not in the bundled library.`);
    assets[assetId] = asset;
  }
  return assets;
}

function buildFixture(
  fixtureId: string,
  scenes: readonly StyleProofScene[],
  packId: StyleProofPackId,
  assetsBySceneId: Readonly<Record<string, Readonly<Record<string, string>>>>,
  trackIds: readonly string[],
): StyleProofCompositionProps {
  return Object.freeze({
    assets: assetsFor(assetsBySceneId),
    captions: captionsForScenes(scenes),
    fixtureId,
    motion: styleProofDefaultMotion,
    narrationTracks: narrationTracksFor(scenes, trackIds),
    scenes: [...scenes],
    selection: selectionForPack(packId, scenes, assetsBySceneId),
  });
}

const conductionTrackIds = Object.freeze([
  "conduction-hook",
  "conduction-definition",
  "conduction-comparison",
]);
const leafTrackIds = Object.freeze([
  "leaf-hook",
  "leaf-definition",
  "leaf-comparison",
]);

/** The three primary clips. Identical content; different resolved selection. */
export const conductionProofFixtures: Readonly<
  Record<StyleProofPackId, StyleProofCompositionProps>
> = Object.freeze({
  essential: buildFixture(
    "conduction-essential",
    conductionScenes,
    "essential",
    conductionAssetsByPack.essential,
    conductionTrackIds,
  ),
  editorial: buildFixture(
    "conduction-editorial",
    conductionScenes,
    "editorial",
    conductionAssetsByPack.editorial,
    conductionTrackIds,
  ),
  everyday: buildFixture(
    "conduction-everyday",
    conductionScenes,
    "everyday",
    conductionAssetsByPack.everyday,
    conductionTrackIds,
  ),
});

/** The second subject, proving reuse without a subject-specific fork (AC8). */
export const leafProofFixtures: Readonly<
  Record<StyleProofPackId, StyleProofCompositionProps>
> = Object.freeze({
  essential: buildFixture(
    "leaf-essential",
    leafScenes,
    "essential",
    leafAssetsByPack.essential,
    leafTrackIds,
  ),
  editorial: buildFixture(
    "leaf-editorial",
    leafScenes,
    "editorial",
    leafAssetsByPack.editorial,
    leafTrackIds,
  ),
  everyday: buildFixture(
    "leaf-everyday",
    leafScenes,
    "everyday",
    leafAssetsByPack.everyday,
    leafTrackIds,
  ),
});

export const conductionDurationInFrames = styleProofTimeline(
  conductionScenes,
).reduce((total, segment) => total + segment.durationInFrames, 0);

export const leafDurationInFrames = styleProofTimeline(leafScenes).reduce(
  (total, segment) => total + segment.durationInFrames,
  0,
);

// ---------------------------------------------------------------------------
// Boundary fixtures (AC4)
// ---------------------------------------------------------------------------

function withScene(
  fixture: StyleProofCompositionProps,
  sceneId: string,
  mutate: (scene: StyleProofScene) => StyleProofScene,
): StyleProofCompositionProps {
  return {
    ...fixture,
    scenes: fixture.scenes.map((scene) =>
      scene.id === sceneId ? mutate(scene) : scene,
    ),
  };
}

/** A heading at exactly the schema's 80-character ceiling. */
export const longHeadingBoundaryFixture: StyleProofCompositionProps = withScene(
  conductionProofFixtures.editorial,
  conductionHookId,
  // The template check narrows `visual`, so the spread needs no assertion.
  (scene) =>
    scene.template !== "hook"
      ? scene
      : proofScene({
          ...scene,
          visual: {
            ...scene.visual,
            question:
              "Why does an ice cube melt so much faster on metal than it does on wood?",
          },
        }),
);

/** The densest comparison every treatment claims to lay out. */
export const denseComparisonBoundaryFixture: StyleProofCompositionProps =
  withScene(
    conductionProofFixtures.everyday,
    conductionComparisonId,
    (scene) =>
      scene.template !== "comparison"
        ? scene
        : proofScene({
            ...scene,
            visual: {
              ...scene.visual,
              differences: [
                "Metal conducts heat quickly",
                "Wood conducts heat slowly",
                "The cube on metal melts first",
                "Wood traps air, which conducts badly",
              ],
              similarities: [
                "Both start at room temperature",
                "Both receive the same ice cube",
                "Both sit in the same room",
              ],
            },
          }),
  );

/** A required Editorial evidence slot left unbound: this must block. */
export const missingAssetBoundaryFixture: StyleProofCompositionProps = {
  ...conductionProofFixtures.editorial,
  selection: {
    ...conductionProofFixtures.editorial.selection,
    sceneDesigns: {
      ...conductionProofFixtures.editorial.selection.sceneDesigns,
      [conductionHookId]: {
        ...conductionProofFixtures.editorial.selection.sceneDesigns[
          conductionHookId
        ]!,
        assetBySlot: {},
      },
    },
  },
};

/** Portrait media in a landscape-first slot, proving the crop policy holds. */
export const portraitMediaBoundaryFixture: StyleProofCompositionProps = {
  ...conductionProofFixtures.editorial,
  assets: {
    ...conductionProofFixtures.editorial.assets,
    "editorial-photo-metal": styleProofAssetLibrary["editorial-photo-metal"]!,
  },
  selection: {
    ...conductionProofFixtures.editorial.selection,
    sceneDesigns: {
      ...conductionProofFixtures.editorial.selection.sceneDesigns,
      [conductionHookId]: {
        ...conductionProofFixtures.editorial.selection.sceneDesigns[
          conductionHookId
        ]!,
        assetBySlot: { evidence: "editorial-photo-metal" },
      },
    },
  },
};

/** Media below the slot's minimum useful resolution: this must block. */
export const undersizedMediaBoundaryFixture: StyleProofCompositionProps = {
  ...conductionProofFixtures.editorial,
  assets: {
    ...conductionProofFixtures.editorial.assets,
    "editorial-photo-undersized":
      styleProofAssetLibrary["editorial-photo-undersized"]!,
  },
  selection: {
    ...conductionProofFixtures.editorial.selection,
    sceneDesigns: {
      ...conductionProofFixtures.editorial.selection.sceneDesigns,
      [conductionHookId]: {
        ...conductionProofFixtures.editorial.selection.sceneDesigns[
          conductionHookId
        ]!,
        assetBySlot: { evidence: "editorial-photo-undersized" },
      },
    },
  },
};

/**
 * A scene too short to carry the required settled hold. It must be reported,
 * not absorbed by speeding anything up.
 */
export const shortSceneBoundaryFixture: StyleProofCompositionProps = (() => {
  const scenes = conductionScenes.map((scene) =>
    scene.id === conductionHookId
      ? proofScene({ ...scene, durationSeconds: 2 })
      : scene,
  );
  return {
    ...conductionProofFixtures.essential,
    captions: captionsForScenes(scenes),
    narrationTracks: conductionProofFixtures.essential.narrationTracks.map(
      (track) =>
        track.sceneId === conductionHookId
          ? { ...track, durationMs: 2_000 }
          : track,
    ),
    scenes,
  };
})();

/**
 * An extended scene: the explanation interval grows, the entrance and exit do
 * not, and the hold remains satisfied.
 */
export const extendedSceneBoundaryFixture: StyleProofCompositionProps = (() => {
  const scenes = conductionScenes.map((scene) =>
    scene.id === conductionDefinitionId
      ? proofScene({ ...scene, durationSeconds: 24 })
      : scene,
  );
  return {
    ...conductionProofFixtures.essential,
    captions: captionsForScenes(scenes),
    narrationTracks: conductionProofFixtures.essential.narrationTracks.map(
      (track) =>
        track.sceneId === conductionDefinitionId
          ? { ...track, durationMs: 24_000 }
          : track,
    ),
    scenes,
  };
})();

/** A treatment asked to present a scene type it does not present. */
export const mismatchedTreatmentFixture: StyleProofCompositionProps = {
  ...conductionProofFixtures.essential,
  selection: {
    ...conductionProofFixtures.essential.selection,
    sceneDesigns: {
      ...conductionProofFixtures.essential.selection.sceneDesigns,
      [conductionHookId]: {
        ...conductionProofFixtures.essential.selection.sceneDesigns[
          conductionHookId
        ]!,
        treatmentId: "essential.comparison.sequential-emphasis",
      },
    },
  },
};

export const styleProofSceneIds = Object.freeze({
  conductionComparison: conductionComparisonId,
  conductionDefinition: conductionDefinitionId,
  conductionHook: conductionHookId,
  leafComparison: leafComparisonId,
  leafDefinition: leafDefinitionId,
  leafHook: leafHookId,
});

/** Total clip length in seconds; AC1 requires 20–30s. */
export const conductionDurationSeconds =
  conductionDurationInFrames / styleProofSecondsToFrames(1);
