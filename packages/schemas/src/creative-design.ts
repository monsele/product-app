/**
 * ST-097 production creative-design contract. This is deliberately distinct
 * from the ST-094 proof contract: it describes resolved tenant data, never
 * executable layout instructions or proof fixtures.
 */
import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const version = z.string().regex(/^\d+\.\d+\.\d+$/);

export const creativeDesignManifestVersion = "1.0" as const;
export const creativeDesignPlannerVersion = "st-097-planner-v1" as const;
export const creativeDesignHashPolicy = "st-097-canonical-json-v1" as const;
export const creativeDesignPackIds = [
  "essential",
  "editorial",
  "everyday",
] as const;
export const creativeDesignPackIdSchema = z.enum(creativeDesignPackIds);
export type CreativeDesignPackId = z.infer<typeof creativeDesignPackIdSchema>;
export const creativeDesignSceneTypes = [
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
    plannerVersion: z.literal(creativeDesignPlannerVersion),
    pack: z.object({ id: creativeDesignPackIdSchema, version }).strict(),
    approach: creativeDesignApproachSchema,
    settings: creativeDesignSettingsSchema,
    selections: z.record(identifierSchema, creativeDesignSceneSelectionSchema),
    presetVersionId: identifierSchema.nullable(),
  })
  .strict();
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
  family: "split" | "subject" | "path" | "panels" | "rows" | "question";
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
  return variant === "primary" ? "panels" : "rows";
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
            minDurationSeconds: sceneType === "process" ? 6 : 4,
            supportedApproaches: ["standard"] as const,
            requiredContent:
              sceneType === "process"
                ? (["title", "narration", "on_screen_text"] as const)
                : (["title", "narration"] as const),
            // These treatments use the scene's already-resolved evidence;
            // no treatment invents or requires a new asset at plan time.
            requiredAssetKinds: ["none"] as const,
            textLimits: {
              maxCharacters: sceneType === "comparison" ? 300 : 220,
              maxItems: sceneType === "process" ? 6 : 4,
            },
            layout: {
              safeInsetPx: packId === "everyday" ? 96 : 72,
              textColumns: sceneType === "comparison" ? (2 as const) : (1 as const),
            },
            timing: {
              establishFrames: 12,
              explainFrames: sceneType === "process" ? 36 : 24,
              holdFrames: sceneType === "process" ? 90 : 60,
              exitFrames: 12,
            },
            density: sceneType === "process" || sceneType === "comparison" ? "medium" : "low",
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
    const component = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return component <= 0.04045
      ? component / 12.92
      : ((component + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function creativeDesignContrastRatio(left: string, right: string): number {
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
  const issues = [...creativeDesignCapability({ approach: manifest.approach, scenes })];
  const colors = manifest.settings.colors;
  if (creativeDesignContrastRatio(colors.text, colors.background) < 4.5)
    issues.push("Text color must have at least 4.5:1 contrast against the background.");
  if (creativeDesignContrastRatio(colors.text, colors.surface) < 4.5)
    issues.push("Text color must have at least 4.5:1 contrast against the surface.");
  if (creativeDesignContrastRatio(colors.accent, colors.background) < 3)
    issues.push("Accent color must have at least 3:1 contrast against the background.");
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
  for (const scene of input.scenes) {
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
            const leftScore =
              (left.family === previousFamily ? -10 : 0) +
              (left.variant === "primary" ? 1 : 0);
            const rightScore =
              (right.family === previousFamily ? -10 : 0) +
              (right.variant === "primary" ? 1 : 0);
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
      requiredHoldFrames: scene.template === "process" ? 90 : 60,
    });
    previousFamily = chosen.family;
  }
  return Object.freeze(selections);
}
