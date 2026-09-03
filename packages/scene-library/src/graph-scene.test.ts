import { videoTheme } from "@avlp/design-system/video-theme";
import { causeEffectVisualSchema, processVisualSchema } from "@avlp/schemas";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CauseEffectSceneFrame } from "./cause-effect-scene.js";
import {
  graphCauseEffectFixture,
} from "./cause-effect-scene.fixtures.js";
import {
  GRAPH_SAFE_AREA,
  planGraphLayout,
  type GraphLayoutEdgeInput,
  type GraphLayoutNodeInput,
} from "./graph-layout.js";
import {
  activeRevealIndex,
  getGraphRevealTiming,
  narrationRevealFractions,
} from "./graph-timing.js";
import { ProcessSceneFrame } from "./process-scene.js";
import {
  branchingProcessGraphFixture,
  nineStepProcessGraphFixture,
} from "./process-scene.fixtures.js";
import { validateScene } from "./scene-registry.js";
import { getSceneFrameTiming } from "./timing.js";

const chain = (
  count: number,
): {
  nodes: GraphLayoutNodeInput[];
  edges: GraphLayoutEdgeInput[];
} => ({
  nodes: Array.from({ length: count }, (_unused, index) => ({
    id: `n${index + 1}`,
    label: `Step ${index + 1} of the sequence`,
  })),
  edges: Array.from({ length: count - 1 }, (_unused, index) => ({
    id: `e${index + 1}`,
    from: `n${index + 1}`,
    to: `n${index + 2}`,
  })),
});

const rectanglesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

describe("planGraphLayout", () => {
  it("is deterministic across repeated runs at representative node counts", () => {
    for (const count of [3, 6, 9, 12]) {
      const { nodes, edges } = chain(count);
      const first = JSON.stringify(planGraphLayout(nodes, edges));
      for (let run = 0; run < 5; run += 1)
        expect(JSON.stringify(planGraphLayout(nodes, edges))).toBe(first);
    }
  });

  it("lays a nine-step process out without overlap and inside the safe areas", () => {
    const plan = planGraphLayout(
      nineStepProcessGraphFixture.visual.nodes,
      nineStepProcessGraphFixture.visual.edges,
    );
    expect(plan.nodes).toHaveLength(9);
    for (let a = 0; a < plan.nodes.length; a += 1)
      for (let b = a + 1; b < plan.nodes.length; b += 1)
        expect(
          rectanglesOverlap(plan.nodes[a]!, plan.nodes[b]!),
          `${plan.nodes[a]!.id} overlaps ${plan.nodes[b]!.id}`,
        ).toBe(false);
    for (const node of plan.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(GRAPH_SAFE_AREA.x);
      expect(node.x + node.width).toBeLessThanOrEqual(
        GRAPH_SAFE_AREA.x + GRAPH_SAFE_AREA.width + 1,
      );
      expect(node.y).toBeGreaterThanOrEqual(GRAPH_SAFE_AREA.y);
      expect(node.y + node.height).toBeLessThanOrEqual(
        GRAPH_SAFE_AREA.y + GRAPH_SAFE_AREA.height + 1,
      );
      // Body safe area ends above the lower-third avoidance band.
      expect(node.y + node.height).toBeLessThanOrEqual(
        videoTheme.lowerThirdAvoidance.top + 1,
      );
    }
  });

  it("keeps every edge endpoint inside the safe area", () => {
    const plan = planGraphLayout(
      graphCauseEffectFixture.visual.nodes,
      graphCauseEffectFixture.visual.edges,
    );
    for (const edge of plan.edges)
      for (const point of edge.points) {
        expect(point.x).toBeGreaterThanOrEqual(GRAPH_SAFE_AREA.x - 1);
        expect(point.x).toBeLessThanOrEqual(
          GRAPH_SAFE_AREA.x + GRAPH_SAFE_AREA.width + 1,
        );
        expect(point.y).toBeGreaterThanOrEqual(GRAPH_SAFE_AREA.y - 1);
        expect(point.y).toBeLessThanOrEqual(
          GRAPH_SAFE_AREA.y + GRAPH_SAFE_AREA.height + 1,
        );
      }
  });

  it("reveals every edge after both of its endpoint nodes", () => {
    const plan = planGraphLayout(
      branchingProcessGraphFixture.visual.nodes,
      branchingProcessGraphFixture.visual.edges,
    );
    const orderById = new Map(plan.nodes.map((node) => [node.id, node.order]));
    for (const edge of plan.edges) {
      expect(edge.order).toBeGreaterThan(orderById.get(edge.from)!);
      expect(edge.order).toBeGreaterThan(orderById.get(edge.to)!);
    }
    expect(plan.revealCount).toBe(plan.nodes.length + plan.edges.length);
  });
});

