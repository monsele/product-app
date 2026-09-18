/**
 * ST-094 — proof motion model.
 *
 * Every value here is a pure function of `(frame, durationSeconds, motion)`.
 * There is no wall-clock time, no unseeded randomness, no mutable counter and
 * no dependence on whether earlier frames were rendered, so evaluating frame N
 * directly, after a backward seek, or out of order all agree (CR-04).
 *
 * Interval policy (CR-05): entrance and exit are authored constants. A longer
 * scene extends the explanation interval only — it never slows the entrance or
 * stretches the exit — and the hold is the tail of the explanation during which
 * the composition is fully settled and every required element is readable.
 */

import { Easing, interpolate } from "remotion";
import {
  styleProofCanvas,
  type StyleProofTokens,
} from "@avlp/design-system/style-proof-tokens";
import type { StyleProofMotionParams } from "@avlp/schemas/style-proof";

export const styleProofFps = styleProofCanvas.fps;

/** The authored default. Treatments are tested at shorter and longer scenes. */
export const styleProofDefaultMotion: StyleProofMotionParams = Object.freeze({
  entranceFrames: 20,
  exitFrames: 12,
  minimumHoldFrames: 45,
});

export type StyleProofIntervals = Readonly<{
  durationInFrames: number;
  entranceEndFrame: number;
  /** First frame of the explanation interval (immediately after entrance). */
  explainStartFrame: number;
  /** First frame at which everything is settled and must stay readable. */
  holdStartFrame: number;
  exitStartFrame: number;
  /** False when the scene is too short to satisfy `minimumHoldFrames`. */
  holdSatisfied: boolean;
  holdFrames: number;
}>;

export function styleProofSecondsToFrames(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds * styleProofFps));
}

/**
 * Intervals are always ordered `0 <= entranceEnd <= holdStart <= exitStart <=
 * duration`. A scene too short to carry the required hold still produces a
 * valid, ordered set of intervals but reports `holdSatisfied: false`, which the
 * validator turns into an `invalid_motion_interval` issue rather than silently
 * shortening reading time.
 */
export function getStyleProofIntervals(
  durationSeconds: number,
  motion: StyleProofMotionParams,
): StyleProofIntervals {
  const durationInFrames = styleProofSecondsToFrames(durationSeconds);
  const entranceEndFrame = Math.min(motion.entranceFrames, durationInFrames);
  const exitStartFrame = Math.max(
    entranceEndFrame,
    durationInFrames - motion.exitFrames,
  );
  // The explanation runs from the end of the entrance to the start of the exit.
  // The hold is its tail: the last `minimumHoldFrames` of that window, or the
  // whole window when the scene cannot afford the full requirement.
  const explainFrames = exitStartFrame - entranceEndFrame;
  const holdFrames = Math.min(explainFrames, motion.minimumHoldFrames);
  return Object.freeze({
    durationInFrames,
    entranceEndFrame,
    explainStartFrame: entranceEndFrame,
    exitStartFrame,
    holdStartFrame: exitStartFrame - holdFrames,
    holdFrames,
    holdSatisfied: explainFrames >= motion.minimumHoldFrames,
  });
}

