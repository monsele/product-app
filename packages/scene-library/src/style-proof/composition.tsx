/**
 * ST-094 — the proof composition.
 *
 * One component drives both the browser preview and the server render, from the
 * same validated, resolved input. There is no preview-only or render-only
 * branch in the treatment path: the only difference is that the render throws
 * on a blocking validation issue rather than drawing it, because a render must
 * never publish output the preview would have flagged.
 */

import { Audio, Sequence, useCurrentFrame } from "remotion";
import { useMemo, type JSX } from "react";
import type { z } from "zod";
import {
  styleProofCompositionPropsSchema,
  type StyleProofCompositionProps,
  type StyleProofIssue,
  type StyleProofIssueCode,
} from "@avlp/schemas/style-proof";
import {
  getStyleProofPack,
  styleProofCanvas,
} from "@avlp/design-system/style-proof-tokens";
import { StyleProofFontGate } from "./fonts.js";
import { ProofCaption } from "./primitives.js";
import {
  resolveStyleProofScenes,
  type ResolvedStyleProofScene,
} from "./resolver.js";
import { styleProofSecondsToFrames } from "./motion.js";
import { styleProofTreatmentComponents } from "./treatments/index.js";
import {
  validateStyleProofCaptions,
  validateStyleProofScenes,
} from "./validation.js";

export const styleProofCompositionIds = Object.freeze({
  essential: "StyleProofEssential",
  editorial: "StyleProofEditorial",
  everyday: "StyleProofEveryday",
});

export type StyleProofTimelineSegment = Readonly<{
  durationInFrames: number;
  endFrameExclusive: number;
  sceneId: string;
  startFrame: number;
}>;

