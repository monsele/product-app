import { Composition } from "remotion";
import type { JSX } from "react";
import { getSceneFrameTiming } from "./timing.js";
import {
  FullLessonComposition,
  getLessonDurationInFrames,
} from "./full-lesson.js";
import { photosynthesisThreeMinutePreview } from "./full-lesson.fixture.js";
import {
  sceneRegistryPreviewFixture,
  SceneRenderRuntime,
  type SceneComponentProps,
} from "./scene-registry.js";
import { videoTheme } from "@avlp/design-system/video-theme";

export const sceneRuntimeCompositionId = "SceneRuntimePreview";
export const fullLessonRuntimeCompositionId = "FullLessonRuntimePreview";
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
    <>
      <Composition
        {...sceneRuntimeComposition}
        component={SceneRuntimeComposition}
        defaultProps={{ scene: sceneRegistryPreviewFixture }}
      />
      <Composition
        component={FullLessonComposition}
        defaultProps={photosynthesisThreeMinutePreview}
        durationInFrames={getLessonDurationInFrames(
          photosynthesisThreeMinutePreview.lesson,
        )}
        fps={videoTheme.canvas.fps}
        height={videoTheme.canvas.height}
        id={fullLessonRuntimeCompositionId}
        width={videoTheme.canvas.width}
      />
    </>
  );
}
