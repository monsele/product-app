import { Composition } from "remotion";
import type { JSX } from "react";
import { getSceneFrameTiming } from "./timing.js";
import {
  FullLessonComposition,
  type FullLessonCompositionProps,
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
export const fullLessonPreviewCompositionId = "FullLessonRuntimePreview";
export const fullLessonRuntimeCompositionId = "FullLessonRuntimeRender";
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

export function FullLessonPreviewComposition(
  props: FullLessonCompositionProps,
): JSX.Element {
  return <FullLessonComposition {...props} runtimeMode="preview" />;
}

export function FullLessonRenderComposition(
  props: FullLessonCompositionProps,
): JSX.Element {
  return <FullLessonComposition {...props} runtimeMode="render" />;
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
        component={FullLessonPreviewComposition}
        defaultProps={photosynthesisThreeMinutePreview}
        durationInFrames={getLessonDurationInFrames(
          photosynthesisThreeMinutePreview.lesson,
        )}
        fps={videoTheme.canvas.fps}
        height={videoTheme.canvas.height}
        id={fullLessonPreviewCompositionId}
        width={videoTheme.canvas.width}
      />
      <Composition
        component={FullLessonRenderComposition}
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
