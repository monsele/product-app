/**
 * ST-097 production creative-design contract. This is deliberately distinct
 * from the ST-094 proof contract: it describes resolved tenant data, never
 * executable layout instructions or proof fixtures.
 */
import { sha256 } from "@avlp/config";
import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
/** Every registered production pack currently has one immutable release. */
export const creativeDesignPackVersion = "1.0.0" as const;
const version = z.literal(creativeDesignPackVersion);

export const creativeDesignManifestVersion = "1.0" as const;
/**
 * Planner releases are immutable inputs to a resolved manifest. Keep the
 * ST-097 value readable for already-approved snapshots, but write ST-100 for
 * the expanded catalogue and rhythm rules.
 */
export const legacyCreativeDesignPlannerVersion = "st-097-planner-v1" as const;
export const creativeDesignPlannerVersion = "st-101-planner-v1" as const;
export const creativeDesignPlannerVersions = [
  legacyCreativeDesignPlannerVersion,
  "st-100-planner-v1",
  creativeDesignPlannerVersion,
] as const;
export const creativeDesignHashPolicy = "st-097-canonical-json-v1" as const;
export const creativeDesignPackIds = [
  "essential",
  "editorial",
  "everyday",
  "systems",
  "field-notes",
  "prism",
] as const;
export const creativeDesignPackIdSchema = z.enum(creativeDesignPackIds);
export type CreativeDesignPackId = z.infer<typeof creativeDesignPackIdSchema>;
export const creativeDesignSceneTypes = [
  "hook",
  "definition",
  "process",
  "input-process-output",
  "comparison",
  "cause-effect",
  "labelled-diagram",
  "analogy",
  "worked-example",
  "summary",
] as const;
const legacyCreativeDesignSceneTypes = [
  "hook",
  "definition",
  "process",
  "comparison",
] as const;
export const creativeDesignSceneTypeSchema = z.enum(creativeDesignSceneTypes);
export type CreativeDesignSceneType = z.infer<
  typeof creativeDesignSceneTypeSchema
>;
export const creativeDesignApproachSchema = z.literal("standard");
export const creativeDesignMotionEnergySchema = z.enum([
  "calm",
  "balanced",
  "lively",
]);
export const creativeDesignImagerySchema = z.enum([
  "photography",
  "illustration",
  "diagrams",
  "compatible_mix",
]);
export const creativeDesignCaptionPresetSchema = z.enum([
  "standard",
  "high_contrast",
  "large",
]);
export const creativeDesignFontPairSchema = z.enum([
  "atkinson-inter",
  "source-serif-inter",
  "nunito-inter",
]);

export const creativeDesignTreatmentIds = creativeDesignPackIds.flatMap(
  (pack) =>
    creativeDesignSceneTypes.flatMap((scene) => [
      `${pack}.${scene}.primary`,
      `${pack}.${scene}.alternate`,
    ]),
) as [string, ...string[]];
export const creativeDesignTreatmentIdSchema = z.enum(
  creativeDesignTreatmentIds,
);
export type CreativeDesignTreatmentId = z.infer<
  typeof creativeDesignTreatmentIdSchema
>;

export const creativeDesignSettingsSchema = z
  .object({
    colors: z
      .object({
        background: hexColor,
        surface: hexColor,
        text: hexColor,
        accent: hexColor,
        diagramEmphasis: hexColor,
      })
      .strict(),
    fontPair: creativeDesignFontPairSchema,
    logoAssetId: identifierSchema.nullable(),
    motionEnergy: creativeDesignMotionEnergySchema,
    imageryPreference: creativeDesignImagerySchema,
    captionPreset: creativeDesignCaptionPresetSchema,
  })
  .strict();
export type CreativeDesignSettings = z.infer<
  typeof creativeDesignSettingsSchema
>;

export const defaultCreativeDesignSettings = Object.freeze({
  colors: Object.freeze({
    background: "#f8fafc",
    surface: "#ffffff",
    text: "#172033",
    accent: "#5b21b6",
    diagramEmphasis: "#2563eb",
  }),
  fontPair: "atkinson-inter" as const,
  logoAssetId: null,
  motionEnergy: "balanced" as const,
  imageryPreference: "compatible_mix" as const,
  captionPreset: "standard" as const,
});

