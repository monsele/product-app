import type { ObjectiveGenerationState } from "@avlp/schemas";

/** Human-readable label for the objectives review route state. */
export function objectiveGenerationStateLabel(
  state: ObjectiveGenerationState,
): string {
  switch (state) {
    case "generating":
      return "Generating learning objectives…";
    case "draft":
      return "Draft learning objectives are ready for review.";
    case "approved":
      return "Learning objectives are approved and will guide the lesson.";
    case "failed":
      return "Objective generation failed.";
    case "idle":
      return "No learning objectives have been generated yet.";
  }
}

/** Friendly message for known generation failure codes. */
export function objectiveFailureMessage(errorCode: string | null): string {
  switch (errorCode) {
    case "AI_QUOTA_EXCEEDED":
      return "The generation quota for this project has been reached. Try again later.";
    case "SOURCE_SNAPSHOT_NOT_FOUND":
    case "SOURCE_SNAPSHOT_STALE":
      return "The approved source changed. Re-confirm the reviewed source and try again.";
    case "MODEL_OUTPUT_DETERMINISTIC_FAILURE":
    case "STRUCTURED_OUTPUT_INVALID":
      return "The AI produced objectives that could not be validated. Try again.";
    case "CANDIDATE_PERSIST_FAILED":
      return "The generated objectives could not be saved. Try again.";
    default:
      return "Objective generation failed. Try again.";
  }
}

/** True while a generation job is still in flight. */
export function isGenerating(state: ObjectiveGenerationState): boolean {
  return state === "generating";
}

/** Human-readable label for a persisted objective's grounding status. */
export function objectiveGroundingLabel(status: "supported" | "unsupported"): string {
  return status === "supported"
    ? "Supported by the reviewed source"
    : "Not supported by the reviewed source";
}
