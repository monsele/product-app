import type { ProjectStage } from "@avlp/schemas";

export interface StageDetails {
  label: string;
  badgeStyle: "neutral" | "info" | "success" | "warning" | "error";
  nextActionLabel: string;
  nextActionPath: (projectId: string) => string;
  isComplete: boolean;
  stepIndex: number;
}

export function getStageDetails(
  stage: ProjectStage | string,
  hasFailure: boolean = false,
): StageDetails {
  if (hasFailure) {
    const base = getBaseStageDetails(stage);
    return {
      ...base,
      badgeStyle: "error",
      nextActionLabel: "View issue",
      nextActionPath: (id) => `/workspace/${id}/upload`,
    };
  }

  return getBaseStageDetails(stage);
}

function getBaseStageDetails(stage: ProjectStage | string): StageDetails {
  switch (stage) {
    case "draft":
      return {
        label: "Draft",
        badgeStyle: "neutral",
        nextActionLabel: "Upload source",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "uploading":
      return {
        label: "Uploading document",
        badgeStyle: "info",
        nextActionLabel: "Continue upload",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "validating_source":
      return {
        label: "Validating source",
        badgeStyle: "info",
        nextActionLabel: "Check validation",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "ingesting":
    case "source_uploaded":
      return {
        label: "Ingesting document",
        badgeStyle: "info",
        nextActionLabel: "Check status",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "ingestion_review":
    case "reviewing":
    case "ingestion_reviewed":
      return {
        label: "Source review",
        badgeStyle: "info",
        nextActionLabel: "Review source",
        nextActionPath: (id) => `/workspace/${id}/review`,
        isComplete: false,
        stepIndex: 1,
      };
    case "lesson_configuration":
    case "configuring":
    case "configured":
      return {
        label: "Lesson setup",
        badgeStyle: "info",
        nextActionLabel: "Configure lesson",
        nextActionPath: (id) => `/workspace/${id}/configuration`,
        isComplete: false,
        stepIndex: 2,
      };
    case "objectives_review":
    case "objectives_approved":
      return {
        label: "Objectives review",
        badgeStyle: "info",
        nextActionLabel: "Review objectives",
        nextActionPath: (id) => `/workspace/${id}/objectives`,
        isComplete: false,
        stepIndex: 3,
      };
    case "outline_review":
    case "outline_approved":
      return {
        label: "Outline review",
        badgeStyle: "info",
        nextActionLabel: "Review outline",
        nextActionPath: (id) => `/workspace/${id}/outline`,
        isComplete: false,
        stepIndex: 4,
      };
    case "narration_storyboard_review":
    case "narration_approved":
    case "storyboarding":
    case "storyboard_approved":
      return {
        label: "Storyboard & script",
        badgeStyle: "info",
        nextActionLabel: "Open storyboard",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
        stepIndex: 6,
      };
    case "audio_generation":
      return {
        label: "Generating audio",
        badgeStyle: "info",
        nextActionLabel: "View storyboard",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
        stepIndex: 6,
      };
    case "ready_for_validation":
      return {
        label: "Ready for validation",
        badgeStyle: "info",
        nextActionLabel: "Validate lesson",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
        stepIndex: 6,
      };
    case "ready_to_render":
      return {
        label: "Ready to render",
        badgeStyle: "info",
        nextActionLabel: "Preview & render",
        nextActionPath: (id) => `/workspace/${id}/preview`,
        isComplete: false,
        stepIndex: 7,
      };
    case "rendering":
      return {
        label: "Rendering video",
        badgeStyle: "warning",
        nextActionLabel: "View render",
        nextActionPath: (id) => `/workspace/${id}/render`,
        isComplete: false,
        stepIndex: 8,
      };
    case "completed":
    case "rendered":
      return {
        label: "Ready for class",
        badgeStyle: "success",
        nextActionLabel: "Preview & share",
        nextActionPath: (id) => `/workspace/${id}/preview`,
        isComplete: true,
        stepIndex: 8,
      };
    default:
      return {
        label: stage.replaceAll("_", " "),
        badgeStyle: "neutral",
        nextActionLabel: "Continue",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
  }
}

export function formatDateTime(isoDate: string): string {
  try {
    return new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(isoDate));
  } catch {
    return isoDate;
  }
}

export function formatRelativeTimestamp(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}
