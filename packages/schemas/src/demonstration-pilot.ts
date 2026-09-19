/**
 * ST-096 — the demonstration pilot's production contracts.
 *
 * This module is the boundary between the tester workflow and ST-095's proven
 * runtime. It owns four things and deliberately owns nothing else:
 *
 * 1. **Eligibility** — whether a lesson version can be explained by a
 *    registered recipe, and if not, why, in words a teacher can act on.
 * 2. **Comparison and variant identity** — the immutable record of one
 *    baseline explained two ways, and what makes those two ways two different
 *    render identities rather than one (CR-06).
 * 3. **The resolved plan snapshot** — what gets persisted when a demonstration
 *    variant is built, so playback and rendering never rebuild a plan.
 * 4. **Feedback** — bounded qualitative pilot evidence attached to the exact
 *    pair and output versions it was given about.
 *
 * It does **not** own the runtime. Event plans, recipes, validation, state
 * evaluation and timing all belong to `@avlp/schemas/demonstration-proof` and
 * `@avlp/scene-library/demonstration-proof`, and are re-exported from here
 * only where a persisted field needs their type. ST-096's out-of-scope section
 * is explicit that a second engine is not this story's to build, and the
 * simplest way to keep that true is to give this module no way to express one.
 *
 * Like `demonstration-proof`, it is reachable only at its own subpath
 * (`@avlp/schemas/demonstration-pilot`) and is not re-exported from the package
 * index, so nothing in the standard path can acquire a demonstration plan by
 * importing the schemas package.
 *
 * CR references (docs/controlled-rendering-versioning-contract.md):
 * - CR-01: a variant stores a *resolved* plan; nothing re-selects at playback.
 * - CR-02: `demonstrationVariantManifestSchema` carries content, approach,
 *   timing, media and implementation identity by immutable reference.
 * - CR-03: `demonstrationPilotExperimentVersion` and the recorded recipe/plan
 *   versions mean a republished recipe produces a new comparison, never a
 *   reinterpreted old one.
 * - CR-06: `demonstrationVariantIdentityInput` is the one shape hashed for a
 *   variant's render identity, and `approach` is inside it.
 */

import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import {
  demonstrationPlanSchema,
  demonstrationPlanVersion,
  demonstrationPresentationSchema,
  demonstrationRecipeIdSchema,
  demonstrationRecipeVersion,
  demonstrationTimingProvenanceSchema,
  type DemonstrationPlan,
} from "./demonstration-proof.js";
import { videoApproachSchema, type VideoApproach } from "./index.js";

const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Bumped whenever the *pilot's own* resolution rules change — which lessons
 * are eligible, how a binding maps onto a recipe, what goes into a variant's
 * identity. It is part of a comparison's uniqueness key, so a rules change
 * produces a new comparison for the same baseline rather than silently
 * reinterpreting the completed one a tester already gave feedback on (CR-03).
 */
export const demonstrationPilotExperimentVersion = "st-096-pilot-1" as const;

/** Identifies the hashing policy for variant identity (CR-06). */
export const demonstrationPilotHashPolicy =
  "st-096-canonical-json-sha256-v1" as const;

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * Why a lesson cannot be explained by demonstration.
 *
 * Every member is a *specific* reason a teacher can act on, because AC2
 * requires a useful explanation rather than a disabled control. `not_in_cohort`
 * is separate from the content reasons so the UI can offer the right recovery:
 * an ineligible tester is not told to change their lesson.
 */
export const demonstrationIneligibilityCodeValues = [
  /** The signed-in user is not in the configured pilot cohort. */
  "not_in_cohort",
  /** The pilot feature flag is off for new experimental work. */
  "pilot_disabled",
  /** No registered recipe binding exists for this lesson's content. */
  "no_registered_recipe",
  /** A binding exists but the recipe's support query refused the content. */
  "recipe_refused_content",
  /** The lesson has no approved, immutable version to compare from. */
  "no_baseline_version",
  /** Narration audio or captions are missing, stale, or not yet measured. */
  "narration_not_ready",
  /** The narration changed after the binding was registered. */
  "narration_identity_changed",
  /** A plan could be built but failed validation against the narration. */
  "plan_validation_failed",
] as const;
export const demonstrationIneligibilityCodeSchema = z.enum(
  demonstrationIneligibilityCodeValues,
);
export type DemonstrationIneligibilityCode = z.infer<
  typeof demonstrationIneligibilityCodeSchema
