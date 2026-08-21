import type {
  SceneCandidate,
  SceneRegenerationMode,
  StoryboardGenerationState,
  StoryboardSceneAssetStatus,
  StoryboardSceneAudioStatus,
  StoryboardSceneValidationStatus,
  StoryboardValidation,
} from "@avlp/schemas";
export type { StoryboardValidation };

/** Human-readable label for a scene asset-readiness projection. */
export function sceneAssetStatusLabel(
  status: StoryboardSceneAssetStatus,
): string {
  switch (status) {
    case "none":
      return "No assets planned";
    case "planned":
      return "Assets planned";
    case "resolved":
      return "Assets resolved";
  }
}

/** Human-readable label for a scene audio-readiness projection. */
export function sceneAudioStatusLabel(
  status: StoryboardSceneAudioStatus,
): string {
  switch (status) {
    case "not_generated":
      return "No audio generated";
  }
}

/** Human-readable label for a scene validation projection. */
export function sceneValidationStatusLabel(
  status: StoryboardSceneValidationStatus,
): string {
  switch (status) {
    case "ok":
      return "Valid";
    case "warning":
      return "Needs attention";
    case "error":
      return "Invalid";
  }
}

/** Human-readable label for the storyboard review route state. */
export function storyboardGenerationStateLabel(
  state: StoryboardGenerationState,
): string {
  switch (state) {
    case "generating":
      return "Generating the lesson storyboard…";
    case "draft":
      return "A storyboard draft is ready for review.";
    case "approved":
      return "The storyboard is approved and will guide production.";
    case "failed":
      return "Storyboard generation failed.";
    case "idle":
      return "No storyboard has been generated yet.";
  }
}

/** Human-readable label for a scene regeneration mode. */
export function sceneRegenerationModeLabel(
  mode: SceneRegenerationMode,
): string {
  switch (mode) {
    case "improve-visual":
      return "Improve visual choice";
    case "simplify":
      return "Simplify";
    case "shorten":
      return "Shorten";
    case "regenerate":
      return "Regenerate";
  }
}

/** Human-readable label for a scene candidate status. */
export function sceneCandidateStatusLabel(
  status: SceneCandidate["status"],
): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "accepted":
      return "Applied";
    case "rejected":
      return "Discarded";
  }
}

/** Friendly message for known storyboard generation failure codes. */
export function storyboardFailureMessage(errorCode: string | null): string {
  switch (errorCode) {
    case "AI_QUOTA_EXCEEDED":
      return "The generation quota for this project has been reached. Try again later.";
    case "NARRATION_SET_NOT_FOUND":
      return "The narration this storyboard was based on no longer exists.";
    case "NARRATION_SET_REVISION_MISMATCH":
      return "The narration changed after this storyboard was requested. Review the narration and try again.";
    case "OUTLINE_SET_NOT_FOUND":
    case "OUTLINE_SET_NOT_APPROVED":
      return "The lesson outline is missing or not approved. Approve the outline first.";
    case "OUTLINE_SET_HASH_MISMATCH":
    case "SOURCE_SNAPSHOT_NOT_FOUND":
    case "SOURCE_SNAPSHOT_STALE":
      return "The approved source or outline changed. Re-confirm the reviewed source and outline, then try again.";
    case "MODEL_OUTPUT_DETERMINISTIC_FAILURE":
    case "STRUCTURED_OUTPUT_INVALID":
      return "The AI produced scenes that could not be validated. Try again.";
    case "STORYBOARD_INVALID_FOR_PERSIST":
      return "The validated storyboard could not be saved because of over-limit scene content. Try again.";
    case "CANDIDATE_PERSIST_FAILED":
      return "The generated storyboard could not be saved. Try again.";
    default:
      return "Storyboard generation failed. Try again.";
  }
}

/**
 * Friendly message for known scene-regeneration failure codes. Falls back to
 * the storyboard-level message so a failed scene job still reads clearly.
 */
export function sceneRegenerationFailureMessage(
  errorCode: string | null,
): string {
  switch (errorCode) {
    case "LESSON_SPEC_NOT_FOUND":
    case "SCENE_NOT_FOUND":
      return "The storyboard or scene no longer exists. Refresh the page.";
    case "LESSON_SPEC_NOT_DRAFT":
      return "Only draft storyboards can be regenerated scene by scene.";
    case "LESSON_SPEC_REVISION_MISMATCH":
    case "SCENE_REVISION_MISMATCH":
    case "NARRATION_SET_MISMATCH":
      return "The storyboard or narration changed after this regeneration was requested. Refresh and try again.";
    case "MODEL_OUTPUT_DETERMINISTIC_FAILURE":
    case "STRUCTURED_OUTPUT_INVALID":
      return "The AI produced a scene that could not be validated. Try again.";
    case "AI_QUOTA_EXCEEDED":
      return "The generation quota for this project has been reached. Try again later.";
    case "CANDIDATE_PERSIST_FAILED":
      return "The regenerated scene could not be saved. Try again.";
    default:
      return storyboardFailureMessage(errorCode);
  }
}

/** True while a storyboard generation job is still in flight. */
export function isGenerating(state: StoryboardGenerationState): boolean {
  return state === "generating";
}

/**
 * Warning sentences for the storyboard review route. A saved draft is always
 * structurally valid; the warnings surface duration drift for the teacher.
 */
export function storyboardValidationWarnings(
  validation: StoryboardValidation,
): string[] {
  const warnings: string[] = [];
  if (validation.durationWarning !== null)
    warnings.push(validation.durationWarning);
  if (validation.uncoveredOutlineItemIds.length > 0)
    warnings.push(
      `${validation.uncoveredOutlineItemIds.length} approved outline item${
        validation.uncoveredOutlineItemIds.length === 1 ? " is" : "s are"
      } missing narration in this storyboard. Regenerate before continuing.`,
    );
  if (validation.unassignedBlockIds.length > 0)
    warnings.push(
      `${validation.unassignedBlockIds.length} narration block${
        validation.unassignedBlockIds.length === 1 ? " is" : "s are"
      } not assigned to any scene. Regenerate before continuing.`,
    );
  return warnings;
}
