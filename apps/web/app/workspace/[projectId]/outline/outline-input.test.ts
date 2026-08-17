import { describe, expect, it } from "vitest";
import {
  outlineFailureMessage,
  outlineGenerationStateLabel,
  outlineItemKindLabel,
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
