/**
 * ST-105 — prompt-to-video ("one-shot") run contracts (ADR-013).
 *
 * A run takes one explicit, idempotent authorisation and drives the existing
 * pipeline stages on the user's behalf until the lesson is previewable. It
 * stops at `awaiting_render_approval` (the single human gate) or at
 * `needs_attention` naming the stage to fix. Rendering happens only after
 * `POST one-shot/render`.
 *
 * Reachable at its own subpath (`@avlp/schemas/one-shot`) so the standard
 * wizard's imports never acquire run contracts by accident.
 */

import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import {
  creativeDesignPackIdSchema,
  creativeDesignPackIds,
  type CreativeDesignPackId,
} from "./creative-design.js";
import {
  lessonAgeBandSchema,
  lessonDifficultySchema,
  lessonFocusPromptSchema,
  lessonToneSchema,
  objectiveFocusCoverageSchema,
  targetDurationSecondsSchema,
} from "./index.js";
import { soundBedChoiceSchema, soundBedNone } from "./sound-bed.js";

const timestampSchema = z.string().datetime({ offset: true });
const usdSchema = z.number().finite().nonnegative().max(10_000);

export const oneShotRunStatusValues = [
  /** ST-107. The brief call is in flight (or was interrupted). Nothing paid
   * has run beyond brief calls. */
  "brief_pending",
  /** ST-107. A brief is ready for the user to confirm. Confirming it is the
   * single authorisation for the paid chain. */
  "brief_ready",
  "queued",
  "running",
  "awaiting_render_approval",
  "rendering",
  "completed",
  "needs_attention",
  "failed",
  "cancelled",
] as const;
export const oneShotRunStatusSchema = z.enum(oneShotRunStatusValues);
export type OneShotRunStatus = z.infer<typeof oneShotRunStatusSchema>;

/** Statuses a new run on the same project is blocked by. A `failed` or
 * `needs_attention` run can still be resumed, so it stays active until it is
 * cancelled. Mirrors the partial unique index on `one_shot_runs`. */
export const oneShotActiveRunStatusValues = [
  "brief_pending",
  "brief_ready",
  "queued",
  "running",
  "awaiting_render_approval",
  "rendering",
  "needs_attention",
  "failed",
] as const satisfies readonly OneShotRunStatus[];

/** Statuses whose tick chain is live. Every other status stops ticking. */
export const oneShotTickingStatusValues = [
  "queued",
  "running",
  "rendering",
] as const satisfies readonly OneShotRunStatus[];

/** The stage map, in execution order. `render` follows the human gate. */
export const oneShotStepValues = [
  "ingestion",
  "source_snapshot",
  "configuration",
  "objectives",
  "outline",
  "narration",
  "storyboard",
  /** ST-112. The bounded visual planner of a v2 design (ADR-015); done at
   * once for a lesson without one. */
  "visual_plan",
  "illustrations",
  "grounding",
  "audio",
  "validation",
  "render",
] as const;
export const oneShotStepSchema = z.enum(oneShotStepValues);
export type OneShotStep = z.infer<typeof oneShotStepSchema>;

/** Where a stopped run asks the user to go. `preview` is the validation
 * screen; every other value is the wizard stage of the same name. */
export const oneShotAttentionStageValues = [
  ...oneShotStepValues,
  "preview",
] as const;
export const oneShotAttentionStageSchema = z.enum(oneShotAttentionStageValues);
export type OneShotAttentionStage = z.infer<typeof oneShotAttentionStageSchema>;

export const oneShotStepStateValues = [
  "pending",
  "running",
  "done",
  "needs_attention",
  "failed",
] as const;
export const oneShotStepStateSchema = z.enum(oneShotStepStateValues);
export type OneShotStepState = z.infer<typeof oneShotStepStateSchema>;

/** Bounded, non-sensitive step detail: counts, ids, codes. Never source text,
 * the focus prompt, tokens or URLs. */
