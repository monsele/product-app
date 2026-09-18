/**
 * ST-094 — treatment-aware proof validation.
 *
 * Two layers, deliberately:
 *
 * 1. The fast checks in this module run anywhere (Node, the browser, a test)
 *    and cover declared content limits, asset slots and motion intervals.
 * 2. Actual wrapped-text and container measurement needs a browser with the
 *    pinned fonts loaded, so it lives in the Playwright preflight
 *    (`style-proof-layout.test.ts`) and keys off the `data-proof-*` attributes
 *    the treatments emit. `measureText()` cannot run in the API's Node context,
 *    so a single estimate here would be a false assurance, not a shortcut.
 *
 * An overfull treatment is reported with the offending field. Nothing here
 * shrinks text, drops a comparison point, crops an evidence label or rewrites
 * narration to make a layout fit.
 */

import type {
  StyleProofIssue,
  StyleProofMotionParams,
} from "@avlp/schemas/style-proof";
import { styleProofCaptionRegion } from "@avlp/design-system/style-proof-tokens";
import { getStyleProofIntervals } from "./motion.js";
import type { ResolvedStyleProofScene } from "./resolver.js";

/**
 * Attribute contract between the treatments and the browser preflight.
 *
 * - `data-proof-fit`: the element must contain its own content with no
 *   scrollable overflow. Its value is the field path reported on failure.
 * - `data-proof-content`: the element carries required readable content and
 *   must not intersect the caption exclusion region during the hold.
 * - `data-proof-region`: names the structural region, used by the contact sheet
 *   and the composition-distinction checks.
 */
export const styleProofFitAttribute = "data-proof-fit" as const;
export const styleProofContentAttribute = "data-proof-content" as const;
export const styleProofRegionAttribute = "data-proof-region" as const;

/**
 * Canvas height below the caption region's top edge. A treatment that runs its
 * imagery to the canvas edge reserves this band so its readable text cannot
 * end up behind a caption.
 */
export const styleProofCaptionReserve = 1080 - styleProofCaptionRegion.top;

/** The rectangle no required readable content may intersect. */
export const styleProofCaptionExclusion = Object.freeze({
  bottom: 1080,
  left: styleProofCaptionRegion.left,
  right: 1920 - styleProofCaptionRegion.right,
  top: styleProofCaptionRegion.top,
});

const issue = (
  code: StyleProofIssue["code"],
  sceneId: string,
  fieldPath: string,
  message: string,
  suggestedCorrection: string,
): StyleProofIssue =>
  Object.freeze({ code, fieldPath, message, sceneId, suggestedCorrection });

function readPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        typeof current === "object" && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

/**
 * Checks one resolved scene against its treatment's declared limits and the
 * motion contract. Returns every issue found rather than the first.
 */
export function validateStyleProofScene(
  resolved: ResolvedStyleProofScene,
  motion: StyleProofMotionParams,
): readonly StyleProofIssue[] {
  const issues: StyleProofIssue[] = [];
  const { scene, treatment } = resolved;

  for (const [path, limit] of Object.entries(treatment.limits.textLimits)) {
    if (path.endsWith(".item")) continue;
    const value = readPath(scene, path);
    if (typeof value !== "string") continue;
    if (value.length > limit)
      issues.push(
        issue(
          "text_overflow",
          scene.id,
          path,
          `${path} is ${value.length} characters; treatment ${treatment.id} lays out at most ${limit}.`,
          `Shorten this field to ${limit} characters, or select a treatment with more room. The proof does not shrink type below its authored size or truncate the text.`,
        ),
      );
  }

  for (const [path, limit] of Object.entries(treatment.limits.itemLimits)) {
    const value = readPath(scene, path);
    if (!Array.isArray(value)) continue;
    if (value.length > limit)
      issues.push(
        issue(
          "text_overflow",
          scene.id,
          path,
          `${path} has ${value.length} items; treatment ${treatment.id} lays out at most ${limit}.`,
          `Reduce to ${limit} items, or select a treatment that presents more. The proof never silently drops a comparison point to make a layout fit.`,
        ),
      );
    const itemLimit = treatment.limits.textLimits[`${path}.item`];
    if (itemLimit === undefined) continue;
    for (const [index, item] of value.entries())
      if (typeof item === "string" && item.length > itemLimit)
        issues.push(
          issue(
            "text_overflow",
            scene.id,
            `${path}.${index}`,
            `${path}[${index}] is ${item.length} characters; treatment ${treatment.id} lays out at most ${itemLimit}.`,
            `Shorten this item to ${itemLimit} characters or select a treatment with more room.`,
          ),
        );
  }

  const intervals = getStyleProofIntervals(scene.durationSeconds, motion);
  if (!intervals.holdSatisfied)
    issues.push(
      issue(
        "invalid_motion_interval",
        scene.id,
        "durationSeconds",
        `A ${scene.durationSeconds}s scene leaves ${intervals.holdFrames} settled frames, below the required ${motion.minimumHoldFrames}.`,
        `Lengthen the scene to at least ${Math.ceil((motion.entranceFrames + motion.exitFrames + motion.minimumHoldFrames) / 30)}s, or reduce the entrance/exit. Narration is never accelerated to create reading time.`,
      ),
    );
  if (
    !(
      0 <= intervals.entranceEndFrame &&
      intervals.entranceEndFrame <= intervals.holdStartFrame &&
      intervals.holdStartFrame <= intervals.exitStartFrame &&
      intervals.exitStartFrame <= intervals.durationInFrames
    )
  )
    issues.push(
      issue(
        "invalid_motion_interval",
        scene.id,
        "motion",
        "Entrance, hold and exit intervals are not in order for this duration.",
        "Reduce entranceFrames or exitFrames so the intervals remain ordered within the scene.",
      ),
    );

  return Object.freeze(issues);
}

export function validateStyleProofScenes(
  scenes: readonly ResolvedStyleProofScene[],
  motion: StyleProofMotionParams,
): readonly StyleProofIssue[] {
  return Object.freeze(
    scenes.flatMap((scene) => validateStyleProofScene(scene, motion)),
  );
}

/**
 * Caption cues must stay inside the shared exclusion region and inside their
 * scene's frame range. Checked here so a caption can never be pushed off the
 * canvas by a style's own geometry.
 */
export function validateStyleProofCaptions(
  captions: readonly Readonly<{
    endFrame: number;
    sceneId: string;
    startFrame: number;
  }>[],
  timeline: readonly Readonly<{
    endFrameExclusive: number;
    sceneId: string;
    startFrame: number;
  }>[],
): readonly StyleProofIssue[] {
  const bySceneId = new Map(timeline.map((segment) => [segment.sceneId, segment]));
  const issues: StyleProofIssue[] = [];
  for (const cue of captions) {
    const segment = bySceneId.get(cue.sceneId);
    if (segment === undefined) continue;
    if (cue.startFrame < segment.startFrame || cue.endFrame > segment.endFrameExclusive)
      issues.push(
        issue(
          // A timing fault, not a geometric one: `caption_collision` is
          // reserved for readable content overlapping the exclusion region,
          // which the browser preflight measures.
          "invalid_caption_timing",
          cue.sceneId,
          "captions",
          `A caption cue runs from frame ${cue.startFrame} to ${cue.endFrame}, outside its scene's ${segment.startFrame}-${segment.endFrameExclusive} range.`,
          "Re-cut the cue inside its scene. Caption timing follows narration and is identical across styles.",
        ),
      );
  }
  return Object.freeze(issues);
}
