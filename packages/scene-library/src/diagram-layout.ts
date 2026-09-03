import { videoTheme } from "@avlp/design-system/video-theme";
import type { DiagramAnchor, DiagramLabel } from "@avlp/schemas";
import { measureTextLayout } from "./layout.js";

export type DiagramRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type DiagramCallout = Readonly<{
  /** The author's semantic anchor, retained only as a placement preference. */
  anchor: DiagramAnchor;
  fontSize: number;
  height: number;
  id: string;
  targetX: number;
  targetY: number;
  /** Which margin the callout was placed in; drives leader-line geometry. */
  side: DiagramSide;
  width: number;
  x: number;
  y: number;
}>;

export type DiagramUnplacedCallout = Readonly<{
  id: string;
  reason: string;
}>;

export type DiagramCalloutPlan = Readonly<{
  callouts: readonly DiagramCallout[];
  /** Ids of labels that could not be placed inside the safe area. */
  collisionLabelIds: readonly string[];
  /** The (possibly narrowed) rectangle the diagram base occupies. */
  diagramRect: DiagramRect;
  unplaced: readonly DiagramUnplacedCallout[];
}>;

type DiagramSide = "left" | "right";

/** The diagram base rectangle used when callout pressure is low. */
export const DIAGRAM_BASE_RECT: DiagramRect = Object.freeze({
  height: 450,
  width: 980,
  x: 470,
  y: 350,
});

/** The narrowed diagram base rectangle used when two columns per side are needed. */
const DIAGRAM_NARROW_RECT: DiagramRect = Object.freeze({
  height: 450,
  width: 680,
  x: 620,
  y: 350,
});

const SAFE_BODY = Object.freeze({
  bottom: videoTheme.canvas.height - videoTheme.safeAreas.body.bottom,
  left: videoTheme.safeAreas.body.left,
  right: videoTheme.canvas.width - videoTheme.safeAreas.body.right,
  top: videoTheme.safeAreas.body.top,
});

const COLUMN_GAP = 12;
const STACK_GAP = 14;
const PER_COLUMN_TARGET = 6;
const CALLOUT_BORDER_WIDTH = videoTheme.lineWidths.emphasis;

/**
 * Keep planner geometry and rendered CSS in lockstep. `width` and `height`
 * include this padding and the callout border because the rendered element
 * uses `box-sizing: border-box`.
 */
export const diagramCalloutPadding = (fontSize: number): number =>
  Math.round(fontSize * 0.55);

/**
 * How the semantic anchor is reinterpreted as a placement *preference*. Callouts
 * are always placed in the left/right margins (they may never overlap the
 * diagram base), so only the horizontal side and a vertical bias survive:
 *
 * | anchor                                   | side               | vertical bias |
 * | ---------------------------------------- | ------------------ | ------------- |
 * | `left`, `top-left`, `bottom-left`        | left               | top / bottom  |
 * | `right`, `top-right`, `bottom-right`     | right              | top / bottom  |
 * | `top`, `bottom`                          | alternating*       | top / bottom  |
 * | `center`                                 | alternating*       | middle        |
 *
 * *`top`/`bottom`/`center` carry no horizontal intent, so the side is assigned
 * by declaration parity — deterministic, and balanced across the two margins.
 * `center` in particular no longer means "over the diagram"; that placement is
 * impossible under the non-overlap rule.
 */
const anchorSide = (anchor: DiagramAnchor, index: number): DiagramSide => {
  if (anchor === "left" || anchor === "top-left" || anchor === "bottom-left")
    return "left";
  if (anchor === "right" || anchor === "top-right" || anchor === "bottom-right")
    return "right";
  // `top`, `bottom`, `center` carry no horizontal preference: split evenly and
  // deterministically by declaration order.
  return index % 2 === 0 ? "left" : "right";
};

const anchorVerticalBias = (anchor: DiagramAnchor): number => {
  if (anchor.startsWith("top")) return 0;
  if (anchor.startsWith("bottom")) return 2;
  return 1;
};

const overlaps = (left: DiagramCallout, right: DiagramCallout): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

export { overlaps as calloutsOverlap };

type Tier = Readonly<{
  columnsPerSide: number;
  fontSize: number;
  width: number;
}>;

const tierFor = (count: number): Tier => {
  const columnsPerSide = Math.min(
    2,
    Math.max(1, Math.ceil(count / (2 * PER_COLUMN_TARGET))),
  );
  if (columnsPerSide === 1) return { columnsPerSide, fontSize: 24, width: 300 };
  return { columnsPerSide, fontSize: 18, width: 210 };
};

