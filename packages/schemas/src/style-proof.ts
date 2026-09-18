/**
 * ST-094 — bounded creative-style proof contract.
 *
 * This module is deliberately **not** re-exported from `@avlp/schemas`'s main
 * entry point. It is reachable only at `@avlp/schemas/style-proof` so that no
 * production lesson validation path (`lessonSpecSchema`, `sceneSpecSchema`,
 * `lessonConfigurationSchema`) can widen to accept a proof style pack. The
 * production theme remains the single literal `mvp-default`.
 *
 * Scope boundary, per the story's "Scope and Architecture Boundary" section and
 * ADR-005 (Proposed): these schemas describe a development proof composition
 * and its immutable fixture manifest. They are not a persisted design contract
 * and carry no `schemaVersion` from the LessonSpec series.
 *
 * CR references (docs/controlled-rendering-versioning-contract.md):
 * - CR-01: only registered pack/treatment IDs are accepted; no JSX, CSS,
 *   executable expressions or pixel coordinates may cross this boundary.
 * - CR-02: `styleProofManifestSchema` carries the resolved content, design,
 *   timing, media, font, implementation and output-profile identity.
 * - CR-06: `canonicalStyleProofJson` is the one canonical serialisation used
 *   for proof input hashing.
 */

import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import { sceneSpecSchema, type SceneSpec } from "./index.js";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

/** Bumped whenever any treatment's rendered output could change. */
export const styleProofPackVersion = "1.0.0" as const;

/** Identifies this proof's hashing policy so a later change cannot silently
 * reinterpret an old hash (CR-06). */
export const styleProofHashPolicy = "st-094-canonical-json-sha256-v1" as const;

export const styleProofPackIdValues = [
  "essential",
  "editorial",
  "everyday",
] as const;
export const styleProofPackIdSchema = z.enum(styleProofPackIdValues);
export type StyleProofPackId = z.infer<typeof styleProofPackIdSchema>;

/**
 * The three semantic scene types this proof covers. These are existing
 * `SceneTemplate` values — the proof adds presentations, never new semantics.
 */
export const styleProofSceneTypeValues = [
  "hook",
  "definition",
  "comparison",
] as const;
export const styleProofSceneTypeSchema = z.enum(styleProofSceneTypeValues);
export type StyleProofSceneType = z.infer<typeof styleProofSceneTypeSchema>;

/** The nine authored treatments. IDs are `<pack>.<sceneType>.<composition>`. */
export const styleProofTreatmentIdValues = [
  "essential.hook.isolated-question",
  "essential.definition.central-subject",
  "essential.comparison.sequential-emphasis",
  "editorial.hook.headline-beside-frame",
  "editorial.definition.annotated-evidence",
  "editorial.comparison.evidence-panels",
  "everyday.hook.illustrated-situation",
  "everyday.definition.labelled-objects",
  "everyday.comparison.paired-scenarios",
] as const;
export const styleProofTreatmentIdSchema = z.enum(styleProofTreatmentIdValues);
export type StyleProofTreatmentId = z.infer<typeof styleProofTreatmentIdSchema>;

/** Declared motion signature per pack (AC11). Attribution in motion must come
 * from these, not from palette or typography. */
export const styleProofMotionSignatureValues = [
  "masked-reveal",
  "image-push-annotation",
  "object-settle",
] as const;
export const styleProofMotionSignatureSchema = z.enum(
  styleProofMotionSignatureValues,
);
export type StyleProofMotionSignature = z.infer<
  typeof styleProofMotionSignatureSchema
>;

// ---------------------------------------------------------------------------
// Asset slots
// ---------------------------------------------------------------------------

export const styleProofMediaKindValues = ["raster", "vector"] as const;
export const styleProofMediaKindSchema = z.enum(styleProofMediaKindValues);
export type StyleProofMediaKind = z.infer<typeof styleProofMediaKindSchema>;

/**
 * `contain` preserves every pixel of the source, which is mandatory wherever
 * cropping would remove information (diagram labels, full-object cutouts).
 * `cover` is permitted only for Editorial's photographic frames, which carry no
 * burned-in text.
 */
