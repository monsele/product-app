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
      nextActionLabel: "View Issue",
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
        nextActionLabel: "Upload Source",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "uploading":
      return {
        label: "Uploading Document",
        badgeStyle: "info",
        nextActionLabel: "Continue Upload",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "validating_source":
      return {
        label: "Validating Source",
        badgeStyle: "info",
        nextActionLabel: "Check Validation",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "ingesting":
    case "source_uploaded":
      return {
        label: "Ingesting Document",
        badgeStyle: "info",
        nextActionLabel: "Check Status",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
        stepIndex: 0,
      };
    case "ingestion_review":
    case "reviewing":
    case "ingestion_reviewed":
      return {
        label: "Source Review",
        badgeStyle: "info",
        nextActionLabel: "Review Source",
        nextActionPath: (id) => `/workspace/${id}/review`,
        isComplete: false,
        stepIndex: 1,
      };
    case "lesson_configuration":
    case "configuring":
    case "configured":
      return {
        label: "Lesson Setup",
        badgeStyle: "info",
        nextActionLabel: "Configure Lesson",
        nextActionPath: (id) => `/workspace/${id}/configuration`,
        isComplete: false,
        stepIndex: 2,
      };
    case "objectives_review":
    case "objectives_approved":
      return {
        label: "Objectives Review",
        badgeStyle: "info",
        nextActionLabel: "Review Objectives",
        nextActionPath: (id) => `/workspace/${id}/objectives`,
        isComplete: false,
        stepIndex: 3,
      };
    case "outline_review":
    case "outline_approved":
      return {
        label: "Outline Review",
        badgeStyle: "info",
        nextActionLabel: "Review Outline",
        nextActionPath: (id) => `/workspace/${id}/outline`,
        isComplete: false,
        stepIndex: 4,
      };
    case "narration_storyboard_review":
    case "narration_approved":
    case "storyboarding":
    case "storyboard_approved":
      return {
        label: "Storyboard & Script",
        badgeStyle: "info",
        nextActionLabel: "Open Storyboard",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
        stepIndex: 6,
      };
    case "audio_generation":
      return {
        label: "Generating Audio",
        badgeStyle: "info",
        nextActionLabel: "View Storyboard",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
        stepIndex: 6,
      };
    case "ready_for_validation":
      return {
        label: "Ready for Validation",
        badgeStyle: "info",
        nextActionLabel: "Validate Lesson",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
        stepIndex: 6,
      };
    case "ready_to_render":
      return {
        label: "Ready to Render",
        badgeStyle: "info",
        nextActionLabel: "Preview & Render",
        nextActionPath: (id) => `/workspace/${id}/preview`,
        isComplete: false,
        stepIndex: 7,
      };
    case "rendering":
      return {
        label: "Rendering Video",
        badgeStyle: "warning",
        nextActionLabel: "View Render",
        nextActionPath: (id) => `/workspace/${id}/render`,
        isComplete: false,
        stepIndex: 8,
      };
    case "completed":
    case "rendered":
      return {
        label: "Ready for Class",
        badgeStyle: "success",
        nextActionLabel: "Preview & Share",
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
