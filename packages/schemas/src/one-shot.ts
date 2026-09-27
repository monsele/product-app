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
  lessonAgeBandSchema,
  lessonDifficultySchema,
  lessonFocusPromptSchema,
  lessonToneSchema,
  objectiveFocusCoverageSchema,
  targetDurationSecondsSchema,
} from "./index.js";

const timestampSchema = z.string().datetime({ offset: true });
const usdSchema = z.number().finite().nonnegative().max(10_000);

export const oneShotRunStatusValues = [
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

/** `POST /projects/:id/one-shot` body: the single explicit authorisation for
 * every paid call the run makes. */
export const oneShotCreateInputSchema = z
  .object({
    focusPrompt: lessonFocusPromptSchema,
    audience: oneShotAudienceSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    acceptedEstimateUsd: usdSchema,
  })
  .strict();
export type OneShotCreateInput = z.infer<typeof oneShotCreateInputSchema>;

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