/**
 * Each pack's starting look. Before this, every pack started from
 * `defaultCreativeDesignSettings`, so switching pack changed only layouts and
 * every lesson shared one palette. Every entry passes the contrast preflight
 * in `validateCreativeDesignManifest` (asserted in creative-design.test).
 */
export const creativeDesignPackDefaultSettings: Readonly<
  Record<CreativeDesignPackId, CreativeDesignSettings>
> = Object.freeze({
  essential: Object.freeze({
    colors: Object.freeze({
      background: "#fbf8f3",
      surface: "#ffffff",
      text: "#1a1a1a",
      accent: "#b42318",
      diagramEmphasis: "#1f6feb",
    }),
    fontPair: "atkinson-inter" as const,
    logoAssetId: null,
    motionEnergy: "calm" as const,
    imageryPreference: "compatible_mix" as const,
    captionPreset: "standard" as const,
  }),
  editorial: Object.freeze({
    colors: Object.freeze({
      background: "#f7f1e3",
      surface: "#fffaf0",
      text: "#22201c",
      accent: "#b45309",
      diagramEmphasis: "#7c2d12",
    }),
    fontPair: "source-serif-inter" as const,
    logoAssetId: null,
    motionEnergy: "balanced" as const,
    imageryPreference: "photography" as const,
    captionPreset: "standard" as const,
  }),
  everyday: Object.freeze({
    colors: Object.freeze({
      background: "#fdf8ec",
      surface: "#ffffff",
      text: "#13234a",
      accent: "#1d4ed8",
      diagramEmphasis: "#0f9d77",
    }),
    fontPair: "nunito-inter" as const,
    logoAssetId: null,
    motionEnergy: "lively" as const,
    imageryPreference: "illustration" as const,
    captionPreset: "standard" as const,
  }),
  systems: Object.freeze({
    colors: Object.freeze({
      background: "#0f172a",
      surface: "#1e293b",
      text: "#e2e8f0",
      accent: "#38bdf8",
      diagramEmphasis: "#22d3ee",
    }),
    fontPair: "atkinson-inter" as const,
    logoAssetId: null,
    motionEnergy: "balanced" as const,
    imageryPreference: "diagrams" as const,
    captionPreset: "standard" as const,
  }),
  "field-notes": Object.freeze({
    colors: Object.freeze({
      background: "#f4efe4",
      surface: "#fbf8f1",
      text: "#2b2b2b",
      accent: "#a8431b",
      diagramEmphasis: "#5b6b2f",
    }),
    fontPair: "source-serif-inter" as const,
    logoAssetId: null,
    motionEnergy: "calm" as const,
    imageryPreference: "illustration" as const,
    captionPreset: "standard" as const,
  }),
  prism: Object.freeze({
    colors: Object.freeze({
      background: "#3b0764",
      surface: "#4c1d95",
      text: "#ffffff",
      accent: "#facc15",
      diagramEmphasis: "#f472b6",
    }),
    fontPair: "nunito-inter" as const,
    logoAssetId: null,
    motionEnergy: "lively" as const,
    imageryPreference: "compatible_mix" as const,
    captionPreset: "standard" as const,
  }),
});

export const creativeDesignSceneSelectionSchema = z
  .object({
    treatmentId: creativeDesignTreatmentIdSchema,
    treatmentVersion: z.literal("1.0.0"),
    locked: z.boolean(),
    requiredHoldFrames: z.number().int().min(30).max(600),
  })
  .strict();
export type CreativeDesignSceneSelection = z.infer<
  typeof creativeDesignSceneSelectionSchema
>;

export const creativeDesignManifestSchema = z
  .object({
    manifestVersion: z.literal(creativeDesignManifestVersion),
    plannerVersion: z.enum(creativeDesignPlannerVersions),
    pack: z.object({ id: creativeDesignPackIdSchema, version }).strict(),
    approach: creativeDesignApproachSchema,
    settings: creativeDesignSettingsSchema,
    selections: z.record(identifierSchema, creativeDesignSceneSelectionSchema),
    presetVersionId: identifierSchema.nullable(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (manifest.plannerVersion !== legacyCreativeDesignPlannerVersion) return;
    for (const [sceneId, selection] of Object.entries(manifest.selections)) {
      const candidate = creativeDesignCatalogue.find(
        (item) => item.id === selection.treatmentId,
      );
      if (
        candidate !== undefined &&
        !legacyCreativeDesignSceneTypes.includes(
          candidate.sceneType as (typeof legacyCreativeDesignSceneTypes)[number],
        )
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selections", sceneId, "treatmentId"],
          message:
            "ST-097 planner manifests support only hook, definition, process, and comparison treatments.",
        });
    }
  });
