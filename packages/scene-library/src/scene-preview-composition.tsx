import { Composition } from "remotion";
import type { JSX } from "react";
import { getSceneFrameTiming } from "./timing.js";
import {
  sceneRegistryPreviewFixture,
  SceneRenderRuntime,
  type SceneComponentProps,
} from "./scene-registry.js";
import { videoTheme } from "@avlp/design-system/video-theme";

export const sceneRuntimeCompositionId = "SceneRuntimePreview";
export const sceneRuntimeComposition = Object.freeze({
  id: sceneRuntimeCompositionId,
  durationInFrames: getSceneFrameTiming(
    sceneRegistryPreviewFixture.durationSeconds,
  ).durationInFrames,
  fps: videoTheme.canvas.fps,
  height: videoTheme.canvas.height,
  width: videoTheme.canvas.width,
});

export function SceneRuntimeComposition({
  resolvedAssets,
  scene,
}: SceneComponentProps): JSX.Element {
  return (
    <SceneRenderRuntime
      {...(resolvedAssets === undefined ? {} : { resolvedAssets })}
      scene={scene}
    />
  );
}

export function SceneRuntimeRoot(): JSX.Element {
  return (
    <Composition
      {...sceneRuntimeComposition}
      component={SceneRuntimeComposition}
      defaultProps={{ scene: sceneRegistryPreviewFixture }}
    />
  );
}
