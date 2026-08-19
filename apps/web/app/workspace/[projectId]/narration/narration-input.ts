import type {
  NarrationBudgetStatus,
  NarrationGenerationState,
  NarrationValidation,
} from "@avlp/schemas";
export type { NarrationValidation };

/** Human-readable label for the narration review route state. */
export function narrationGenerationStateLabel(
  state: NarrationGenerationState,
): string {
  switch (state) {
    case "generating":
      return "Generating the lesson narration…";
    case "draft":
      return "A draft narration is ready for review.";
    case "approved":
      return "The narration is approved and will guide the storyboard.";
    case "failed":
      return "Narration generation failed.";
    case "idle":
      return "No narration has been generated yet.";
  }
}

/** Friendly message for known narration generation failure codes. */
export function narrationFailureMessage(errorCode: string | null): string {
  switch (errorCode) {
    case "AI_QUOTA_EXCEEDED":
      return "The generation quota for this project has been reached. Try again later.";
    case "OUTLINE_SET_NOT_FOUND":
    case "OUTLINE_SET_NOT_APPROVED":
    case "OUTLINE_SET_REVISION_MISMATCH":
      return "The approved lesson outline changed. Review and approve the outline again.";
    case "OUTLINE_SET_SNAPSHOT_MISMATCH":
    case "SOURCE_SNAPSHOT_NOT_FOUND":
    case "SOURCE_SNAPSHOT_STALE":
      return "The approved source changed. Re-confirm the reviewed source and try again.";
    case "MODEL_OUTPUT_DETERMINISTIC_FAILURE":
    case "STRUCTURED_OUTPUT_INVALID":
      return "The AI produced narration that could not be validated. Try again.";
    case "CANDIDATE_PERSIST_FAILED":
      return "The generated narration could not be saved. Try again.";
    default:
      return "Narration generation failed. Try again.";
  }
}

/** True while a narration generation job is still in flight. */
export function isGenerating(state: NarrationGenerationState): boolean {
  return state === "generating";
}

/** Human-readable label for a narration budget status. */
export function narrationBudgetStatusLabel(
  status: NarrationBudgetStatus,
): string {
  switch (status) {
    case "under":
      return "Under the target";
    case "over":
      return "Over the target";
    case "within":
      return "Within the target";
  }
}

/**
 * Warning sentences for the narration review route. Duration and word-count
 * statuses never block approval; uncovered outline items do.
 */
export function narrationValidationWarnings(
  validation: NarrationValidation,
): string[] {
  const warnings: string[] = [];
  if (validation.durationWarning !== null)
    warnings.push(validation.durationWarning);
  if (validation.wordCountWarning !== null)
    warnings.push(validation.wordCountWarning);
  if (validation.uncoveredOutlineItemIds.length > 0)
    warnings.push(
      `${validation.uncoveredOutlineItemIds.length} approved outline item${
        validation.uncoveredOutlineItemIds.length === 1 ? " is" : "s are"
      } missing narration. Regenerate before continuing.`,
    );
  return warnings;
}