export type CreativeDesignManifest = z.infer<
  typeof creativeDesignManifestSchema
>;

export const creativeDesignDraftInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    manifest: creativeDesignManifestSchema,
  })
  .strict();
export const creativeDesignPlanInputSchema = z
  .object({
    packId: creativeDesignPackIdSchema,
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export const creativeDesignNaturalLanguageInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    request: text(1_000),
  })
  .strict();
export const creativeDesignProposalPatchSchema = z
  .object({
    motionEnergy: creativeDesignMotionEnergySchema.optional(),
    imageryPreference: creativeDesignImagerySchema.optional(),
    captionPreset: creativeDesignCaptionPresetSchema.optional(),
    colors: creativeDesignSettingsSchema.shape.colors
      .partial()
      .strict()
      .optional(),
    fontPair: creativeDesignFontPairSchema.optional(),
  })
  .strict();
export type CreativeDesignProposalPatch = z.infer<
  typeof creativeDesignProposalPatchSchema
>;

export const creativeDesignPresetInputSchema = z
  .object({
    name: text(80),
    expectedRevision: z.number().int().nonnegative().optional(),
    manifest: creativeDesignManifestSchema,
  })
  .strict();

export const creativeDesignApplyPresetInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    versionId: identifierSchema.optional(),
  })
  .strict();

export type CreativeDesignCandidate = Readonly<{
  id: CreativeDesignTreatmentId;
  packId: CreativeDesignPackId;
  sceneType: CreativeDesignSceneType;
  family:
    | "split"
    | "subject"
    | "path"
    | "panels"
    | "rows"
    | "question"
    | "flow"
    | "staged"
    | "chain"
    | "divergent"
    | "annotated"
    | "focused"
    | "parallel"
    | "metaphor"
    | "stepwise"
    | "walkthrough"
    | "recap-cards"
    | "central-takeaway";
  variant: "primary" | "alternate";
  minDurationSeconds: number;
  supportedApproaches: readonly ["standard"];
  requiredContent: readonly ("title" | "narration" | "on_screen_text")[];
  requiredAssetKinds: readonly ("none" | "approved_scene_asset" | "diagram")[];
  textLimits: Readonly<{ maxCharacters: number; maxItems: number }>;
  layout: Readonly<{ safeInsetPx: number; textColumns: 1 | 2 }>;
  timing: Readonly<{
    establishFrames: number;
    explainFrames: number;
    holdFrames: number;
    exitFrames: number;
  }>;
  density: "low" | "medium";
  motionIntensity: "calm" | "balanced" | "lively";
}>;

const familyFor = (
  sceneType: CreativeDesignSceneType,
  variant: "primary" | "alternate",
): CreativeDesignCandidate["family"] => {
  if (sceneType === "hook")
    return variant === "primary" ? "question" : "subject";
  if (sceneType === "definition")
    return variant === "primary" ? "split" : "subject";
  if (sceneType === "process") return variant === "primary" ? "path" : "panels";
  if (sceneType === "input-process-output")
    return variant === "primary" ? "flow" : "staged";
  if (sceneType === "comparison")
    return variant === "primary" ? "panels" : "rows";
  if (sceneType === "cause-effect")
    return variant === "primary" ? "chain" : "divergent";
  if (sceneType === "labelled-diagram")
    return variant === "primary" ? "annotated" : "focused";
  if (sceneType === "analogy")
    return variant === "primary" ? "parallel" : "metaphor";
  if (sceneType === "worked-example")
    return variant === "primary" ? "stepwise" : "walkthrough";
  return variant === "primary" ? "recap-cards" : "central-takeaway";
};

const minDurationFor = (sceneType: CreativeDesignSceneType): number => {
  if (sceneType === "worked-example") return 7;
  if (
    sceneType === "process" ||
    sceneType === "cause-effect" ||
    sceneType === "labelled-diagram"
  )
    return 6;
  if (
    sceneType === "comparison" ||
    sceneType === "analogy" ||
    sceneType === "input-process-output" ||
    sceneType === "summary"
  )
    return 5;
  return 4;
};

