/**
 * ST-095 — the renderer's geometry.
 *
 * Everything that decides *where* something is drawn lives here, and nothing
 * here is reachable from a plan. A plan names a container and the runtime
 * reports a stable slot index; this module turns that pair into a rectangle.
 * That is the whole of the separation the story asks for: semantic parameters
 * cross the boundary, coordinates never do.
 *
 * All of it is pure arithmetic on the canvas constants, so the browser preview
 * and the server render lay out identically by construction rather than by
 * agreement.
 */

import { Easing, interpolate } from "remotion";
import { videoTheme, VIDEO_HEIGHT, VIDEO_WIDTH } from "@avlp/design-system/video-theme";

export type Rect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const demonstrationCanvas = Object.freeze({
  width: VIDEO_WIDTH,
  height: VIDEO_HEIGHT,
  fps: videoTheme.canvas.fps,
});

/**
 * The band reserved for captions, plus a margin.
 *
 * Explanatory objects are laid out strictly above this line. A token that
 * drifts behind a caption is not a cosmetic problem: it is the moment the
 * learner loses the thing the sentence is describing.
 */
export const demonstrationContentBottom =
  VIDEO_HEIGHT - videoTheme.safeAreas.caption.bottom - 120;

export const demonstrationContentTop = videoTheme.safeAreas.title.top;

export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
): Rect => Object.freeze({ x, y, width, height });

export const centerOf = (area: Rect): Readonly<{ x: number; y: number }> =>
  Object.freeze({ x: area.x + area.width / 2, y: area.y + area.height / 2 });

/**
 * A slot inside a holder, on a grid sized for the holder's capacity.
 *
 * The grid is derived from the capacity and the holder's aspect ratio, not
 * from how many objects happen to be present, so a container does not reflow
 * when something leaves it. Combined with the stable slot index the runtime
 * assigns, that is what keeps a token in one place for the whole clip.
 */
export function slotRect(
  holder: Rect,
  capacity: number,
  slot: number,
  options: Readonly<{ aspect: number; gap: number; padding: number }>,
): Rect {
  const safeCapacity = Math.max(1, capacity);
  const inner = rect(
    holder.x + options.padding,
    holder.y + options.padding,
    Math.max(1, holder.width - options.padding * 2),
    Math.max(1, holder.height - options.padding * 2),
  );
  // Columns chosen so the cells come out close to the requested aspect ratio.
  const columns = Math.min(
    safeCapacity,
    Math.max(
      1,
      Math.round(
        Math.sqrt((safeCapacity * inner.width) / (inner.height * options.aspect)),
      ),
    ),
  );
  const rows = Math.ceil(safeCapacity / columns);
  const cellWidth = (inner.width - options.gap * (columns - 1)) / columns;
  const cellHeight = (inner.height - options.gap * (rows - 1)) / rows;
  const index = Math.max(0, Math.min(slot, safeCapacity - 1));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return rect(
    inner.x + column * (cellWidth + options.gap),
    inner.y + row * (cellHeight + options.gap),
    cellWidth,
    cellHeight,
  );
}

/**
 * The eased position of an object travelling between two slots.
 *
 * The arc is deliberate and small: a straight line between two trays reads as
 * a teleport with interpolation, while a lifted path reads as something being
 * picked up and put down. It is restrained rather than springy, because a
 * bounce would suggest the money is doing something it is not.
 */
export function transitPoint(
  from: Rect,
  to: Rect,
  progress: number,
): Readonly<{ x: number; y: number; lift: number }> {
  const eased = interpolate(progress, [0, 1], [0, 1], {
    easing: Easing.bezier(...videoTheme.motion.enter.easing),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const start = centerOf(from);
  const end = centerOf(to);
  // A half-sine lift: zero at both ends, so the object lands flat in its slot.
  const lift = Math.sin(Math.PI * eased) * 90;
  return Object.freeze({
    x: start.x + (end.x - start.x) * eased,
    y: start.y + (end.y - start.y) * eased - lift,
    lift,
  });
}

/** Scene-level enter/exit fade, shared with the production scene runtime so a
 * demonstration scene begins and ends exactly as a standard one does. */
export function sceneOpacity(frame: number, durationInFrames: number): number {
  const enter = videoTheme.motion.enter.durationInFrames;
  const exit = videoTheme.motion.exit.durationInFrames;
  return interpolate(
    frame,
    [0, enter, Math.max(enter, durationInFrames - exit), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
}

/** A restrained emphasis: a slight lift and a ring, never a scale pulse that
 * would make text move while it is being read. */
export function emphasisRing(emphasis: number): Readonly<{
  offsetY: number;
  glow: number;
}> {
  return Object.freeze({
    offsetY: -8 * emphasis,
    glow: emphasis,
  });
}

/** Formats an integer minor amount as naira. Never rounds: the contract keeps
 * amounts in integer minor units precisely so this cannot drift. */
export function formatNaira(minor: number): string {
  const major = Math.trunc(minor / 100);
  return `₦${major.toLocaleString("en-NG")}`;
}
