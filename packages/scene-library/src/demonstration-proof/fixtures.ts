/**
 * ST-095 — the proof fixtures.
 *
 * Two curated subjects, each authored twice: once as a demonstration plan and
 * once as a standard lesson built from the existing production scene
 * templates. The pair shares its facts, its narration audio, its caption cues,
 * its scene boundaries and `mvp-default` appearance, so the only thing that
 * differs between the two clips is what the pictures do. That is what makes
 * the comparison in the evaluation worth anything.
 *
 * The fact inventory below each subject is not decoration: it is the list a
 * reviewer checks both clips against, and the standard fixtures state every
 * item the demonstration plan animates.
 *
 * Every event's `startFrame` is derived by `buildDemonstrationPlan` from the
 * measured beat timings in `narration.generated.ts`. Nothing here hard-codes a
 * frame that the audio does not justify.
 */

import { sceneSpecSchema, type SceneSpec } from "@avlp/schemas";
import {
  fullLessonCompositionPropsSchema,
  type FullLessonCompositionProps,
} from "../full-lesson.js";
import {
  demonstrationCompositionPropsSchema,
  demonstrationFps,
  type DemonstrationCaptionCue,
  type DemonstrationCompositionProps,
  type DemonstrationInitialState,
  type DemonstrationNarrationTrack,
  type DemonstrationScene,
} from "@avlp/schemas/demonstration-proof";
import { demonstrationAssetLibrary } from "./assets.generated.js";
import {
  demonstrationNarrationRecord,
  demonstrationNarrationTrack,
} from "./narration.js";
import {
  buildDemonstrationPlan,
  type DemonstrationEventDraft,
} from "./plan-builder.js";

/** ₦1,000 expressed in kobo, the minor unit this fixture counts in. */
const NOTE_MINOR = 100_000;

const trackCache = new Map<string, DemonstrationNarrationTrack>();
function track(trackId: string): DemonstrationNarrationTrack {
  const cached = trackCache.get(trackId);
  if (cached !== undefined) return cached;
  const parsed = demonstrationNarrationTrack(trackId);
  trackCache.set(trackId, parsed);
  return parsed;
}

const narrationOf = demonstrationNarrationRecord;

/**
 * Scene length in whole seconds, from the measured audio.
 *
 * ADR-004 makes measured narration the authority, so the scene is as long as
 * the recording plus a settling second — never the other way round. A plan that
 * cannot finish inside that is a plan that must change.
 */
function sceneSecondsFor(trackId: string): number {
  return Math.ceil(narrationOf(trackId).durationMs / 1_000) + 1;
}

/**
 * Caption cues for a whole subject, cut directly on the measured beats.
 *
 * The beats are measured within their own scene's audio, but the composition
 * timeline is global, so each scene's cues are offset by the frames its
 * predecessors occupy. Doing it here, once, keeps every consumer — the
 * demonstration composition, the standard composition and the tests — reading
 * the same cue list, which is what "identical captions" in the comparison
 * actually means.
 */
function captionsForSubject(
  trackIds: readonly string[],
): readonly DemonstrationCaptionCue[] {
  const cues: DemonstrationCaptionCue[] = [];
  let offset = 0;
  for (const trackId of trackIds) {
    const source = track(trackId);
    for (const beat of source.beats)
      cues.push(
        Object.freeze({
          endFrame: offset + Math.round((beat.endMs / 1_000) * demonstrationFps),
          sceneId: source.sceneId,
          startFrame:
            offset + Math.round((beat.startMs / 1_000) * demonstrationFps),
          text: beat.text,
        }),
      );
    offset += sceneSecondsFor(trackId) * demonstrationFps;
  }
  return Object.freeze(cues);
}

export const savingsTrackIds = Object.freeze([
  "savings-intro",
  "savings-transfer",
  "savings-accumulate",
]);

export const evaporationTrackIds = Object.freeze([
  "evaporation-setup",
  "evaporation-escape",
  "evaporation-spread",
]);

