import { describe, expect, it } from "vitest";
import {
  lessonConfigurationInputSchema,
  pinSoundBed,
  pinnedSoundBedSchema,
  readPinnedSoundBed,
  readSoundBedChoice,
  renderReviewReportSchema,
  soundBedCatalogEntrySchema,
  soundBedChoiceSchema,
} from "./index.js";

const checksum = "a".repeat(64);
const entry = {
  trackId: "morning-pad",
  title: "Morning Pad",
  moodTags: ["calm", "warm"],
  durationMs: 16_000,
  loops: true,
  integratedLoudnessLufs: -20,
  peakDbfs: -8.4,
  checksumSha256: checksum,
  storageKey: `catalog/sound-beds/morning-pad/${checksum}.wav`,
  contentType: "audio/wav",
  licenseId: "CC0-1.0",
  sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attributionText: null,
};

describe("sound bed catalog entry schema", () => {
  it("accepts a registered, licensed, checksum-addressed track", () => {
    expect(soundBedCatalogEntrySchema.safeParse(entry).success).toBe(true);
  });

  it.each([
    ["an unlicensed track", { licenseId: "all-rights-reserved" }],
    ["a key outside its catalog path", { storageKey: `users/x/projects/y/${checksum}.wav` }],
    ["a key for another track", { storageKey: `catalog/sound-beds/quiet-pulse/${checksum}.wav` }],
    ["a key not addressed by its checksum", { storageKey: `catalog/sound-beds/morning-pad/${"b".repeat(64)}.wav` }],
    ["a short track that does not loop", { loops: false }],
    ["a loop that does not end on a frame boundary", { durationMs: 16_050 }],
    ["an unknown mood", { moodTags: ["sad"] }],
    ["an unnormalised track", { integratedLoudnessLufs: -3 }],
    ["a non-WAV track", { contentType: "audio/mpeg" }],
    ["an unregistered field", { signedUrl: "https://example.test" }],
  ])("rejects %s", (_label, override) => {
    expect(
      soundBedCatalogEntrySchema.safeParse({ ...entry, ...override }).success,
    ).toBe(false);
  });

  it("accepts a long track that does not need to loop", () => {
    expect(
      soundBedCatalogEntrySchema.safeParse({
        ...entry,
        durationMs: 420_000,
        loops: false,
      }).success,
    ).toBe(true);
  });

  it("pins only identities, never a URL", () => {
    const pinned = pinSoundBed(soundBedCatalogEntrySchema.parse(entry));
    expect(pinnedSoundBedSchema.parse(pinned)).toEqual(pinned);
    expect(Object.keys(pinned)).not.toContain("title");
    expect(JSON.stringify(pinned)).not.toContain("https://");
  });
});

describe("sound bed choice", () => {
  it("is none or a track slug", () => {
    expect(soundBedChoiceSchema.safeParse("none").success).toBe(true);
    expect(soundBedChoiceSchema.safeParse("quiet-pulse").success).toBe(true);
    expect(soundBedChoiceSchema.safeParse("Quiet Pulse").success).toBe(false);
    expect(soundBedChoiceSchema.safeParse("").success).toBe(false);
  });

  it("reads a pre-ST-103 configuration as none", () => {
    expect(readSoundBedChoice(null)).toBe("none");
    expect(readSoundBedChoice(undefined)).toBe("none");
    expect(readSoundBedChoice("warm-drift")).toBe("warm-drift");
  });

  it("is optional on the configuration input, and validated when present", () => {
    const base = {
      expectedVersion: 0,
      ageBand: "11-13",
      difficulty: "introductory",
      subject: "Biology",
      lessonTitle: "Water",
      targetDurationSeconds: 300,
      tone: "friendly",
      includeRecallQuestions: false,
    };
    expect(lessonConfigurationInputSchema.safeParse(base).success).toBe(true);
    expect(
      lessonConfigurationInputSchema.safeParse({ ...base, soundBed: "none" })
        .success,
    ).toBe(true);
    expect(
      lessonConfigurationInputSchema.safeParse({ ...base, soundBed: 42 })
        .success,
    ).toBe(false);
  });
});

describe("readPinnedSoundBed", () => {
  it("reads an absent key (a pre-ST-103 snapshot) and null as no bed", () => {
    expect(readPinnedSoundBed({ lessonSpec: {} })).toBeNull();
    expect(readPinnedSoundBed({ soundBed: null })).toBeNull();
    expect(readPinnedSoundBed(null)).toBeNull();
  });

  it("rejects a malformed pinned bed rather than silently dropping it", () => {
    expect(() =>
      readPinnedSoundBed({ soundBed: { trackId: "morning-pad" } }),
    ).toThrow();
  });
});

describe("render review report schema", () => {
  const report = {
    reviewVersion: "render-review-v1",
    jobId: "019ffbf1-a000-7000-8000-000000000001",
    attempt: 1,
    outcome: "passed",
    videoChecksumSha256: checksum,
    durationMs: 60_000,
    findings: [],
    contactSheet: [],
    loudness: { integratedLufs: -16, peakDbfs: -3 },
    reviewedAt: "2026-09-26T00:00:00.000Z",
  };

  it("fails exactly when a finding is an error", () => {
    const error = {
      code: "BLACK_SEGMENT",
      severity: "error",
      atMs: 1_000,
      detail: "Black.",
      correction: "Fix it.",
    };
    expect(renderReviewReportSchema.safeParse(report).success).toBe(true);
    expect(
      renderReviewReportSchema.safeParse({ ...report, findings: [error] })
        .success,
    ).toBe(false);
    expect(
      renderReviewReportSchema.safeParse({
        ...report,
        findings: [error],
        outcome: "failed",
      }).success,
    ).toBe(true);
    expect(
      renderReviewReportSchema.safeParse({ ...report, outcome: "failed" })
        .success,
    ).toBe(false);
  });
});