export function styleProofTimeline(
  scenes: readonly Readonly<{
    durationSeconds: number;
    id: string;
    order: number;
  }>[],
): readonly StyleProofTimelineSegment[] {
  let startFrame = 0;
  return Object.freeze(
    [...scenes]
      .sort((left, right) => left.order - right.order)
      .map((scene) => {
        const durationInFrames = styleProofSecondsToFrames(
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

export function styleProofDurationInFrames(
  scenes: readonly Readonly<{
    durationSeconds: number;
    id: string;
    order: number;
  }>[],
): number {
  return styleProofTimeline(scenes).reduce(
    (total, segment) => total + segment.durationInFrames,
    0,
  );
}

/**
 * Maps a schema failure onto the proof's stable failure categories.
 *
 * Collapsing every Zod issue into one code would make the categories
 * unactionable for a client: an uncovered scene type and a malformed caption
 * are different problems with different recovery actions, and the machine
 * readable code is what a client branches on.
 */
function classifySchemaIssue(problem: z.ZodIssue): StyleProofIssueCode {
  // An extra key is the one case that really is an attempt to address a
  // treatment's internals rather than to supply data.
  if (problem.code === "unrecognized_keys") return "unsupported_design_instruction";
  const path = problem.path.join(".");
  if (/^scenes\.\d+\.template$/.test(path)) return "treatment_scene_type_mismatch";
  if (path === "selection.pack.id") return "unknown_pack";
  if (path === "selection.pack.version") return "unsupported_pack_version";
  if (path.endsWith(".treatmentId")) return "unknown_treatment";
  if (path.endsWith(".treatmentVersion")) return "unsupported_treatment_version";
  if (path.startsWith("assets.")) return "missing_required_asset";
  if (path.startsWith("captions")) return "invalid_caption_timing";
  return "invalid_composition_input";
}

function correctionFor(code: StyleProofIssueCode): string {
  switch (code) {
    case "unsupported_design_instruction":
      return "Remove the unrecognised field. A treatment exposes a content contract, not its layout.";
    case "treatment_scene_type_mismatch":
      return "Use a hook, definition or comparison scene; full scene-type coverage is later production work.";
    case "unknown_pack":
      return "Select one of the registered proof packs: essential, editorial or everyday.";
    case "unsupported_pack_version":
    case "unsupported_treatment_version":
      return "Pin a version this implementation provides, or retain the bundle that published the requested one.";
    case "unknown_treatment":
      return "Select a registered treatment ID; the resolver never guesses a nearby treatment.";
    case "missing_required_asset":
      return "Bind an asset that exists in the bundled proof library with valid metadata.";
    case "invalid_caption_timing":
      return "Re-cut the cue inside its scene. Caption timing follows narration and is identical across styles.";
    default:
      return "Correct the proof composition input; the schema rejects anything the treatments cannot present.";
  }
}

/** Attributes a schema failure to a scene where the path identifies one. */
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
  if (head === "selection" && path[1] === "sceneDesigns") {
    const sceneId = path[2];
    if (typeof sceneId === "string") return sceneId;
  }
  return "lesson";
}

/**
 * Resolves and validates one set of composition props. Exported so the
 * development gallery, the contract tests and the render scripts all decide
 * "is this renderable?" the same way.
 */
export function prepareStyleProofComposition(input: unknown): Readonly<{
  issues: readonly StyleProofIssue[];
  props?: StyleProofCompositionProps;
}> {
  const parsed = styleProofCompositionPropsSchema.safeParse(input);
  if (!parsed.success)
    return Object.freeze({
      issues: Object.freeze(
        parsed.error.issues.map((problem) =>
          Object.freeze({
            code: classifySchemaIssue(problem),
            fieldPath: problem.path.join("."),
            message: problem.message,
            sceneId: sceneIdForPath(problem.path, input),
            suggestedCorrection: correctionFor(classifySchemaIssue(problem)),
          }),
        ),
      ),
    });
  const props = parsed.data;
  const resolution = resolveStyleProofScenes(
    props.scenes,
    props.selection,
    props.assets,
  );
  const issues = [
    ...resolution.issues,
    ...validateStyleProofScenes(resolution.scenes, props.motion),
    ...validateStyleProofCaptions(
      props.captions,
      styleProofTimeline(props.scenes),
    ),
  ];
  return issues.length > 0
    ? Object.freeze({ issues: Object.freeze(issues) })
    : Object.freeze({ issues: Object.freeze([]), props });
}

function StyleProofCaptionOverlay({
  captions,
  packId,
}: Readonly<{
  captions: StyleProofCompositionProps["captions"];
  packId: StyleProofCompositionProps["selection"]["pack"]["id"];
}>): JSX.Element | null {
  const frame = useCurrentFrame();
  const cue = captions.find(
    (item) => frame >= item.startFrame && frame < item.endFrame,
  );
  if (cue === undefined) return null;
  return <ProofCaption pack={getStyleProofPack(packId)} text={cue.text} />;
}

/**
 * Draws one already-resolved scene at the current frame.
 *
 * It takes the resolved scene rather than resolving one: resolution is an
 * authoring-time decision, and re-running it inside the frame loop would both
 * waste work and sit against CR-01's rule that rendering must not rerun
 * selection.
 */
function StyleProofSceneFrame({
  motion,
  packId,
  resolved,
}: Readonly<{
  motion: StyleProofCompositionProps["motion"];
  packId: StyleProofCompositionProps["selection"]["pack"]["id"];
  resolved: ResolvedStyleProofScene;
}>): JSX.Element {
  const frame = useCurrentFrame();
  const Treatment = styleProofTreatmentComponents[resolved.treatment.id];
  return (
    <Treatment
      frame={frame}
      motion={motion}
      pack={getStyleProofPack(packId)}
      resolved={resolved}
    />
  );
}

/**
 * The full proof clip. `runtimeMode: "render"` refuses to draw anything when a
 * blocking issue exists, so a failing preflight cannot become an MP4.
 */
export function StyleProofComposition(
  props: StyleProofCompositionProps &
    Readonly<{ runtimeMode?: "preview" | "render" }>,
): JSX.Element {
  const {
    assets,
    captions,
    fixtureId,
    motion,
    narrationTracks,
    runtimeMode = "preview",
    scenes,
    selection,
  } = props;
  /**
   * Prepared once per input, not once per frame. Validating the whole input —
   * which carries every bundled asset — cost ~1.8ms on each of 840 frames, and
   * returned a fresh object each time, so nothing downstream could ever bail
   * out of re-rendering.
   *
   * The dependencies are the individual fields, deliberately. React builds a
   * new props object on every render, so memoising on `props` itself would
   * never hit; these inner references come from Remotion's `inputProps` and are
   * stable for the whole render.
   */
  const prepared = useMemo(
    () =>
      prepareStyleProofComposition({
        assets,
        captions,
        fixtureId,
        motion,
        narrationTracks,
        scenes,
        selection,
      }),
    [assets, captions, fixtureId, motion, narrationTracks, scenes, selection],
  );
  const resolvedScenes = useMemo(
    () =>
      prepared.props === undefined
        ? []
        : resolveStyleProofScenes(
            prepared.props.scenes,
            prepared.props.selection,
            prepared.props.assets,
          ).scenes,
    [prepared.props],
  );

  if (prepared.props === undefined) {
    const summary = prepared.issues
      .map((problem) => `${problem.code} at ${problem.fieldPath}: ${problem.message}`)
      .join(" | ");
    if (runtimeMode === "render")
      throw new Error(`Style proof render blocked — ${summary}`);
    return (
      <main
        data-testid="style-proof-blocked"
        role="alert"
        style={{
          background: "#14161A",
          boxSizing: "border-box",
          color: "#F7F5F0",
          fontFamily: "Arial, sans-serif",
          fontSize: 28,
          height: styleProofCanvas.height,
          padding: 96,
          width: styleProofCanvas.width,
        }}
      >
        <h1 style={{ fontSize: 56 }}>This treatment cannot be rendered</h1>
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
  const timeline = styleProofTimeline(composition.scenes);
  const narrationBySceneId = new Map(
    composition.narrationTracks.map((track) => [track.sceneId, track]),
  );
  const resolvedBySceneId = new Map(
    resolvedScenes.map((scene) => [scene.scene.id, scene]),
  );
  return (
    <StyleProofFontGate>
      <main
        data-testid="style-proof-composition"
        data-style-proof-pack={composition.selection.pack.id}
        style={{
          background: getStyleProofPack(composition.selection.pack.id).colors
            .background,
          height: "100%",
          overflow: "hidden",
          position: "relative",
          width: "100%",
        }}
      >
        {timeline.map((segment) => {
          const narration = narrationBySceneId.get(segment.sceneId);
          const resolved = resolvedBySceneId.get(segment.sceneId);
          if (resolved === undefined) return null;
          return (
            <Sequence
              durationInFrames={segment.durationInFrames}
              from={segment.startFrame}
              key={segment.sceneId}
            >
              <StyleProofSceneFrame
                motion={composition.motion}
                packId={composition.selection.pack.id}
                resolved={resolved}
              />
              {narration === undefined ? null : (
                <Audio pauseWhenBuffering src={narration.src} />
              )}
            </Sequence>
          );
        })}
        <StyleProofCaptionOverlay
          captions={composition.captions}
          packId={composition.selection.pack.id}
        />
      </main>
    </StyleProofFontGate>
  );
}

export function StyleProofRenderComposition(
  props: StyleProofCompositionProps,
): JSX.Element {
  return <StyleProofComposition {...props} runtimeMode="render" />;
}

/**
 * A single scene at a single frame, used by the contact sheet and by the
 * browser/server frame comparison. It shares the treatment path exactly.
 */
export function StyleProofStill({
  frame,
  props,
  sceneId,
}: Readonly<{
  frame: number;
  props: StyleProofCompositionProps;
  sceneId: string;
}>): JSX.Element | null {
  // `resolveStyleProofScenes` never returns a scene it flagged, so an empty
  // result here means the scene is not renderable.
  const resolution = resolveStyleProofScenes(
    props.scenes.filter((scene) => scene.id === sceneId),
    props.selection,
    props.assets,
  );
  const resolved = resolution.scenes[0];
  if (resolved === undefined) return null;
  const Treatment = styleProofTreatmentComponents[resolved.treatment.id];
  return (
    <Treatment
      frame={frame}
      motion={props.motion}
      pack={getStyleProofPack(props.selection.pack.id)}
      resolved={resolved}
    />
  );
}