function buildScene(
  trackId: string,
  order: number,
  title: string,
  recipeId: Parameters<typeof buildDemonstrationPlan>[0]["recipeId"],
  seed: number,
  initialState: DemonstrationInitialState,
  events: readonly DemonstrationEventDraft[],
  expectedFinalState: Parameters<
    typeof buildDemonstrationPlan
  >[0]["expectedFinalState"],
  assetBySlot: Readonly<Record<string, string>>,
): DemonstrationScene {
  const source = track(trackId);
  const durationSeconds = sceneSecondsFor(trackId);
  const built = buildDemonstrationPlan(
    {
      recipeId,
      sceneId: source.sceneId,
      durationSeconds,
      seed,
      initialState,
      events,
      expectedFinalState,
    },
    source,
  );
  if (built.plan === undefined)
    throw new Error(
      `Fixture ${trackId} does not validate: ${built.issues
        .map((issue) => `${issue.code} at ${issue.fieldPath} — ${issue.message}`)
        .join(" | ")}`,
    );
  return {
    id: source.sceneId,
    order,
    title,
    narration: source.beats.map((beat) => beat.text).join(" "),
    durationSeconds,
    plan: built.plan,
    assetBySlot,
  };
}

// ===========================================================================
// Subject 1 — Saving a little, every week
// ===========================================================================

/**
 * The facts both clips must carry. A reviewer checks each line against each
 * clip; the demonstration must not invent any, and the standard must not lose
 * any.
 */
export const savingsFactInventory: readonly string[] = Object.freeze([
  "Ten notes of ₦1,000 each make ₦10,000.",
  "Two notes move from income into savings, leaving eight.",
  "After the first week: ₦8,000 income, ₦2,000 saved.",
  "Weeks 2 and 3 each bring wages, from which two more notes are saved.",
  "After three weeks: ₦6,000 saved, against a ₦10,000 goal.",
  "The figures are illustrative, not financial advice.",
]);

const noteIds = Array.from({ length: 14 }, (_unused, index) =>
  `note-${String(index + 1).padStart(2, "0")}`,
);

const notesIn = (containerId: string, ids: readonly string[]) =>
  ids.map((id, index) => ({
    id,
    kind: "token" as const,
    label: `₦1,000 note ${index + 1}`,
    amountMinor: NOTE_MINOR,
    unit: "NGN-minor" as const,
    containerId,
  }));

const savingsIntroScene = buildScene(
  "savings-intro",
  1,
  "Ten notes, ten thousand naira",
  "savings.transfer-accumulate",
  9_501,
  {
    objects: [
      {
        id: "cash-origin",
        kind: "container",
        label: "This week's wages",
        role: "origin",
      },
      { id: "income", kind: "container", label: "Income", role: "source" },
      { id: "savings", kind: "container", label: "Savings", role: "destination" },
      { id: "week", kind: "period-marker", label: "Week", periodLabel: "Week 1" },
      {
        id: "illustrative-note",
        kind: "note",
        label: "Example figures",
        text: "Example figures, used to show how saving works. Not financial advice.",
        anchorObjectId: "income",
      },
      ...notesIn("cash-origin", noteIds.slice(0, 10)),
    ],
    readouts: [
      {
        id: "income-balance",
        kind: "readout",
        label: "Income",
        containerId: "income",
        display: "balance",
      },
      {
        id: "savings-balance",
        kind: "readout",
        label: "Savings",
        containerId: "savings",
        display: "goal",
        goalMinor: 10 * NOTE_MINOR,
      },
    ],
  },
  [
    {
      id: "wages-arrive",
      action: "introduce",
      beatId: "count-notes",
      durationFrames: 90,
      holdFrames: 36,
      tokenIds: noteIds.slice(0, 10),
      fromOriginId: "cash-origin",
      toContainerId: "income",
      originLabel: "This week's wages",
    },
    {
      id: "count-them",
      action: "emphasise",
      beatId: "count-total",
      durationFrames: 66,
      holdFrames: 30,
      objectIds: noteIds.slice(0, 10),
    },
    {
      id: "say-illustrative",
      action: "annotate",
      beatId: "illustrative",
      durationFrames: 36,
      holdFrames: 0,
      noteId: "illustrative-note",
    },
  ],
  {
    containerTotals: [
      { containerId: "cash-origin", totalMinor: 0 },
      { containerId: "income", totalMinor: 10 * NOTE_MINOR },
      { containerId: "savings", totalMinor: 0 },
    ],
    particlePhases: [],
  },
  { coin: "naira-note", "savings-jar": "savings-jar" },
);

