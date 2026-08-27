import type { ProjectStage } from "@avlp/schemas";
import type { StageId, StageState } from "../components/layout/project-pipeline-rail";

export interface PipelineStageConfig {
  id: StageId;
  label: string;
  pathSuffix: string;
}

export const PIPELINE_STAGES: readonly PipelineStageConfig[] = [
  { id: "Source", label: "Source", pathSuffix: "/upload" },
  { id: "Review", label: "Review", pathSuffix: "/review" },
  { id: "Setup", label: "Setup", pathSuffix: "/configuration" },
  { id: "Objectives", label: "Objectives", pathSuffix: "/objectives" },
  { id: "Outline", label: "Outline", pathSuffix: "/outline" },
  { id: "Narration", label: "Narration", pathSuffix: "/narration" },
  { id: "Storyboard", label: "Storyboard", pathSuffix: "/storyboard" },
  { id: "Preview", label: "Preview", pathSuffix: "/preview" },
  { id: "Deliver", label: "Deliver", pathSuffix: "/render" },
] as const;

export function getProjectStageIndex(stage: ProjectStage): number {
  switch (stage) {
    case "draft":
    case "uploading":
    case "validating_source":
    case "ingesting":
      return 0; // Source
    case "ingestion_review":
      return 1; // Review
    case "lesson_configuration":
      return 2; // Setup
    case "objectives_review":
      return 3; // Objectives
    case "outline_review":
      return 4; // Outline
    case "narration_storyboard_review":
      return 6; // Storyboard (covers both Narration and Storyboard)
    case "audio_generation":
    case "ready_for_validation":
      return 6; // Storyboard
    case "ready_to_render":
      return 7; // Preview
    case "rendering":
    case "completed":
      return 8; // Deliver
    default:
      return 0;
  }
}

export function getPipelineStages(
  projectStage: ProjectStage,
  currentStageId?: StageId | undefined,
  projectIdOrNavigate?: string | ((id: StageId, path: string) => void) | undefined,
  onNavigateExplicit?: ((id: StageId, path: string) => void) | undefined,
): StageState[] {
  const maxReachedIndex = getProjectStageIndex(projectStage);
  const activeIndex = currentStageId
    ? PIPELINE_STAGES.findIndex((s) => s.id === currentStageId)
    : maxReachedIndex;

  const projectId =
    typeof projectIdOrNavigate === "string" ? projectIdOrNavigate : undefined;
  const onNavigate =
    typeof projectIdOrNavigate === "function"
      ? projectIdOrNavigate
      : onNavigateExplicit;

  return PIPELINE_STAGES.map((config, index) => {
    let status: "completed" | "current" | "available" | "blocked";

    if (index === activeIndex) {
      status = "current";
    } else if (index < activeIndex || index < maxReachedIndex) {
      status = "completed";
    } else if (index <= Math.max(maxReachedIndex, activeIndex + 1)) {
      status = "available";
    } else {
      status = "blocked";
    }

    const href =
      status !== "blocked" && projectId
        ? `/workspace/${encodeURIComponent(projectId)}${config.pathSuffix}`
        : undefined;

    const onClick =
      status !== "blocked" && onNavigate
        ? () => onNavigate(config.id, config.pathSuffix)
        : undefined;

    return {
      id: config.id,
      label: config.label,
      status,
      ...(href !== undefined ? { href } : {}),
      ...(onClick !== undefined ? { onClick } : {}),
    };
  });
}