const stepDetailValueSchema = z.union([
  z.string().max(300),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const oneShotStepDetailSchema = z
  .record(z.string().min(1).max(60), stepDetailValueSchema)
  .refine((value) => Object.keys(value).length <= 20, {
    message: "Step detail is limited to 20 entries.",
  });
export type OneShotStepDetail = z.infer<typeof oneShotStepDetailSchema>;

export const oneShotStepRecordSchema = z
  .object({
    step: oneShotStepSchema,
    state: oneShotStepStateSchema,
    jobId: identifierSchema.optional(),
    startedAt: timestampSchema,
    finishedAt: timestampSchema.optional(),
    detail: oneShotStepDetailSchema.optional(),
  })
  .strict();
export type OneShotStepRecord = z.infer<typeof oneShotStepRecordSchema>;

export const oneShotStepsSchema = z.array(oneShotStepRecordSchema).max(
  oneShotStepValues.length,
);

export const oneShotErrorCodeValues = [
  "FOCUS_NOT_COVERED",
  "INGESTION_FAILED",
  "STAGE_JOB_FAILED",
  "STAGE_BLOCKED",
  "VALIDATION_BLOCKING",
  "ONE_SHOT_STEP_TIMEOUT",
  "RENDER_FAILED",
  /** ST-107. The next paid step would take actual spend past the cap. */
  "ONE_SHOT_BUDGET_CAP",
  /** ST-107. The measured duration, or the pinned style pack or sound bed,
   * does not match the confirmed brief. */
  "BRIEF_PROMISE_UNMET",
  /** ST-107. The ST-103 post-render review found an error. */
  "RENDER_REVIEW_FAILED",
] as const;
export const oneShotErrorCodeSchema = z.enum(oneShotErrorCodeValues);
export type OneShotErrorCode = z.infer<typeof oneShotErrorCodeSchema>;

/** Who the lesson is for. Tone defaults to the wizard's default. */
export const oneShotAudienceSchema = z
  .object({
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    tone: lessonToneSchema.default("friendly"),
  })
  .strict();
export type OneShotAudience = z.infer<typeof oneShotAudienceSchema>;

/** `POST /projects/:id/one-shot/estimate` body. */
export const oneShotEstimateInputSchema = z
  .object({ targetDurationSeconds: targetDurationSecondsSchema })
  .strict();
export type OneShotEstimateInput = z.infer<typeof oneShotEstimateInputSchema>;

export const oneShotEstimateItemSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_.-]{0,59}$/),
    label: z.string().min(1).max(120),
    quantity: z.number().int().nonnegative().max(1_000),
    unitCostUsd: usdSchema,
    costUsd: usdSchema,
  })
  .strict();

/** An itemised upper-bound estimate for the whole chain. */
export const oneShotEstimateSchema = z
  .object({
    pricingVersion: z.string().min(1).max(40),
    currency: z.literal("USD"),
    targetDurationSeconds: targetDurationSecondsSchema,
    estimatedScenes: z.number().int().positive().max(50),
    items: z.array(oneShotEstimateItemSchema).min(1).max(20),
    totalUsd: usdSchema,
  })
  .strict();
export type OneShotEstimate = z.infer<typeof oneShotEstimateSchema>;

/**
 * `POST /projects/:id/one-shot` body (ST-107): confirms one brief revision and
 * its estimate. This is the single explicit authorisation for every paid call
 * the run makes after the brief. The style pack and sound bed default to the
 * brief's choices; either can be changed here, from the closed lists only.
 */
export const oneShotCreateInputSchema = z
  .object({
    briefRevision: z.number().int().positive().max(100),
    acceptedEstimateUsd: usdSchema,
    stylePackId: creativeDesignPackIdSchema.optional(),
    soundBed: soundBedChoiceSchema.optional(),
  })
  .strict();
export type OneShotCreateInput = z.infer<typeof oneShotCreateInputSchema>;

// ---------------------------------------------------------------------------
// ST-107 — video brief
// ---------------------------------------------------------------------------

/** `POST /projects/:id/one-shot/brief` body: prepares or revises the brief. */
export const oneShotBriefInputSchema = z
  .object({
    focusPrompt: lessonFocusPromptSchema,
    audience: oneShotAudienceSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
  })
  .strict();
