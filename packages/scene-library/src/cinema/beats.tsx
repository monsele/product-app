/**
 * ST-111 — narration-led motion for v2 compositions.
 *
 * Beats are resolved to scene-relative frames once per scene by
 * `resolveCinemaBeatFrames` (a pure function of the pinned captions, the
 * narration and the duration). Every element's state is then a pure function
 * of the current frame, so seeking to a frame shows exactly what playing to
 * it would. An element with no beat is simply present from the establish
 * frame: motion adds emphasis, it never hides validated content.
 */
import {
  cinemaBeatRevealFrames,
  cinemaEstablishFrames,
  type CinemaBeat,
} from "@avlp/schemas";
import { Easing, interpolate } from "remotion";
import { createContext, useContext, type JSX, type ReactNode } from "react";

export type CinemaMotionEnergy = "calm" | "balanced" | "lively";

export type CinemaBeatTimeline = Readonly<{
  frame: number;
  durationInFrames: number;
  energy: CinemaMotionEnergy;
  /** Target → earliest resolved start frame. */
  starts: ReadonlyMap<string, number>;
  /** Target → motion family of its first beat. */
  motions: ReadonlyMap<string, CinemaBeat["motion"]>;
}>;

export function createBeatTimeline(
  input: Readonly<{
    beats: readonly CinemaBeat[];
    frames: readonly number[];
    frame: number;
    durationInFrames: number;
    energy: CinemaMotionEnergy;
  }>,
): CinemaBeatTimeline {
  const starts = new Map<string, number>();
  const motions = new Map<string, CinemaBeat["motion"]>();
  input.beats.forEach((beat, index) => {
    const start = input.frames[index] ?? cinemaEstablishFrames;
    const previous = starts.get(beat.target);
    if (previous === undefined || start < previous) {
      starts.set(beat.target, start);
      motions.set(beat.target, beat.motion);
    }
  });
  return Object.freeze({
    frame: input.frame,
    durationInFrames: input.durationInFrames,
    energy: input.energy,
    starts,
    motions,
  });
}

const BeatContext = createContext<CinemaBeatTimeline | null>(null);

export function CinemaBeatProvider({
  children,
  timeline,
}: Readonly<{ children: ReactNode; timeline: CinemaBeatTimeline }>): JSX.Element {
  return <BeatContext.Provider value={timeline}>{children}</BeatContext.Provider>;
}

function revealFrames(energy: CinemaMotionEnergy): number {
  return energy === "calm"
    ? cinemaBeatRevealFrames + 6
    : energy === "lively"
      ? cinemaBeatRevealFrames - 4
      : cinemaBeatRevealFrames;
}

const ease = Easing.bezier(0.22, 1, 0.36, 1);

export type CinemaBeats = Readonly<{
  frame: number;
  durationInFrames: number;
  /** When a target starts; unanchored targets start at establish. */
  startOf: (target: string) => number;
  /** Whether the plan anchors this target to the narration. */
  has: (target: string) => boolean;
  /** 0 → 1 arrival progress of a target. */
  reveal: (target: string) => number;
  /** 0 → 1 progress of a relationship link drawing between items. */
  link: (index: number) => number;
  /** 0 → 1 progress of an arrival that starts at `start`. */
  progressFrom: (start: number) => number;
  /** 0 → 1 emphasis progress (highlight drawing on). */
  emphasis: (target?: string) => number;
  /** 1-based index of the item currently being discussed, or 0. */
  activeItem: (count: number) => number;
  /** 0 → 1 progress of the scene's slow picture drift. */
  drift: number;
}>;

export function useCinemaBeats(): CinemaBeats {
  const timeline = useContext(BeatContext);
  if (timeline === null)
    throw new Error("A cinema composition must render inside CinemaBeatProvider.");
  const { frame, starts, energy } = timeline;
  const duration = revealFrames(energy);
  const startOf = (target: string) => starts.get(target) ?? cinemaEstablishFrames;
  const progress = (start: number, length = duration) =>
    interpolate(frame, [start, start + length], [0, 1], {
      easing: ease,
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  return {
    frame,
    durationInFrames: timeline.durationInFrames,
    startOf,
    has: (target) => starts.has(target),
    reveal: (target) => progress(startOf(target)),
    link: (index) => {
      const explicit = starts.get(`link-${index}`);
      const next = starts.get(`item-${index + 1}`);
      const start =
        explicit ?? (next === undefined ? cinemaEstablishFrames : Math.max(cinemaEstablishFrames, next - 8));
      return progress(start, duration + 6);
    },
    progressFrom: (start) => progress(start),
    emphasis: (target = "emphasis") => {
      const start = starts.get(target);
      return start === undefined ? 1 : progress(start, duration + 4);
    },
    activeItem: (count) => {
      let active = 0;
      let latest = -1;
      for (let index = 1; index <= count; index += 1) {
        const start = starts.get(`item-${index}`);
        if (start !== undefined && start <= frame && start >= latest) {
          latest = start;
          active = index;
        }
      }
      return active;
    },
    drift: interpolate(frame, [0, Math.max(1, timeline.durationInFrames)], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  };
}

/** Standard arrival styling: fade with a short directional settle. */
export function arrival(
  progress: number,
  direction: "up" | "left" | "right" | "none" = "up",
  distance = 28,
): Readonly<{ opacity: number; transform: string }> {
  const offset = (1 - progress) * distance;
  const transform =
    direction === "up"
      ? `translateY(${offset}px)`
      : direction === "left"
        ? `translateX(${-offset}px)`
        : direction === "right"
          ? `translateX(${offset}px)`
          : "none";
  return { opacity: progress, transform };
}
