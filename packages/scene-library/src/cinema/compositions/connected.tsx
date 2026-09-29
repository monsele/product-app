/**
 * ST-109 — `connected`: nodes linked by arrows that draw on as each
 * relationship is narrated, ending on the result. Geometry comes from the
 * existing deterministic graph layout engine (`planGraphLayout`); this
 * composition only decides the area, styling and motion. Process steps,
 * legacy cause-effect chains and input-process-output models are converted to
 * the same node/edge form so every relationship is drawn natively.
 */
import type { SceneSpec } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import {
  absolute,
  cinemaCanvas,
  headerHeight,
  SceneHeader,
  type CinemaCompositionProps,
} from "../frame.js";
import { planGraphLayout, type GraphPoint, type GraphRect, type PlacedGraphNode } from "../../graph-layout.js";
import { surfaceFill } from "../identity.js";
import { BodyText, Connector, ItemIcon, Surface } from "../primitives.js";
import { fitText } from "../text-fit.js";

type NodeKind = "cause" | "mechanism" | "effect" | "step" | "input" | "process" | "output";

type Graph = Readonly<{
  nodes: readonly Readonly<{ id: string; label: string; kind: NodeKind }>[];
  edges: readonly Readonly<{ id: string; from: string; to: string; label?: string | undefined }>[];
}>;

/** The scene's relationships as nodes and edges, in item order. */
export function connectedGraph(scene: SceneSpec): Graph {
  switch (scene.template) {
    case "process":
      if (scene.visual.nodes !== undefined)
        return {
          nodes: scene.visual.nodes.map((node) => ({ id: node.id, label: node.label, kind: "step" as const })),
          edges: (scene.visual.edges ?? []).map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label })),
        };
      return {
        nodes: (scene.visual.steps ?? []).map((label, index) => ({ id: `s${index + 1}`, label, kind: "step" as const })),
        edges: (scene.visual.steps ?? []).slice(1).map((_, index) => ({
          id: `e${index + 1}`,
          from: `s${index + 1}`,
          to: `s${index + 2}`,
        })),
      };
    case "cause-effect":
      if (scene.visual.nodes !== undefined)
        return {
          nodes: scene.visual.nodes.map((node) => ({ id: node.id, label: node.label, kind: node.kind })),
          edges: (scene.visual.edges ?? []).map((edge) => ({ id: edge.id, from: edge.from, to: edge.to, label: edge.label })),
        };
      return {
        nodes: [
          ...(scene.visual.causes ?? []).map((node) => ({ id: node.id, label: node.label, kind: "cause" as const })),
          ...(scene.visual.mechanism === undefined
            ? []
            : [{ id: scene.visual.mechanism.id, label: scene.visual.mechanism.label, kind: "mechanism" as const }]),
          ...(scene.visual.effects ?? []).map((node) => ({ id: node.id, label: node.label, kind: "effect" as const })),
        ],
        edges: (scene.visual.connections ?? []).map((connection, index) => ({
          id: `c${index + 1}`,
          from: connection.from,
          to: connection.to,
        })),
      };
    case "input-process-output": {
      const inputs = scene.visual.inputs.map((item, index) => ({ id: `in${index + 1}`, label: item.label, kind: "input" as const }));
      const outputs = scene.visual.outputs.map((item, index) => ({ id: `out${index + 1}`, label: item.label, kind: "output" as const }));
      return {
        nodes: [...inputs, { id: "proc", label: scene.visual.process.label, kind: "process" as const }, ...outputs],
        edges: [
          ...inputs.map((input, index) => ({ id: `ei${index + 1}`, from: input.id, to: "proc" })),
          ...outputs.map((output, index) => ({ id: `eo${index + 1}`, from: "proc", to: output.id })),
        ],
      };
    }
    default:
      throw new Error(`The connected composition does not present ${scene.template} scenes.`);
  }
}

type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