const savingsTransferScene = buildScene(
  "savings-transfer",
  2,
  "Two notes into savings",
  "savings.transfer-accumulate",
  9_502,
  {
    objects: [
      { id: "income", kind: "container", label: "Income", role: "source" },
      { id: "savings", kind: "container", label: "Savings", role: "destination" },
      { id: "week", kind: "period-marker", label: "Week", periodLabel: "Week 1" },
      {
        id: "illustrative-note",
        kind: "note",
        label: "Example figures",
        text: "Example figures, used to show how saving works. Not financial advice.",
        anchorObjectId: "income",
      },
      ...notesIn("income", noteIds.slice(0, 10)),
    ],
    readouts: [
      {
        id: "income-balance",
        kind: "readout",
        label: "Income",
        containerId: "income",
        display: "balance",
      },
      {
        id: "savings-balance",
        kind: "readout",
        label: "Savings",
        containerId: "savings",
        display: "goal",
        goalMinor: 10 * NOTE_MINOR,
      },
    ],
  },
  [
    {
      id: "pick-two",
      action: "emphasise",
      beatId: "decide",
      durationFrames: 60,
      holdFrames: 24,
      objectIds: ["note-01", "note-02"],
    },
    {
      id: "move-two",
      action: "transfer",
      beatId: "move",
      durationFrames: 96,
      holdFrames: 48,
      tokenIds: ["note-01", "note-02"],
      fromContainerId: "income",
      toContainerId: "savings",
    },
    {
      id: "read-result",
      action: "emphasise",
      beatId: "result",
      durationFrames: 66,
      holdFrames: 36,
      objectIds: ["income", "savings"],
    },
  ],
  {
    containerTotals: [
      { containerId: "income", totalMinor: 8 * NOTE_MINOR },
      { containerId: "savings", totalMinor: 2 * NOTE_MINOR },
    ],
    particlePhases: [],
  },
  { coin: "naira-note", "savings-jar": "savings-jar" },
);

const savingsAccumulateScene = buildScene(
  "savings-accumulate",
  3,
  "Three weeks of saving",
  "savings.transfer-accumulate",
  9_503,
  {
    objects: [
      {
        id: "wages-origin",
        kind: "container",
        label: "Wages",
        role: "origin",
      },
      { id: "income", kind: "container", label: "Income", role: "source" },
      { id: "savings", kind: "container", label: "Savings", role: "destination" },
      { id: "week", kind: "period-marker", label: "Week", periodLabel: "Week 1" },
      {
        id: "illustrative-note",
        kind: "note",
        label: "Example figures",
        text: "Example figures, used to show how saving works. Not financial advice.",
        anchorObjectId: "income",
      },
      ...notesIn("income", noteIds.slice(2, 10)),
      ...notesIn("savings", noteIds.slice(0, 2)),
      ...notesIn("wages-origin", noteIds.slice(10, 14)),
    ],
    readouts: [
      {
        id: "income-balance",
        kind: "readout",
        label: "Income",
        containerId: "income",
        display: "balance",
      },
      {
        id: "savings-balance",
        kind: "readout",
        label: "Savings",
        containerId: "savings",
        display: "goal",
        goalMinor: 10 * NOTE_MINOR,
      },
    ],
  },
  [
    {
      id: "to-week-2",
      action: "advance-period",
      beatId: "week-two",
      durationFrames: 30,
      holdFrames: 24,
      markerId: "week",
      toPeriodLabel: "Week 2",
    },
    {
      id: "wages-week-2",
      action: "introduce",
      beatId: "deposit-two",
      durationFrames: 60,
      holdFrames: 24,
      tokenIds: ["note-11", "note-12"],
      fromOriginId: "wages-origin",
      toContainerId: "income",
      originLabel: "Week 2 wages",
    },
    {
      id: "save-week-2",
      action: "transfer",
      beatId: "deposit-two",
      offsetFrames: 90,
      durationFrames: 60,
      holdFrames: 24,
      tokenIds: ["note-11", "note-12"],
      fromContainerId: "income",
      toContainerId: "savings",
    },
    {
      id: "to-week-3",
      action: "advance-period",
      beatId: "week-three",
      durationFrames: 30,
      holdFrames: 24,
      markerId: "week",
      toPeriodLabel: "Week 3",
    },
    {
      id: "wages-week-3",
      action: "introduce",
      beatId: "deposit-three",
      durationFrames: 60,
      holdFrames: 24,
      tokenIds: ["note-13", "note-14"],
      fromOriginId: "wages-origin",
      toContainerId: "income",
      originLabel: "Week 3 wages",
    },
    {
      id: "save-week-3",
      action: "transfer",
      beatId: "deposit-three",
      offsetFrames: 90,
      durationFrames: 60,
      holdFrames: 24,
      tokenIds: ["note-13", "note-14"],
      fromContainerId: "income",
      toContainerId: "savings",
    },
    {
      id: "read-goal",
      action: "emphasise",
      beatId: "goal",
      durationFrames: 72,
      holdFrames: 48,
      objectIds: ["savings"],
    },
  ],
  {
    containerTotals: [
      { containerId: "wages-origin", totalMinor: 0 },
      { containerId: "income", totalMinor: 8 * NOTE_MINOR },
      { containerId: "savings", totalMinor: 6 * NOTE_MINOR },
    ],
    particlePhases: [],
  },
  { coin: "naira-note", "savings-jar": "savings-jar" },
);

