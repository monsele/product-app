import { describe, expect, it } from "vitest";
import {
  isGenerating,
  previewBlockersSentence,
  sceneAttentionLabels,
  sceneTemplateLabel,
  sceneAssetStatusLabel,
  sceneAudioStatusLabel,
  sceneCandidateStatusLabel,
  sceneRegenerationFailureMessage,
  sceneRegenerationModeLabel,
  sceneValidationStatusLabel,
  storyboardFailureMessage,
  storyboardGenerationStateLabel,
  storyboardValidationWarnings,
  type StoryboardValidation,
} from "./storyboard-input";

describe("storyboard generation state label", () => {
  it("labels every review state", () => {
    expect(storyboardGenerationStateLabel("idle")).toContain("No storyboard");
    expect(storyboardGenerationStateLabel("generating")).toContain(
      "Generating",
    );
    expect(storyboardGenerationStateLabel("draft")).toContain(
      "ready for review",
    );
    expect(storyboardGenerationStateLabel("failed")).toContain("failed");
    expect(storyboardGenerationStateLabel("approved")).toContain("approved");
  });

  it("reports in-flight generation", () => {
    expect(isGenerating("generating")).toBe(true);
    expect(isGenerating("draft")).toBe(false);
  });
});

describe("storyboard failure messages", () => {
  it("explains known failure codes", () => {
    expect(storyboardFailureMessage("AI_QUOTA_EXCEEDED")).toContain("quota");
    expect(
      storyboardFailureMessage("NARRATION_SET_REVISION_MISMATCH"),
    ).toContain("narration");
    expect(storyboardFailureMessage("OUTLINE_SET_NOT_APPROVED")).toContain(
      "outline",
    );
    expect(
      storyboardFailureMessage("MODEL_OUTPUT_DETERMINISTIC_FAILURE"),
    ).toContain("validated");
  });

  it("falls back for unknown codes", () => {
    expect(storyboardFailureMessage("SOMETHING_NEW")).toContain("Try again");
  });
});

describe("storyboard validation warnings", () => {
  const base: StoryboardValidation = {
    structurallyValid: true,
    durationStatus: "within",
    durationWarning: null,
    uncoveredOutlineItemIds: [],
    unassignedBlockIds: [],
  };

  it("returns no warnings for a healthy draft", () => {
    expect(storyboardValidationWarnings(base)).toEqual([]);
  });

  it("reports duration drift", () => {
    const warnings = storyboardValidationWarnings({
      ...base,
      durationWarning: "The storyboard totals 200 seconds.",
    });
    expect(warnings).toContain("The storyboard totals 200 seconds.");
  });

  it("reports uncovered outline items and unassigned blocks", () => {
    const warnings = storyboardValidationWarnings({
      ...base,
      uncoveredOutlineItemIds: ["item-1"],
      unassignedBlockIds: ["block-1"],
    });
    expect(warnings.some((warning) => warning.includes("outline item"))).toBe(
      true,
    );
    expect(
      warnings.some((warning) => warning.includes("narration block")),
    ).toBe(true);
  });
});

describe("scene regeneration helpers", () => {
  it("labels every regeneration mode", () => {
    expect(sceneRegenerationModeLabel("improve-visual")).toBe(
      "Improve visual choice",
    );
    expect(sceneRegenerationModeLabel("simplify")).toBe("Simplify");
    expect(sceneRegenerationModeLabel("shorten")).toBe("Shorten");
    expect(sceneRegenerationModeLabel("regenerate")).toBe("Regenerate");
  });

  it("labels every candidate status", () => {
    expect(sceneCandidateStatusLabel("pending")).toBe("Pending review");
    expect(sceneCandidateStatusLabel("accepted")).toBe("Applied");
    expect(sceneCandidateStatusLabel("rejected")).toBe("Discarded");
  });

  it("explains known scene regeneration failure codes", () => {
    expect(sceneRegenerationFailureMessage("SCENE_NOT_FOUND")).toContain(
      "no longer exists",
    );
    expect(
      sceneRegenerationFailureMessage("LESSON_SPEC_REVISION_MISMATCH"),
    ).toContain("changed");
    expect(
      sceneRegenerationFailureMessage("MODEL_OUTPUT_DETERMINISTIC_FAILURE"),
    ).toContain("validated");
    expect(sceneRegenerationFailureMessage("AI_QUOTA_EXCEEDED")).toContain(
      "quota",
    );
  });

  it("falls back to the storyboard message for unknown codes", () => {
    expect(sceneRegenerationFailureMessage("SOMETHING_NEW")).toContain(
      "Try again",
    );
  });
});

describe("scene status projections", () => {
  it("labels every asset status", () => {
    expect(sceneAssetStatusLabel("none")).toBe("No assets planned");
    expect(sceneAssetStatusLabel("planned")).toBe("Assets planned");
    expect(sceneAssetStatusLabel("resolved")).toBe("Assets resolved");
  });

  it("labels the audio status", () => {
    expect(sceneAudioStatusLabel("not_generated")).toBe("No audio generated");
  });

  it("labels every validation status", () => {
    expect(sceneValidationStatusLabel("ok")).toBe("Valid");
    expect(sceneValidationStatusLabel("warning")).toBe("Needs attention");
    expect(sceneValidationStatusLabel("error")).toBe("Invalid");
  });
});

describe("scene template label", () => {
  it("names templates for teachers instead of showing identifiers", () => {
    expect(sceneTemplateLabel("cause-effect")).toBe("Cause and effect");
    expect(sceneTemplateLabel("input-process-output")).toBe(
      "Inputs and outputs",
    );
    expect(sceneTemplateLabel("hook")).toBe("Hook");
  });
});

describe("scene attention labels", () => {
  it("returns nothing for a ready scene", () => {
    expect(
      sceneAttentionLabels({
        assets: "resolved",
        audio: "ready",
        captions: "ready",
        validation: "ok",
      }),
    ).toEqual([]);
  });

  it("lists only the statuses that need action", () => {
    expect(
      sceneAttentionLabels({
        assets: "planned",
        audio: "not_generated",
        captions: "ready",
        validation: "warning",
      }),
    ).toEqual(["No audio generated", "Needs attention"]);
    expect(
      sceneAttentionLabels({
        assets: "missing_required",
        audio: "ready",
        captions: "pending",
        validation: "ok",
      }),
    ).toEqual(["Required asset missing", "Captions pending"]);
  });
});

describe("preview blockers sentence", () => {
  it("names only the remaining work, with plurals", () => {
    expect(
      previewBlockersSentence({ audio: 0, captions: 3, assets: 0, invalid: 0 }),
    ).toBe("To preview, generate captions for 3 scenes.");
    expect(
      previewBlockersSentence({ audio: 1, captions: 2, assets: 1, invalid: 0 }),
    ).toBe(
      "To preview, generate audio for 1 scene, generate captions for 2 scenes and add 1 required asset.",
    );
  });

  it("points to final checks when nothing is missing", () => {
    expect(
      previewBlockersSentence({ audio: 0, captions: 0, assets: 0, invalid: 0 }),
    ).toBe("Run final checks to enable Preview lesson.");
  });
});
