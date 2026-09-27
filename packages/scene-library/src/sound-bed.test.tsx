import { describe, expect, it } from "vitest";
import { videoTheme } from "@avlp/design-system/video-theme";
import {
  narrationSegmentsFromCaptions,
  soundBedCompositionPropSchema,
  soundBedVolumeAtFrame,
} from "./sound-bed.js";
import { fullLessonCompositionPropsSchema } from "./full-lesson.js";
import { photosynthesisThreeMinutePreview } from "./full-lesson.fixture.js";

const fps = 30;
const tokens = videoTheme.audio.soundBed;
const totalFrames = 30 * 60; // one minute
const volume = (frame: number, segments = [{ startFrame: 300, endFrameExclusive: 600 }]) =>
  soundBedVolumeAtFrame({ fps, frame, segments, totalFrames });

describe("sound bed mix tokens", () => {
  it("are the story's starting values, held as theme tokens", () => {
    expect(tokens).toEqual({
      level: 0.12,
      duckedLevel: 0.04,
      duckRampMs: 250,
      fadeInMs: 1_500,
      fadeOutMs: 2_000,
    });
  });
});

describe("soundBedVolumeAtFrame — duck envelope", () => {
  it("is exactly the ducked level on a segment's first and last frames", () => {
    expect(volume(300)).toBeCloseTo(tokens.duckedLevel, 12);
    expect(volume(599)).toBeCloseTo(tokens.duckedLevel, 12);
    expect(volume(450)).toBeCloseTo(tokens.duckedLevel, 12);
  });

  it("finishes ducking by the segment boundary (within one frame)", () => {
    // 250 ms = 7.5 frames at 30 fps. One frame before the boundary the bed
    // is already within one frame's worth of ramp of the ducked level.
    const oneFrameBefore = volume(299);
    const rampPerFrame =
      (tokens.level - tokens.duckedLevel) / ((tokens.duckRampMs * fps) / 1_000);
    expect(oneFrameBefore).toBeGreaterThan(tokens.duckedLevel);
    expect(oneFrameBefore - tokens.duckedLevel).toBeLessThanOrEqual(
      rampPerFrame + 1e-12,
    );
  });

  it("ramps linearly over 250 ms on both sides of a segment", () => {
    // 8 frames before the segment (266.7 ms) is outside the ramp.
    expect(volume(292)).toBeCloseTo(tokens.level, 12);
    // Exactly half-way through the down-ramp: 125 ms = 3.75 frames before.
    const halfway = soundBedVolumeAtFrame({
      fps: 40, // 25 ms per frame gives an exact 125 ms sample
      frame: 395,
      segments: [{ startFrame: 400, endFrameExclusive: 800 }],
      totalFrames: 4_000,
    });
    expect(halfway).toBeCloseTo((tokens.level + tokens.duckedLevel) / 2, 12);
    // Up-ramp starts on the exclusive end frame and reaches full level.
    expect(volume(600)).toBeCloseTo(tokens.duckedLevel, 12);
    expect(volume(604)).toBeGreaterThan(tokens.duckedLevel);
    expect(volume(608)).toBeCloseTo(tokens.level, 12);
  });

  it("takes the lower gain where two ramps overlap", () => {
    const segments = [
      { startFrame: 300, endFrameExclusive: 330 },
      { startFrame: 340, endFrameExclusive: 400 },
    ];
    for (let frame = 330; frame < 340; frame += 1) {
      const single = volume(frame, [segments[0]!]);
      expect(volume(frame, segments)).toBeLessThanOrEqual(single);
    }
  });

  it("is a pure function of the frame", () => {
    const forward = Array.from({ length: 900 }, (_, frame) => volume(frame));
    const backward = Array.from({ length: 900 }, (_, index) =>
      volume(899 - index),
    ).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("soundBedVolumeAtFrame — fades", () => {
  it("fades in linearly over 1.5 s from silence", () => {
    expect(volume(0, [])).toBe(0);
    expect(volume(22, [])).toBeCloseTo(tokens.level * (733.333 / 1_500), 4);
    expect(volume(45, [])).toBeCloseTo(tokens.level, 12);
  });

  it("fades out over 2 s, reaching silence on the last frame", () => {
    expect(volume(totalFrames - 1, [])).toBe(0);
    expect(volume(totalFrames - 1 - 60, [])).toBeCloseTo(tokens.level, 12);
    expect(volume(totalFrames - 1 - 30, [])).toBeCloseTo(tokens.level / 2, 12);
  });

  it("multiplies the fade with the duck", () => {
    const segments = [{ startFrame: 0, endFrameExclusive: 90 }];
    expect(volume(15, segments)).toBeCloseTo(
      tokens.duckedLevel * (500 / 1_500),
      12,
    );
  });
});

describe("narrationSegmentsFromCaptions", () => {
  it("merges cues closer than two ramps and keeps wider gaps", () => {
    const segments = narrationSegmentsFromCaptions(
      [
        { startFrame: 100, endFrame: 150 },
        { startFrame: 160, endFrame: 200 }, // 10-frame gap < 15 frames
        { startFrame: 240, endFrame: 300 }, // 40-frame gap
      ],
      fps,
    );
    expect(segments).toEqual([
      { startFrame: 100, endFrameExclusive: 200 },
      { startFrame: 240, endFrameExclusive: 300 },
    ]);
  });

  it("orders cues before merging and returns nothing for no captions", () => {
    expect(narrationSegmentsFromCaptions([], fps)).toEqual([]);
    expect(
      narrationSegmentsFromCaptions(
        [
          { startFrame: 240, endFrame: 300 },
          { startFrame: 100, endFrame: 150 },
        ],
        fps,
      ),
    ).toEqual([
      { startFrame: 100, endFrameExclusive: 150 },
      { startFrame: 240, endFrameExclusive: 300 },
    ]);
  });
});

describe("sound bed composition props", () => {
  const bed = {
    trackId: "morning-pad",
    src: "https://storage.example/catalog/sound-beds/morning-pad.wav?sig=x",
    durationInFrames: 480,
    loops: true,
  };

  it("accepts a signed HTTPS or loopback bed and rejects anything else", () => {
    expect(soundBedCompositionPropSchema.safeParse(bed).success).toBe(true);
    expect(
      soundBedCompositionPropSchema.safeParse({
        ...bed,
        src: "http://127.0.0.1:9000/x.wav",
      }).success,
    ).toBe(true);
    expect(
      soundBedCompositionPropSchema.safeParse({
        ...bed,
        src: "http://cdn.example/x.wav",
      }).success,
    ).toBe(false);
    expect(
      soundBedCompositionPropSchema.safeParse({ ...bed, trackId: "Bad ID" })
        .success,
    ).toBe(false);
  });

  it("is optional on the full-lesson composition, and absent by default", () => {
    const withoutBed = fullLessonCompositionPropsSchema.parse(
      photosynthesisThreeMinutePreview,
    );
    expect(withoutBed.soundBed).toBeUndefined();
    const withBed = fullLessonCompositionPropsSchema.parse({
      ...photosynthesisThreeMinutePreview,
      soundBed: bed,
    });
    expect(withBed.soundBed).toEqual(bed);
  });
});
