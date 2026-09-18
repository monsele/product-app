/**
 * ST-095 — the demonstration composition.
 *
 * One component drives both the browser preview and the server render, from
 * the same validated, resolved input. There is no preview-only or render-only
 * branch in the recipe path: the only difference is that the render throws on
 * a blocking validation issue instead of drawing it, because a render must
 * never publish output the preview would have flagged (CR-07).
 *
 * The caption overlay, the scene sequencing and the audio are deliberately
 * identical in shape to the production `FullLessonComposition`, because the
 * standard equivalent is that component: if the two differed here, a
 * comparison would be measuring the difference between two shells rather than
 * between two ways of explaining.
 */

import { Audio, Sequence, useCurrentFrame } from "remotion";
import { useMemo, type JSX } from "react";
import {
  demonstrationCompositionPropsSchema,
  type DemonstrationCompositionProps,
  type DemonstrationIssue,
  type DemonstrationNarrationTrack,
  type DemonstrationScene,
} from "@avlp/schemas/demonstration-proof";
import { videoTheme } from "@avlp/design-system/video-theme";
import { DemonstrationFontGate } from "./fonts.js";
import { sceneOpacity } from "./geometry.js";
import { EvaporationRecipe } from "./recipes/evaporation.js";
import { SavingsRecipe } from "./recipes/savings.js";
import {
  compileDemonstrationPlan,
  demonstrationSecondsToFrames,
  evaluateDemonstrationState,
  type CompiledDemonstrationPlan,
} from "./state.js";
import {
  demonstrationSchemaIssues,
  validateDemonstrationCaptions,
  validateDemonstrationPlan,
  validateDemonstrationScene,
} from "./validation.js";

export const demonstrationCompositionIds = Object.freeze({
  savingsDemonstration: "DemoSavingsDemonstration",
  savingsStandard: "DemoSavingsStandard",
  evaporationDemonstration: "DemoEvaporationDemonstration",
  evaporationStandard: "DemoEvaporationStandard",
});

export type DemonstrationTimelineSegment = Readonly<{
  durationInFrames: number;
  endFrameExclusive: number;
  sceneId: string;
  startFrame: number;
}>;

export function demonstrationTimeline(
  scenes: readonly Readonly<{
    durationSeconds: number;
    id: string;
    order: number;
  }>[],
): readonly DemonstrationTimelineSegment[] {
  let startFrame = 0;
  return Object.freeze(
    [...scenes]
      .sort((left, right) => left.order - right.order)
      .map((scene) => {
        const durationInFrames = demonstrationSecondsToFrames(
          scene.durationSeconds,
        );
        const segment = Object.freeze({
          durationInFrames,
          endFrameExclusive: startFrame + durationInFrames,
          sceneId: scene.id,
          startFrame,
        });
        startFrame = segment.endFrameExclusive;
        return segment;
      }),
  );
}

export function demonstrationDurationInFrames(
  scenes: readonly Readonly<{
    durationSeconds: number;
    id: string;
    order: number;
  }>[],
): number {
  return demonstrationTimeline(scenes).reduce(
    (total, segment) => total + segment.durationInFrames,
    0,
  );
}

function sceneIdForPath(
  path: readonly (string | number)[],
  input: unknown,
): string {
  const [head, index] = path;
  if (head === "scenes" && typeof index === "number") {
    const scenes = (input as { scenes?: readonly { id?: unknown }[] } | null)
      ?.scenes;
    const id = scenes?.[index]?.id;
    if (typeof id === "string") return id;
  }
  return "lesson";
}

export type PreparedDemonstration = Readonly<{
  issues: readonly DemonstrationIssue[];
  props?: DemonstrationCompositionProps;
}>;

/**
 * Resolves and validates one set of composition props.
 *
 * Exported so the development gallery, the contract tests and the render
 * scripts all decide "is this renderable?" the same way — there is no second
 * opinion anywhere about whether a plan is fit to become an MP4.
 */
export function prepareDemonstrationComposition(
  input: unknown,
): PreparedDemonstration {
  const parsed = demonstrationCompositionPropsSchema.safeParse(input);
  if (!parsed.success)
    return Object.freeze({
      issues: demonstrationSchemaIssues(parsed.error.issues, (path) =>
        sceneIdForPath(path, input),
      ),
    });

  const props = parsed.data;
  const narrationBySceneId = new Map(
    props.narrationTracks.map((entry) => [entry.sceneId, entry]),
  );
  const issues = [
    ...props.scenes.flatMap((scene) => [
      ...validateDemonstrationScene(
        scene,
        narrationBySceneId.get(scene.id),
        props.assets,
      ),
      ...validateDemonstrationPlan(scene.plan, narrationBySceneId.get(scene.id)),
    ]),
    ...validateDemonstrationCaptions(
      props.captions,
      demonstrationTimeline(props.scenes),
    ),
  ];

  return issues.length > 0
    ? Object.freeze({ issues: Object.freeze(issues) })
    : Object.freeze({ issues: Object.freeze([]), props });
}

