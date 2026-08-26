import { describe, expect, it } from "vitest";
import {
  getPipelineStages,
  getProjectStageIndex,
  PIPELINE_STAGES,
} from "./project-pipeline";

describe("project-pipeline stage mapping", () => {
  it("has 9 pipeline stages in required order", () => {
    expect(PIPELINE_STAGES.map((s) => s.id)).toEqual([
      "Source",
      "Review",
      "Setup",
      "Objectives",
      "Outline",
      "Narration",
      "Storyboard",
      "Preview",
      "Deliver",
    ]);
  });

  it("maps domain stages to correct maximum reached index", () => {
    expect(getProjectStageIndex("draft")).toBe(0);
    expect(getProjectStageIndex("uploading")).toBe(0);
    expect(getProjectStageIndex("ingestion_review")).toBe(1);
    expect(getProjectStageIndex("lesson_configuration")).toBe(2);
    expect(getProjectStageIndex("objectives_review")).toBe(3);
    expect(getProjectStageIndex("outline_review")).toBe(4);
    expect(getProjectStageIndex("narration_storyboard_review")).toBe(6);
    expect(getProjectStageIndex("ready_to_render")).toBe(7);
    expect(getProjectStageIndex("completed")).toBe(8);
  });

  it("computes stage statuses correctly for active objectives review", () => {
    const stages = getPipelineStages("objectives_review", "Objectives");
    expect(stages.find((s) => s.id === "Source")?.status).toBe("completed");
    expect(stages.find((s) => s.id === "Review")?.status).toBe("completed");
    expect(stages.find((s) => s.id === "Setup")?.status).toBe("completed");
    expect(stages.find((s) => s.id === "Objectives")?.status).toBe("current");
    expect(stages.find((s) => s.id === "Outline")?.status).toBe("blocked");
    expect(stages.find((s) => s.id === "Storyboard")?.status).toBe("blocked");
  });

  it("computes stage statuses when viewing previous stage", () => {
    const stages = getPipelineStages("outline_review", "Objectives");
    expect(stages.find((s) => s.id === "Source")?.status).toBe("completed");
    expect(stages.find((s) => s.id === "Objectives")?.status).toBe("current");
    expect(stages.find((s) => s.id === "Outline")?.status).toBe("available");
    expect(stages.find((s) => s.id === "Narration")?.status).toBe("blocked");
  });

  it("supports navigation callbacks for non-blocked stages", () => {
    let navigatedTo: string | undefined;
    const stages = getPipelineStages(
      "objectives_review",
      "Objectives",
      (_id, path) => {
        navigatedTo = path;
      },
    );

    const sourceStage = stages.find((s) => s.id === "Source");
    expect(sourceStage?.onClick).toBeDefined();
    sourceStage?.onClick?.();
    expect(navigatedTo).toBe("/upload");

    const outlineStage = stages.find((s) => s.id === "Outline");
    expect(outlineStage?.onClick).toBeUndefined();
  });
});