>;

export const demonstrationIneligibilityReasonSchema = z
  .object({
    code: demonstrationIneligibilityCodeSchema,
    /** What is wrong, in a teacher's words. */
    message: boundedText(400),
    /** What to do about it. Empty is not allowed: a reason without a recovery
     * is the dead end AC2 exists to prevent. */
    suggestedCorrection: boundedText(400),
    /** The scene the reason is about, when it is about one scene. */
    sceneId: identifierSchema.optional(),
  })
  .strict();
export type DemonstrationIneligibilityReason = z.infer<
  typeof demonstrationIneligibilityReasonSchema
>;

/**
 * The server's authoritative answer about one project.
 *
 * `selectable` drives the radio group's enabled state and `reasons` drives what
 * is shown beside it. They are returned together because the UI must never
 * infer one from the other — hiding a control is not authorisation, and the
 * same object is re-checked server side on every write.
 */
export const demonstrationEligibilitySchema = z
  .object({
    /** Whether the experimental option may be *offered* at all. */
    visible: z.boolean(),
    /** Whether it may be *chosen* right now. */
    selectable: z.boolean(),
    reasons: z.array(demonstrationIneligibilityReasonSchema).max(20),
    /** The recipes this lesson resolved to, when it resolved to any. */
    recipes: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            recipeId: demonstrationRecipeIdSchema,
            recipeVersion: z.literal(demonstrationRecipeVersion),
          })
          .strict(),
      )
      .max(12),
    /** A supported curated lesson the tester can open instead, when their own
     * content is unsupported. Null when they already have one or are not in
     * the cohort. */
    supportedTestLesson: z
      .object({
        subject: boundedText(60),
        label: boundedText(160),
        projectId: identifierSchema.nullable(),
      })
      .strict()
      .nullable(),
    experimentVersion: z.literal(demonstrationPilotExperimentVersion),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.selectable && value.reasons.length > 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasons"],
        message:
          "A selectable approach must not also report a blocking reason.",
      });
    if (!value.selectable && value.reasons.length === 0)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasons"],
        message:
          "An unselectable approach must say why; a silent refusal is not a reason.",
      });
  });
export type DemonstrationEligibility = z.infer<
  typeof demonstrationEligibilitySchema
>;

// ---------------------------------------------------------------------------
// The resolved plan snapshot
// ---------------------------------------------------------------------------

/**
 * One scene's resolved demonstration, persisted immutably with its variant.
 *
 * `plan` is ST-095's validated event plan with its frames already resolved
 * from measured beats. The narration identity beside it is what makes the plan
 * re-checkable: if the scene's audio checksum or measured duration changes, the
 * plan is stale and the pair stops being presentable as equivalent, rather than
 * animating against audio it was never timed to.
 */
export const demonstrationResolvedSceneSchema = z
  .object({
    sceneId: identifierSchema,
    order: z.number().int().positive(),
    title: boundedText(160),
    narration: boundedText(5_000),
    durationSeconds: z.number().int().min(1).max(300),
    recipeId: demonstrationRecipeIdSchema,
    recipeVersion: z.literal(demonstrationRecipeVersion),
    planVersion: z.literal(demonstrationPlanVersion),
    plan: demonstrationPlanSchema,
    /** Slot name → the pilot asset ID bound to it. Never a URL. */
    assetBySlot: z.record(z.string().min(1).max(64), z.string().min(1).max(64)),
    audio: z
      .object({
        storageKey: z.string().min(1).max(1_024),
        checksumSha256: sha256,
        durationMs: z.number().int().positive(),
        contentType: z.enum(["audio/mpeg", "audio/wav"]),
        /**
         * The measured beats, carried rather than counted.
         *
         * The runtime revalidates a plan against its narration at render time,
         * and that check needs the actual boundaries — a count would let a
         * render proceed against beats it had never seen. Carrying them also
         * makes the timing half of CR-02 real: the manifest states when each
         * explanatory event is anchored, not merely how many there are.
         */
        beats: z
          .array(
            z
              .object({
                beatId: z.string().min(1).max(64),
                startMs: z.number().int().nonnegative(),
                endMs: z.number().int().positive(),
                text: boundedText(1_000),
              })
              .strict(),
          )
          .min(1)
          .max(60),
        timingProvenance: demonstrationTimingProvenanceSchema,
      })
      .strict(),
  })
  .strict();