// ===========================================================================
// Subject 2 — Evaporation
// ===========================================================================

/**
 * Accuracy review, performed against the cited source material and recorded
 * here so it is checkable rather than asserted:
 *
 * - Evaporation happens at any temperature, not only at boiling point; the
 *   narration states this explicitly and the plan never depends on heating.
 * - A molecule that leaves the surface is chemically unchanged; `substance` is
 *   fixed at water in the contract and no action can alter it.
 * - Particle count is conserved — `expectedFinalState.particlePhases` checks
 *   the two phases still add up to the sixteen we started with.
 * - The particle view is a simplification: a real glass holds on the order of
 *   10^25 molecules. The authored note says so and the magnifier asset carries
 *   the words "MAGNIFIED MODEL".
 * - The liquid is drawn as a fixed lattice, so an escaping particle leaves an
 *   empty cell rather than the water closing up. Stable slots are what stop the
 *   remaining particles shuffling every time a neighbour leaves, and object
 *   continuity outranks lattice realism here; the trade is recorded in the
 *   evaluation's simplification list rather than left for a reader to notice.
 *
 * Reviewed against: OpenStax Chemistry 2e §10.3 "Phase Transitions"
 * (evaporation, vapour pressure, kinetic-molecular explanation) and OpenStax
 * Physics §13.5 "Phase Change and Latent Heat". Both are openly licensed
 * educational texts; no text is reproduced here.
 */
export const evaporationFactInventory: readonly string[] = Object.freeze([
  "Water sits in an open glass at room temperature.",
  "Water is made of particles that are always moving, at a range of speeds.",
  "A fast-moving particle at the surface can escape into the air.",
  "An escaped particle is still water; only its position and phase changed.",
  "Evaporation does not require boiling.",
  "Escaped particles spread out into the space above the liquid.",
  "The water has not vanished — it has moved, particle by particle.",
  "The particle view is a simplified model, not a picture of real water.",
]);

const particleIds = Array.from({ length: 16 }, (_unused, index) =>
  `drop-${String(index + 1).padStart(2, "0")}`,
);

const particlesIn = (regionId: string, ids: readonly string[]) =>
  ids.map((id, index) => ({
    id,
    kind: "particle" as const,
    label: `Water particle ${index + 1}`,
    substance: "water" as const,
    phase: regionId === "vapour" ? ("vapour" as const) : ("liquid" as const),
    regionId,
    dispersion: 0,
  }));

const modelNote = {
  id: "model-note",
  kind: "note" as const,
  label: "Simplified model",
  text: "A simplified model. A real glass of water holds far more particles than could ever be drawn.",
  anchorObjectId: "liquid",
};

