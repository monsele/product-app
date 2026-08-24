import { describe, expect, it } from "vitest";
import {
  alignSentences,
  normalizeCaptionTiming,
  segmentCaptions,
  serializeSrt,
  serializeVtt,
} from "./captions.js";

describe("captions", () => {
  it("uses a proportional, sentence-level fallback when provider timing is absent", () => {
    expect(
      alignSentences({
        narration: "Plants need light. They also need water.",
        durationMs: 4_000,
        timing: [],
      }),
    ).toEqual([
      { startMs: 0, endMs: 1_714, text: "Plants need light." },
      { startMs: 1_714, endMs: 4_000, text: "They also need water." },
    ]);
  });

  it("replaces invalid provider timing with a bounded monotonic fallback", () => {
    expect(
      alignSentences({
        narration: "Plants need light. They need water.",
        durationMs: 4_000,
        timing: [
          { startMs: 2_000, endMs: 4_500, text: "Plants need light." },
        ],
      }),
    ).toEqual([
      { startMs: 0, endMs: 2_000, text: "Plants need light." },
      { startMs: 2_000, endMs: 4_000, text: "They need water." },
    ]);
  });

  it("segments readable caption lines with monotonic timing bounded by audio", () => {
    const cues = segmentCaptions(
      [
        {
          startMs: 0,
          endMs: 4_000,
          text: "Photosynthesis uses carbon dioxide and water with sunlight to make glucose, releasing oxygen for the plant and its surroundings.",
        },
      ],
      4_000,
    );
    expect(cues.length).toBeGreaterThan(1);
    expect(cues.every((cue) => cue.text.length <= 84)).toBe(true);
    expect(cues[0]?.startMs).toBe(0);
    expect(cues.at(-1)?.endMs).toBe(4_000);
    expect(cues.every((cue, index) => index === 0 || cue.startMs >= cues[index - 1]!.endMs)).toBe(true);
    expect(normalizeCaptionTiming([{ startMs: -5, endMs: 1, text: "One" }, { startMs: 0, endMs: 20, text: "Two" }], 100)).toEqual([
      { startMs: 0, endMs: 100, text: "One" },
    ]);
  });

  it("serializes parseable SRT and VTT with millisecond timestamps", () => {
    const cues = [{ startMs: 1_250, endMs: 2_500, text: "Water enters roots." }];
    expect(serializeSrt(cues)).toBe("1\n00:00:01,250 --> 00:00:02,500\nWater enters roots.\n");
    expect(serializeVtt(cues)).toBe("WEBVTT\n\n00:00:01.250 --> 00:00:02.500\nWater enters roots.\n");
  });
});