export type DemonstrationResolvedScene = z.infer<
  typeof demonstrationResolvedSceneSchema
>;

/**
 * A pilot asset, by immutable reference.
 *
 * The bytes live in the project's own asset storage — the same tenant-scoped
 * path a teacher's uploaded replacement uses — so a demonstration variant never
 * reaches media outside its project, and the checksum here is verified before
 * anything is signed or downloaded (CR-02).
 */
export const demonstrationVariantAssetSchema = z
  .object({
    assetId: z.string().min(1).max(64),
    altText: boundedText(2_000),
    provenance: boundedText(500),
    storageKey: z.string().min(1).max(1_024),
    checksumSha256: sha256,
    contentType: z.enum(["image/png", "image/svg+xml"]),
    width: z.number().int().positive().max(8_640),
    height: z.number().int().positive().max(8_640),
  })
  .strict();
export type DemonstrationVariantAsset = z.infer<
  typeof demonstrationVariantAssetSchema
>;

export const demonstrationVariantCaptionSchema = z
  .object({
    sceneId: identifierSchema,
    startFrame: z.number().int().nonnegative(),
    endFrame: z.number().int().positive(),
    text: boundedText(1_000),
  })
  .strict()
  .refine(
    (cue) => cue.endFrame > cue.startFrame,
    "Caption endFrame must be after startFrame.",
  );

/**
 * Everything a demonstration variant needs to render, resolved.
 *
 * This is the demonstration approach's half of CR-02's manifest. The standard
 * approach's half is the existing production render manifest, unchanged — which
 * is why this object carries the same content, audio and caption identities
 * rather than a second copy of the content itself.
 */
export const demonstrationVariantPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    experimentVersion: z.literal(demonstrationPilotExperimentVersion),
    hashPolicy: z.literal(demonstrationPilotHashPolicy),
    /** Absent only on legacy plans, which keep their historical default look. */
    presentation: demonstrationPresentationSchema.optional(),
    themeId: z.union([
      z.literal("mvp-default"),
      z.enum(["essential", "editorial", "everyday"]),
    ]),
    bindingId: boundedText(80),
    scenes: z.array(demonstrationResolvedSceneSchema).min(1).max(12),
    assets: z.array(demonstrationVariantAssetSchema).max(60),
    captions: z.array(demonstrationVariantCaptionSchema).max(400),
  })
  .strict()
  .superRefine((value, context) => {
    const sceneIds = new Set<string>();
    for (const [index, scene] of value.scenes.entries()) {
      if (sceneIds.has(scene.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "sceneId"],
          message: `Duplicate scene ${scene.sceneId}.`,
        });
      sceneIds.add(scene.sceneId);
    }
    const assetIds = new Set(value.assets.map((asset) => asset.assetId));
    for (const [index, scene] of value.scenes.entries())
      for (const [slot, assetId] of Object.entries(scene.assetBySlot))
        if (!assetIds.has(assetId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["scenes", index, "assetBySlot", slot],
            message: `Slot ${slot} binds unknown asset ${assetId}.`,
          });
    for (const [index, cue] of value.captions.entries())
      if (!sceneIds.has(cue.sceneId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["captions", index, "sceneId"],
          message: "A caption cue must belong to a scene in this variant.",
        });
    if (
      value.presentation?.kind === "creative-style" &&
      value.themeId !== value.presentation.packId
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["themeId"],
        message:
          "The variant theme must match its resolved creative presentation.",
      });
    if (
      value.presentation?.kind === "mvp-default" &&
      value.themeId !== "mvp-default"
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["themeId"],
        message: "The default presentation must use the default theme.",
      });
    if (value.presentation === undefined && value.themeId !== "mvp-default")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["themeId"],
        message:
          "A creative theme requires its resolved presentation; it cannot fall back to default visuals.",
      });
  });
export type DemonstrationVariantPlan = z.infer<
  typeof demonstrationVariantPlanSchema
>;

// ---------------------------------------------------------------------------
// Variant identity
// ---------------------------------------------------------------------------

/**
 * The exact shape hashed for a variant's render identity (CR-06).
 *
 * Note what is in it and what is not. `approach` is in it, which is the whole
 * point: standard and demonstration built from the same baseline with the same
 * narration must not collide on a cache key. Storage keys and checksums are in
 * it; signed URLs, request timestamps and correlation IDs are not, because a
 * credential refresh must not invalidate a render (CR-06).
 */