/** Normalised 0..1 entrance progress at `frame`. */
export function entranceProgress(
  frame: number,
  intervals: StyleProofIntervals,
  pack: StyleProofTokens,
): number {
  if (intervals.entranceEndFrame <= 0) return 1;
  return interpolate(
    Math.max(0, frame),
    [0, intervals.entranceEndFrame],
    [0, 1],
    {
      easing: Easing.bezier(...pack.easing.entrance),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
}

/** Normalised 1..0 exit progress at `frame` (1 while the scene is present). */
export function exitProgress(
  frame: number,
  intervals: StyleProofIntervals,
  pack: StyleProofTokens,
): number {
  if (intervals.exitStartFrame >= intervals.durationInFrames) return 1;
  return interpolate(
    Math.max(0, frame),
    [intervals.exitStartFrame, intervals.durationInFrames],
    [1, 0],
    {
      easing: Easing.bezier(...pack.easing.exit),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
}

/**
 * Staggered entrance progress for the `index`-th of `count` elements. The whole
 * stagger still completes by `entranceEndFrame`, so adding elements never eats
 * into the hold.
 */
export function staggeredEntrance(
  frame: number,
  intervals: StyleProofIntervals,
  pack: StyleProofTokens,
  index: number,
  count: number,
): number {
  if (count <= 1) return entranceProgress(frame, intervals, pack);
  const span = intervals.entranceEndFrame;
  const slot = span / (count + 1);
  const start = slot * index;
  const end = start + slot * 2;
  return interpolate(Math.max(0, frame), [start, Math.max(start + 1, end)], [0, 1], {
    easing: Easing.bezier(...pack.easing.entrance),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * Essential's signature: a single-axis clip mask that uncovers content and then
 * stops. Returns the CSS `inset()` a treatment applies; at progress 1 the inset
 * is exactly zero, so the composition is completely static for the whole hold.
 */
export function maskedRevealInset(
  progress: number,
  direction: "left" | "up",
): string {
  const remaining = Math.max(0, Math.min(100, (1 - progress) * 100));
  return direction === "left"
    ? `inset(0 ${remaining}% 0 0)`
    : `inset(${remaining}% 0 0 0)`;
}

/**
 * Editorial's signature: the evidence image drifts slowly and continuously
 * across its own frame for the whole scene. The drift is bounded to a few
 * percent of the frame so it never moves content out of its container, and it
 * is applied only to imagery, never to text.
 */
export function editorialImagePush(
  frame: number,
  intervals: StyleProofIntervals,
  axis: "x" | "y",
): Readonly<{ scale: number; translate: number }> {
  const progress = interpolate(
    Math.max(0, frame),
    [0, Math.max(1, intervals.durationInFrames)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return Object.freeze({
    // A 12% zoom across the scene, plus 70px of travel. Measured against the
    // other two packs' entrances, an earlier 3.5%/22px version moved so little
    // that a one-second excerpt was effectively frozen — a motion signature a
    // reviewer cannot see is not a signature. The image starts at 1.05 scale
    // inside an overflow-hidden frame, so the drift never uncovers an edge.
    scale: 1.05 + progress * 0.12,
    translate: (axis === "x" ? -1 : 1) * progress * 70,
  });
}

/**
 * Editorial's annotation rules draw out from the image during the explanation
 * interval and are fully drawn before the hold begins.
 */
export function annotationDraw(
  frame: number,
  intervals: StyleProofIntervals,
  pack: StyleProofTokens,
  index: number,
  count: number,
): number {
  const start = intervals.explainStartFrame;
  const end = Math.max(start + 1, intervals.holdStartFrame);
  const slot = (end - start) / Math.max(1, count);
  return interpolate(
    Math.max(0, frame),
    [start + slot * index, start + slot * (index + 1)],
    [0, 1],
    {
      easing: Easing.bezier(...pack.easing.emphasis),
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
}

/**
 * Everyday's signature: a whole illustrated object travels a short distance and
 * settles with one damped overshoot. Frame-driven rather than spring-stateful,
 * so a backward seek reproduces the same position exactly.
 */
export function objectSettle(
  frame: number,
  intervals: StyleProofIntervals,
  index: number,
  count: number,
  distance: number,
): Readonly<{ offset: number; rotation: number }> {
  const span = Math.max(1, intervals.entranceEndFrame);
  const slot = span / (count + 1);
  const local = Math.max(0, frame) - slot * index;
  const settleFrames = Math.max(1, span - slot * index);
  if (local <= 0) return Object.freeze({ offset: distance, rotation: -3 });
  if (local >= settleFrames) return Object.freeze({ offset: 0, rotation: 0 });
  const t = local / settleFrames;
  // Critically-damped-looking single overshoot: exponential decay times a
  // half-period cosine. Deterministic and closed-form at any frame.
  const decay = Math.exp(-4.2 * t);
  const oscillation = Math.cos(t * Math.PI * 1.35);
  return Object.freeze({
    offset: distance * decay * oscillation,
    rotation: -3 * decay * oscillation,
  });
}

/**
 * Essential's sequential comparison emphasis: exactly one difference is
 * emphasised at a time across the explanation interval.
 */
export function sequentialEmphasisIndex(
  frame: number,
  intervals: StyleProofIntervals,
  count: number,
): number {
  if (count <= 0) return -1;
  const start = intervals.explainStartFrame;
  const end = Math.max(start + 1, intervals.exitStartFrame);
  const slot = (end - start) / count;
  const index = Math.floor((Math.max(0, frame) - start) / slot);
  return Math.max(0, Math.min(count - 1, index));
}