export type OneShotBriefInput = z.infer<typeof oneShotBriefInputSchema>;

export const oneShotBriefMinCoveragePoints = 2;
export const oneShotBriefMaxCoveragePoints = 8;
export const oneShotBriefReasonMaxLength = 200;

/** Scene-count band a brief may plan for a target duration: one scene per
 * 60 s at the least, one per 20 s at the most. */
export function oneShotPlannedSceneRange(targetDurationSeconds: number): {
  min: number;
  max: number;
} {
  return {
    min: Math.max(2, Math.ceil(targetDurationSeconds / 60)),
    max: Math.ceil(targetDurationSeconds / 20),
  };
}

const briefText = (max: number) => z.string().trim().min(1).max(max);

/**
 * Structured output of `one-shot-brief/v1`, closed over what exists at call
 * time: every `sectionIds` entry is a section of the source document, the
 * style pack is a registered pack, and the sound bed is an active catalog
 * track or `none`. Anything else fails validation and goes through the
 * bounded structured-output repair policy; there is no silent fallback.
 */
export function createOneShotBriefOutputSchema(context: {
  sectionIds: readonly string[];
  soundBedTrackIds: readonly string[];
  targetDurationSeconds: number;
}) {
  const sections = new Set(context.sectionIds);
  const tracks = new Set(context.soundBedTrackIds);
  const scenes = oneShotPlannedSceneRange(context.targetDurationSeconds);
  return z
    .object({
      schemaVersion: z.literal("one-shot-brief-v1"),
      subject: briefText(200),
      lessonTitle: briefText(200),
      coverage: z
        .array(
          z
            .object({
              point: briefText(300),
              sectionIds: z
                .array(
                  z.string().refine((value) => sections.has(value), {
                    message: "Cite only section IDs from the document outline.",
                  }),
                )
                .min(1)
                .max(10),
            })
            .strict(),
        )
        .min(oneShotBriefMinCoveragePoints)
        .max(oneShotBriefMaxCoveragePoints),
      notCovered: z.array(briefText(300)).max(10),
      plannedSceneCount: z.number().int().min(scenes.min).max(scenes.max),
      stylePackId: creativeDesignPackIdSchema,
      stylePackReason: briefText(oneShotBriefReasonMaxLength),
      soundBed: z
        .string()
        .refine((value) => value === soundBedNone || tracks.has(value), {
          message: "Choose an available sound bed track ID or none.",
        }),
      soundBedReason: briefText(oneShotBriefReasonMaxLength),
    })
    .strict();
}
export type OneShotBriefOutput = z.infer<
  ReturnType<typeof createOneShotBriefOutputSchema>
>;

export const oneShotBriefSectionSchema = z
  .object({ sectionId: identifierSchema, heading: z.string().min(1).max(300) })
  .strict();

export const oneShotBriefCoveragePointSchema = z
  .object({
    point: briefText(300),
    sectionIds: z.array(identifierSchema).min(1).max(10),
  })
  .strict();
export type OneShotBriefCoveragePoint = z.infer<
  typeof oneShotBriefCoveragePointSchema
>;


/** An itemised estimate carried by a brief (declared after the estimate). */
export const oneShotBriefSchema = z
  .object({
    runId: identifierSchema,
    revision: z.number().int().positive().max(100),
    focusPrompt: lessonFocusPromptSchema,
    audience: oneShotAudienceSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    subject: briefText(200),
    lessonTitle: briefText(200),
    coverage: z
      .array(oneShotBriefCoveragePointSchema)
      .min(oneShotBriefMinCoveragePoints)
      .max(oneShotBriefMaxCoveragePoints),
    notCovered: z.array(briefText(300)).max(10),
    /** Headings of every section the coverage cites, for the source chips. */
    sections: z.array(oneShotBriefSectionSchema).max(80),
    plannedSceneCount: z.number().int().positive().max(50),
    stylePackId: creativeDesignPackIdSchema,
    stylePackReason: briefText(oneShotBriefReasonMaxLength),
    soundBed: soundBedChoiceSchema,
    soundBedReason: briefText(oneShotBriefReasonMaxLength),
    estimate: oneShotEstimateSchema,
    model: z.string().min(1).max(200),
    promptVersion: z.string().min(1).max(50),
    modelCallId: identifierSchema,
    createdAt: timestampSchema,
  })
  .strict();
