import type { DiagramAnchor, DiagramLabel } from "@avlp/schemas";

export type DiagramCallout = Readonly<{
  anchor: DiagramAnchor;
  height: number;
  id: string;
  targetX: number;
  targetY: number;
  width: number;
  x: number;
  y: number;
}>;

export type DiagramCalloutPlan = Readonly<{
  callouts: readonly DiagramCallout[];
  collisionLabelIds: readonly string[];
}>;

const positions: Record<
  DiagramAnchor,
  Omit<DiagramCallout, "anchor" | "height" | "id" | "width">
> = {
  "top-left": { targetX: 600, targetY: 350, x: 90, y: 240 },
  top: { targetX: 960, targetY: 350, x: 740, y: 240 },
  "top-right": { targetX: 1320, targetY: 350, x: 1410, y: 240 },
  right: { targetX: 1450, targetY: 540, x: 1410, y: 480 },
  "bottom-right": { targetX: 1320, targetY: 740, x: 1410, y: 710 },
  bottom: { targetX: 960, targetY: 790, x: 740, y: 710 },
  "bottom-left": { targetX: 600, targetY: 740, x: 90, y: 710 },
  left: { targetX: 470, targetY: 540, x: 90, y: 480 },
  center: { targetX: 960, targetY: 540, x: 740, y: 480 },
};

const overlaps = (left: DiagramCallout, right: DiagramCallout): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

export function planDiagramCallouts(
  labels: readonly DiagramLabel[],
): DiagramCalloutPlan {
  const callouts = labels.map((label) =>
    Object.freeze({
      ...positions[label.anchor],
      anchor: label.anchor,
      height: 150,
      id: label.id,
      width: 420,
    }),
  );
  const collisions = new Set<string>();
  for (let left = 0; left < callouts.length; left += 1)
    for (let right = left + 1; right < callouts.length; right += 1)
      if (overlaps(callouts[left]!, callouts[right]!)) {
        collisions.add(callouts[left]!.id);
        collisions.add(callouts[right]!.id);
      }
  return Object.freeze({
    callouts: Object.freeze(callouts),
    collisionLabelIds: Object.freeze([...collisions]),
  });
}
