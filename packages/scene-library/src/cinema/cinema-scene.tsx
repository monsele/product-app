/**
 * ST-108/109/111 (ADR-015) — one scene of a v2 video.
 *
 * Resolves the identity, the scene's pictures and its narration-anchored
 * beats, then draws the registered composition. Transitions stay inside the
 * scene's own frames (a dissolve or a short directional settle), so they never
 * shorten narration, overlap the next scene or alter the audio timeline. There
 * is no compulsory border: any framing belongs to the composition.
 */
import {
  resolveCinemaBeatFrames,
  type CinemaCaptionCue,
  type CinemaCompositionId,
  type CreativeDesignManifestV2,
  type LessonSpec,
} from "@avlp/schemas";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { useMemo, type JSX } from "react";
import type { ResolvedSceneAsset } from "../scene-registry.js";
import { StyleProofFontGate } from "../style-proof/fonts.js";
import { CinemaBeatProvider, createBeatTimeline } from "./beats.js";
import {
  ComparisonSplitComposition,
  ComparisonStackedComposition,
} from "./compositions/comparison.js";
import { ConnectedComposition } from "./compositions/connected.js";
import {
  ChapterComposition,
  IllustratedHeadlineComposition,
  StatementComposition,
} from "./compositions/headline-led.js";
import {
  HeroAnnotatedComposition,
  HeroIndexedComposition,
} from "./compositions/hero.js";
import { SequenceComposition } from "./compositions/sequence.js";
import { TakeawayComposition } from "./compositions/takeaway.js";
import {
  resolveCinemaHero,
  resolveCinemaItemIcons,
  resolveCinemaSubjectImages,
} from "./content.js";
import type { CinemaCompositionProps } from "./frame.js";
import { resolveCinemaIdentity } from "./identity.js";

/** The registered implementation of every composition of `cinema-1.0.0`. */
export const cinemaCompositionComponents: Readonly<
  Record<CinemaCompositionId, (props: CinemaCompositionProps) => JSX.Element>
> = Object.freeze({
  "illustrated-headline": IllustratedHeadlineComposition,
  statement: StatementComposition,
  chapter: ChapterComposition,
  sequence: SequenceComposition,
  "comparison-split": ComparisonSplitComposition,
  "comparison-stacked": ComparisonStackedComposition,
  connected: ConnectedComposition,
  "hero-annotated": HeroAnnotatedComposition,
  "hero-indexed": HeroIndexedComposition,
  takeaway: TakeawayComposition,
});

const settle = Easing.bezier(0.22, 1, 0.36, 1);

function transitionStyle(
  transition: LessonSpec["scenes"][number]["transition"],
  frame: number,
  durationInFrames: number,
  energy: "calm" | "balanced" | "lively",
): Readonly<{ opacity: number; transform: string }> {
  if (transition === "cut") return { opacity: 1, transform: "none" };
  const scale = energy === "calm" ? 1.4 : energy === "lively" ? 0.7 : 1;
  const enter = Math.round(12 * scale);
  const exit = Math.round(8 * scale);
  const opacity = interpolate(
    frame,
    [0, enter, Math.max(enter + 1, durationInFrames - exit), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  if (transition === "fade") return { opacity, transform: "none" };
  const offset = interpolate(frame, [0, Math.round(16 * scale)], [56, 0], {
    easing: settle,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, transform: `translateX(${offset}px)` };
}

export function CinemaScene({
  creativeDesign,
  durationInFrames,
  frameStyle,
  resolvedAssets,
  runtimeMode,
  scene,
  sceneCaptions = [],
}: Readonly<{
  creativeDesign: CreativeDesignManifestV2;
  durationInFrames: number;
  frameStyle?: Readonly<{ opacity?: number; transform?: string }>;
  resolvedAssets: Readonly<Record<string, ResolvedSceneAsset>>;
  runtimeMode: "preview" | "render";
  scene: LessonSpec["scenes"][number];
  /** Caption cues for this scene, in scene-relative frames. */
  sceneCaptions?: readonly CinemaCaptionCue[];
}>): JSX.Element {
  const frame = useCurrentFrame();
  const design = creativeDesign.scenes[scene.id];
  // Composition props are validated before preview or render; a caller that
  // bypasses that boundary must fail rather than draw an unplanned scene.
  if (design === undefined)
    throw new Error(`Creative design is missing a resolved composition for scene ${scene.id}.`);
  const identity = useMemo(
    () => resolveCinemaIdentity(creativeDesign.pack.id, creativeDesign.settings),
    [creativeDesign.pack.id, creativeDesign.settings],
  );
  const beatFrames = useMemo(
    () =>
      resolveCinemaBeatFrames({
        beats: design.beats,
        narration: scene.narration,
        cues: sceneCaptions,
        durationInFrames,
      }),
    [design.beats, scene.narration, sceneCaptions, durationInFrames],
  );
  const energy = creativeDesign.settings.motionEnergy;
  const timeline = createBeatTimeline({
    beats: design.beats,
    frames: beatFrames,
    frame,
    durationInFrames,
    energy,
  });
  const mode = runtimeMode;
  const hero = resolveCinemaHero({ scene, design, assets: resolvedAssets, mode });
  const itemIcons = resolveCinemaItemIcons({ scene, assets: resolvedAssets, mode });
  const sequenceIcons = resolveCinemaItemIcons({ scene, assets: resolvedAssets, mode, forSequence: true });
  const subjects = resolveCinemaSubjectImages({ scene, assets: resolvedAssets, mode });
  const Composition = cinemaCompositionComponents[design.compositionId];
  const transition = transitionStyle(scene.transition, frame, durationInFrames, energy);
  return (
    <div
      data-cinema-composition={design.compositionId}
      data-cinema-identity={identity.packId}
      data-testid={`full-lesson-scene-${scene.order}`}
      style={{
        background: identity.colors.background,
        color: identity.colors.text,
        height: "100%",
        overflow: "hidden",
        position: "relative",
        width: "100%",
        ...(frameStyle ?? {}),
      }}
    >
      <StyleProofFontGate>
        <div
          style={{
            height: "100%",
            left: 0,
            opacity: transition.opacity,
            position: "absolute",
            top: 0,
            transform: transition.transform,
            width: "100%",
          }}
        >
          <CinemaBeatProvider timeline={timeline}>
            <Composition
              design={design}
              hero={hero}
              identity={identity}
              itemIcons={itemIcons}
              scene={scene}
              sequenceIcons={sequenceIcons}
              subjects={subjects}
            />
          </CinemaBeatProvider>
        </div>
      </StyleProofFontGate>
    </div>
  );
}
