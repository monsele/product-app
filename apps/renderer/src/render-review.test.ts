import { describe, expect, it } from "vitest";
import { renderReviewReportSchema } from "@avlp/schemas";
import { hdRenderProfile } from "./contracts.js";
import {
  blackSpansFromFlags,
  classifyRenderReview,
  isBlackPicture,
  narrationSpansFromCaptions,
  parseIntegratedLufs,
  parseSilenceSpans,
  silenceFloorDb,
  type RenderMeasurements,
  type RenderReviewExpectations,
} from "./render-review.js";
import {
  renderReviewThresholds,
  renderReviewVersion,
} from "./render-review-thresholds.js";

const clean: RenderMeasurements = {
  blackSpans: [],
  durationMs: 60_000,
  integratedLufs: -16,
  peakDbfs: -3,
  silenceSpans: [],
  streams: {
    audioCodec: "aac",
    audioCount: 1,
    fps: 30,
    height: 1080,
    videoCodec: "h264",
    videoCount: 1,
    width: 1920,
  },
};
const expectations: RenderReviewExpectations = {
  captions: {
    expectedCueCount: 4,
    narratedScenesWithoutCaptions: 0,
    renderedCueCount: 4,
  },
  expectedDurationMs: 60_000,
  narrationSpans: [{ startMs: 10_000, endMs: 20_000 }],
  profile: hdRenderProfile,
};
const codes = (measurements: Partial<RenderMeasurements>, overrides: Partial<RenderReviewExpectations> = {}) =>
  classifyRenderReview(
    { ...clean, ...measurements },
    { ...expectations, ...overrides },
  ).map((finding) => `${finding.severity}:${finding.code}`);

describe("render review thresholds", () => {
  it("are one versioned set of constants", () => {
    expect(renderReviewVersion).toBe("render-review-v2");
    expect(renderReviewThresholds).toMatchObject({
      audio: {
        clippingPeakDbfs: -0.1,
        maxIntegratedLufs: -12,
        minIntegratedLufs: -20,
      },
      black: { minDurationMs: 1_000, pictureRatio: 0.98, pixelThreshold: 0.05 },
      contactSheet: { positions: [0.05, 0.35, 0.65, 0.95] },
      durationToleranceMs: 100,
      silence: { minDurationMs: 1_000, noiseFloorDb: -50, overlapMs: 1_000 },
    });
    expect(Object.isFrozen(renderReviewThresholds)).toBe(true);
  });
});