const textLimitsFor = (
  sceneType: CreativeDesignSceneType,
): Readonly<{ maxCharacters: number; maxItems: number }> => {
  if (sceneType === "worked-example")
    return { maxCharacters: 400, maxItems: 12 };
  if (sceneType === "labelled-diagram")
    return { maxCharacters: 320, maxItems: 12 };
  if (sceneType === "comparison" || sceneType === "cause-effect")
    return { maxCharacters: 300, maxItems: 8 };
  if (sceneType === "input-process-output" || sceneType === "summary")
    return { maxCharacters: 280, maxItems: 6 };
  if (sceneType === "process") return { maxCharacters: 220, maxItems: 6 };
  return { maxCharacters: 220, maxItems: 4 };
};

const textColumnsFor = (
  sceneType: CreativeDesignSceneType,
  variant: "primary" | "alternate",
): 1 | 2 => {
  if (sceneType === "comparison" || sceneType === "analogy") return 2;
  if (sceneType === "labelled-diagram" && variant === "alternate") return 2;
  return 1;
};

const timingFor = (
  sceneType: CreativeDesignSceneType,
): Readonly<{
  establishFrames: number;
  explainFrames: number;
  holdFrames: number;
  exitFrames: number;
}> => {
  if (sceneType === "worked-example")
    return {
      establishFrames: 12,
      explainFrames: 42,
      holdFrames: 105,
      exitFrames: 12,
    };
  if (
    sceneType === "process" ||
    sceneType === "cause-effect" ||
    sceneType === "labelled-diagram"
  )
    return {
      establishFrames: 12,
      explainFrames: 36,
      holdFrames: 90,
      exitFrames: 12,
    };
  if (sceneType === "summary")
    return {
      establishFrames: 12,
      explainFrames: 24,
      holdFrames: 80,
      exitFrames: 12,
    };
  if (sceneType === "input-process-output" || sceneType === "analogy")
    return {
      establishFrames: 12,
      explainFrames: 30,
      holdFrames: 75,
      exitFrames: 12,
    };
  return {
    establishFrames: 12,
    explainFrames: 24,
    holdFrames: 60,
    exitFrames: 12,
  };
};

const densityFor = (sceneType: CreativeDesignSceneType): "low" | "medium" => {
  if (
    sceneType === "process" ||
    sceneType === "comparison" ||
    sceneType === "cause-effect" ||
    sceneType === "labelled-diagram" ||
    sceneType === "worked-example"
  )
    return "medium";
  return "low";
};

export const creativeDesignCatalogue: readonly CreativeDesignCandidate[] =
  Object.freeze(
    creativeDesignPackIds.flatMap((packId) =>
      creativeDesignSceneTypes.flatMap((sceneType) =>
        (["primary", "alternate"] as const).map((variant) =>
          Object.freeze({
            id: `${packId}.${sceneType}.${variant}` as CreativeDesignTreatmentId,
            packId,
            sceneType,
            family: familyFor(sceneType, variant),
            variant,
            minDurationSeconds: minDurationFor(sceneType),
            supportedApproaches: ["standard"] as const,
            requiredContent:
              sceneType === "process"
                ? (["title", "narration", "on_screen_text"] as const)
                : (["title", "narration"] as const),
            // These treatments use the scene's already-resolved evidence;
            // no treatment invents or requires a new asset at plan time.
            requiredAssetKinds: ["none"] as const,
            textLimits: textLimitsFor(sceneType),
            layout: {
              safeInsetPx: packId === "everyday" ? 96 : 72,
              textColumns: textColumnsFor(sceneType, variant),
            },
            timing: timingFor(sceneType),
            density: densityFor(sceneType),
            motionIntensity:
              packId === "essential"
                ? "calm"
                : packId === "editorial"
                  ? "balanced"
                  : "lively",
          }),
        ),
      ),
    ),
  );

