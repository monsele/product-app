import { describe, expect, it } from "vitest";
import {
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  isWithinSafeArea,
  scaleVideoCanvas,
  transitionPresets,
  videoFont,
  videoTheme,
} from "./video-theme.js";

describe("video theme", () => {
  it("uses the approved 1080p 30fps video canvas and controlled transitions", () => {
    expect([VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS]).toEqual([1920, 1080, 30]);
    expect(transitionPresets).toEqual(["cut", "fade", "slide"]);
  });

  it("keeps title and caption representative bounds inside their safe areas", () => {
    expect(
      isWithinSafeArea(videoTheme.safeAreas.title, {
        left: 144,
        top: 108,
        right: 1776,
        bottom: 612,
      }),
    ).toBe(true);
    expect(
      isWithinSafeArea(videoTheme.safeAreas.caption, {
        left: 240,
        top: 876,
        right: 1680,
        bottom: 984,
      }),
    ).toBe(true);
  });

  it("uses uniform 16:9 scaling for browser preview containers", () => {
    expect(scaleVideoCanvas(960, 1080)).toEqual({
      scale: 0.5,
      width: 960,
      height: 540,
    });
    expect(
      isWithinSafeArea(videoTheme.lowerThirdAvoidance, {
        left: 144,
        top: 840,
        right: 1776,
        bottom: 1008,
      }),
    ).toBe(true);
  });

  it("uses a bundled font declaration rather than a remote runtime font", () => {
    expect(videoFont.source).toMatch(/^@fontsource\//);
    expect(videoTheme.typography.fontFamily).toContain(videoFont.family);
  });

  it("meets WCAG AA contrast for the primary text pairs", () => {
    expect(
      contrast(videoTheme.colors.text, videoTheme.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(videoTheme.colors.mutedText, videoTheme.colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const values =
      hex
        .slice(1)
        .match(/../g)
        ?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
    const [red = 0, green = 0, blue = 0] = values.map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const ordered = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  const lighter = ordered[0] ?? 0;
  const darker = ordered[1] ?? 0;
  return (lighter + 0.05) / (darker + 0.05);
}
