import { describe, expect, it } from "vitest";
import { soundBedCompositionPropSchema } from "@avlp/scene-library";
import { previewSoundBedProps } from "./preview-player";

describe("previewSoundBedProps (ST-103)", () => {
  const canvas = { fps: 30, height: 1_080, width: 1_920 };

  it("maps the configured bed to the composition prop the renderer uses", () => {
    const props = previewSoundBedProps({
      canvas,
      soundBed: {
        trackId: "quiet-pulse",
        url: "https://storage.example.test/bed.wav?signature=x",
        expiresAt: "2026-08-24T10:05:00.000Z",
        durationMs: 16_000,
        loops: true,
      },
    });
    expect(props).toEqual({
      soundBed: {
        durationInFrames: 480,
        loops: true,
        src: "https://storage.example.test/bed.wav?signature=x",
        trackId: "quiet-pulse",
      },
    });
    expect(soundBedCompositionPropSchema.safeParse(props.soundBed).success).toBe(
      true,
    );
  });

  it("adds no bed when none is configured", () => {
    expect(previewSoundBedProps({ canvas })).toEqual({});
  });
});