export type OneShotBrief = z.infer<typeof oneShotBriefSchema>;

export const oneShotStylePackIds: readonly CreativeDesignPackId[] =
  creativeDesignPackIds;

/** `GET` and `POST /projects/:id/one-shot/brief` response. */
export const oneShotBriefResponseSchema = z
  .object({
    brief: oneShotBriefSchema.nullable(),
    /** Brief calls made for this run so far, and the per-run limit. */
    revisionsUsed: z.number().int().nonnegative(),
    maxRevisions: z.number().int().positive(),
    stylePackIds: z.array(creativeDesignPackIdSchema).min(1),
  })
  .strict();
export type OneShotBriefResponse = z.infer<typeof oneShotBriefResponseSchema>;

// ---------------------------------------------------------------------------
// ST-107 — run budget ledger
// ---------------------------------------------------------------------------

/** A ledger line: one per paid step of a run. `other` collects any usage the
 * run's correlation id produced outside the known steps, so the ledger total
 * always equals the usage records. */
export const oneShotLedgerStepValues = [
  "brief",
  "objectives",
  "outline",
  "narration",
  "storyboard",
  "visual_plan",
  "illustrations",
  "grounding",
  "audio",
  "repair",
  "render",
  "other",
] as const;
export const oneShotLedgerStepSchema = z.enum(oneShotLedgerStepValues);
export type OneShotLedgerStep = z.infer<typeof oneShotLedgerStepSchema>;

export const oneShotLedgerEntrySchema = z
  .object({
    step: oneShotLedgerStepSchema,
    estimateUsd: usdSchema,
    actualUsd: usdSchema,
    usageRecordIds: z.array(identifierSchema).max(2_000),
  })
  .strict();
export type OneShotLedgerEntry = z.infer<typeof oneShotLedgerEntrySchema>;

export const oneShotBudgetSchema = z
  .object({
    reservedUsd: usdSchema,
    capUsd: usdSchema,
    actualUsd: usdSchema,
    reservationRevision: z.number().int().nonnegative(),
    /** Set only while the run is stopped with ONE_SHOT_BUDGET_CAP: the new
     * estimate the user must accept to continue. */
    proposedEstimateUsd: usdSchema.nullable(),
  })
  .strict();
export type OneShotBudget = z.infer<typeof oneShotBudgetSchema>;

/** `POST /projects/:id/one-shot/budget/accept` body. */
export const oneShotBudgetAcceptInputSchema = z
  .object({
    reservationRevision: z.number().int().nonnegative(),
    acceptedEstimateUsd: usdSchema,
  })
  .strict();
export type OneShotBudgetAcceptInput = z.infer<
  typeof oneShotBudgetAcceptInputSchema
>;

// ---------------------------------------------------------------------------
// ST-107 — production decision log
// ---------------------------------------------------------------------------

export const oneShotDecisionKindValues = [
  "brief",
  "style_pack",
  "sound_bed",
  "auto_approval",
  "repair",
  "budget_reservation",
  "coverage_gap",
  "render_review",
] as const;
export const oneShotDecisionKindSchema = z.enum(oneShotDecisionKindValues);
export type OneShotDecisionKind = z.infer<typeof oneShotDecisionKindSchema>;

/** What a writer proposes to append; the service assigns `seq`. */
export const oneShotDecisionDraftSchema = z
  .object({
    kind: oneShotDecisionKindSchema,
    summary: z.string().trim().min(1).max(500),
    reason: z.string().trim().min(1).max(500).optional(),
    model: z.string().min(1).max(200).optional(),
    promptVersion: z.string().min(1).max(50).optional(),
    costUsd: usdSchema.optional(),
    relatedIds: z.array(identifierSchema).max(20).default([]),
  })
  .strict();
export type OneShotDecisionDraft = z.input<typeof oneShotDecisionDraftSchema>;

