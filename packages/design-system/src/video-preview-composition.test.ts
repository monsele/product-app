import { describe, expect, it } from "vitest";
import {
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  videoFont,
  videoTheme,
} from "./video-theme.js";
import {
  getVideoDesignPreviewFrame,
  videoDesignPreviewComposition,
  videoDesignPreviewTransition,
} from "./video-preview-composition.js";

describe("video design preview composition", () => {
  it("shares the exact 1080p render configuration used for previews", () => {
    expect(videoDesignPreviewComposition).toEqual({
      id: "VideoDesignPreview",
      durationInFrames: 150,
      fps: VIDEO_FPS,
      width: VIDEO_WIDTH,
      height: VIDEO_HEIGHT,
    });
  });

  it("has deterministic representative frame states", () => {
    expect(getVideoDesignPreviewFrame(0).firstOpacity).toBe(0);
    expect(
      getVideoDesignPreviewFrame(videoTheme.motion.enter.durationInFrames)
        .firstOpacity,
    ).toBe(1);
    expect(getVideoDesignPreviewFrame(36).firstOpacity).toBe(1);
    expect(getVideoDesignPreviewFrame(9).firstOpacity).toBeGreaterThan(0);
    expect(getVideoDesignPreviewFrame(9).firstOpacity).toBeLessThan(1);
    expect(videoDesignPreviewTransition).toBe("fade");
    expect(getVideoDesignPreviewFrame(90).secondOpacity).toBe(0);
    expect(getVideoDesignPreviewFrame(102).secondOpacity).toBe(1);
  });

  it("declares a local CSS font asset shared by browser preview and renderer", () => {
    expect(videoFont.source).toBe("@fontsource/atkinson-hyperlegible/400.css");
  });
});
