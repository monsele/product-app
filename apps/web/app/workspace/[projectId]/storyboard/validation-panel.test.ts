import { describe, expect, it } from "vitest";
import { type ValidationIssue } from "@avlp/schemas";
import { groupValidationIssues } from "./validation-panel";

const issue = (scopeType: ValidationIssue["scopeType"]): ValidationIssue => ({
  id: "01989a3d-8e00-7000-8000-000000000009",
  severity: "error",
  code: "audio_missing",
  scopeType,
  scopeId: null,
  sceneId: null,
  fieldPath: "scenes.0.audio",
  message: "Audio is missing.",
  details: {},
  acknowledgeable: false,
  acknowledgedAt: null,
});

describe("groupValidationIssues", () => {
  it("groups UI issues by their authoritative scope rather than issue copy", () => {
    const groups = groupValidationIssues([issue("audio"), issue("grounding")]);
    expect(groups.get("audio")).toHaveLength(1);
    expect(groups.get("grounding")).toHaveLength(1);
  });
});