describe("classifyRenderReview", () => {
  it("passes a clean render with no findings", () => {
    expect(codes({})).toEqual([]);
  });

  it("1. streams: exactly one video and one audio stream with the profile", () => {
    expect(codes({ streams: { ...clean.streams, audioCount: 0 } })).toEqual([
      "error:STREAM_LAYOUT_INVALID",
    ]);
    expect(codes({ streams: { ...clean.streams, videoCount: 2 } })).toEqual([
      "error:STREAM_LAYOUT_INVALID",
    ]);
    expect(codes({ streams: { ...clean.streams, height: 720 } })).toEqual([
      "error:STREAM_PROFILE_MISMATCH",
    ]);
    expect(codes({ streams: { ...clean.streams, fps: 29.97 } })).toEqual([
      "error:STREAM_PROFILE_MISMATCH",
    ]);
    expect(codes({ streams: { ...clean.streams, audioCodec: "mp3" } })).toEqual([
      "error:STREAM_PROFILE_MISMATCH",
    ]);
  });

  it("1. streams: keeps the existing ±100 ms duration rule, inclusive", () => {
    expect(codes({ durationMs: 60_100 })).toEqual([]);
    expect(codes({ durationMs: 59_900 })).toEqual([]);
    expect(codes({ durationMs: 60_101 })).toEqual(["error:DURATION_MISMATCH"]);
    expect(codes({ durationMs: 59_899 })).toEqual(["error:DURATION_MISMATCH"]);
  });

  it("2. black frames: a black run of 1.0 s or longer is an error", () => {
    expect(codes({ blackSpans: [{ startMs: 5_000, endMs: 5_999 }] })).toEqual(
      [],
    );
    const findings = classifyRenderReview(
      { ...clean, blackSpans: [{ startMs: 5_000, endMs: 6_000 }] },
      expectations,
    );
    expect(findings).toEqual([
      expect.objectContaining({
        atMs: 5_000,
        code: "BLACK_SEGMENT",
        severity: "error",
      }),
    ]);
    expect(findings[0]!.correction).toMatch(/storyboard/);
  });

  it("3. narration pauses are advisory, including the 1.0 s boundary", () => {
    // Long silence entirely outside narration: not an error.
    expect(codes({ silenceSpans: [{ startMs: 0, endMs: 9_000 }] })).toEqual([]);
    // Overlap just under 1.0 s.
    expect(
      codes({ silenceSpans: [{ startMs: 9_000, endMs: 10_999 }] }),
    ).toEqual([]);
    // Overlap exactly 1.0 s.
    const findings = classifyRenderReview(
      { ...clean, silenceSpans: [{ startMs: 9_000, endMs: 11_000 }] },
      expectations,
    );
    expect(findings).toEqual([
      expect.objectContaining({
        atMs: 10_000,
        code: "NARRATION_SILENT",
        severity: "warning",
      }),
    ]);
    expect(findings[0]!.correction).toContain("No action is required");
    // A silence shorter than the detection minimum never counts.
    expect(
      codes({ silenceSpans: [{ startMs: 12_000, endMs: 12_999 }] }),
    ).toEqual([]);
  });

  it("delivers the reported lesson's seven short pauses and quiet loudness as notes", () => {
    const pauses = [[7893, 1080], [11955, 1040], [35680, 1050], [70000, 1220],
      [115464, 1070], [144901, 1170], [154763, 1110]] as const;
    const findings = classifyRenderReview({
      ...clean,
      durationMs: 207062,
      integratedLufs: -27.53,
      silenceSpans: pauses.map(([startMs, duration]) => ({ startMs, endMs: startMs + duration })),
    }, { ...expectations, expectedDurationMs: 207062, narrationSpans: [{ startMs: 0, endMs: 207062 }] });
    expect(findings).toHaveLength(8);
    expect(findings.every((item) => item.severity === "warning")).toBe(true);
    expect(findings.filter((item) => item.code === "NARRATION_SILENT").map((item) => item.atMs))
      .toEqual(pauses.map(([startMs]) => startMs));
  });

  it("4. audio level: clipping at -0.1 dBFS and loudness outside -20..-12 LUFS warn", () => {
    expect(codes({ peakDbfs: -0.11 })).toEqual([]);
    expect(codes({ peakDbfs: -0.1 })).toEqual(["warning:AUDIO_CLIPPING"]);
    expect(codes({ peakDbfs: 0 })).toEqual(["warning:AUDIO_CLIPPING"]);
    expect(codes({ integratedLufs: -20 })).toEqual([]);
    expect(codes({ integratedLufs: -12 })).toEqual([]);
    expect(codes({ integratedLufs: -20.1 })).toEqual([
      "warning:LOUDNESS_OUT_OF_RANGE",
    ]);
    expect(codes({ integratedLufs: -11.9 })).toEqual([
      "warning:LOUDNESS_OUT_OF_RANGE",
    ]);
    expect(codes({ integratedLufs: null })).toEqual([
      "warning:LOUDNESS_OUT_OF_RANGE",
    ]);
  });

  it("4. warnings alone never fail a report", () => {
    const findings = classifyRenderReview(
      { ...clean, integratedLufs: -25, peakDbfs: 0 },
      expectations,
    );
    expect(findings.every((finding) => finding.severity === "warning")).toBe(
      true,
    );
    expect(
      renderReviewReportSchema.safeParse({
        attempt: 1,
        contactSheet: [],
        durationMs: 60_000,
        findings,
        jobId: "019ffbf1-a000-7000-8000-000000000001",
        loudness: { integratedLufs: -25, peakDbfs: 0 },
        outcome: "passed",
        reviewVersion: renderReviewVersion,
        reviewedAt: "2026-09-26T00:00:00.000Z",
        videoChecksumSha256: "a".repeat(64),
      }).success,
    ).toBe(true);
  });

  it("5. captions: a missing track or a cue-count mismatch is an error", () => {
    expect(
      codes(
        {},
        {
          captions: {
            expectedCueCount: 4,
            narratedScenesWithoutCaptions: 0,
            renderedCueCount: 0,
          },
        },
      ),
    ).toEqual(["error:CAPTION_TRACK_MISSING"]);
    expect(
      codes(
        {},
        {
          captions: {
            expectedCueCount: 4,
            narratedScenesWithoutCaptions: 1,
            renderedCueCount: 3,
          },
        },
      ),
    ).toEqual(["error:CAPTION_TRACK_MISSING"]);
    expect(
      codes(
        {},
        {
          captions: {
            expectedCueCount: 4,
            narratedScenesWithoutCaptions: 0,
            renderedCueCount: 5,
          },
        },
      ),
    ).toEqual(["error:CAPTION_CUE_COUNT_MISMATCH"]);
  });

  it("never puts media, URLs or source text in a finding", () => {
    const findings = classifyRenderReview(
      {
        ...clean,
        blackSpans: [{ startMs: 1_000, endMs: 3_000 }],
        silenceSpans: [{ startMs: 10_000, endMs: 15_000 }],
      },
      expectations,
    );
    for (const finding of findings)
      expect(`${finding.detail} ${finding.correction}`).not.toMatch(
        /https?:|users\//,
      );
  });
});

