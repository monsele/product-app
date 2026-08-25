import { describe, expect, it } from "vitest";
import type { LessonConfiguration } from "@avlp/schemas";
import {
  buildConfigurationSaveInput,
  emptyConfigurationFormState,
  formStateFromConfiguration,
  isConfigurationFormComplete,
  type ConfigurationFormState,
} from "./lesson-configuration-input";

const persisted: LessonConfiguration = {
  version: 2,
  ageBand: "11-13",
  difficulty: "introductory",
  subject: "Biology",
  lessonTitle: "The Water Cycle",
  targetDurationSeconds: 300,
  tone: "friendly",
  visualTheme: "mvp-default",
  includeRecallQuestions: true,
  sourceParsedDocumentVersion: 1,
  updatedAt: "2026-08-16T12:00:00.000Z",
};

describe("lesson configuration form input", () => {
  it("starts empty and incomplete", () => {
    const state = emptyConfigurationFormState();
    expect(isConfigurationFormComplete(state)).toBe(false);
    expect(
      buildConfigurationSaveInput(null, state),
    ).toBeNull();
  });

  it("pre-fills the form from a persisted configuration", () => {
    expect(formStateFromConfiguration(persisted)).toEqual({
      ageBand: "11-13",
      difficulty: "introductory",
      subject: "Biology",
      lessonTitle: "The Water Cycle",
      targetDurationSeconds: 300,
      tone: "friendly",
      includeRecallQuestions: true,
    });
  });

  it("builds a save input carrying the expected version", () => {
    const state = formStateFromConfiguration(persisted);
    const input = buildConfigurationSaveInput(persisted, state);
    expect(input).not.toBeNull();
    expect(input).toMatchObject({
      expectedVersion: 2,
      ageBand: "11-13",
      targetDurationSeconds: 300,
      includeRecallQuestions: true,
    });
  });

  it("uses expectedVersion 0 when no configuration exists yet", () => {
    const state = formStateFromConfiguration({
      ...persisted,
      version: 1,
      updatedAt: "2026-08-16T12:00:00.000Z",
    });
    const input = buildConfigurationSaveInput(null, state);
    expect(input?.expectedVersion).toBe(0);
  });

  it("refuses to build input while required fields are missing", () => {
    const state: ConfigurationFormState = {
      ...formStateFromConfiguration(persisted),
      tone: "",
    };
    expect(isConfigurationFormComplete(state)).toBe(false);
    expect(buildConfigurationSaveInput(persisted, state)).toBeNull();
  });

  it("trims whitespace from free-text fields", () => {
    const state = {
      ...formStateFromConfiguration(persisted),
      subject: "  Biology  ",
      lessonTitle: "  The Water Cycle  ",
    };
    const input = buildConfigurationSaveInput(persisted, state);
    expect(input?.subject).toBe("Biology");
    expect(input?.lessonTitle).toBe("The Water Cycle");
  });
});