export const oneShotDecisionSchema = z
  .object({
    runId: identifierSchema,
    seq: z.number().int().positive(),
    kind: oneShotDecisionKindSchema,
    summary: z.string().min(1).max(500),
    reason: z.string().min(1).max(500).nullable(),
    model: z.string().min(1).max(200).nullable(),
    promptVersion: z.string().min(1).max(50).nullable(),
    costUsd: usdSchema.nullable(),
    relatedIds: z.array(identifierSchema).max(20),
    createdAt: timestampSchema,
  })
  .strict();
export type OneShotDecision = z.infer<typeof oneShotDecisionSchema>;

/** `GET /projects/:id/one-shot/decisions`: the log, the ledger and the
 * budget of the project's latest run. */
export const oneShotDecisionsResponseSchema = z
  .object({
    runId: identifierSchema.nullable(),
    decisions: z.array(oneShotDecisionSchema).max(1_000),
    ledger: z
      .array(oneShotLedgerEntrySchema)
      .max(oneShotLedgerStepValues.length),
    budget: oneShotBudgetSchema.nullable(),
  })
  .strict();
export type OneShotDecisionsResponse = z.infer<
  typeof oneShotDecisionsResponseSchema
>;

export const oneShotIneligibilityReasonSchema = z
  .object({
    code: z.enum(["not_in_cohort", "pilot_disabled"]),
    message: z.string().min(1).max(300),
  })
  .strict();

/** Every read carries eligibility; users outside the cohort get
 * `visible: false` and nothing else about the feature. */
export const oneShotEligibilitySchema = z
  .object({
    visible: z.boolean(),
    canStart: z.boolean(),
    reasons: z.array(oneShotIneligibilityReasonSchema).max(5),
  })
  .strict();
export type OneShotEligibility = z.infer<typeof oneShotEligibilitySchema>;

export const oneShotNeedsAttentionSchema = z
  .object({
    stage: oneShotAttentionStageSchema,
    errorCode: oneShotErrorCodeSchema,
    message: z.string().min(1).max(500),
  })
  .strict();

export const oneShotRunViewSchema = z
  .object({
    id: identifierSchema,
    projectId: identifierSchema,
    status: oneShotRunStatusSchema,
    currentStep: oneShotStepSchema.nullable(),
    steps: oneShotStepsSchema,
    /** The owner's own request, returned only to the owner. */
    focusPrompt: lessonFocusPromptSchema,
    audience: oneShotAudienceSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    acceptedEstimateUsd: usdSchema,
    actualCostUsd: usdSchema,
    focusCoverage: objectiveFocusCoverageSchema.nullable(),
    needsAttention: oneShotNeedsAttentionSchema.nullable(),
    /** ST-107. The confirmed (or, before confirmation, latest) brief
     * revision; `null` before any brief and for runs from before ST-107. */
    briefRevision: z.number().int().positive().nullable(),
    budget: oneShotBudgetSchema.nullable(),
    /** ST-107. Confirmed coverage points still unmet after one repair round;
     * the preview shows each as "Not covered". */
    coverageGaps: z.array(z.string().min(1).max(300)).max(10),
    stylePackId: creativeDesignPackIdSchema.nullable(),
    soundBed: soundBedChoiceSchema.nullable(),
    lessonVersionId: identifierSchema.nullable(),
    renderJobId: identifierSchema.nullable(),
    correlationId: identifierSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();
export type OneShotRunView = z.infer<typeof oneShotRunViewSchema>;

/** `GET /projects/:id/one-shot` and every write's response. */
export const oneShotResponseSchema = z
  .object({
    eligibility: oneShotEligibilitySchema,
    run: oneShotRunViewSchema.nullable(),
  })
  .strict();
export type OneShotResponse = z.infer<typeof oneShotResponseSchema>;

/** `oneshot.advance` job payload on the `orchestration` queue. */
export const oneShotAdvanceJobType = "oneshot.advance" as const;
export const oneShotAdvancePayloadSchema = z
  .object({ runId: identifierSchema, schemaVersion: z.literal(1) })
  .strict();
export type OneShotAdvancePayload = z.infer<typeof oneShotAdvancePayloadSchema>;
