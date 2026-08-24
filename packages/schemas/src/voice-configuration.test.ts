import { describe, expect, it } from "vitest";
import { voiceConfigurationInputSchema } from "./index.js";

describe("voice configuration contract", () => {
  const valid = { expectedVersion: 0, voiceId: "english-aria", speakingRate: 1, pronunciationOverrides: [{ phrase: "Docling", replacement: "dock-ling" }] };
  it("accepts bounded English configuration", () => expect(voiceConfigurationInputSchema.safeParse(valid).success).toBe(true));
  it("rejects unsupported voices, rate ranges, duplicate phrases, and excessive overrides", () => {
    expect(voiceConfigurationInputSchema.safeParse({ ...valid, voiceId: "fr-FR" }).success).toBe(false);
    expect(voiceConfigurationInputSchema.safeParse({ ...valid, speakingRate: 1.5 }).success).toBe(false);
    expect(voiceConfigurationInputSchema.safeParse({ ...valid, pronunciationOverrides: [valid.pronunciationOverrides[0], valid.pronunciationOverrides[0]] }).success).toBe(false);
    expect(voiceConfigurationInputSchema.safeParse({ ...valid, pronunciationOverrides: Array.from({ length: 21 }, (_, index) => ({ phrase: `term-${index}`, replacement: `say-${index}` })) }).success).toBe(false);
  });
});
