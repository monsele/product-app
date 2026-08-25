export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const VIDEO_FPS = 30;

export type SafeArea = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
}>;

export type MotionPreset = Readonly<{
  durationInFrames: number;
  easing: readonly [number, number, number, number];
}>;

export type VideoScale = Readonly<{
  scale: number;
  width: number;
  height: number;
}>;

export type VideoTheme = Readonly<{
  id: "mvp-default";
  canvas: Readonly<{
    width: typeof VIDEO_WIDTH;
    height: typeof VIDEO_HEIGHT;
    fps: typeof VIDEO_FPS;
  }>;
  colors: Readonly<{
    background: string;
    surface: string;
    primary: string;
    accent: string;
    text: string;
    mutedText: string;
    captionBackground: string;
  }>;
  typography: Readonly<{
    fontFamily: string;
    titleSize: number;
    bodySize: number;
    captionSize: number;
    lineHeight: number;
  }>;
  spacing: Readonly<{
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  }>;
  layout: Readonly<{ contentMaxWidth: number }>;
  radii: Readonly<{ md: number }>;
  lineWidths: Readonly<{ emphasis: number }>;
  safeAreas: Readonly<{
    action: SafeArea;
    title: SafeArea;
    body: SafeArea;
    caption: SafeArea;
  }>;
  lowerThirdAvoidance: SafeArea;
  motion: Readonly<
    Record<"enter" | "exit" | "emphasize" | "reveal", MotionPreset>
  >;
}>;

export const videoFont = Object.freeze({
  family: "Atkinson Hyperlegible",
  fallback: "Arial, sans-serif",
  source: "@fontsource/atkinson-hyperlegible/400.css",
});

export const videoTheme: VideoTheme = Object.freeze({
  id: "mvp-default",
  canvas: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, fps: VIDEO_FPS } as const,
  colors: {
    background: "#102A43",
    surface: "#243B53",
    primary: "#2CB1BC",
    accent: "#F0B429",
    text: "#F0F4F8",
    mutedText: "#D9E2EC",
    captionBackground: "#102A43",
  },
  typography: {
    fontFamily: `"${videoFont.family}", ${videoFont.fallback}`,
    titleSize: 72,
    bodySize: 42,
    captionSize: 34,
    lineHeight: 1.25,
  },
  spacing: { xs: 12, sm: 24, md: 40, lg: 64, xl: 96 },
  layout: { contentMaxWidth: 1200 },
  radii: { md: 16 },
  lineWidths: { emphasis: 12 },
  safeAreas: {
    action: { left: 96, top: 72, right: 96, bottom: 72 },
    title: { left: 144, top: 108, right: 144, bottom: 72 },
    body: { left: 144, top: 252, right: 144, bottom: 264 },
    caption: { left: 240, top: 876, right: 240, bottom: 96 },
  },
  lowerThirdAvoidance: { left: 144, top: 840, right: 144, bottom: 72 },
  motion: {
    enter: { durationInFrames: 18, easing: [0.22, 1, 0.36, 1] },
    exit: { durationInFrames: 12, easing: [0.4, 0, 1, 1] },
    emphasize: { durationInFrames: 10, easing: [0.34, 1.56, 0.64, 1] },
    reveal: { durationInFrames: 15, easing: [0, 0, 0.2, 1] },
  } as const,
});

export const transitionPresets = ["cut", "fade", "slide"] as const;
export type TransitionPreset = (typeof transitionPresets)[number];

export function isWithinSafeArea(
  area: SafeArea,
  bounds: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>,
): boolean {
  return (
    bounds.left >= area.left &&
    bounds.top >= area.top &&
    bounds.right <= VIDEO_WIDTH - area.right &&
    bounds.bottom <= VIDEO_HEIGHT - area.bottom
  );
}

export function scaleVideoCanvas(
  containerWidth: number,
  containerHeight: number,
): VideoScale {
  const scale = Math.max(
    0,
    Math.min(containerWidth / VIDEO_WIDTH, containerHeight / VIDEO_HEIGHT),
  );
  return Object.freeze({
    scale,
    width: VIDEO_WIDTH * scale,
    height: VIDEO_HEIGHT * scale,
  });
}