export const demonstrationVariantIdentityInputSchema = z
  .object({
    approach: videoApproachSchema,
    baselineLessonVersionId: identifierSchema,
    baselineContentHash: sha256,
    experimentVersion: z.literal(demonstrationPilotExperimentVersion),
    /** Null for standard: its visuals come from the lesson spec itself. */
    planSha256: sha256.nullable(),
    audioChecksums: z.array(sha256).min(1).max(20),
    captionSha256: sha256,
    themeId: z.union([
      z.literal("mvp-default"),
      z.enum(["essential", "editorial", "everyday"]),
    ]),
    rendererVersion: boundedText(120),
    profileSha256: sha256,
  })
  .strict();
export type DemonstrationVariantIdentityInput = z.infer<
  typeof demonstrationVariantIdentityInputSchema
>;

export const demonstrationVariantStatusValues = [
  "pending",
  "queued",
  "generating",
  "ready",
  "failed",
  "stale",
] as const;
export const demonstrationVariantStatusSchema = z.enum(
  demonstrationVariantStatusValues,
);
export type DemonstrationVariantStatus = z.infer<
  typeof demonstrationVariantStatusSchema
>;

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export const demonstrationVariantViewSchema = z
  .object({
    id: identifierSchema,
    approach: videoApproachSchema,
    status: demonstrationVariantStatusSchema,
    /** 0–1, mirroring the render job's own progress. */
    progress: z.number().min(0).max(1),
    identitySha256: sha256,
    renderId: identifierSchema.nullable(),
    /** Set only when the render completed and the caller may download it. */
    videoAvailable: z.boolean(),
    durationMs: z.number().int().positive().nullable(),
    errorCode: boundedText(80).nullable(),
    errorMessage: boundedText(400).nullable(),
    recipes: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            recipeId: demonstrationRecipeIdSchema,
            recipeVersion: z.literal(demonstrationRecipeVersion),
          })
          .strict(),
      )
      .max(12),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DemonstrationVariantView = z.infer<
  typeof demonstrationVariantViewSchema
>;

/** One scene, as both approaches present it. Drives matched navigation (AC6). */
export const demonstrationSceneCorrespondenceSchema = z
  .object({
    sceneId: identifierSchema,
    order: z.number().int().positive(),
    title: boundedText(160),
    startFrame: z.number().int().nonnegative(),
    durationInFrames: z.number().int().positive(),
  })
  .strict();
export type DemonstrationSceneCorrespondence = z.infer<
  typeof demonstrationSceneCorrespondenceSchema
>;

