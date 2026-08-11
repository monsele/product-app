import {
  transitionPresets,
  videoTheme,
  type VideoTheme,
} from "@avlp/design-system";

export const sceneLibraryVideoTheme: VideoTheme = videoTheme;

export const sceneLibrarySafeAreas: VideoTheme["safeAreas"] =
  videoTheme.safeAreas;

export const sceneLibraryMotionPresets: VideoTheme["motion"] =
  videoTheme.motion;

export const sceneLibraryTransitionPresets = transitionPresets;

export * from "./layout.js";
export * from "./scene-registry.js";
export * from "./timing.js";
export * from "./scene-preview-composition.js";
