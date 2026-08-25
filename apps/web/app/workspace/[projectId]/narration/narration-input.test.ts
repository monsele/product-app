import { describe, expect, it } from "vitest";
import {
  isGenerating,
  narrationBudgetStatusLabel,
  narrationCandidateStatusLabel,
  narrationFailureMessage,
  narrationGenerationStateLabel,
  narrationTransformModeLabel,
  narrationValidationWarnings,
} from "./narration-input";

describe("narration input helpers", () => {
  it("labels each generation state", () => {
    expect(narrationGenerationStateLabel("idle")).toContain("No narration");
    expect(narrationGenerationStateLabel("generating")).toContain("Generating");
    expect(narrationGenerationStateLabel("draft")).toContain("ready for review");
    expect(narrationGenerationStateLabel("approved")).toContain("approved");
    expect(narrationGenerationStateLabel("failed")).toContain("failed");
  });

  it("maps known failure codes to friendly messages", () => {
    expect(narrationFailureMessage("AI_QUOTA_EXCEEDED")).toContain("quota");
    expect(narrationFailureMessage("OUTLINE_SET_NOT_APPROVED")).toContain(
      "outline",
    );
    expect(narrationFailureMessage("SOURCE_SNAPSHOT_STALE")).toContain(
      "Re-confirm",
    );
    expect(
      narrationFailureMessage("MODEL_OUTPUT_DETERMINISTIC_FAILURE"),
    ).toContain("could not be validated");
    expect(
      narrationFailureMessage("NARRATION_SET_REVISION_MISMATCH"),
    ).toContain("changed while the block");
    expect(
      narrationFailureMessage("NARRATION_OUTLINE_MISMATCH"),
    ).toContain("outline");
    expect(narrationFailureMessage(null)).toContain("Try again");
  });

  it("labels every transform mode", () => {
    expect(narrationTransformModeLabel("shorten")).toBe("Shorten");
    expect(narrationTransformModeLabel("simplify")).toBe("Simplify");
    expect(narrationTransformModeLabel("expand")).toBe("Expand");
    expect(narrationTransformModeLabel("regenerate")).toBe("Regenerate");
  });

  it("labels candidate statuses", () => {
    expect(narrationCandidateStatusLabel("pending")).toContain("Pending");
    expect(narrationCandidateStatusLabel("accepted")).toBe("Accepted");
    expect(narrationCandidateStatusLabel("rejected")).toBe("Rejected");
  });

  it("detects the generating state", () => {
    expect(isGenerating("generating")).toBe(true);
    expect(isGenerating("draft")).toBe(false);
  });

  it("labels budget statuses", () => {
    expect(narrationBudgetStatusLabel("within")).toContain("Within");
    expect(narrationBudgetStatusLabel("under")).toContain("Under");
    expect(narrationBudgetStatusLabel("over")).toContain("Over");
  });

  it("warns about uncovered outline items", () => {
    const warnings = narrationValidationWarnings({
      structurallyValid: false,
      durationStatus: "within",
      durationWarning: null,
      wordCountStatus: "within",
      wordCountWarning: null,
      uncoveredOutlineItemIds: [
        "019ffbf1-eeee-7000-8000-000000000001",
        "019ffbf1-eeee-7000-8000-000000000002",
      ],
    });
    expect(warnings.some((warning) => warning.includes("2 approved outline"))).toBe(
      true,
    );
  });

  it("surfaces duration and word-count warnings", () => {
    const warnings = narrationValidationWarnings({
      structurallyValid: true,
      durationStatus: "over",
      durationWarning: "The narration is over the target.",
      wordCountStatus: "under",
      wordCountWarning: "The narration is under the word budget.",
      uncoveredOutlineItemIds: [],
    });
    expect(warnings).toContain("The narration is over the target.");
    expect(warnings).toContain("The narration is under the word budget.");
  });
});
