/**
 * ST-103 — every post-render review threshold, in one versioned module.
 *
 * Changing any value here changes which videos are delivered, so it must bump
 * `renderReviewVersion`. Each report records the version it was judged by, and
 * a stored report is never re-interpreted under newer thresholds.
 */
export const renderReviewVersion = "render-review-v1" as const;

export const renderReviewThresholds = Object.freeze({
  /** Streams: the existing rendered-duration rule (media.ts). */
  durationToleranceMs: 100,
  /** Black frames: `blackdetect` semantics. A pixel is black at or below
   * `pixelThreshold` of the luma range; a picture is black when at least
   * `pictureRatio` of its pixels are. A black run this long is an error. */
  black: Object.freeze({
    pixelThreshold: 0.05,
    pictureRatio: 0.98,
    minDurationMs: 1_000,
    /** Analysis size. Area-averaged luma at this size is compared per frame. */
    analysisWidth: 160,
    analysisHeight: 90,
  }),
  /** Missing narration: `silencedetect` at this floor, for at least this
   * long, overlapping a narration segment by at least `overlapMs`. */
  silence: Object.freeze({
    noiseFloorDb: -50,
    minDurationMs: 1_000,
    overlapMs: 1_000,
    /** With a bed, the floor rises to the bed's own ceiling under narration
     * (registered peak + ducked gain) plus this margin (ADR-012). */
    bedMarginDb: 1.5,
  }),
  /** Audio level: warnings only. */
  audio: Object.freeze({
    clippingPeakDbfs: -0.1,
    minIntegratedLufs: -20,
    maxIntegratedLufs: -12,
  }),
  /** Contact sheet: four private frames at these fractions of the duration. */
  contactSheet: Object.freeze({
    positions: Object.freeze([0.05, 0.35, 0.65, 0.95] as const),
    width: 480,
  }),
});
export type RenderReviewThresholds = typeof renderReviewThresholds;