/**
 * The caption line at an explicitly given frame.
 *
 * Hook-free, so the browser harness mounts the very same component the clip
 * draws. The two used to carry separate copies of this markup, which meant the
 * layout preflight measured the harness's copy while the render used the
 * composition's — a style change in one would have moved what the other was
 * checked against, silently.
 */
export function DemonstrationCaptionAtFrame({
  captions,
  frame,
}: Readonly<{
  captions: DemonstrationCompositionProps["captions"];
  frame: number;
}>): JSX.Element | null {
  const cue = captions.find(
    (item) => frame >= item.startFrame && frame < item.endFrame,
  );
  if (cue === undefined) return null;
  return (
    <p
      data-testid="demonstration-caption"
      style={{
        background: videoTheme.colors.captionBackground,
        bottom: videoTheme.safeAreas.caption.bottom,
        color: videoTheme.colors.text,
        fontFamily: videoTheme.typography.fontFamily,
        fontSize: videoTheme.typography.captionSize,
        left: videoTheme.safeAreas.caption.left,
        margin: 0,
        padding: videoTheme.spacing.sm,
        position: "absolute",
        right: videoTheme.safeAreas.caption.right,
        textAlign: "center",
        zIndex: 20,
      }}
    >
      {cue.text}
    </p>
  );
}

/** The Remotion-aware wrapper: supplies the clip frame, draws nothing itself. */
function DemonstrationCaptionOverlay({
  captions,
}: Readonly<{
  captions: DemonstrationCompositionProps["captions"];
}>): JSX.Element | null {
  return (
    <DemonstrationCaptionAtFrame
      captions={captions}
      frame={useCurrentFrame()}
    />
  );
}

/**
 * One scene at an explicitly given frame.
 *
 * Deliberately free of Remotion hooks so the browser harness, the contact
 * sheet and the parity comparison can mount it directly, outside a Player,
 * and still be drawing exactly what the clip draws. `DemonstrationSceneFrame`
 * below is the thin Remotion wrapper that supplies the frame.
 *
 * The compiled plan is passed in rather than built here: compiling is a pure
 * function of the plan, but re-deriving the slot maps on every one of two
 * thousand frames is work the render does not need to do, and returning a
 * fresh object each frame would defeat React's bail-out.
 */
export function DemonstrationSceneAtFrame({
  compiled,
  frame,
  scene,
  assets,
}: Readonly<{
  assets: DemonstrationCompositionProps["assets"];
  compiled: CompiledDemonstrationPlan;
  frame: number;
  scene: DemonstrationScene;
}>): JSX.Element {
  const state = evaluateDemonstrationState(compiled, frame);
  const resolvedAssets = Object.fromEntries(
    Object.entries(scene.assetBySlot).flatMap(([slot, assetId]) => {
      const asset = assets[assetId];
      return asset === undefined ? [] : [[slot, asset] as const];
    }),
  );
  const shared = {
    assets: resolvedAssets,
    compiled,
    plan: scene.plan,
    state,
    title: scene.title,
  };
  return (
    <div
      data-testid={`demonstration-scene-${scene.order}`}
      style={{
        height: "100%",
        opacity: sceneOpacity(frame, scene.plan.durationInFrames),
        position: "relative",
        width: "100%",
      }}
    >
      {scene.plan.recipe.id === "savings.transfer-accumulate" ? (
        <SavingsRecipe {...shared} />
      ) : (
        <EvaporationRecipe {...shared} />
      )}
    </div>
  );
}

/** The Remotion-aware wrapper: reads the sequence-relative frame and defers
 * every drawing decision to the hook-free component above. */
export function DemonstrationSceneFrame(
  props: Readonly<{
    assets: DemonstrationCompositionProps["assets"];
    compiled: CompiledDemonstrationPlan;
    scene: DemonstrationScene;
  }>,
): JSX.Element {
  const frame = useCurrentFrame();
  return <DemonstrationSceneAtFrame {...props} frame={frame} />;
}

/**
 * The full demonstration clip. `runtimeMode: "render"` refuses to draw
 * anything when a blocking issue exists, so a failing preflight cannot become
 * an MP4.
 */