export function creativeDesignCapability(
  input: Readonly<{
    approach: string;
    scenes: readonly Readonly<{
      id: string;
      template: string;
      durationSeconds: number;
      processShape?: "legacy" | "graph";
    }>[];
  }>,
): readonly string[] {
  const issues: string[] = [];
  if (input.approach !== "standard")
    issues.push(
      "Creative styles currently support the standard video approach only.",
    );
  for (const scene of input.scenes) {
    if (!creativeDesignSceneTypeSchema.safeParse(scene.template).success)
      issues.push(
        `Scene ${scene.id} uses unsupported template ${scene.template}.`,
      );
    else if (
      scene.template === "process" &&
      scene.processShape !== undefined &&
      !["legacy", "graph"].includes(scene.processShape)
    )
      issues.push(`Scene ${scene.id} has an unsupported process form.`);
    else if (scene.durationSeconds < 4)
      issues.push(
        `Scene ${scene.id} is too short for a readable treatment hold.`,
      );
  }
  return Object.freeze(issues);
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const component =
      Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function creativeDesignContrastRatio(
  left: string,
  right: string,
): number {
  const high = Math.max(relativeLuminance(left), relativeLuminance(right));
  const low = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (high + 0.05) / (low + 0.05);
}

/**
 * Deterministic preflight checks which can run before a snapshot is written.
 * Browser measurements remain an additional renderer check; this protects the
 * persistence boundary so an invalid theme can never be partially applied.
 */
export function validateCreativeDesignManifest(
  manifest: CreativeDesignManifest,
  scenes: readonly Readonly<{
    id: string;
    template: string;
    durationSeconds: number;
  }>[],
): readonly string[] {
  const issues = [
    ...creativeDesignCapability({ approach: manifest.approach, scenes }),
  ];
  const colors = manifest.settings.colors;
  if (creativeDesignContrastRatio(colors.text, colors.background) < 4.5)
    issues.push(
      "Text color must have at least 4.5:1 contrast against the background.",
    );
  if (creativeDesignContrastRatio(colors.text, colors.surface) < 4.5)
    issues.push(
      "Text color must have at least 4.5:1 contrast against the surface.",
    );
  if (creativeDesignContrastRatio(colors.accent, colors.background) < 3)
    issues.push(
      "Accent color must have at least 3:1 contrast against the background.",
    );
  for (const scene of scenes) {
    const selection = manifest.selections[scene.id];
    if (selection === undefined) {
      issues.push(`Scene ${scene.id} has no resolved treatment.`);
      continue;
    }
    const candidate = creativeDesignCatalogue.find(
      (item) => item.id === selection.treatmentId,
    );
    if (
      candidate === undefined ||
      candidate.packId !== manifest.pack.id ||
      candidate.sceneType !== scene.template ||
      candidate.minDurationSeconds > scene.durationSeconds
    )
      issues.push(`Scene ${scene.id} has an incompatible saved treatment.`);
    else if (selection.requiredHoldFrames < candidate.timing.holdFrames)
      issues.push(
        `Scene ${scene.id} does not preserve the ${candidate.timing.holdFrames}-frame readable hold required by its treatment.`,
      );
    else if (
      selection.requiredHoldFrames +
        candidate.timing.establishFrames +
        candidate.timing.explainFrames +
        candidate.timing.exitFrames >
      Math.floor(scene.durationSeconds * 30)
    )
      issues.push(
        `Scene ${scene.id} is too short for its resolved treatment timing.`,
      );
  }
  for (const sceneId of Object.keys(manifest.selections))
    if (!scenes.some((scene) => scene.id === sceneId))
      issues.push(`Saved treatment ${sceneId} does not belong to this lesson.`);
  return Object.freeze(issues);
}

export function treatmentFor(
  id: CreativeDesignTreatmentId,
): CreativeDesignCandidate {
  const result = creativeDesignCatalogue.find(
    (candidate) => candidate.id === id,
  );
  if (result === undefined)
    throw new Error("Registered treatment missing from catalogue.");
  return result;
}

const holdFramesForScene = (sceneType: CreativeDesignSceneType): number => {
  if (sceneType === "worked-example") return 105;
  if (
    sceneType === "process" ||
    sceneType === "cause-effect" ||
    sceneType === "labelled-diagram"
  )
    return 90;
  if (sceneType === "summary") return 80;
  if (sceneType === "input-process-output" || sceneType === "analogy")
    return 75;
  return 60;
};

/** Stable planner: score is named, output never depends on random ordering. */
export function planCreativeDesign(
  input: Readonly<{
    packId: CreativeDesignPackId;
    scenes: readonly Readonly<{
      id: string;
      template: CreativeDesignSceneType;
      durationSeconds: number;
    }>[];
    locks?: Readonly<Record<string, CreativeDesignTreatmentId>>;
  }>,
): Readonly<Record<string, CreativeDesignSceneSelection>> {
  const selections: Record<string, CreativeDesignSceneSelection> = {};
  let previousFamily: CreativeDesignCandidate["family"] | undefined;
  const totalScenes = input.scenes.length;
  for (const [index, scene] of input.scenes.entries()) {
    const locked = input.locks?.[scene.id];
    const candidates = creativeDesignCatalogue.filter(
      (candidate) =>
        candidate.packId === input.packId &&
        candidate.sceneType === scene.template &&
        candidate.minDurationSeconds <= scene.durationSeconds,
    );
    const chosen =
      locked === undefined
        ? [...candidates].sort((left, right) => {
            const isOpening = index === 0 && scene.template === "hook";
            const isClosing =
              index === totalScenes - 1 && scene.template === "summary";
            const rhythmBonus = (candidate: CreativeDesignCandidate) => {
              if (isOpening && candidate.family === "question") return 5;
              if (isClosing && candidate.family === "recap-cards") return 5;
              return 0;
            };
            const leftScore =
              (left.family === previousFamily ? -10 : 0) +
              (left.variant === "primary" ? 1 : 0) +
              rhythmBonus(left);
            const rightScore =
              (right.family === previousFamily ? -10 : 0) +
              (right.variant === "primary" ? 1 : 0) +
              rhythmBonus(right);
            return rightScore - leftScore || left.id.localeCompare(right.id);
          })[0]
        : candidates.find((candidate) => candidate.id === locked);
    if (chosen === undefined)
      throw new Error(
        `No valid treatment is available for scene ${scene.id}; preserve its lock as a conflict.`,
      );
    selections[scene.id] = Object.freeze({
      treatmentId: chosen.id,
      treatmentVersion: "1.0.0",
      locked: locked !== undefined,
      requiredHoldFrames: holdFramesForScene(scene.template),
    });
    previousFamily = chosen.family;
  }
  return Object.freeze(selections);
}

export function createDefaultCreativeDesignManifest(
  input: Readonly<{
    packId: CreativeDesignPackId;
    scenes: readonly Readonly<{
      id: string;
      template: CreativeDesignSceneType;
      durationSeconds: number;
    }>[];
  }>,
): CreativeDesignManifest {
  return creativeDesignManifestSchema.parse({
    manifestVersion: "1.0",
    plannerVersion: creativeDesignPlannerVersion,
    pack: { id: input.packId, version: "1.0.0" },
    approach: "standard",
    settings: creativeDesignPackDefaultSettings[input.packId],
    selections: planCreativeDesign(input),
    presetVersionId: null,
  });
}

/**
 * The design a new storyboard revision inherits from the previous one. A
 * snapshot is pinned to an exact revision, so every revision bump (duration
 * reconciliation, scene edits, regeneration) must re-pin it or the lesson
 * silently falls back to the legacy `mvp-default` look.
 *
 * Keeps the previous design untouched while it still fits. When it no longer
 * fits (a regenerated scene changed template, a retime made a scene too short
 * for its treatment), re-plans the same pack, keeping the teacher's settings
 * and every lock that still fits. Returns `undefined` when there is nothing to
 * carry or the pack cannot cover these scenes: the caller keeps the lesson on
 * the legacy look rather than inventing a different style.
 */
export function carryForwardCreativeDesignManifest(
  input: Readonly<{
    previous: CreativeDesignManifest | undefined;
    packId?: CreativeDesignPackId | null;
    scenes: readonly Readonly<{
      id: string;
      template: string;
      durationSeconds: number;
    }>[];
  }>,
): CreativeDesignManifest | undefined {
  const { previous, scenes } = input;
  if (
    previous !== undefined &&
    validateCreativeDesignManifest(previous, scenes).length === 0
  )
    return previous;
  const packId = previous?.pack.id ?? input.packId ?? undefined;
  if (packId === undefined) return undefined;
  if (
    creativeDesignCapability({ approach: "standard", scenes }).length > 0
  )
    return undefined;
  const typedScenes = scenes.map((scene) => ({
    id: scene.id,
    template: scene.template as CreativeDesignSceneType,
    durationSeconds: scene.durationSeconds,
  }));
  const planWith = (
    locks: Readonly<Record<string, CreativeDesignTreatmentId>> | undefined,
  ) => {
    try {
      return planCreativeDesign({
        packId,
        scenes: typedScenes,
        ...(locks === undefined ? {} : { locks }),
      });
    } catch {
      return undefined;
    }
  };
  const fittingLocks =
    previous === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(previous.selections).filter(([sceneId, selection]) => {
            if (!selection.locked) return false;
            const scene = typedScenes.find((item) => item.id === sceneId);
            const candidate = creativeDesignCatalogue.find(
              (item) => item.id === selection.treatmentId,
            );
            return (
              scene !== undefined &&
              candidate !== undefined &&
              candidate.packId === packId &&
              candidate.sceneType === scene.template &&
              candidate.minDurationSeconds <= scene.durationSeconds
            );
          }).map(([sceneId, selection]) => [sceneId, selection.treatmentId]),
        );
  const selections = planWith(fittingLocks) ?? planWith(undefined);
  if (selections === undefined) return undefined;
  const manifest = creativeDesignManifestSchema.parse({
    manifestVersion: creativeDesignManifestVersion,
    plannerVersion: creativeDesignPlannerVersion,
    pack: { id: packId, version: creativeDesignPackVersion },
    approach: "standard",
    settings: previous?.settings ?? creativeDesignPackDefaultSettings[packId],
    selections,
    presetVersionId: previous?.presetVersionId ?? null,
  });
  return validateCreativeDesignManifest(manifest, scenes).length === 0
    ? manifest
    : undefined;
}

