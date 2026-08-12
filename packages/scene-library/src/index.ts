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
export * from "./hook-scene.js";
export * from "./hook-scene.fixtures.js";
export * from "./definition-scene.js";
export * from "./definition-scene.fixtures.js";
export * from "./process-scene.js";
export * from "./process-scene.fixtures.js";
export * from "./ipo-scene.js";
export * from "./ipo-scene.fixtures.js";
export * from "./comparison-scene.js";
export * from "./comparison-scene.fixtures.js";
export * from "./cause-effect-scene.js";
export * from "./cause-effect-scene.fixtures.js";
export * from "./diagram-layout.js";
export * from "./labelled-diagram-scene.js";
export * from "./labelled-diagram-scene.fixtures.js";
export * from "./analogy-scene.js";
export * from "./analogy-scene.fixtures.js";
