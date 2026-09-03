import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate } from "remotion";
import { getSceneFrameTiming } from "./timing.js";

/**
 * Reveal timing for graph scenes. Reveal frames derive from
 * `getSceneFrameTiming` and the scene's narration: the narration is split into
 * sentences, the sentences are distributed across the reveal steps, and each
 * step starts at the frame proportional to how far through the narration text
 * that step falls. No per-node delay is chosen at authoring time, and the whole
 * computation is a pure function of its inputs, so preview and render agree.
 */

export type GraphRevealTiming = Readonly<{
  /** Index of the node currently being narrated, or -1 before the first. */
  activeIndex: number;
  /** Start frame for each reveal step, ascending. */
  starts: readonly number[];
}>;

const SENTENCE_PATTERN = /[^.!?]+[.!?]*/g;

/** Cumulative text-length fraction at the start of each of `count` buckets. */
export function narrationRevealFractions(
  narration: string,
  count: number,
): readonly number[] {
  if (count <= 0) return [];
  const sentences = (narration.match(SENTENCE_PATTERN) ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
  if (sentences.length === 0)
    return Array.from({ length: count }, (_unused, index) => index / count);

  const perBucket = Math.ceil(sentences.length / count);
  const total = sentences.reduce(
    (sum, sentence) => sum + sentence.length,
    0,
  );
  const fractions: number[] = [];
  let consumed = 0;
  for (let bucket = 0; bucket < count; bucket += 1) {
    fractions.push(total === 0 ? bucket / count : consumed / total);
    const slice = sentences.slice(
      bucket * perBucket,
      bucket * perBucket + perBucket,
    );
    consumed += slice.reduce((sum, sentence) => sum + sentence.length, 0);
  }
  return fractions;
}

export function getGraphRevealTiming(
  durationSeconds: number,
  revealCount: number,
  narration: string,
): GraphRevealTiming {
  if (revealCount <= 0)
    return Object.freeze({ activeIndex: -1, starts: Object.freeze([]) });
  const timing = getSceneFrameTiming(durationSeconds);
  const windowStart = timing.enterEndFrame;
  const windowEnd = Math.max(windowStart, timing.exitStartFrame);
  const span = windowEnd - windowStart;
  const fractions = narrationRevealFractions(narration, revealCount);
  const starts = fractions.map((fraction) =>
    Math.round(windowStart + fraction * span),
  );
  return Object.freeze({ activeIndex: -1, starts: Object.freeze(starts) });
}

/** Opacity 0..1 for a single reveal step at `frame`, with the shared exit fade. */
export function graphRevealOpacity(
  frame: number,
  durationSeconds: number,
  start: number,
): number {
  const timing = getSceneFrameTiming(durationSeconds);
  const current = Math.max(0, Math.floor(frame));
  const entered = interpolate(
    current,
    [start, start + videoTheme.motion.reveal.durationInFrames],
    [0, 1],
    {
      easing: Easing.bezier(...videoTheme.motion.reveal.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const exit = interpolate(
    current,
    [timing.exitStartFrame, timing.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...videoTheme.motion.exit.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return entered * exit;
}

/** Emphasis 0..1 for the node whose narration segment is currently playing. */
export function graphEmphasis(
  frame: number,
  start: number,
  end: number,
): number {
  const current = Math.max(0, Math.floor(frame));
  const rampIn = interpolate(
    current,
    [start, start + videoTheme.motion.emphasize.durationInFrames],
    [0, 1],
    {
      easing: Easing.bezier(...videoTheme.motion.emphasize.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const rampOut = interpolate(
    current,
    [end, end + videoTheme.motion.emphasize.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...videoTheme.motion.emphasize.easing),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  return Math.min(rampIn, rampOut);
}

/** Index of the last reveal step whose start frame is at or before `frame`. */
export function activeRevealIndex(
  frame: number,
  starts: readonly number[],
): number {
  const current = Math.max(0, Math.floor(frame));
  let active = -1;
  starts.forEach((start, index) => {
    if (current >= start) active = index;
  });
  return active;
}