/**
 * The layout engine sizes nodes for its own small type; grow each node
 * vertically (up to 56px per side) so labels can be set larger, while keeping
 * at least 28px between horizontally overlapping neighbours and staying
 * inside the area.
 */
function grownRects(nodes: readonly PlacedGraphNode[], area: GraphRect): ReadonlyMap<string, Rect> {
  const rects = new Map<string, Rect>();
  for (const node of nodes) {
    let up = Math.min(56, node.y - area.y);
    let down = Math.min(56, area.y + area.height - (node.y + node.height));
    for (const other of nodes) {
      if (other.id === node.id) continue;
      const overlaps = other.x < node.x + node.width && node.x < other.x + other.width;
      if (!overlaps) continue;
      if (other.y + other.height <= node.y) up = Math.min(up, (node.y - (other.y + other.height) - 28) / 2);
      else if (other.y >= node.y + node.height) down = Math.min(down, (other.y - (node.y + node.height) - 28) / 2);
    }
    up = Math.max(0, up);
    down = Math.max(0, down);
    rects.set(node.id, { x: node.x, y: node.y - up, width: node.width, height: node.height + up + down });
  }
  return rects;
}

/** Where the line from `rect`'s centre toward `toward` leaves the rect, `margin` px outside it. */
function exitPoint(rect: Rect, toward: GraphPoint, margin = 6): GraphPoint {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const scale = Math.min(
    dx === 0 ? Infinity : (rect.width / 2 + margin) / Math.abs(dx),
    dy === 0 ? Infinity : (rect.height / 2 + margin) / Math.abs(dy),
  );
  if (!Number.isFinite(scale)) return { x: cx, y: cy };
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function centre(rect: Rect): GraphPoint {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function crossesRect(from: GraphPoint, to: GraphPoint, rect: Rect): boolean {
  for (let step = 1; step < 24; step += 1) {
    const t = step / 24;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height) return true;
  }
  return false;
}

/**
 * Edge endpoints on the grown rects: clipped centre-to-centre, unless that
 * line would run through another node — then each end leaves from the side
 * facing the other node, as close to level with it as the rect allows.
 */
function edgeEnds(fromRect: Rect, toRect: Rect, others: readonly Rect[]): readonly [GraphPoint, GraphPoint] {
  const direct = [exitPoint(fromRect, centre(toRect)), exitPoint(toRect, centre(fromRect))] as const;
  const leftToRight = fromRect.x + fromRect.width <= toRect.x;
  const rightToLeft = toRect.x + toRect.width <= fromRect.x;
  if ((!leftToRight && !rightToLeft) || !others.some((rect) => crossesRect(direct[0], direct[1], rect))) return direct;
  const inset = 18;
  const level = (rect: Rect, y: number) => Math.min(rect.y + rect.height - inset, Math.max(rect.y + inset, y));
  const fromX = leftToRight ? fromRect.x + fromRect.width + 6 : fromRect.x - 6;
  const toX = leftToRight ? toRect.x - 6 : toRect.x + toRect.width + 6;
  return [
    { x: fromX, y: level(fromRect, centre(toRect).y) },
    { x: toX, y: level(toRect, centre(fromRect).y) },
  ];
}

export function ConnectedComposition({
  scene,
  design,
  identity,
  itemIcons,
}: CinemaCompositionProps): JSX.Element {
  const beats = useCinemaBeats();
  const graph = connectedGraph(scene);
  const headerWidth = cinemaCanvas.right - cinemaCanvas.left;
  const headHeight = headerHeight(identity, design.display.headline, headerWidth, { maxSize: 60 });
  const areaTop = cinemaCanvas.top + headHeight + 40;
  const area = {
    x: cinemaCanvas.left,
    y: areaTop,
    width: cinemaCanvas.right - cinemaCanvas.left,
    height: cinemaCanvas.bottom - areaTop,
  };
  const plan = planGraphLayout(
    graph.nodes.map((node) => ({ id: node.id, label: node.label })),
    graph.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
    area,
  );
  const rects = grownRects(plan.nodes, area);
  const indexById = new Map(graph.nodes.map((node, index) => [node.id, index]));
  const kindById = new Map(graph.nodes.map((node) => [node.id, node.kind]));
  const active = beats.activeItem(graph.nodes.length);
  const lastRank = Math.max(0, ...plan.nodes.map((node) => node.rank));
  return (
    <>
      <SceneHeader identity={identity} design={design} scene={scene} x={cinemaCanvas.left} y={cinemaCanvas.top} width={headerWidth} maxSize={60} />
      <svg aria-hidden height={cinemaCanvas.height} style={{ left: 0, position: "absolute", top: 0 }} width={cinemaCanvas.width}>
        {plan.edges.map((edge, index) => {
          const fromRect = rects.get(edge.from);
          const toRect = rects.get(edge.to);
          const [start, end] =
            fromRect === undefined || toRect === undefined
              ? edge.points
              : edgeEnds(
                  fromRect,
                  toRect,
                  [...rects.entries()].filter(([id]) => id !== edge.from && id !== edge.to).map(([, rect]) => rect),
                );
          const long = Math.hypot(end.x - start.x, end.y - start.y) > 160;
          const toIndex = indexById.get(edge.to) ?? 0;
          const link = `link-${index + 1}`;
          const progress = beats.has(link)
            ? beats.progressFrom(beats.startOf(link))
            : beats.progressFrom(Math.max(0, beats.startOf(`item-${toIndex + 1}`) - 8));
          return (
            <Connector
              key={edge.id}
              active={active === toIndex + 1}
              curve={long && (identity.surface === "paper" || identity.surface === "card") ? 24 : 0}
              from={start}
              identity={identity}
              progress={progress}
              to={end}
            />
          );
        })}
      </svg>
      {plan.nodes.map((node) => {
        const index = indexById.get(node.id) ?? 0;
        const target = `item-${index + 1}`;
        const reveal = beats.reveal(target);
        const isActive = active === index + 1;
        const kind = kindById.get(node.id) ?? "step";
        const result = kind === "effect" || kind === "output" || (kind === "step" && node.rank === lastRank);
        const rect = rects.get(node.id) ?? node;
        const icon = itemIcons[index];
        const iconSize = icon === undefined ? 0 : Math.min(88, rect.height - 24);
        const fit = fitText({
          text: node.label,
          width: rect.width - 36 - (iconSize > 0 ? iconSize + 14 : 0),
          maxLines: 4,
          maxSize: 44,
          minSize: 24,
          glyphWidth: identity.bodyWidth,
          lineHeight: 1.2,
          maxHeight: rect.height - 24,
        });
        return (
          <Surface
            key={node.id}
            active={isActive}
            data-cinema-item={target}
            identity={identity}
            tone={result ? "accent" : "plain"}
            style={{
              ...absolute(rect.x, rect.y, rect.width, rect.height),
              ...arrival(reveal, "up", 18),
              alignItems: "center",
              display: "flex",
              gap: 14,
              justifyContent: "center",
              padding: "10px 18px",
              transform: `${arrival(reveal, "up", 18).transform} scale(${isActive ? 1.05 : 1})`,
            }}
          >
            {icon === undefined ? null : <ItemIcon backdrop={surfaceFill(identity, result ? "accent" : "plain")} icon={icon} identity={identity} size={iconSize} />}
            <BodyText
              identity={identity}
              fontSize={fit.fontSize}
              style={{
                color: result && identity.surface === "block" ? identity.colors.onAccent : identity.colors.text,
                fontWeight: isActive || result ? 700 : 600,
                lineHeight: 1.2,
                textAlign: icon === undefined ? "center" : "left",
              }}
            >
              {node.label}
            </BodyText>
          </Surface>
        );
      })}
    </>
  );
}
