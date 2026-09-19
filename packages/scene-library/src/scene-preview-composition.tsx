import { Composition } from "remotion";
import type { JSX } from "react";
import {
  demonstrationCompositionPropsSchema,
  demonstrationFps,
  type DemonstrationCompositionProps,
} from "@avlp/schemas/demonstration-proof";
import {
  DemonstrationRenderComposition,
  demonstrationDurationInFrames,
} from "./demonstration-proof/composition.js";
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
/**
 * ST-096 - the demonstration approach's production composition.
 *
 * Registered on the *production* root, unlike ST-095's proof root, because
 * this is the composition the real render worker selects when a comparison
 * variant's manifest says `demonstration`. It is the same component ST-095
 * proved; only its entry point is new, so the pilot renders the animation that
 * was verified rather than a production reimplementation of it.
 */
export const demonstrationRuntimeCompositionId = "DemonstrationRuntimeRender";
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

/**
 * A lesson's real length, from the props actually being rendered.
 *
 * Without this, `selectComposition` reports the `durationInFrames` literal
 * declared on the `<Composition>` element - which is derived from the
 * checked-in preview fixture - for *every* lesson, so a lesson of any other
 * length renders to the fixture's duration and then passes its own duration
 * check, because that check compares against the same wrong number.
 *
 * ST-096 needs this fixed to make any claim about a controlled pair: AC4 says
 * both approaches share their scene boundaries, and two clips truncated to an
 * unrelated fixture's length share nothing worth comparing. The renderer's
 * implementation version is bumped alongside it (CR-03), so the change
 * produces a new render identity rather than silently reinterpreting one.
 */
function fullLessonMetadata({
  props,
}: {
  props: FullLessonCompositionProps;
}): { durationInFrames: number } {
  return { durationInFrames: getLessonDurationInFrames(props.lesson) };
}

/**
 * The placeholder this composition is declared with.
 *
 * It is deliberately empty rather than a real fixture: a fixture would drag
 * ST-095's bundled narration - fifteen megabytes of base64 audio - into the
 * production render bundle for the benefit of a default nobody renders. The
 * render worker always supplies input props, so the placeholder is only ever
 * seen by Remotion Studio, where an empty demonstration is the honest thing to
 * show.
 */
const demonstrationRuntimePlaceholder = {
  approach: "demonstration",
  assets: {},
  captions: [],
  fixtureId: "unset",
  narrationTracks: [],
  scenes: [],
} as unknown as DemonstrationCompositionProps;

function demonstrationMetadata({
  props,
}: {
  props: DemonstrationCompositionProps;
}): { durationInFrames: number } {
  // `safeParse` rather than `parse`: the placeholder above does not satisfy the
  // schema, and metadata resolution must not be the thing that fails - the
  // composition itself refuses invalid input, with a structured issue, where
  // that refusal is meaningful.
  const parsed = demonstrationCompositionPropsSchema.safeParse(props);
  return {
    durationInFrames: parsed.success
      ? demonstrationDurationInFrames(parsed.data.scenes)
      : demonstrationFps,
  };
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
        calculateMetadata={fullLessonMetadata}
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
      <Composition
        calculateMetadata={demonstrationMetadata}
        component={DemonstrationRenderComposition}
        defaultProps={demonstrationRuntimePlaceholder}
        durationInFrames={demonstrationFps}
        fps={videoTheme.canvas.fps}
        height={videoTheme.canvas.height}
        id={demonstrationRuntimeCompositionId}
        width={videoTheme.canvas.width}
      />
    </>
  );
}
