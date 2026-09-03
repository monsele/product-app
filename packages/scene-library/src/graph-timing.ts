import { videoTheme } from "@avlp/design-system/video-theme";
import { Easing, interpolate } from "remotion";
import { getSceneFrameTiming } from "./timing.js";

/**
 * Reveal timing for graph scenes. Reveal frames derive from
 * `getSceneFrameTiming` and the scene's narration: the narration is split into
 * sentences, each reveal step is anchored to the sentence it falls in and
 * blended with an even spacing across the reveal window, and the window ends
 * before the scene-wide exit fade so the last reveal still animates in. No
 * per-node delay is chosen at authoring time, and the whole computation is a
 * pure function of its inputs, so preview and render agree.
 */

export type GraphRevealTiming = Readonly<{
  /** Start frame for each reveal step, strictly ascending. */
  starts: readonly number[];
}>;

const SENTENCE_PATTERN = /[^.!?]+[.!?]*/g;

/**
 * Start fraction (0..1) for each of `count` reveal steps.
 *
 * Each step is anchored to the narration sentence it belongs to — step `i`
 * maps to sentence `floor(i * sentences / count)` and inherits that sentence's
 * cumulative-character start fraction — then blended equally with an even
 * `i / count` spacing. The even term keeps the fraction sequence strictly
 * increasing while the sentence term keeps the reveal tracking what the
 * narration is actually saying. The result is always < 1, so the final step
 * still begins before the scene-wide exit fade. (After rounding to whole
 * frames, adjacent steps can coincide only when the scene is far too short
 * for its node count — a case `scene_duration_out_of_range` already flags.)
 */
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

  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  const sentenceStart: number[] = [];
  let consumed = 0;
  for (const sentence of sentences) {
    sentenceStart.push(total === 0 ? 0 : consumed / total);
    consumed += sentence.length;
  }

  return Array.from({ length: count }, (_unused, index) => {
    const sentenceIndex = Math.min(
      sentences.length - 1,
      Math.floor((index * sentences.length) / count),
    );
    const evenly = index / count;
    return 0.5 * evenly + 0.5 * sentenceStart[sentenceIndex]!;
  });
}

export function getGraphRevealTiming(
  durationSeconds: number,
  revealCount: number,
  narration: string,
): GraphRevealTiming {
  if (revealCount <= 0)
    return Object.freeze({ starts: Object.freeze([]) });
  const timing = getSceneFrameTiming(durationSeconds);
  const windowStart = timing.enterEndFrame;
  // Leave room for the last reveal to finish animating before the exit fade.
  const windowEnd = Math.max(
    windowStart,
    timing.exitStartFrame - videoTheme.motion.reveal.durationInFrames,
  );
  const span = windowEnd - windowStart;
  const fractions = narrationRevealFractions(narration, revealCount);
  const starts = fractions.map((fraction) =>
    Math.round(windowStart + fraction * span),
  );
  return Object.freeze({ starts: Object.freeze(starts) });
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
