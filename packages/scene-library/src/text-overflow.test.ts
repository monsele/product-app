import { describe, expect, it } from "vitest";
import { measureSceneContent } from "./layout.js";
import { minimumProcessFixture } from "./process-scene.fixtures.js";
import { validateScene } from "./scene-registry.js";

// Title + two on-screen lines + five short steps: every block fits on its own,
// but the stack is taller than the body safe area. Without the title it fits.
const stackedProcessScene = {
  ...minimumProcessFixture,
  title: "Stewardship Truths and the Five Pillars",
  onScreenText: [
    "God gives power to get wealth",
    "Growth expected from every steward",
  ],
  visual: {
    steps: [
      "Budgeting",
      "Protection",
      "Savings",
      "Investment",
      "Debt management",
    ],
  },
};

describe("text overflow reporting", () => {
  it("marks a too-tall stack as a total overflow, not a block overflow", () => {
    const measurement = measureSceneContent([
      { path: "title", value: stackedProcessScene.title },
      ...stackedProcessScene.onScreenText.map((value, index) => ({
        path: `onScreenText.${index}`,
        value,
      })),
      ...stackedProcessScene.visual.steps.map((value, index) => ({
        path: `visual.steps.${index}`,
        value,
      })),
    ]);
    expect(measurement.fits).toBe(false);
    expect(measurement.overflowScope).toBe("total");
  });

  it("names the scene as a whole instead of blaming the last block", () => {
    const issues = validateScene(stackedProcessScene);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "text_overflow",
      fieldPath: "scene",
    });
    expect(issues[0]!.message).toMatch(/together exceed/);
    expect(issues[0]!.suggestedCorrection).toMatch(/on-screen text/);
  });

  it("fits once the title is removed, so layout checks must include it", () => {
    const { title: _title, ...untitled } = stackedProcessScene;
    expect(validateScene(untitled)).toEqual([]);
  });

  it("still blames a single block that is too long on its own", () => {
    const measurement = measureSceneContent([
      { path: "title", value: "Short" },
      { path: "onScreenText.0", value: "word ".repeat(120).trim() },
    ]);
    expect(measurement).toMatchObject({
      fits: false,
      firstOverflowPath: "onScreenText.0",
      overflowScope: "block",
    });
  });
});