export const styleProofFitModeValues = ["contain", "cover"] as const;
export const styleProofFitModeSchema = z.enum(styleProofFitModeValues);
export type StyleProofFitMode = z.infer<typeof styleProofFitModeSchema>;

/** Bounded, named framing labels. A treatment never accepts coordinates. */
export const styleProofFocalValues = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
] as const;
export const styleProofFocalSchema = z.enum(styleProofFocalValues);
export type StyleProofFocal = z.infer<typeof styleProofFocalSchema>;

export const styleProofAssetSlotSchema = z
  .object({
    /** Stable slot name a treatment reads, e.g. `subject`, `evidence-left`. */
    slot: boundedText(64).regex(/^[a-z][a-z0-9-]*$/),
    acceptedKinds: z.array(styleProofMediaKindSchema).min(1).max(2),
    fit: styleProofFitModeSchema,
    minWidth: z.number().int().positive().max(8_640),
    minHeight: z.number().int().positive().max(8_640),
    required: z.boolean(),
  })
  .strict();
export type StyleProofAssetSlot = z.infer<typeof styleProofAssetSlotSchema>;

/**
 * A resolved proof asset. `src` is a bundled `data:` URI so preview and server
 * render consume byte-identical media (AC6); `checksumSha256` is the checksum
 * of the decoded bytes, recorded in the manifest for reproducibility.
 */
export const styleProofAssetSchema = z
  .object({
    assetId: boundedText(80).regex(/^[a-z][a-z0-9-]*$/),
    altText: boundedText(2_000),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    focal: styleProofFocalSchema,
    height: z.number().int().positive().max(8_640),
    kind: styleProofMediaKindSchema,
    /** Provenance recorded for every bundled asset (no third-party media). */
    provenance: boundedText(500),
    src: z
      .string()
      .min(1)
      .max(4_000_000)
      .regex(
        /^data:image\/(png|svg\+xml);base64,[A-Za-z0-9+/=]+$/,
        "A proof asset must be a bundled base64 data URI.",
      ),
    width: z.number().int().positive().max(8_640),
  })
  .strict();
export type StyleProofAsset = z.infer<typeof styleProofAssetSchema>;

// ---------------------------------------------------------------------------
// Design selection
// ---------------------------------------------------------------------------

export const styleProofPackRefSchema = z
  .object({
    id: styleProofPackIdSchema,
    version: z.literal(styleProofPackVersion),
  })
  .strict();
export type StyleProofPackRef = z.infer<typeof styleProofPackRefSchema>;

export const styleProofSceneDesignSchema = z
  .object({
    treatmentId: styleProofTreatmentIdSchema,
    treatmentVersion: z.literal(styleProofPackVersion),
    /** Slot name → bundled asset ID. Never a URL and never a coordinate. */
    assetBySlot: z
      .record(
        boundedText(64).regex(/^[a-z][a-z0-9-]*$/),
        boundedText(80).regex(/^[a-z][a-z0-9-]*$/),
      )
      .default({}),
  })
  .strict();
export type StyleProofSceneDesign = z.infer<typeof styleProofSceneDesignSchema>;

export const styleProofSelectionSchema = z
  .object({
    pack: styleProofPackRefSchema,
    /** Scene ID → its resolved design. Resolution never runs at render time. */
    sceneDesigns: z.record(identifierSchema, styleProofSceneDesignSchema),
  })
  .strict();
export type StyleProofSelection = z.infer<typeof styleProofSelectionSchema>;

// ---------------------------------------------------------------------------
// Motion energy parameters
// ---------------------------------------------------------------------------

/**
 * Entrance and exit are authored in frames; the remainder is explanation and
 * hold time. Longer durations extend explanation, never the entrance (CR-05).
 */
export const styleProofMotionParamsSchema = z
  .object({
    entranceFrames: z.number().int().min(1).max(45),
    exitFrames: z.number().int().min(1).max(45),
    /** Frames of fully-settled content required before the exit begins. */
    minimumHoldFrames: z.number().int().min(1).max(600),
  })
  .strict();
export type StyleProofMotionParams = z.infer<
  typeof styleProofMotionParamsSchema
>;