describe("graph reveal timing", () => {
  it("derives reveal frames from getSceneFrameTiming and the narration", () => {
    const plan = planGraphLayout(
      nineStepProcessGraphFixture.visual.nodes,
      nineStepProcessGraphFixture.visual.edges,
    );
    const timing = getGraphRevealTiming(
      nineStepProcessGraphFixture.durationSeconds,
      plan.revealCount,
      nineStepProcessGraphFixture.narration,
    );
    const frames = getSceneFrameTiming(
      nineStepProcessGraphFixture.durationSeconds,
    );
    expect(timing.starts).toHaveLength(plan.revealCount);
    expect(timing.starts[0]).toBeGreaterThanOrEqual(frames.enterEndFrame);
    expect(timing.starts.at(-1)!).toBeLessThanOrEqual(frames.exitStartFrame);
    for (let i = 1; i < timing.starts.length; i += 1)
      expect(timing.starts[i]!).toBeGreaterThanOrEqual(timing.starts[i - 1]!);
  });

  it("splits narration into as many buckets as reveal steps", () => {
    const fractions = narrationRevealFractions("One. Two. Three. Four.", 4);
    expect(fractions).toHaveLength(4);
    expect(fractions[0]).toBe(0);
    for (let i = 1; i < fractions.length; i += 1)
      expect(fractions[i]!).toBeGreaterThan(fractions[i - 1]!);
  });

  it("falls back to an even split when narration has no sentences", () => {
    expect(narrationRevealFractions("", 4)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it("advances the active node monotonically over the timeline", () => {
    const starts = [10, 20, 30, 40];
    expect(activeRevealIndex(5, starts)).toBe(-1);
    expect(activeRevealIndex(25, starts)).toBe(1);
    expect(activeRevealIndex(1000, starts)).toBe(3);
  });
});

describe("graph scene schema", () => {
  it("rejects coordinate, transform, easing, and animation-code fields", () => {
    for (const forbidden of ["x", "y", "transform", "easing", "animation"]) {
      const result = processVisualSchema.safeParse({
        nodes: [
          { id: "a", label: "A", [forbidden]: 1 },
          { id: "b", label: "B" },
        ],
        edges: [{ id: "e1", from: "a", to: "b" }],
      });
      expect(result.success, `process accepted "${forbidden}"`).toBe(false);
    }
    const edgeResult = causeEffectVisualSchema.safeParse({
      nodes: [
        { id: "a", label: "A", kind: "cause" },
        { id: "b", label: "B", kind: "effect" },
      ],
      edges: [{ id: "e1", from: "a", to: "b", cx: 4 }],
    });
    expect(edgeResult.success).toBe(false);
  });

  it("fails an edge that references an unknown node id", () => {
    const result = processVisualSchema.safeParse({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ id: "e1", from: "a", to: "ghost" }],
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]!.message).toContain("ghost");
  });

  it("rejects mixing legacy and graph shapes", () => {
    expect(
      processVisualSchema.safeParse({
        steps: ["one", "two"],
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ id: "e1", from: "a", to: "b" }],
      }).success,
    ).toBe(false);
  });

  it("still accepts the legacy shapes unchanged", () => {
    expect(processVisualSchema.safeParse({ steps: ["one", "two"] }).success).toBe(
      true,
    );
    expect(
      causeEffectVisualSchema.safeParse({
        causes: [{ id: "cause-1", label: "Cause" }],
        effects: [{ id: "effect-1", label: "Effect" }],
        connections: [{ from: "cause-1", to: "effect-1" }],
      }).success,
    ).toBe(true);
  });

  it("requires at least one cause and one effect node in a graph", () => {
    expect(
      causeEffectVisualSchema.safeParse({
        nodes: [
          { id: "a", label: "A", kind: "cause" },
          { id: "b", label: "B", kind: "mechanism" },
        ],
        edges: [{ id: "e1", from: "a", to: "b" }],
      }).success,
    ).toBe(false);
  });
});

describe("graph scene rendering", () => {
  const frames = [0, 60, 200];

  it("passes deterministic validation for graph fixtures", () => {
    for (const fixture of [
      nineStepProcessGraphFixture,
      branchingProcessGraphFixture,
      graphCauseEffectFixture,
    ])
      expect(validateScene(fixture)).toEqual([]);
  });

  it("renders identical markup for browser preview and headless render", () => {
    // Preview and render drive the same frame component; neither branches on
    // runtime mode, so a given frame must produce byte-identical output.
    for (const [Component, fixture] of [
      [ProcessSceneFrame, nineStepProcessGraphFixture],
      [CauseEffectSceneFrame, graphCauseEffectFixture],
    ] as const) {
      const preview = renderToStaticMarkup(
        createElement(Component, {
          frame: 120,
          runtimeMode: "preview",
          scene: fixture,
        }),
      );
      const render = renderToStaticMarkup(
        createElement(Component, {
          frame: 120,
          runtimeMode: "render",
          scene: fixture,
        }),
      );
      expect(preview).toBe(render);
    }
  });

  it("is frame-deterministic for both templates", () => {
    for (const [Component, fixture] of [
      [ProcessSceneFrame, nineStepProcessGraphFixture],
      [CauseEffectSceneFrame, graphCauseEffectFixture],
    ] as const)
      for (const frame of frames) {
        const once = renderToStaticMarkup(
          createElement(Component, { frame, scene: fixture }),
        );
        const twice = renderToStaticMarkup(
          createElement(Component, { frame, scene: fixture }),
        );
        expect(twice).toBe(once);
      }
  });

  it("emphasises exactly one node while its narration segment plays", () => {
    const plan = planGraphLayout(
      graphCauseEffectFixture.visual.nodes,
      graphCauseEffectFixture.visual.edges,
    );
    const timing = getGraphRevealTiming(
      graphCauseEffectFixture.durationSeconds,
      plan.revealCount,
      graphCauseEffectFixture.narration,
    );
    const midpoint = timing.starts[2]! + 2;
    const markup = renderToStaticMarkup(
      createElement(CauseEffectSceneFrame, {
        frame: midpoint,
        scene: graphCauseEffectFixture,
      }),
    );
    expect(markup.match(/data-graph-node-active="true"/g)).toHaveLength(1);
  });
});