const evaporationRegions = [
  { id: "liquid", kind: "region" as const, label: "Water", role: "liquid-body" as const },
  {
    id: "vapour",
    kind: "region" as const,
    label: "Air above the water",
    role: "vapour-space" as const,
  },
];

const evaporationSetupScene = buildScene(
  "evaporation-setup",
  1,
  "A glass of water, up close",
  "evaporation.surface-to-vapour",
  9_511,
  {
    objects: [
      ...evaporationRegions,
      modelNote,
      ...particlesIn("liquid", particleIds),
    ],
    readouts: [],
  },
  [
    {
      id: "see-surface",
      action: "emphasise",
      beatId: "still-water",
      durationFrames: 66,
      holdFrames: 30,
      objectIds: particleIds.slice(0, 4),
    },
    {
      id: "see-particles",
      action: "emphasise",
      beatId: "look-closer",
      durationFrames: 96,
      holdFrames: 30,
      objectIds: particleIds,
    },
    {
      id: "say-model",
      action: "annotate",
      beatId: "model-note",
      durationFrames: 45,
      holdFrames: 0,
      noteId: "model-note",
    },
  ],
  {
    containerTotals: [],
    particlePhases: [
      { phase: "liquid", count: 16 },
      { phase: "vapour", count: 0 },
    ],
  },
  { vessel: "water-vessel", magnifier: "magnifier-frame" },
);

const evaporationEscapeScene = buildScene(
  "evaporation-escape",
  2,
  "A particle breaks away",
  "evaporation.surface-to-vapour",
  9_512,
  {
    objects: [
      ...evaporationRegions,
      modelNote,
      {
        id: "identity-note",
        kind: "note",
        label: "Still water",
        text: "Still water. The particle has not changed — only where it is has changed.",
        anchorObjectId: "vapour",
      },
      ...particlesIn("liquid", particleIds),
    ],
    readouts: [],
  },
  [
    {
      id: "see-motion",
      action: "emphasise",
      beatId: "energy",
      durationFrames: 90,
      holdFrames: 30,
      objectIds: particleIds,
    },
    {
      id: "first-escape",
      action: "detach",
      beatId: "escape",
      durationFrames: 60,
      holdFrames: 30,
      particleIds: ["drop-01"],
      fromRegionId: "liquid",
      toRegionId: "vapour",
    },
    {
      id: "two-more-escape",
      action: "detach",
      beatId: "escape",
      offsetFrames: 96,
      durationFrames: 60,
      holdFrames: 30,
      particleIds: ["drop-02", "drop-03"],
      fromRegionId: "liquid",
      toRegionId: "vapour",
    },
    {
      id: "say-identity",
      action: "annotate",
      beatId: "identity",
      durationFrames: 45,
      holdFrames: 0,
      noteId: "identity-note",
    },
    {
      id: "look-at-escaped",
      action: "emphasise",
      beatId: "identity",
      offsetFrames: 24,
      durationFrames: 66,
      holdFrames: 36,
      objectIds: ["drop-01", "drop-02", "drop-03"],
    },
  ],
  {
    containerTotals: [],
    particlePhases: [
      { phase: "liquid", count: 13 },
      { phase: "vapour", count: 3 },
    ],
  },
  { vessel: "water-vessel", magnifier: "magnifier-frame" },
);

const evaporationSpreadScene = buildScene(
  "evaporation-spread",
  3,
  "Spreading into the air",
  "evaporation.surface-to-vapour",
  9_513,
  {
    objects: [
      ...evaporationRegions,
      modelNote,
      {
        id: "conserved-note",
        kind: "note",
        label: "Nothing lost",
        text: "The water has not disappeared. Every particle is still water, now in the air.",
        anchorObjectId: "vapour",
      },
      ...particlesIn("liquid", particleIds.slice(3)),
      ...particlesIn("vapour", particleIds.slice(0, 3)),
    ],
    readouts: [],
  },
  [
    {
      id: "spread-out",
      action: "disperse",
      beatId: "spread",
      durationFrames: 90,
      holdFrames: 36,
      particleIds: ["drop-01", "drop-02", "drop-03"],
      toDispersion: 2,
    },
    {
      id: "more-escape",
      action: "detach",
      beatId: "no-boiling",
      durationFrames: 66,
      holdFrames: 30,
      particleIds: ["drop-04", "drop-05"],
      fromRegionId: "liquid",
      toRegionId: "vapour",
    },
    {
      id: "spread-further",
      action: "disperse",
      beatId: "conserved",
      durationFrames: 96,
      holdFrames: 48,
      particleIds: ["drop-01", "drop-02", "drop-03", "drop-04", "drop-05"],
      toDispersion: 3,
    },
    {
      id: "say-conserved",
      action: "annotate",
      beatId: "conserved",
      offsetFrames: 12,
      durationFrames: 45,
      holdFrames: 0,
      noteId: "conserved-note",
    },
  ],
  {
    containerTotals: [],
    particlePhases: [
      { phase: "liquid", count: 11 },
      { phase: "vapour", count: 5 },
    ],
  },
  { vessel: "water-vessel", magnifier: "magnifier-frame" },
);

