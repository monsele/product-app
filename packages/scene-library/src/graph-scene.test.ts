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

  it("keeps a columnar layout (incl. a full four-node layer) inside the safe area", () => {
    for (const input of [
      {
        nodes: branchingProcessGraphFixture.visual.nodes,
        edges: branchingProcessGraphFixture.visual.edges,
      },
      {
        nodes: [
          { id: "a", label: "Alpha cause" },
          { id: "b", label: "Beta cause" },
          { id: "c", label: "Gamma cause" },
          { id: "d", label: "Delta cause" },
          { id: "hub", label: "Shared mechanism" },
          { id: "out", label: "Outcome" },
        ],
        edges: [
          { id: "e1", from: "a", to: "hub" },
          { id: "e2", from: "b", to: "hub" },
          { id: "e3", from: "c", to: "hub" },
          { id: "e4", from: "d", to: "hub" },
          { id: "e5", from: "hub", to: "out" },
        ],
      },
    ]) {
      const plan = planGraphLayout(input.nodes, input.edges);
      for (const node of plan.nodes) {
        expect(node.x).toBeGreaterThanOrEqual(GRAPH_SAFE_AREA.x - 1);
        expect(node.x + node.width).toBeLessThanOrEqual(
          GRAPH_SAFE_AREA.x + GRAPH_SAFE_AREA.width + 1,
        );
        expect(node.y).toBeGreaterThanOrEqual(GRAPH_SAFE_AREA.y - 1);
        expect(node.y + node.height).toBeLessThanOrEqual(
          videoTheme.lowerThirdAvoidance.top + 1,
        );
      }
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

  it("layers an acyclic process by longest path from the source", () => {
    const plan = planGraphLayout(
      branchingProcessGraphFixture.visual.nodes,
      branchingProcessGraphFixture.visual.edges,
    );
    const rankById = new Map(plan.nodes.map((node) => [node.id, node.rank]));
    expect(rankById.get("collect")).toBe(0);
    expect(rankById.get("clean")).toBe(1);
    expect(rankById.get("validate")).toBe(2);
    expect(rankById.get("coverage")).toBe(2);
    expect(rankById.get("report")).toBe(3);
  });

  it("breaks a cyclic process into ordered layers instead of one flat rank", () => {
    const plan = planGraphLayout(
      nineStepProcessGraphFixture.visual.nodes,
      nineStepProcessGraphFixture.visual.edges,
    );
    const ranks = plan.nodes.map((node) => node.rank);
    expect(new Set(ranks).size).toBeGreaterThan(1);
    // Reveal order follows the chain declared in the fixture.
    expect(plan.nodes.map((node) => node.id).slice(0, 3)).toEqual([
      "magma",
      "igneous",
      "sediment",
    ]);
  });

  it("reports node labels that cannot fit their computed cell", () => {
    // Four nodes in one layer (columnar, 4 rows) with maximum-length labels:
    // the cell is too short for the wrapped text.
    const plan = planGraphLayout(
      [
        { id: "n1", label: "A".repeat(80) },
        { id: "n2", label: "B".repeat(80) },
        { id: "n3", label: "C".repeat(80) },
        { id: "n4", label: "D".repeat(80) },
        { id: "hub", label: "Hub" },
        { id: "mid", label: "Mid" },
        { id: "end", label: "End" },
      ],
      [
        { id: "e1", from: "n1", to: "hub" },
        { id: "e2", from: "n2", to: "hub" },
        { id: "e3", from: "n3", to: "hub" },
        { id: "e4", from: "n4", to: "hub" },
        { id: "e5", from: "hub", to: "mid" },
        { id: "e6", from: "mid", to: "end" },
      ],
    );
    expect(plan.overflowNodeIds).toContain("n1");
  });
});

describe("graph reveal timing", () => {
  it("derives strictly increasing reveal frames that all finish before the exit fade", () => {
    for (const fixture of [
      nineStepProcessGraphFixture,
      branchingProcessGraphFixture,
      graphCauseEffectFixture,
    ]) {
      const plan = planGraphLayout(
        fixture.visual.nodes,
        fixture.visual.edges,
      );
      const timing = getGraphRevealTiming(
        fixture.durationSeconds,
        plan.revealCount,
        fixture.narration,
      );
      const frames = getSceneFrameTiming(fixture.durationSeconds);
      expect(timing.starts).toHaveLength(plan.revealCount);
      expect(timing.starts[0]).toBeGreaterThanOrEqual(frames.enterEndFrame);
      // Every reveal — including the last edge — starts early enough to finish
      // its reveal animation before the scene-wide exit fade begins.
      expect(timing.starts.at(-1)!).toBeLessThanOrEqual(
        frames.exitStartFrame -
          videoTheme.motion.reveal.durationInFrames,
      );
      for (let i = 1; i < timing.starts.length; i += 1)
        expect(timing.starts[i]!).toBeGreaterThan(timing.starts[i - 1]!);
    }
  });

  it("makes every node and edge fully visible mid-scene", () => {
    for (const [Component, fixture] of [
      [ProcessSceneFrame, nineStepProcessGraphFixture],
      [CauseEffectSceneFrame, graphCauseEffectFixture],
    ] as const) {
      const plan = planGraphLayout(fixture.visual.nodes, fixture.visual.edges);
      const timing = getGraphRevealTiming(
        fixture.durationSeconds,
        plan.revealCount,
        fixture.narration,
      );
      // A frame shortly after the final reveal, still before the exit fade.
      const frame =
        timing.starts.at(-1)! +
        videoTheme.motion.reveal.durationInFrames;
      const markup = renderToStaticMarkup(
        createElement(Component, { frame, scene: fixture }),
      );
      for (const node of plan.nodes)
        expect(markup).toContain(`data-graph-node="${node.id}"`);
      for (const edge of plan.edges)
        expect(markup).toContain(`data-graph-edge="${edge.id}"`);
      // Every node/edge is fully revealed and the exit fade has not started:
      // no element is at (or near) zero opacity.
      expect(markup).not.toMatch(/opacity:\s*0(?:\.0+)?[;"]/);
      expect(markup).not.toMatch(/opacity="0(?:\.0+)?"/);
    }
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

  it("rejects self-loops and duplicate parallel edges", () => {
    expect(
      processVisualSchema.safeParse({
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [{ id: "e1", from: "a", to: "a" }],
      }).success,
    ).toBe(false);
    expect(
      processVisualSchema.safeParse({
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [
          { id: "e1", from: "a", to: "b" },
          { id: "e2", from: "a", to: "b" },
        ],
      }).success,
    ).toBe(false);
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

  it("reports a graph node label that overflows its layout cell", () => {
    const scene = {
      ...branchingProcessGraphFixture,
      visual: {
        nodes: [
          { id: "n1", label: "A".repeat(80) },
          { id: "n2", label: "B".repeat(80) },
          { id: "n3", label: "C".repeat(80) },
          { id: "n4", label: "D".repeat(80) },
          { id: "hub", label: "Hub" },
          { id: "mid", label: "Mid" },
          { id: "end", label: "End" },
        ],
        edges: [
          { id: "e1", from: "n1", to: "hub" },
          { id: "e2", from: "n2", to: "hub" },
          { id: "e3", from: "n3", to: "hub" },
          { id: "e4", from: "n4", to: "hub" },
          { id: "e5", from: "hub", to: "mid" },
          { id: "e6", from: "mid", to: "end" },
        ],
      },
    };
    const issues = validateScene(scene);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe("text_overflow");
    expect(issues[0]!.fieldPath).toMatch(/^visual\.nodes\.\d+\.label$/);
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

  it("keeps the final node emphasised while trailing edges reveal", () => {
    const plan = planGraphLayout(
      graphCauseEffectFixture.visual.nodes,
      graphCauseEffectFixture.visual.edges,
    );
    const timing = getGraphRevealTiming(
      graphCauseEffectFixture.durationSeconds,
      plan.revealCount,
      graphCauseEffectFixture.narration,
    );
    const nodeCount = plan.nodes.length;
    // A frame after the first edge has started revealing (index >= nodeCount).
    const frame = timing.starts[nodeCount]! + 4;
    const markup = renderToStaticMarkup(
      createElement(CauseEffectSceneFrame, {
        frame,
        scene: graphCauseEffectFixture,
      }),
    );
    const lastNodeId = plan.nodes[nodeCount - 1]!.id;
    expect(markup).toMatch(
      new RegExp(
        `data-graph-node="${lastNodeId}" data-graph-node-active="true"`,
      ),
    );
    expect(markup.match(/data-graph-node-active="true"/g)).toHaveLength(1);
  });
});
