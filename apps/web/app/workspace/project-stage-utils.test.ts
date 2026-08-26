import { describe, expect, it } from "vitest";
import {
  getStageDetails,
  formatDateTime,
  formatRelativeTimestamp,
} from "./project-stage-utils";
import type { ProjectStage } from "@avlp/schemas";

describe("project-stage-utils", () => {
  it("maps all 14 domain ProjectStages to teacher-facing labels and paths", () => {
    const testCases: Array<{
      stage: ProjectStage;
      expectedLabel: string;
      expectedPathSuffix: string;
      badgeStyle: string;
    }> = [
      {
        stage: "draft",
        expectedLabel: "Draft",
        expectedPathSuffix: "/upload",
        badgeStyle: "neutral",
      },
      {
        stage: "uploading",
        expectedLabel: "Uploading Document",
        expectedPathSuffix: "/upload",
        badgeStyle: "info",
      },
      {
        stage: "validating_source",
        expectedLabel: "Validating Source",
        expectedPathSuffix: "/upload",
        badgeStyle: "info",
      },
      {
        stage: "ingesting",
        expectedLabel: "Ingesting Document",
        expectedPathSuffix: "/upload",
        badgeStyle: "info",
      },
      {
        stage: "ingestion_review",
        expectedLabel: "Source Review",
        expectedPathSuffix: "/review",
        badgeStyle: "info",
      },
      {
        stage: "lesson_configuration",
        expectedLabel: "Lesson Setup",
        expectedPathSuffix: "/configuration",
        badgeStyle: "info",
      },
      {
        stage: "objectives_review",
        expectedLabel: "Objectives Review",
        expectedPathSuffix: "/objectives",
        badgeStyle: "info",
      },
      {
        stage: "outline_review",
        expectedLabel: "Outline Review",
        expectedPathSuffix: "/outline",
        badgeStyle: "info",
      },
      {
        stage: "narration_storyboard_review",
        expectedLabel: "Storyboard & Script",
        expectedPathSuffix: "/storyboard",
        badgeStyle: "info",
      },
      {
        stage: "audio_generation",
        expectedLabel: "Generating Audio",
        expectedPathSuffix: "/storyboard",
        badgeStyle: "info",
      },
      {
        stage: "ready_for_validation",
        expectedLabel: "Ready for Validation",
        expectedPathSuffix: "/storyboard",
        badgeStyle: "info",
      },
      {
        stage: "ready_to_render",
        expectedLabel: "Ready to Render",
        expectedPathSuffix: "/preview",
        badgeStyle: "info",
      },
      {
        stage: "rendering",
        expectedLabel: "Rendering Video",
        expectedPathSuffix: "/render",
        badgeStyle: "warning",
      },
      {
        stage: "completed",
        expectedLabel: "Ready for Class",
        expectedPathSuffix: "/preview",
        badgeStyle: "success",
      },
    ];

    for (const { stage, expectedLabel, expectedPathSuffix, badgeStyle } of testCases) {
      const details = getStageDetails(stage);
      expect(details.label).toBe(expectedLabel);
      expect(details.badgeStyle).toBe(badgeStyle);
      expect(details.nextActionPath("test-id")).toBe(`/workspace/test-id${expectedPathSuffix}`);
    }
  });

  it("handles failure status while preserving base stage info", () => {
    const details = getStageDetails("draft", true);
    expect(details.label).toBe("Draft");
    expect(details.badgeStyle).toBe("error");
    expect(details.nextActionLabel).toBe("View Issue");
    expect(details.nextActionPath("proj-123")).toBe("/workspace/proj-123/upload");
  });

  it("formats dates and relative timestamps gracefully", () => {
    const iso = "2026-08-13T12:00:00.000Z";
    const formatted = formatDateTime(iso);
    expect(formatted).toContain("2026");

    const recent = new Date().toISOString();
    expect(formatRelativeTimestamp(recent)).toBe("Just now");
  });
});