describe("silenceFloorDb", () => {
  it("is the story's -50 dB with no bed", () => {
    expect(silenceFloorDb(null)).toBe(-50);
  });

  it("rises to the bed's ducked ceiling plus a margin with a bed", () => {
    // -6.2 dBFS peak × 0.04 ducked gain (-27.96 dB) + 1.5 dB margin.
    expect(silenceFloorDb({ peakDbfs: -6.2 })).toBe(-32.7);
    // Never below the base floor.
    expect(silenceFloorDb({ peakDbfs: -40 })).toBe(-50);
  });
});

describe("narrationSpansFromCaptions", () => {
  it("uses only narrated scenes and merges close cues", () => {
    expect(
      narrationSpansFromCaptions(
        [
          { sceneId: "a", startFrame: 0, endFrame: 30 },
          { sceneId: "a", startFrame: 33, endFrame: 60 },
          { sceneId: "b", startFrame: 90, endFrame: 120 },
        ],
        new Set(["a"]),
        30,
      ),
    ).toEqual([{ startMs: 0, endMs: 2_000 }]);
  });
});

describe("ffmpeg output parsing", () => {
  it("parses silencedetect spans, including one that runs to the end", () => {
    const stderr = [
      "[silencedetect @ 0x1] silence_start: 1.5",
      "[silencedetect @ 0x1] silence_end: 3.25 | silence_duration: 1.75",
      "[silencedetect @ 0x1] silence_start: 8",
    ].join("\n");
    expect(parseSilenceSpans(stderr, 10_000)).toEqual([
      { startMs: 1_500, endMs: 3_250 },
      { startMs: 8_000, endMs: 10_000 },
    ]);
  });

  it("parses loudnorm integrated loudness and treats -inf as unmeasurable", () => {
    expect(
      parseIntegratedLufs('noise\n{\n "input_i" : "-16.42",\n "input_tp" : "-1.0"\n}\n'),
    ).toBe(-16.42);
    expect(parseIntegratedLufs('{ "input_i" : "-inf" }')).toBeNull();
    expect(parseIntegratedLufs("no summary")).toBeNull();
  });
});

describe("black picture detection", () => {
  const frame = (black: number, total = 100, value = 16) =>
    Uint8Array.from({ length: total }, (_, index) => (index < black ? value : 128));

  it("uses blackdetect's pixel threshold on the limited luma range", () => {
    // 16 + 0.05 × 219 = 26.95: luma 26 is black, 27 is not.
    expect(isBlackPicture(frame(100, 100, 26), true)).toBe(true);
    expect(isBlackPicture(frame(100, 100, 27), true)).toBe(false);
    // Full range: 0.05 × 255 = 12.75.
    expect(isBlackPicture(frame(100, 100, 12), false)).toBe(true);
    expect(isBlackPicture(frame(100, 100, 13), false)).toBe(false);
  });

  it("needs 98% of pixels to be black", () => {
    expect(isBlackPicture(frame(98), true)).toBe(true);
    expect(isBlackPicture(frame(97), true)).toBe(false);
  });

  it("turns per-frame flags into timed runs", () => {
    const flags = [false, true, true, true, false, true, true];
    expect(blackSpansFromFlags(flags, 2)).toEqual([
      { startMs: 500, endMs: 2_000 },
      { startMs: 2_500, endMs: 3_500 },
    ]);
  });
});