export const demonstrationComparisonViewSchema = z
  .object({
    id: identifierSchema,
    projectId: identifierSchema,
    baselineLessonVersionId: identifierSchema,
    baselineVersionNumber: z.number().int().positive(),
    baselineContentHash: sha256,
    experimentVersion: z.literal(demonstrationPilotExperimentVersion),
    themeId: z.union([
      z.literal("mvp-default"),
      z.enum(["essential", "editorial", "everyday"]),
    ]),
    /**
     * False when the baseline's content, audio, captions, style or scene
     * timing no longer agree with what the pair was built from. The pair stays
     * viewable — it is historical evidence — but the UI must stop presenting
     * it as a controlled comparison.
     */
    controlled: z.boolean(),
    uncontrolledReason: boundedText(400).nullable(),
    scenes: z.array(demonstrationSceneCorrespondenceSchema).min(1).max(12),
    /** Total frames; identical for both approaches by construction. */
    durationInFrames: z.number().int().positive(),
    variants: z.array(demonstrationVariantViewSchema).min(1).max(2),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DemonstrationComparisonView = z.infer<
  typeof demonstrationComparisonViewSchema
>;

export const demonstrationComparisonListSchema = z
  .object({
    comparisons: z.array(demonstrationComparisonViewSchema).max(50),
    eligibility: demonstrationEligibilitySchema,
  })
  .strict();
export type DemonstrationComparisonList = z.infer<
  typeof demonstrationComparisonListSchema
>;

/** `POST /demonstration-test-lessons`. */
export const demonstrationTestLessonRequestSchema = z
  .object({ subject: z.string().trim().min(1).max(60) })
  .strict();
export type DemonstrationTestLessonRequest = z.infer<
  typeof demonstrationTestLessonRequestSchema
>;

/** `POST /projects/:id/demonstration-comparisons`. */
export const demonstrationComparisonCreateSchema = z
  .object({
    lessonVersionId: identifierSchema,
    /** The approach to generate now. The other side is adopted from the
     * project's existing completed render when one matches the baseline. */
    approach: videoApproachSchema,
  })
  .strict();
export type DemonstrationComparisonCreate = z.infer<
  typeof demonstrationComparisonCreateSchema
>;

/** `POST /projects/:id/demonstration-comparisons/:comparisonId/variants`. */
export const demonstrationVariantRequestSchema = z
  .object({
    approach: videoApproachSchema,
  })
  .strict();
export type DemonstrationVariantRequest = z.infer<
  typeof demonstrationVariantRequestSchema
>;

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/**
 * The rating scale, with its endpoints named.
 *
 * The story requires defined endpoints, and they belong in the contract rather
 * than only in the markup: a rating stored without knowing what 1 and 5 meant
 * is not evidence of anything later.
 */
export const demonstrationRatingScale = Object.freeze({
  min: 1,
  max: 5,
  clarity: Object.freeze({
    label: "Clarity",
    low: "1 — I could not follow the explanation",
    high: "5 — the explanation was easy to follow",
  }),
  engagement: Object.freeze({
    label: "Engagement",
    low: "1 — I lost interest",
    high: "5 — it held my attention throughout",
  }),
  narrationSync: Object.freeze({
    label: "Narration synchronisation",
    low: "1 — the pictures and the words did not match",
    high: "5 — the pictures matched the words exactly",
  }),
});

const ratingSchema = z.number().int().min(1).max(5);

export const demonstrationPreferenceValues = [
  "standard",
  "demonstration",
  "no_preference",
] as const;
export const demonstrationPreferenceSchema = z.enum(
  demonstrationPreferenceValues,
);
export type DemonstrationPreference = z.infer<
  typeof demonstrationPreferenceSchema
>;

export const demonstrationApproachFeedbackSchema = z
  .object({
    approach: videoApproachSchema,
    clarity: ratingSchema.nullable(),
    engagement: ratingSchema.nullable(),
    narrationSync: ratingSchema.nullable(),
  })
  .strict();

/** `PUT /projects/:id/demonstration-comparisons/:comparisonId/feedback`. */
export const demonstrationFeedbackInputSchema = z
  .object({
    /** 0 when no feedback has been saved yet; drives the stale-update check. */
    expectedRevision: z.number().int().nonnegative(),
    ratings: z.array(demonstrationApproachFeedbackSchema).max(2),
    preference: demonstrationPreferenceSchema.nullable(),
    comment: z.string().trim().max(4_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<VideoApproach>();
    for (const [index, entry] of value.ratings.entries()) {
      if (seen.has(entry.approach))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ratings", index, "approach"],
          message: "Each approach may be rated once.",
        });
      seen.add(entry.approach);
    }
  });
export type DemonstrationFeedbackInput = z.infer<
  typeof demonstrationFeedbackInputSchema
>;

export const demonstrationFeedbackViewSchema = z
  .object({
    comparisonId: identifierSchema,
    revision: z.number().int().nonnegative(),
    ratings: z.array(demonstrationApproachFeedbackSchema).max(2),
    preference: demonstrationPreferenceSchema.nullable(),
    comment: z.string().max(4_000).nullable(),
    /** The exact variant/output versions this feedback was given about, so a
     * later regeneration cannot silently re-attribute it. */
    ratedVariantIds: z.array(identifierSchema).max(2),
    /** Immutable output identity captured when feedback is saved. Variant rows
     * are lifecycle handles and may later point at a retry; this records the
     * actual rendered bytes the tester saw. */
    ratedOutputs: z
      .array(
        z
          .object({
            approach: videoApproachSchema,
            checksumSha256: sha256,
            renderJobId: identifierSchema,
            renderedVideoId: identifierSchema,
            variantId: identifierSchema,
          })
          .strict(),
      )
      .max(2),
    updatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export type DemonstrationFeedbackView = z.infer<
  typeof demonstrationFeedbackViewSchema
>;

export {
  demonstrationPlanVersion,
  demonstrationRecipeVersion,
  type DemonstrationPlan,
};