// ===========================================================================
// Demonstration composition props
// ===========================================================================

const assetsFor = (ids: readonly string[]) =>
  Object.fromEntries(ids.map((id) => [id, demonstrationAssetLibrary[id]!]));

export const savingsDemonstrationFixture: DemonstrationCompositionProps =
  demonstrationCompositionPropsSchema.parse({
    fixtureId: "savings-demonstration",
    approach: "demonstration",
    assets: assetsFor(["naira-note", "savings-jar"]),
    captions: captionsForSubject(savingsTrackIds),
    narrationTracks: [
      track("savings-intro"),
      track("savings-transfer"),
      track("savings-accumulate"),
    ],
    scenes: [savingsIntroScene, savingsTransferScene, savingsAccumulateScene],
  });

export const evaporationDemonstrationFixture: DemonstrationCompositionProps =
  demonstrationCompositionPropsSchema.parse({
    fixtureId: "evaporation-demonstration",
    approach: "demonstration",
    assets: assetsFor(["water-vessel", "magnifier-frame"]),
    captions: captionsForSubject(evaporationTrackIds),
    narrationTracks: [
      track("evaporation-setup"),
      track("evaporation-escape"),
      track("evaporation-spread"),
    ],
    scenes: [
      evaporationSetupScene,
      evaporationEscapeScene,
      evaporationSpreadScene,
    ],
  });

// ===========================================================================
// Standard equivalents
// ===========================================================================

/**
 * The same two subjects, authored against the existing production scene
 * templates and rendered by the existing `FullLessonComposition`.
 *
 * These are not strawmen. Each scene states every fact its demonstration
 * counterpart animates, uses the same narration recording, the same caption
 * cues, the same scene boundaries and the same `mvp-default` theme. The
 * comparison is between two honest treatments of identical material, which is
 * the only version of it worth showing a tester.
 *
 * They parse through `sceneSpecSchema` rather than being cast into shape, so
 * the standard side of the comparison is held to the production contract.
 */
function standardScene(
  trackId: string,
  order: number,
  title: string,
  template: SceneSpec["template"],
  visual: unknown,
  onScreenText: readonly string[],
): SceneSpec {
  const source = track(trackId);
  return sceneSpecSchema.parse({
    id: source.sceneId,
    order,
    title,
    narration: source.beats.map((beat) => beat.text).join(" "),
    durationSeconds: sceneSecondsFor(trackId),
    onScreenText: [...onScreenText],
    transition: "fade",
    assetBindings: [],
    sourceRefs: [],
    generatedAdditions: [],
    template,
    visual,
  });
}

