import { describe, expect, it } from "vitest";
import {
  isGenerating,
  objectiveFailureMessage,
  objectiveGenerationStateLabel,
  objectiveGroundingLabel,
} from "./objectives-input";

describe("objectives input helpers", () => {
  it("labels each generation state", () => {
    expect(objectiveGenerationStateLabel("idle")).toContain("No learning objectives");
    expect(objectiveGenerationStateLabel("generating")).toContain("Generating");
    expect(objectiveGenerationStateLabel("draft")).toContain("ready for review");
    expect(objectiveGenerationStateLabel("approved")).toContain("approved");
    expect(objectiveGenerationStateLabel("failed")).toContain("failed");
  });

  it("maps known failure codes to friendly messages", () => {
    expect(objectiveFailureMessage("AI_QUOTA_EXCEEDED")).toContain("quota");
    expect(objectiveFailureMessage("SOURCE_SNAPSHOT_STALE")).toContain(
      "Re-confirm",
    );
    expect(objectiveFailureMessage("MODEL_OUTPUT_DETERMINISTIC_FAILURE")).toContain(
      "could not be validated",
    );
    expect(objectiveFailureMessage(null)).toContain("Try again");
  });

  it("detects the generating state", () => {
    expect(isGenerating("generating")).toBe(true);
    expect(isGenerating("draft")).toBe(false);
  });

  it("labels grounding status", () => {
    expect(objectiveGroundingLabel("supported")).toContain("Supported");
    expect(objectiveGroundingLabel("unsupported")).toContain("Not supported");
  });
});