// ---------------------------------------------------------------------------
// Composition input
// ---------------------------------------------------------------------------

/** The proof accepts only the three covered semantic scene types. */
export const styleProofSceneSchema = sceneSpecSchema.superRefine(
  (scene, context) => {
    if (!styleProofSceneTypeSchema.safeParse(scene.template).success)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["template"],
        message: `The style proof covers ${styleProofSceneTypeValues.join(", ")} scenes only.`,
      });
  },
);
export type StyleProofScene = SceneSpec;

export const styleProofCaptionCueSchema = z
  .object({
    endFrame: z.number().int().positive(),
    sceneId: identifierSchema,
    startFrame: z.number().int().nonnegative(),
    text: boundedText(1_000),
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endFrame <= cue.startFrame)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endFrame"],
        message: "Caption endFrame must be after startFrame.",
      });
  });
export type StyleProofCaptionCue = z.infer<typeof styleProofCaptionCueSchema>;

/**
 * One prepared local narration track per scene, shared unchanged across all
 * three styles. `src` is a bundled WAV data URI; measured narration duration
 * remains the timing authority (ADR-004).
 */
export const styleProofNarrationTrackSchema = z
  .object({
    durationMs: z.number().int().positive().max(300_000),
    sceneId: identifierSchema,
    src: z
      .string()
      .min(1)
      .max(40_000_000)
      .regex(
        /^data:audio\/wav;base64,[A-Za-z0-9+/=]+$/,
        "Proof narration must be a bundled base64 WAV data URI.",
      ),
  })
  .strict();
export type StyleProofNarrationTrack = z.infer<
  typeof styleProofNarrationTrackSchema
>;

export const styleProofCompositionPropsSchema = z
  .object({
    assets: z.record(
      boundedText(80).regex(/^[a-z][a-z0-9-]*$/),
      styleProofAssetSchema,
    ),
    captions: z.array(styleProofCaptionCueSchema).max(200),
    fixtureId: boundedText(80).regex(/^[a-z][a-z0-9-]*$/),
    motion: styleProofMotionParamsSchema,
    narrationTracks: z.array(styleProofNarrationTrackSchema).min(1).max(20),
    scenes: z.array(styleProofSceneSchema).min(1).max(12),
    selection: styleProofSelectionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const sceneIds = new Set(value.scenes.map((scene) => scene.id));
    for (const sceneId of Object.keys(value.selection.sceneDesigns))
      if (!sceneIds.has(sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selection", "sceneDesigns", sceneId],
          message: "A design selection must belong to a proof scene.",
        });
    for (const scene of value.scenes)
      if (value.selection.sceneDesigns[scene.id] === undefined)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selection", "sceneDesigns"],
          message: `Scene ${scene.id} has no resolved treatment.`,
        });
    const trackedScenes = new Set<string>();
    for (const [index, track] of value.narrationTracks.entries()) {
      if (!sceneIds.has(track.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks", index, "sceneId"],
          message: "A narration track must belong to a proof scene.",
        });
      else if (trackedScenes.has(track.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks", index, "sceneId"],
          message: "Each proof scene has exactly one narration track.",
        });
      else trackedScenes.add(track.sceneId);
    }
    for (const scene of value.scenes)
      if (!trackedScenes.has(scene.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["narrationTracks"],
          message: `Scene ${scene.id} has no narration track.`,
        });
    for (const [index, cue] of value.captions.entries())
      if (!sceneIds.has(cue.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["captions", index, "sceneId"],
          message: "A caption cue must belong to a proof scene.",
        });
  });
export type StyleProofCompositionProps = z.infer<
  typeof styleProofCompositionPropsSchema
>;

// ---------------------------------------------------------------------------
// Structured rejection codes
// ---------------------------------------------------------------------------

/**
 * Stable failure categories. `unsupported_design_instruction` covers any input
 * that attempted to supply JSX, CSS, an executable expression or a coordinate.
 */