const packSubjectKeywords: readonly (readonly [
  CreativeDesignPackId,
  readonly string[],
])[] = [
  [
    "systems",
    [
      "comput", "software", "program", "network", "engineer", "electr",
      "circuit", "data", "algorithm", "technolog", "machine", "system",
      "mechanic", "physics", "structur", "cyber",
    ],
  ],
  [
    "field-notes",
    [
      "biolog", "ecolog", "geograph", "geolog", "earth", "plant", "animal",
      "cell", "anatom", "environment", "climate", "botan", "zoolog",
      "ocean", "weather", "evolution",
    ],
  ],
  [
    "editorial",
    [
      "histor", "econom", "politic", "law", "literat", "philosoph",
      "sociolog", "government", "civic", "art", "religio", "ethic",
      "media", "english", "language",
    ],
  ],
  [
    "everyday",
    [
      "financ", "money", "budget", "maths", "math", "arithmetic",
      "percent", "health", "nutrition", "cooking", "business", "career",
      "personal",
    ],
  ],
  [
    "essential",
    ["chemi", "science", "medic", "psycholog", "statistic", "calculus"],
  ],
];

/**
 * Deterministic starting pack for a lesson whose owner chose none, so lessons
 * no longer all default to one look. No model call: subject keywords first,
 * then audience, then a stable hash of the project so unrelated lessons still
 * vary. The owner can always change it.
 */