const measureCallout = (
  text: string,
  tier: Tier,
): Readonly<{ height: number; width: number }> => {
  const padding = diagramCalloutPadding(tier.fontSize);
  const innerWidth = tier.width - (padding + CALLOUT_BORDER_WIDTH) * 2;
  const measurement = measureTextLayout(text, {
    fontSize: tier.fontSize,
    lineHeight: videoTheme.typography.lineHeight,
    // The result is used only for deterministic line estimation; callout
    // geometry must include every line rather than silently truncating text.
    maxLines: Number.MAX_SAFE_INTEGER,
    width: innerWidth,
  });
  const lines = measurement.lineCount;
  const height = Math.ceil(
    lines * tier.fontSize * videoTheme.typography.lineHeight +
      (padding + CALLOUT_BORDER_WIDTH) * 2,
  );
  return { height, width: tier.width };
};

/**
 * Compute deterministic, non-overlapping callout placement around a diagram.
 *
 * Identical input always yields identical output: labels are processed in
 * declaration order, every sort carries the declaration index as a tie-breaker,
 * and no wall-clock, locale, or unordered-collection input is consulted.
 *
 * The semantic anchor on each label is treated as a placement *preference*; the
 * engine decides the pixels. Placement always stays inside `videoTheme`'s body
 * safe area, which also clears the lower-third avoidance band.
 */
export function planDiagramCallouts(
  labels: readonly DiagramLabel[],
  baseRect: DiagramRect = DIAGRAM_BASE_RECT,
): DiagramCalloutPlan {
  const tier = tierFor(labels.length);
  const diagramRect =
    tier.columnsPerSide === 1
      ? baseRect
      : {
          height: baseRect.height,
          width: DIAGRAM_NARROW_RECT.width,
          x: DIAGRAM_NARROW_RECT.x,
          y: baseRect.y,
        };

  const sized = labels.map((label, index) => ({
    ...measureCallout(label.text, tier),
    anchor: label.anchor,
    bias: anchorVerticalBias(label.anchor),
    fontSize: tier.fontSize,
    id: label.id,
    index,
    side: anchorSide(label.anchor, index),
  }));

  // Rebalance so the two sides differ by at most one, moving the
  // lowest-preference (latest-declared) items off the heavier side.
  const balance = (side: DiagramSide): void => {
    const other: DiagramSide = side === "left" ? "right" : "left";
    while (
      sized.filter((item) => item.side === side).length -
        sized.filter((item) => item.side === other).length >
      1
    ) {
      const movable = sized
        .filter((item) => item.side === side)
        .sort((a, b) => b.index - a.index)[0];
      if (movable === undefined) break;
      movable.side = other;
    }
  };
  balance("left");
  balance("right");

  const columnXs = (side: DiagramSide): readonly number[] => {
    if (side === "left") {
      const first = SAFE_BODY.left;
      return tier.columnsPerSide === 1
        ? [first]
        : [first, first + tier.width + COLUMN_GAP];
    }
    const outer = SAFE_BODY.right - tier.width;
    return tier.columnsPerSide === 1
      ? [outer]
      : [outer, outer - tier.width - COLUMN_GAP];
  };

  const placed: DiagramCallout[] = [];
  const unplaced: DiagramUnplacedCallout[] = [];

  for (const side of ["left", "right"] as const) {
    const items = sized
      .filter((item) => item.side === side)
      .sort((a, b) => a.bias - b.bias || a.index - b.index);
    const xs = columnXs(side);
    const perColumn = Math.ceil(items.length / xs.length);
    items.forEach((item, position) => {
      const columnIndex = Math.min(
        xs.length - 1,
        Math.floor(position / perColumn),
      );
      const columnItems = items.slice(
        columnIndex * perColumn,
        columnIndex * perColumn + perColumn,
      );
      const withinColumn = position - columnIndex * perColumn;
      const consumed = columnItems
        .slice(0, withinColumn)
        .reduce((total, entry) => total + entry.height + STACK_GAP, 0);
      const x = xs[columnIndex]!;
      const y = SAFE_BODY.top + consumed;
      if (y + item.height > SAFE_BODY.bottom) {
        unplaced.push({
          id: item.id,
          reason: `No room inside the diagram safe area for ${items.length} label${
            items.length === 1 ? "" : "s"
          } on the ${side} side; reduce the label count or shorten the label text.`,
        });
        return;
      }
      const centerY = y + item.height / 2;
      const targetX =
        side === "left" ? diagramRect.x : diagramRect.x + diagramRect.width;
      const targetY = Math.min(
        diagramRect.y + diagramRect.height,
        Math.max(diagramRect.y, centerY),
      );
      placed.push(
        Object.freeze({
          anchor: item.anchor,
          fontSize: item.fontSize,
          height: item.height,
          id: item.id,
          side,
          targetX,
          targetY,
          width: item.width,
          x,
          y,
        }),
      );
    });
  }

  const callouts = placed
    .slice()
    .sort(
      (a, b) =>
        sized.findIndex((item) => item.id === a.id) -
        sized.findIndex((item) => item.id === b.id),
    );

  return Object.freeze({
    callouts: Object.freeze(callouts),
    collisionLabelIds: Object.freeze(unplaced.map((entry) => entry.id)),
    diagramRect: Object.freeze(diagramRect),
    unplaced: Object.freeze(unplaced),
  });
}
