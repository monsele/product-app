import { z } from "zod";
import { identifierSchema } from "@avlp/config";

export const lessonTimingRepairPayloadSchema = z
  .object({ schemaVersion: z.literal(1) })
  .strict();

export const recoveryTaskStates = [
  "queued",
  "running",
  "retry_wait",
  "succeeded",
  "needs_action",
  "failed",
  "superseded",
  "cancelled",
] as const;
export const recoveryOperationSchema = z.enum([
  "audio",
  "captions",
  "timing",
  "validation",
  "asset",
  "grounding",
  "review",
]);
export const recoveryActionSchema = z.enum([
  "prepare",
  "retry",
  "review_content",
  "review_sources",
  "review_assets",
  "choose_voice",
  "approve_usage",
]);
export const recoveryTaskSchema = z
  .object({
    id: z.string(),
    sceneId: identifierSchema.nullable(),
    operation: recoveryOperationSchema,
    issueCodes: z.array(z.string()),
    state: z.enum(recoveryTaskStates),
    attempts: z.number().int().min(0),
    message: z.string(),
    action: recoveryActionSchema.nullable(),
    failureCode: z.string().nullable(),
    fieldPath: z.string().optional(),
  })
  .strict();
export const lessonReadinessSchema = z
  .object({
    enabled: z.boolean(),
    revision: z.number().int().nonnegative().nullable(),
    capabilities: z
      .object({ edit: z.boolean(), preview: z.boolean(), render: z.boolean() })
      .strict(),
    state: z.enum([
      "preparing",
      "recovering",
      "ready",
      "needs_action",
      "unavailable",
    ]),
    actualDurationSeconds: z.number().nonnegative(),
    targetDurationSeconds: z.number().nonnegative(),
    validationRunId: identifierSchema.nullable(),
    runId: identifierSchema.nullable(),
    tasks: z.array(recoveryTaskSchema),
    completedTasks: z.number().int().nonnegative(),
    allowanceUsd: z.number().nonnegative(),
    reservedUsd: z.number().nonnegative(),
    activity: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            sceneId: identifierSchema.nullable(),
            operation: recoveryOperationSchema,
            state: z.enum(recoveryTaskStates),
            attempts: z.number().int().nonnegative(),
            occurredAt: z.string().datetime(),
            message: z.string(),
          })
          .strict(),
      )
      .optional(),
    metrics: z
      .object({
        timeToEditableMs: z.number().nonnegative(),
        timeToPreviewMs: z.number().nonnegative().nullable(),
        successfulRepairs: z.number().int().nonnegative(),
        unresolvedTasks: z.number().int().nonnegative(),
        retryCount: z.number().int().nonnegative(),
        recoveryCostUsd: z.number().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const recoveryCommandSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(1).max(160),
  })
  .strict();
export const recoveryEstimateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    fingerprint: z.string().length(64),
    maximumCostUsd: z.number().finite().nonnegative(),
    scenes: z.number().int().nonnegative(),
    coversSavedEdits: z.literal(true),
    maxAttempts: z.literal(3),
  })
  .strict();
export const recoveryStartSchema = recoveryCommandSchema
  .extend({
    intent: z.enum(["prepare", "retry", "increase_allowance"]).optional(),
    estimateFingerprint: z.string().length(64),
    acceptedMaximumCostUsd: z.number().finite().nonnegative(),
  })
  .strict();
export const recoveryAdvancePayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: identifierSchema,
    sequence: z.number().int().nonnegative(),
  })
  .strict();
export type RecoveryTask = z.infer<typeof recoveryTaskSchema>;
export type RecoveryOperation = z.infer<typeof recoveryOperationSchema>;
export type LessonReadiness = z.infer<typeof lessonReadinessSchema>;
export type RecoveryEstimate = z.infer<typeof recoveryEstimateSchema>;

export const recoveryCallsSchema = z.record(z.number().finite().nonnegative());

export const generationPreparationEstimateSchema = z
  .object({
    enabled: z.boolean(),
    fingerprint: z.string().length(64),
    maximumCostUsd: z.number().finite().nonnegative(),
  })
  .strict();
export const generationPreparationConsentSchema = z
  .object({
    estimateFingerprint: z.string().length(64),
    acceptedMaximumCostUsd: z.number().finite().nonnegative(),
  })
  .strict();