export function DemonstrationComposition(
  props: DemonstrationCompositionProps &
    Readonly<{ runtimeMode?: "preview" | "render" }>,
): JSX.Element {
  const {
    approach,
    assets,
    captions,
    fixtureId,
    narrationTracks,
    runtimeMode = "preview",
    scenes,
  } = props;

  /**
   * Prepared once per input, not once per frame. The dependencies are the
   * individual fields deliberately: React builds a new props object on every
   * render, so memoising on `props` itself would never hit, while these inner
   * references come from Remotion's `inputProps` and are stable for the whole
   * render.
   */
  const prepared = useMemo(
    () =>
      prepareDemonstrationComposition({
        approach,
        assets,
        captions,
        fixtureId,
        narrationTracks,
        scenes,
      }),
    [approach, assets, captions, fixtureId, narrationTracks, scenes],
  );

  const compiledByScene = useMemo(
    () =>
      new Map(
        (prepared.props?.scenes ?? []).map((scene) => [
          scene.id,
          compileDemonstrationPlan(scene.plan),
        ]),
      ),
    [prepared.props],
  );

  if (prepared.props === undefined) {
    const summary = prepared.issues
      .map(
        (problem) =>
          `${problem.code} at ${problem.fieldPath}: ${problem.message}`,
      )
      .join(" | ");
    if (runtimeMode === "render")
      throw new Error(`Demonstration render blocked — ${summary}`);
    return (
      <main
        data-testid="demonstration-blocked"
        role="alert"
        style={{
          background: videoTheme.colors.background,
          boxSizing: "border-box",
          color: videoTheme.colors.text,
          fontFamily: videoTheme.typography.fontFamily,
          fontSize: 28,
          height: "100%",
          padding: 96,
          width: "100%",
        }}
      >
        <h1 style={{ fontSize: 56 }}>This demonstration cannot be rendered</h1>
        <ul>
          {prepared.issues.map((problem) => (
            <li key={`${problem.fieldPath}:${problem.code}`}>
              <strong>{problem.code}</strong> at {problem.fieldPath} —{" "}
              {problem.message} {problem.suggestedCorrection}
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const composition = prepared.props;
  const timeline = demonstrationTimeline(composition.scenes);
  const narrationBySceneId = new Map<string, DemonstrationNarrationTrack>(
    composition.narrationTracks.map((entry) => [entry.sceneId, entry]),
  );
  const sceneById = new Map(
    composition.scenes.map((scene) => [scene.id, scene]),
  );

  return (
    <DemonstrationFontGate>
      <main
        data-testid="demonstration-composition"
        data-demo-fixture={composition.fixtureId}
        data-demo-approach={composition.approach}
        style={{
          background: videoTheme.colors.background,
          height: "100%",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        {timeline.map((segment) => {
          const scene = sceneById.get(segment.sceneId);
          const compiled = compiledByScene.get(segment.sceneId);
          const narration = narrationBySceneId.get(segment.sceneId);
          if (scene === undefined || compiled === undefined) return null;
          return (
            <Sequence
              durationInFrames={segment.durationInFrames}
              from={segment.startFrame}
              key={segment.sceneId}
            >
              <DemonstrationSceneFrame
                assets={composition.assets}
                compiled={compiled}
                scene={scene}
              />
              {narration === undefined ? null : (
                <Audio pauseWhenBuffering src={narration.src} />
              )}
            </Sequence>
          );
        })}
        <DemonstrationCaptionOverlay captions={composition.captions} />
      </main>
    </DemonstrationFontGate>
  );
}

export function DemonstrationRenderComposition(
  props: DemonstrationCompositionProps,
): JSX.Element {
  return <DemonstrationComposition {...props} runtimeMode="render" />;
}

/**
 * A single scene at a single frame, used by the contact sheet and by the
 * browser/server frame comparison. It shares the recipe path exactly, so a
 * still is evidence about the clip rather than about a second code path.
 */
export function DemonstrationStill({
  frame,
  props,
  sceneId,
}: Readonly<{
  frame: number;
  props: DemonstrationCompositionProps;
  sceneId: string;
}>): JSX.Element | null {
  const scene = props.scenes.find((entry) => entry.id === sceneId);
  if (scene === undefined) return null;
  return (
    <main
      data-testid="demonstration-still"
      style={{
        background: videoTheme.colors.background,
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
      }}
    >
      <DemonstrationSceneAtFrame
        assets={props.assets}
        compiled={compileDemonstrationPlan(scene.plan)}
        frame={frame}
        scene={scene}
      />
    </main>
  );
}
