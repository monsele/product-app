import { videoTheme } from "@avlp/design-system/video-theme";
import type { DiagramAnchor, DiagramLabel } from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import {
  calloutsOverlap,
  diagramCalloutPadding,
  DIAGRAM_BASE_RECT,
  planDiagramCallouts,
} from "./diagram-layout.js";

const body = {
  bottom: videoTheme.canvas.height - videoTheme.safeAreas.body.bottom,
  left: videoTheme.safeAreas.body.left,
  right: videoTheme.canvas.width - videoTheme.safeAreas.body.right,
  top: videoTheme.safeAreas.body.top,
};

const labels = (
  count: number,
  text: (index: number) => string = (index) => `Structure ${index + 1}`,
  anchor: DiagramAnchor = "left",
): DiagramLabel[] =>
  Array.from({ length: count }, (_unused, index) => ({
    anchor,
    id: `part-${index + 1}`,
    text: text(index),
  }));

const expectNoOverlap = (
  plan: ReturnType<typeof planDiagramCallouts>,
): void => {
  for (let a = 0; a < plan.callouts.length; a += 1)
    for (let b = a + 1; b < plan.callouts.length; b += 1)
      expect(
        calloutsOverlap(plan.callouts[a]!, plan.callouts[b]!),
        `${plan.callouts[a]!.id} overlaps ${plan.callouts[b]!.id}`,
      ).toBe(false);
};

const expectInsideSafeArea = (
  plan: ReturnType<typeof planDiagramCallouts>,
): void => {
  for (const callout of plan.callouts) {
    expect(callout.x).toBeGreaterThanOrEqual(body.left);
    expect(callout.x + callout.width).toBeLessThanOrEqual(body.right);
    expect(callout.y).toBeGreaterThanOrEqual(body.top);
    expect(callout.y + callout.height).toBeLessThanOrEqual(body.bottom);
    // Body safe area ends above the lower-third avoidance band.
    expect(callout.y + callout.height).toBeLessThanOrEqual(
      videoTheme.lowerThirdAvoidance.top,
    );
  }
};

describe("planDiagramCallouts", () => {
  it("is deterministic across repeated runs", () => {
    const input = labels(14);
    const first = JSON.stringify(planDiagramCallouts(input));
    for (let run = 0; run < 5; run += 1)
      expect(JSON.stringify(planDiagramCallouts(input))).toBe(first);
  });

  it("resolves collisions across the former nine-anchor ceiling", () => {
    for (const count of [9, 10, 20]) {
      const plan = planDiagramCallouts(labels(count));
      expect(plan.unplaced).toEqual([]);
      expect(plan.callouts).toHaveLength(count);
      expectNoOverlap(plan);
      expectInsideSafeArea(plan);
    }
  });

  it("places every label that requests the same semantic anchor", () => {
    const plan = planDiagramCallouts([
      { anchor: "left", id: "alpha", text: "Alpha" },
      { anchor: "left", id: "beta", text: "Beta" },
      { anchor: "left", id: "gamma", text: "Gamma" },
    ]);
    expect(plan.unplaced).toEqual([]);
    expect(plan.callouts.map((callout) => callout.id).sort()).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    expectNoOverlap(plan);
  });

  it("plans the exact border-box height used by rendered callouts", () => {
    const plan = planDiagramCallouts(labels(4));
    const [first, second] = plan.callouts.filter(
      (callout) => callout.side === "left",
    );
    if (first === undefined || second === undefined)
      throw new Error("Expected two callouts in the left column.");
    const renderedOneLineHeight = Math.ceil(
      first.fontSize * videoTheme.typography.lineHeight +
        (diagramCalloutPadding(first.fontSize) +
          videoTheme.lineWidths.emphasis) *
          2,
    );

    expect(first.height).toBe(renderedOneLineHeight);
    expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
    expectNoOverlap(plan);
  });

  it("keeps every placed callout inside the body safe area", () => {
    expectInsideSafeArea(planDiagramCallouts(labels(6)));
    expectInsideSafeArea(planDiagramCallouts(labels(18)));
  });

  it("sizes callouts from their content", () => {
    const plan = planDiagramCallouts([
      { anchor: "left", id: "short", text: "Ion" },
      {
        anchor: "right",
        id: "long",
        text: "The semipermeable membrane that regulates transport across the cell boundary",
      },
    ]);
    const short = plan.callouts.find((callout) => callout.id === "short")!;
    const long = plan.callouts.find((callout) => callout.id === "long")!;
    expect(long.height).toBeGreaterThan(short.height);
  });

  it("allocates enough height for maximum-length labels without truncation", () => {
    const plan = planDiagramCallouts(labels(12, () => "x".repeat(80)));

    expect(plan.unplaced.length).toBeGreaterThan(0);
    for (const callout of plan.callouts)
      expect(callout.height).toBeGreaterThan(
        3 * callout.fontSize * videoTheme.typography.lineHeight +
          (diagramCalloutPadding(callout.fontSize) +
            videoTheme.lineWidths.emphasis) *
            2,
      );
    expectNoOverlap(plan);
    expectInsideSafeArea(plan);
  });

  it("reports the labels it cannot place and why", () => {
    const plan = planDiagramCallouts(labels(20, () => "x".repeat(80)));
    expect(plan.unplaced.length).toBeGreaterThan(0);
    expect(plan.collisionLabelIds).toEqual(
      plan.unplaced.map((entry) => entry.id),
    );
    for (const entry of plan.unplaced) {
      expect(entry.id).toMatch(/^part-\d+$/);
      expect(entry.reason).toMatch(/safe area/i);
    }
    // Whatever is placed still does not overlap.
    expectNoOverlap(plan);
    expectInsideSafeArea(plan);
  });

  it("connects each callout's leader line to the diagram rectangle edge", () => {
    const plan = planDiagramCallouts(labels(4));
    expect(plan.diagramRect).toEqual(DIAGRAM_BASE_RECT);
    for (const callout of plan.callouts) {
      const edge =
        callout.side === "left"
          ? plan.diagramRect.x
          : plan.diagramRect.x + plan.diagramRect.width;
      expect(callout.targetX).toBe(edge);
      expect(callout.targetY).toBeGreaterThanOrEqual(plan.diagramRect.y);
      expect(callout.targetY).toBeLessThanOrEqual(
        plan.diagramRect.y + plan.diagramRect.height,
      );
    }
  });
});
