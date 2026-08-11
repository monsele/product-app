import { VIDEO_FPS, videoTheme } from "@avlp/design-system/video-theme";

export type SceneFrameTiming = Readonly<{
  durationInFrames: number;
  enterEndFrame: number;
  exitStartFrame: number;
}>;

export function secondsToFrames(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds * VIDEO_FPS));
}

export function getSceneFrameTiming(durationSeconds: number): SceneFrameTiming {
  const durationInFrames = secondsToFrames(durationSeconds);
  const enterEndFrame = Math.min(
    durationInFrames,
    videoTheme.motion.enter.durationInFrames,
  );
  return Object.freeze({
    durationInFrames,
    enterEndFrame,
    exitStartFrame: Math.max(
      enterEndFrame,
      durationInFrames - videoTheme.motion.exit.durationInFrames,
    ),
  });
}
