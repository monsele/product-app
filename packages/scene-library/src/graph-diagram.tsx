import { videoTheme } from "@avlp/design-system/video-theme";
import type { CSSProperties, JSX } from "react";
import {
  planGraphLayout,
  type GraphLayoutEdgeInput,
  type GraphLayoutNodeInput,
} from "./graph-layout.js";
import {
  activeRevealIndex,
  getGraphRevealTiming,
  graphEmphasis,
  graphRevealOpacity,
} from "./graph-timing.js";

export type GraphDiagramProps = Readonly<{
  durationSeconds: number;
  edges: readonly GraphLayoutEdgeInput[];
  eyebrow: string;
  frame: number;
  narration: string;
  /** Accent colour per node id; defaults to the theme primary. */
  nodeAccent?: (nodeId: string) => string;
  nodes: readonly GraphLayoutNodeInput[];
  title: string;
}>;

/**
 * Renders a laid-out directed graph for the `process` and `cause-effect`
 * templates. Geometry comes entirely from `planGraphLayout`; motion comes
 * entirely from the named `videoTheme.motion` presets via `graph-timing`.
 */
export function GraphDiagram({
  durationSeconds,
  edges,
  eyebrow,
  frame,
  narration,
  nodeAccent,
  nodes,
  title,
}: GraphDiagramProps): JSX.Element {
  const plan = planGraphLayout(nodes, edges);
  const timing = getGraphRevealTiming(
    durationSeconds,
    plan.revealCount,
    narration,
  );
  const active = activeRevealIndex(frame, timing.starts);
  const nodeStartById = new Map(
    plan.nodes.map((node) => [node.id, timing.starts[node.order] ?? 0]),
  );

  const canvas: CSSProperties = {
    background: videoTheme.colors.background,
    color: videoTheme.colors.text,
    fontFamily: videoTheme.typography.fontFamily,
    height: "100%",
    overflow: "hidden",
    position: "relative",
    width: "100%",
  };

  return (
    <main aria-label={eyebrow} style={canvas}>
      <header
        style={{
          left: videoTheme.safeAreas.title.left,
          position: "absolute",
          top: videoTheme.safeAreas.title.top,
          zIndex: 2,
        }}
      >
        <p
          style={{
            color: videoTheme.colors.primary,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 2,
            margin: 0,
          }}
        >
          {eyebrow}
        </p>
        <h1
          style={{
            fontSize: 48,
            lineHeight: 1.1,
            margin: `${videoTheme.spacing.xs}px 0 0`,
            maxWidth: 1200,
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </h1>
      </header>
      <svg
        aria-hidden="true"
        height={videoTheme.canvas.height}
        style={{ inset: 0, position: "absolute" }}
        width={videoTheme.canvas.width}
      >
        {plan.edges.map((edge) => {
          const [start, end] = edge.points;
          const opacity = graphRevealOpacity(
            frame,
            durationSeconds,
            timing.starts[edge.order] ?? 0,
          );
          return (
            <line
              data-graph-edge={edge.id}
              key={edge.id}
              opacity={opacity}
              stroke={videoTheme.colors.accent}
              strokeWidth={videoTheme.lineWidths.emphasis}
              x1={start.x}
              x2={end.x}
              y1={start.y}
              y2={end.y}
            />
          );
        })}
      </svg>
      {plan.nodes.map((node) => {
        const start = nodeStartById.get(node.id) ?? 0;
        const opacity = graphRevealOpacity(frame, durationSeconds, start);
        const isActive = node.order === active;
        const emphasis = isActive
          ? graphEmphasis(
              frame,
              start,
              timing.starts[node.order + 1] ?? timing.starts[node.order] ?? 0,
            )
          : 0;
        const accent = nodeAccent?.(node.id) ?? videoTheme.colors.primary;
        return (
          <article
            data-graph-node={node.id}
            data-graph-node-active={isActive ? "true" : "false"}
            key={node.id}
            style={{
              alignItems: "center",
              background: videoTheme.colors.surface,
              border: `${videoTheme.lineWidths.emphasis}px solid ${
                isActive ? videoTheme.colors.accent : accent
              }`,
              borderRadius: videoTheme.radii.md,
              boxSizing: "border-box",
              display: "grid",
              fontSize: node.fontSize,
              fontWeight: 700,
              height: node.height,
              left: node.x,
              lineHeight: videoTheme.typography.lineHeight,
              opacity,
              overflowWrap: "anywhere",
              padding: Math.round(node.fontSize * 0.5),
              position: "absolute",
              textAlign: "center",
              top: node.y,
              transform: `translateY(${(1 - opacity) * 16}px) scale(${
                1 + emphasis * 0.04
              })`,
              width: node.width,
              zIndex: 1,
            }}
          >
            {nodes.find((candidate) => candidate.id === node.id)?.label ?? ""}
          </article>
        );
      })}
    </main>
  );
}
