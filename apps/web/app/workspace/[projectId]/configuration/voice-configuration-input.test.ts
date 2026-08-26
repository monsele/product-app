import { describe, expect, it } from "vitest";
import {
  addPronunciationOverride,
  defaultVoiceFormState,
  formatSpeakingRate,
  formStateFromVoiceConfiguration,
  hasVoiceChanges,
  maxPronunciationOverrides,
  selectVoice,
} from "./voice-configuration-input";

describe("voice configuration form input", () => {
  it("selects the teacher's approved voice", () => {
    expect(selectVoice(null, "english-luna")).toBe("english-luna");
    expect(selectVoice({ voiceId: "english-james", speakingRate: 1.0, pronunciationOverrides: [], version: 1, updatedAt: "" }, "english-aria")).toBe("english-aria");
  });

  it("adds bounded pronunciation entries", () => {
    expect(addPronunciationOverride([])).toHaveLength(1);
    expect(
      addPronunciationOverride(
        Array.from({ length: maxPronunciationOverrides }, () => ({
          phrase: "a",
          replacement: "b",
        })),
      ),
    ).toHaveLength(maxPronunciationOverrides);
  });

  it("formats speaking rate with descriptive speed tags", () => {
    expect(formatSpeakingRate(1.0)).toContain("1.00× (Standard)");
    expect(formatSpeakingRate(0.85)).toContain("0.85× (Slower)");
    expect(formatSpeakingRate(1.15)).toContain("1.15× (Faster)");
  });

  it("detects voice form changes accurately", () => {
    const defaultState = defaultVoiceFormState();
    expect(hasVoiceChanges(null, defaultState)).toBe(false);

    const modified = { ...defaultState, speakingRate: 1.1 };
    expect(hasVoiceChanges(null, modified)).toBe(true);

    const saved = {
      version: 1,
      voiceId: "english-aria" as const,
      speakingRate: 1.0,
      pronunciationOverrides: [{ phrase: "RNA", replacement: "R-N-A" }],
      updatedAt: "2026-08-16T12:00:00.000Z",
    };

    const state = formStateFromVoiceConfiguration(saved);
    expect(hasVoiceChanges(saved, state)).toBe(false);

    const withChange = {
      ...state,
      pronunciationOverrides: [{ phrase: "DNA", replacement: "D-N-A" }],
    };
    expect(hasVoiceChanges(saved, withChange)).toBe(true);
  });
});
