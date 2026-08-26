import type { ProjectStage } from "@avlp/schemas";

export interface StageDetails {
  label: string;
  badgeStyle: "neutral" | "info" | "success" | "warning" | "error";
  nextActionLabel: string;
  nextActionPath: (projectId: string) => string;
  isComplete: boolean;
}

export function getStageDetails(
  stage: ProjectStage | string,
  hasFailure: boolean = false,
): StageDetails {
  if (hasFailure) {
    return {
      label: "Needs Attention",
      badgeStyle: "error",
      nextActionLabel: "View Issue",
      nextActionPath: (id) => `/workspace/${id}/upload`,
      isComplete: false,
    };
  }

  switch (stage) {
    case "draft":
      return {
        label: "Draft",
        badgeStyle: "neutral",
        nextActionLabel: "Upload Source",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
      };
    case "ingesting":
    case "source_uploaded":
      return {
        label: "Ingesting Document",
        badgeStyle: "info",
        nextActionLabel: "Check Status",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
      };
    case "reviewing":
    case "ingestion_reviewed":
      return {
        label: "Source Review",
        badgeStyle: "info",
        nextActionLabel: "Review Source",
        nextActionPath: (id) => `/workspace/${id}/review`,
        isComplete: false,
      };
    case "configuring":
    case "configured":
      return {
        label: "Configuration",
        badgeStyle: "info",
        nextActionLabel: "Configure Lesson",
        nextActionPath: (id) => `/workspace/${id}/configuration`,
        isComplete: false,
      };
    case "planning":
    case "objectives_approved":
    case "outline_approved":
    case "narration_approved":
      return {
        label: "Planning & Scripting",
        badgeStyle: "info",
        nextActionLabel: "Review Plan",
        nextActionPath: (id) => `/workspace/${id}/outline`,
        isComplete: false,
      };
    case "storyboarding":
    case "storyboard_approved":
      return {
        label: "Storyboard Studio",
        badgeStyle: "info",
        nextActionLabel: "Open Studio",
        nextActionPath: (id) => `/workspace/${id}/storyboard`,
        isComplete: false,
      };
    case "rendering":
      return {
        label: "Rendering Video",
        badgeStyle: "warning",
        nextActionLabel: "View Render",
        nextActionPath: (id) => `/workspace/${id}/render`,
        isComplete: false,
      };
    case "rendered":
    case "completed":
      return {
        label: "Ready for Class",
        badgeStyle: "success",
        nextActionLabel: "Preview & Share",
        nextActionPath: (id) => `/workspace/${id}/preview`,
        isComplete: true,
      };
    default:
      return {
        label: "In Progress",
        badgeStyle: "neutral",
        nextActionLabel: "Continue",
        nextActionPath: (id) => `/workspace/${id}/upload`,
        isComplete: false,
      };
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
