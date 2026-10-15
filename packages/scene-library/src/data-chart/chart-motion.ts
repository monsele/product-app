/**
 * ST-114 — chart motion keyed to narration beats.
 *
 * A mark (a bar, or the line segment arriving at a point) grows over a fixed
 * window that *ends* on its category's beat frame, so the value is complete
 * exactly when the narration reaches it (AC5). Everything is a pure function
 * of the frame, so seeking shows exactly what playing does.
 */
import {
  authoredCinemaBeats,
  resolveCinemaBeatFrames,
  type CinemaCaptionCue,
  type SceneSpec,
} from "@avlp/schemas";

/** Frames a mark takes to reach its value. */
export const dataChartGrowFrames = 18;
/** Frames the highlight takes to draw on after its beat. */
export const dataChartHighlightFrames = 14;

/** Cubic ease-out: decelerates into the value without arriving early, so a
 * mark is still visibly short of its value two frames before its beat. */
const ease = (t: number): number => 1 - (1 - t) ** 3;

/** 0 → 1 growth of a mark whose value is reached at `completeFrame`. */
export function dataChartMarkProgress(
  frame: number,
  completeFrame: number,
  growFrames = dataChartGrowFrames,
): number {
  if (frame >= completeFrame) return 1;
  const start = Math.max(0, completeFrame - growFrames);
  if (frame <= start) return 0;
  return ease((frame - start) / (completeFrame - start));
}

/** 0 → 1 highlight emphasis that starts on its beat. */
export function dataChartHighlightProgress(frame: number, beatFrame: number): number {
  if (frame <= beatFrame) return 0;
  if (frame >= beatFrame + dataChartHighlightFrames) return 1;
  return ease((frame - beatFrame) / dataChartHighlightFrames);
}

export type DataChartBeatFrames = Readonly<{
  /** Frame each category's mark is complete, in category order. */
  items: readonly number[];
  /** Frame the highlight starts. */
  highlight: number;
}>;

/**
 * Beat frames from a beat lookup: `startOf(target)` is the composition's
 * resolved start frame for a target (`item-N`, `emphasis`). The highlight
 * never lands before the highlighted category itself.
 */
export function dataChartBeatFrames(
  categoryCount: number,
  highlightIndex: number | undefined,
  startOf: (target: string) => number,
  has: (target: string) => boolean,
): DataChartBeatFrames {
  const items = Array.from({ length: categoryCount }, (_, index) =>
    startOf(`item-${index + 1}`),
  );
  const own = highlightIndex === undefined ? 0 : (items[highlightIndex] ?? 0);
  const emphasis = has("emphasis") ? startOf("emphasis") : (items.at(-1) ?? 0);
  return Object.freeze({ items: Object.freeze(items), highlight: Math.max(own, emphasis) });
}

/**
 * The v1 renderer has no saved visual plan, so it uses the authored chart
 * beats. With the scene's measured caption cues they resolve against the
 * narration as spoken (ST-111), exactly as a v2 scene does; without cues
 * (a lesson with no generated audio yet) they fall back to the narration
 * estimate.
 */
export function authoredDataChartBeatFrames(
  scene: SceneSpec,
  durationInFrames: number,
  highlightIndex: number | undefined,
  cues: readonly CinemaCaptionCue[] = [],
): DataChartBeatFrames {
  const beats = authoredCinemaBeats("hero-chart", scene);
  const frames = resolveCinemaBeatFrames({
    beats,
    narration: scene.narration,
    cues,
    durationInFrames,
  });
  const starts = new Map<string, number>();
  beats.forEach((beat, index) => {
    const frame = frames[index];
    if (frame !== undefined && !starts.has(beat.target)) starts.set(beat.target, frame);
  });
  return dataChartBeatFrames(
    scene.template === "data-chart" ? scene.visual.rowIndexes.length : 0,
    highlightIndex,
    (target) => starts.get(target) ?? 0,
    (target) => starts.has(target),
  );
}