export const styleProofIssueCodeValues = [
  "unsupported_pack_version",
  "unknown_pack",
  "unknown_treatment",
  "unsupported_treatment_version",
  "treatment_scene_type_mismatch",
  "missing_required_asset",
  "unsupported_asset_kind",
  "asset_resolution_too_low",
  "unsupported_design_instruction",
  "text_overflow",
  /** Readable content overlapping the shared caption exclusion region. */
  "caption_collision",
  /** A caption cue outside its own scene's frame range. */
  "invalid_caption_timing",
  "invalid_motion_interval",
  /**
   * Schema-level input that no more specific category describes. Kept distinct
   * from `unsupported_design_instruction`, which means the caller tried to
   * address a treatment's layout rather than merely supplying invalid data.
   */
  "invalid_composition_input",
] as const;
export const styleProofIssueCodeSchema = z.enum(styleProofIssueCodeValues);
export type StyleProofIssueCode = z.infer<typeof styleProofIssueCodeSchema>;

export type StyleProofIssue = Readonly<{
  code: StyleProofIssueCode;
  fieldPath: string;
  message: string;
  sceneId: string;
  suggestedCorrection: string;
}>;

// ---------------------------------------------------------------------------
// Reproducibility manifest (CR-02)
// ---------------------------------------------------------------------------

export const styleProofFontFaceSchema = z
  .object({
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    family: boundedText(120),
    file: boundedText(400),
    style: z.enum(["normal", "italic"]),
    weight: z.number().int().min(100).max(900),
  })
  .strict();
export type StyleProofFontFace = z.infer<typeof styleProofFontFaceSchema>;

export const styleProofOutputProfileSchema = z
  .object({
    audioCodec: z.literal("aac"),
    fps: z.literal(30),
    height: z.literal(1080),
    pixelFormat: z.literal("yuv420p"),
    videoCodec: z.literal("h264"),
    width: z.literal(1920),
  })
  .strict();
export type StyleProofOutputProfile = z.infer<
  typeof styleProofOutputProfileSchema
>;

export const styleProofManifestSchema = z
  .object({
    /** sha256 over `canonicalStyleProofJson(compositionProps)`. */
    resolvedInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    hashPolicy: z.literal(styleProofHashPolicy),
    fixtureId: boundedText(80),
    pack: styleProofPackRefSchema,
    treatments: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            sceneType: styleProofSceneTypeSchema,
            treatmentId: styleProofTreatmentIdSchema,
            treatmentVersion: z.literal(styleProofPackVersion),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    assets: z
      .array(
        z
          .object({
            assetId: boundedText(80),
            bytes: z.number().int().nonnegative(),
            checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
            kind: styleProofMediaKindSchema,
          })
          .strict(),
      )
      .max(60),
    audio: z
      .array(
        z
          .object({
            checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
            durationMs: z.number().int().positive(),
            sceneId: identifierSchema,
          })
          .strict(),
      )
      .max(20),
    fonts: z.array(styleProofFontFaceSchema).min(1).max(30),
    motion: styleProofMotionParamsSchema,
    outputProfile: styleProofOutputProfileSchema,
    timeline: z
      .array(
        z
          .object({
            durationInFrames: z.number().int().positive(),
            endFrameExclusive: z.number().int().positive(),
            sceneId: identifierSchema,
            startFrame: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    /** Renderer identity: bundle revision + pinned Remotion version. */
    implementation: z
      .object({
        remotionVersion: boundedText(40),
        proofImplementationVersion: boundedText(120),
      })
      .strict(),
  })
  .strict();
export type StyleProofManifest = z.infer<typeof styleProofManifestSchema>;

// ---------------------------------------------------------------------------
// Canonical serialisation (CR-06)
// ---------------------------------------------------------------------------

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

function canonicalize(value: unknown, path: string): JsonValue {
  if (value === null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error(`Non-finite number at ${path} cannot be hashed.`);
    return value;
  }
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value))
    return value.map((entry, index) =>
      canonicalize(entry, `${path}[${index}]`),
    );
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    // Meaningful array order is preserved above; object keys are sorted so an
    // authoring-order change cannot invalidate an otherwise identical render.
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      result[key] = canonicalize(entry, `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`Unhashable value at ${path}.`);
}

/** The single canonical serialisation used for every proof input hash. */
export function canonicalStyleProofJson(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"));
}