export const savingsStandardScenes: readonly SceneSpec[] = Object.freeze([
  standardScene(
    "savings-intro",
    1,
    "Ten notes, ten thousand naira",
    "definition",
    {
      term: "₦10,000 as ten notes",
      definition: "Ten notes of ₦1,000 each add up to ₦10,000.",
      exampleLabel: "Example figures",
      exampleText: "Illustrative only, not financial advice.",
    },
    ["10 × ₦1,000 = ₦10,000", "Example figures, not financial advice"],
  ),
  standardScene(
    "savings-transfer",
    2,
    "Two notes into savings",
    "process",
    {
      steps: [
        "Start the week with ₦10,000 as ten notes.",
        "Move two notes from income into savings.",
        "₦8,000 is left to spend; ₦2,000 is saved.",
      ],
    },
    ["Income ₦8,000", "Savings ₦2,000"],
  ),
  standardScene(
    "savings-accumulate",
    3,
    "Three weeks of saving",
    "summary",
    {
      takeaways: [
        { text: "Weeks 2 and 3 each bring wages, and two notes are saved from each." },
        { text: "After three weeks, ₦6,000 is saved against a ₦10,000 goal." },
        { text: "Income stays at ₦8,000 a week; only the savings grow." },
      ],
      centralModel: "Save the same two notes every week",
      callToAction: "Choose an amount you can repeat every week.",
    },
    ["Week 3: ₦6,000 saved", "Goal: ₦10,000"],
  ),
]);

export const evaporationStandardScenes: readonly SceneSpec[] = Object.freeze([
  standardScene(
    "evaporation-setup",
    1,
    "A glass of water, up close",
    "hook",
    {
      question: "Where does water go when a glass is left standing?",
      prompt: "Look closer than the eye can see",
      // Two, not three: the production scene runtime's layout capacity check
      // rejects a third chip alongside this question and prompt, and the
      // standard fixture is held to the production contract like any lesson.
      supportingElements: ["Water", "Air"],
    },
    ["Room temperature", "A simplified particle model"],
  ),
  standardScene(
    "evaporation-escape",
    2,
    "A particle breaks away",
    "definition",
    {
      term: "Evaporation",
      definition:
        "Fast-moving particles escape a liquid's surface into the air.",
      exampleLabel: "Still water",
      exampleText: "Only its position changes, not the substance.",
    },
    [
      "Particles move at a range of speeds",
      "A fast particle at the surface can escape",
    ],
  ),
  standardScene(
    "evaporation-spread",
    3,
    "Spreading into the air",
    "summary",
    {
      takeaways: [
        { text: "Escaped particles spread out into the space above the liquid." },
        { text: "Evaporation happens without boiling; the water need not be hot." },
        { text: "The water has not vanished — it has moved, particle by particle." },
      ],
      centralModel: "Water moves into the air one particle at a time",
    },
    ["No boiling required", "Nothing is destroyed"],
  ),
]);

/**
 * Props for the existing `FullLessonComposition`, sharing the demonstration's
 * audio and captions.
 *
 * Parsed through the production `fullLessonCompositionPropsSchema` rather than
 * assembled loosely: that check enforces that every scene has exactly one
 * narration track and that every caption cue sits inside its own scene's
 * timeline, so the claim that the two approaches share a timeline is verified
 * by the production contract rather than asserted by this file.
 */
export type StandardLessonFixture = Readonly<{
  fixtureId: string;
  props: FullLessonCompositionProps;
}>;

function standardFixture(
  fixtureId: string,
  trackIds: readonly string[],
  scenes: readonly SceneSpec[],
): StandardLessonFixture {
  return Object.freeze({
    fixtureId,
    props: fullLessonCompositionPropsSchema.parse({
      assets: {},
      captions: captionsForSubject(trackIds).map((cue) => ({ ...cue })),
      lesson: { scenes: scenes.map((scene) => ({ ...scene })) },
      narrationTracks: trackIds.map((trackId) => {
        const source = track(trackId);
        return {
          kind: "browser-audio" as const,
          sceneId: source.sceneId,
          src: source.src,
        };
      }),
    }),
  });
}

export const savingsStandardFixture: StandardLessonFixture = standardFixture(
  "savings-standard",
  savingsTrackIds,
  savingsStandardScenes,
);

export const evaporationStandardFixture: StandardLessonFixture =
  standardFixture(
    "evaporation-standard",
    evaporationTrackIds,
    evaporationStandardScenes,
  );

export const demonstrationSubjects = Object.freeze({
  savings: Object.freeze({
    label: "Saving a little, every week",
    demonstration: savingsDemonstrationFixture,
    standard: savingsStandardFixture,
    facts: savingsFactInventory,
  }),
  evaporation: Object.freeze({
    label: "Evaporation",
    demonstration: evaporationDemonstrationFixture,
    standard: evaporationStandardFixture,
    facts: evaporationFactInventory,
  }),
});
