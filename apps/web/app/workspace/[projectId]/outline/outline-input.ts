import type {
  OutlineDurationStatus,
  OutlineGenerationState,
  OutlineItemKind,
  OutlineValidation,
} from "@avlp/schemas";
export type { OutlineValidation };

/** Human-readable label for the outline review route state. */
export function outlineGenerationStateLabel(
  state: OutlineGenerationState,
): string {
  switch (state) {
    case "generating":
      return "Generating the lesson outline…";
    case "draft":
      return "A draft lesson outline is ready for review.";
    case "approved":
      return "The lesson outline is approved and will guide narration.";
    case "failed":
      return "Outline generation failed.";
    case "idle":
      return "No lesson outline has been generated yet.";
  }
}

/** Friendly message for known outline generation failure codes. */
export function outlineFailureMessage(errorCode: string | null): string {
  switch (errorCode) {
    case "AI_QUOTA_EXCEEDED":
      return "The generation quota for this project has been reached. Try again later.";
    case "OBJECTIVE_SET_NOT_FOUND":
    case "OBJECTIVE_SET_NOT_APPROVED":
    case "OBJECTIVE_SET_REVISION_MISMATCH":
      return "The approved learning objectives changed. Review and approve the objectives again.";
    case "OBJECTIVE_SET_SNAPSHOT_MISMATCH":
    case "SOURCE_SNAPSHOT_NOT_FOUND":
    case "SOURCE_SNAPSHOT_STALE":
      return "The approved source changed. Re-confirm the reviewed source and try again.";
    case "MODEL_OUTPUT_DETERMINISTIC_FAILURE":
    case "STRUCTURED_OUTPUT_INVALID":
      return "The AI produced an outline that could not be validated. Try again.";
    case "CANDIDATE_PERSIST_FAILED":
      return "The generated outline could not be saved. Try again.";
    default:
      return "Outline generation failed. Try again.";
  }
}

/** True while an outline generation job is still in flight. */
export function isGenerating(state: OutlineGenerationState): boolean {
  return state === "generating";
}

/** Human-readable label for an outline item's structural purpose. */
export function outlineItemKindLabel(kind: OutlineItemKind): string {
  switch (kind) {
    case "hook":
      return "Hook";
    case "concept":
      return "Concept";
    case "example":
      return "Example";
    case "analogy":
      return "Analogy";
    case "summary":
      return "Summary";
    case "recall_question":
      return "Recall question";
  }
}

/** Human-readable label for the estimated-duration status. */
export function outlineDurationStatusLabel(
  status: OutlineDurationStatus,
): string {
  switch (status) {
    case "under":
      return "Under the lesson target";
    case "over":
      return "Over the lesson target";
    case "within":
      return "Within the lesson target";
  }
}

/**
 * Warning sentences for the outline review route. Duration and structure
 * warnings never block approval; uncovered objectives do.
 */
export function outlineValidationWarnings(
  validation: OutlineValidation,
): string[] {
  const warnings: string[] = [];
  if (validation.durationWarning !== null)
    warnings.push(validation.durationWarning);
  if (validation.structureWarning !== null)
    warnings.push(validation.structureWarning);
  if (validation.uncoveredObjectiveIds.length > 0)
    warnings.push(
      `${validation.uncoveredObjectiveIds.length} approved objective${
        validation.uncoveredObjectiveIds.length === 1 ? " is" : "s are"
      } not covered by any outline item. Add links before approving.`,
    );
  return warnings;
}
