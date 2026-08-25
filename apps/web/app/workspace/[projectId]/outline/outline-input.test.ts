import { describe, expect, it } from "vitest";
import {
  outlineDurationStatusLabel,
  outlineFailureMessage,
  outlineGenerationStateLabel,
  outlineItemKindLabel,
  outlineValidationWarnings,
  type OutlineValidation,
} from "./outline-input";

describe("outline generation state label", () => {
  it("labels every route state", () => {
    expect(outlineGenerationStateLabel("idle")).toContain("No lesson outline");
    expect(outlineGenerationStateLabel("generating")).toContain("Generating");
    expect(outlineGenerationStateLabel("draft")).toContain("draft");
    expect(outlineGenerationStateLabel("approved")).toContain("approved");
    expect(outlineGenerationStateLabel("failed")).toContain("failed");
  });
});

describe("outline failure message", () => {
  it("maps known failure codes to friendly messages", () => {
    expect(outlineFailureMessage("AI_QUOTA_EXCEEDED")).toContain("quota");
    expect(
      outlineFailureMessage("OBJECTIVE_SET_NOT_APPROVED"),
    ).toContain("objectives");
    expect(
      outlineFailureMessage("MODEL_OUTPUT_DETERMINISTIC_FAILURE"),
    ).toContain("could not be validated");
    expect(outlineFailureMessage(null)).toContain("failed");
  });
});

describe("outline item kind label", () => {
  it("labels every item kind", () => {
    expect(outlineItemKindLabel("hook")).toBe("Hook");
    expect(outlineItemKindLabel("concept")).toBe("Concept");
    expect(outlineItemKindLabel("example")).toBe("Example");
    expect(outlineItemKindLabel("analogy")).toBe("Analogy");
    expect(outlineItemKindLabel("summary")).toBe("Summary");
    expect(outlineItemKindLabel("recall_question")).toBe("Recall question");
  });
});

describe("outline duration status label", () => {
  it("labels every duration status", () => {
    expect(outlineDurationStatusLabel("under")).toContain("Under");
    expect(outlineDurationStatusLabel("over")).toContain("Over");
    expect(outlineDurationStatusLabel("within")).toContain("Within");
  });
});

describe("outline validation warnings", () => {
  const validation = (): OutlineValidation => ({
    structurallyValid: true,
    durationStatus: "within",
    durationWarning: null,
    uncoveredObjectiveIds: [],
    structureWarning: null,
  });

  it("returns no warnings for a healthy draft", () => {
    expect(outlineValidationWarnings(validation())).toEqual([]);
  });

  it("surfaces the duration warning", () => {
    expect(
      outlineValidationWarnings({
        ...validation(),
        durationWarning: "The estimated total is under the lesson target.",
      }),
    ).toEqual(["The estimated total is under the lesson target."]);
  });

  it("surfaces the structure warning", () => {
    const warnings = outlineValidationWarnings({
      ...validation(),
      structureWarning: "The outline has no hook item.",
    });
    expect(warnings.some((warning) => warning.includes("no hook item"))).toBe(
      true,
    );
  });

  it("counts uncovered objectives as a blocking warning", () => {
    const warnings = outlineValidationWarnings({
      ...validation(),
      uncoveredObjectiveIds: ["a", "b"],
    });
    expect(warnings.some((warning) => warning.includes("2 approved objectives"))).toBe(
      true,
    );
  });
});
