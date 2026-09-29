import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { type LessonValidationRun, type StoryboardSceneListEntry, type ValidationIssue } from "@avlp/schemas";
import { groupValidationIssues, ValidationPanel, validationIssueSceneLabel } from "./validation-panel";

const sceneId = "01989a3d-8e00-7000-8000-000000000010";
const scenes: StoryboardSceneListEntry[] = [{
  sceneId,
  order: 3,
  template: "hook",
  title: "The water cycle",
  narrationSummary: "Water evaporates.",
  narrationBlockCount: 1,
  durationSeconds: 15,
  status: {
    validation: "ok",
    stale: false,
    captions: "ready",
    assets: "resolved",
    audio: "ready",
  },
}];

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

describe("grounding issue location", () => {
  it("names the affected scene using the current storyboard order and title", () => {
    const finding = { ...issue("grounding"), sceneId };
    expect(validationIssueSceneLabel(finding, scenes)).toBe("Scene 3: The water cycle");
    expect(validationIssueSceneLabel(finding, [{ ...scenes[0]!, title: null }])).toBe("Scene 3");
  });

  it("explains an older grounding result with no scene location and offers a rerun", () => {
    const finding: ValidationIssue = {
      ...issue("grounding"),
      code: "grounding_unsupported_claim",
      message: "Grounding found unsupported claims that must be corrected before rendering.",
    };
    const run: LessonValidationRun = {
      id: "01989a3d-8e00-7000-8000-000000000011",
      lessonSpecId: "01989a3d-8e00-7000-8000-000000000012",
      lessonSpecRevision: 1,
      lessonSpecContentHash: "a".repeat(64),
      inputHash: "b".repeat(64),
      rulesetVersion: "3",
      sceneLibraryVersion: "1",
      artifactHashes: {},
      status: "failed",
      stale: false,
      startedAt: "2026-09-29T00:00:00Z",
      completedAt: "2026-09-29T00:00:00Z",
      issues: [finding],
    };
    const html = renderToStaticMarkup(createElement(ValidationPanel, {
      projectId: "01989a3d-8e00-7000-8000-000000000013",
      run,
      scenes,
      onRun: () => undefined,
      onAcknowledge: () => undefined,
      onNavigate: () => undefined,
      busy: false,
    }));
    expect(html).toContain("does not identify the affected scene");
    expect(html).toContain("Run checks again");
    expect(html).not.toContain("Review storyboard");

    const locatedHtml = renderToStaticMarkup(createElement(ValidationPanel, {
      projectId: "01989a3d-8e00-7000-8000-000000000013",
      run: { ...run, issues: [{ ...finding, sceneId, message: "Narration is not backed by the source." }] },
      scenes,
      onRun: () => undefined,
      onAcknowledge: () => undefined,
      onNavigate: () => undefined,
      busy: false,
    }));
    expect(locatedHtml).toContain("Scene 3: The water cycle");
    expect(locatedHtml).toContain("Open Scene 3: The water cycle");
  });
});