export function suggestCreativeDesignPack(
  input: Readonly<{
    subject?: string | null;
    lessonTitle?: string | null;
    ageBand?: string | null;
    difficulty?: string | null;
    projectId: string;
  }>,
): CreativeDesignPackId {
  // Keywords match word starts, so "art" matches "artists" but not "part".
  const words = `${input.subject ?? ""} ${input.lessonTitle ?? ""}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 0);
  const young = input.ageBand === "8-10" || input.ageBand === "11-13";
  const matched = packSubjectKeywords.find(([, keywords]) =>
    keywords.some((keyword) => words.some((word) => word.startsWith(keyword))),
  )?.[0];
  if (young) return matched === "systems" ? "everyday" : "prism";
  if (matched !== undefined) return matched;
  let hash = 0;
  for (const character of input.projectId)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return creativeDesignPackIds[hash % creativeDesignPackIds.length]!;
}

function canonicalCreativeDesignValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalCreativeDesignValue);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalCreativeDesignValue(nested)]),
    );
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error(
      "Creative design identity cannot contain a non-finite number.",
    );
  return value;
}
export function canonicalCreativeDesignJson(value: unknown): string {
  return JSON.stringify(canonicalCreativeDesignValue(value));
}
export function creativeDesignHash(value: unknown): string {
  return sha256(canonicalCreativeDesignJson(value));
}
