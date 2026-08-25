import { describe, expect, it } from "vitest";
import { addPronunciationOverride, maxPronunciationOverrides, selectVoice } from "./voice-configuration-input";

describe("voice configuration form input", () => {
  it("selects the teacher's approved voice", () => expect(selectVoice(null, "english-luna")).toBe("english-luna"));
  it("adds bounded pronunciation entries", () => {
    expect(addPronunciationOverride([])).toHaveLength(1);
    expect(addPronunciationOverride(Array.from({ length: maxPronunciationOverrides }, () => ({ phrase: "a", replacement: "b" })))).toHaveLength(maxPronunciationOverrides);
  });
});
