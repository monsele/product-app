import { videoTheme } from "@avlp/design-system/video-theme";
import { measureTextLayout } from "./layout.js";

/**
 * Deterministic node-and-edge layout for the `process` and `cause-effect`
 * scene templates. This generalises the free-placement primitive built for
 * `labelled-diagram` in ST-086 to a directed graph.
 *
 * Determinism: layout is a pure function of declaration order. Nodes and edges
 * are processed in array order, ranks derive from a longest-path pass that
 * breaks ties by declaration index, and no wall-clock, locale, or unordered
 * input is consulted. Identical input always produces identical output, so a
 * browser preview and a headless render agree frame for frame.
 *
 * The engine decides every pixel. The scene contract carries no coordinate,
 * transform, or easing field, and this module accepts none.
 */

export type GraphLayoutNodeInput = Readonly<{
  id: string;
  label: string;
}>;

export type GraphLayoutEdgeInput = Readonly<{
  id: string;
  from: string;
  to: string;
}>;

export type GraphRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type GraphPoint = Readonly<{ x: number; y: number }>;

export type PlacedGraphNode = Readonly<{
  fontSize: number;
  height: number;
  id: string;
  /** 0-based reveal order; also the animation sequence position. */
  order: number;
  /** Layer index in the directed graph (source layer is 0). */
  rank: number;
  width: number;
  x: number;
  y: number;
}>;

export type PlacedGraphEdge = Readonly<{
  from: string;
  id: string;
  /** Reveal order, always at or after both endpoint nodes. */
  order: number;
  /** Polyline from the source node boundary to the target node boundary. */
  points: readonly [GraphPoint, GraphPoint];
  to: string;
}>;

export type GraphLayoutPlan = Readonly<{
  area: GraphRect;
  edges: readonly PlacedGraphEdge[];
  nodes: readonly PlacedGraphNode[];
  /** Total number of reveal steps across nodes and edges. */
  revealCount: number;
}>;

/**
 * The body safe area, already clear of the lower-third avoidance band. Layout
 * never places a node or an edge endpoint outside this rectangle.
 */
export const GRAPH_SAFE_AREA: GraphRect = Object.freeze({
  height:
    Math.min(
      videoTheme.canvas.height - videoTheme.safeAreas.body.bottom,
      videoTheme.lowerThirdAvoidance.top,
    ) - videoTheme.safeAreas.body.top,
  width:
    videoTheme.canvas.width -
    videoTheme.safeAreas.body.left -
    videoTheme.safeAreas.body.right,
  x: videoTheme.safeAreas.body.left,
  y: videoTheme.safeAreas.body.top,
});

const CELL_GAP = 24;
const MAX_GRID_COLUMNS = 4;
const MAX_COLUMNAR_PER_RANK = 4;

/**
 * Longest-path layering. Ties break on declaration index. A cyclic input (which
 * the schema does not forbid outright) still terminates: after `nodes.length`
 * relaxation passes any node left unranked is appended to the final layer in
 * declaration order.
 */
function assignRanks(
  nodes: readonly GraphLayoutNodeInput[],
  edges: readonly GraphLayoutEdgeInput[],
): Map<string, number> {
  const indexById = new Map(nodes.map((node, index) => [node.id, index]));
  const incoming = new Map<string, string[]>();
  for (const node of nodes) incoming.set(node.id, []);
  for (const edge of edges)
    if (incoming.has(edge.to) && indexById.has(edge.from))
      incoming.get(edge.to)!.push(edge.from);

  const rank = new Map<string, number>();
  for (const node of nodes)
    if (incoming.get(node.id)!.length === 0) rank.set(node.id, 0);

  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const node of nodes) {
      const preds = incoming.get(node.id)!;
      if (preds.length === 0) continue;
      const resolved = preds
        .map((predId) => rank.get(predId))
        .filter((value): value is number => value !== undefined);
      if (resolved.length === 0) continue;
      const next = Math.max(...resolved) + 1;
      if (rank.get(node.id) !== next) {
        rank.set(node.id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const maxRank = Math.max(0, ...Array.from(rank.values()));
  for (const node of nodes)
    if (!rank.has(node.id)) rank.set(node.id, maxRank + 1);

  return rank;
}

function measureNodeHeight(
  label: string,
  boxWidth: number,
  fontSize: number,
): number {
  const padding = Math.round(fontSize * 0.5);
  const inner = Math.max(1, boxWidth - padding * 2);
  const lines = measureTextLayout(label, {
    fontSize,
    lineHeight: videoTheme.typography.lineHeight,
    maxLines: Number.MAX_SAFE_INTEGER,
    width: inner,
  }).lineCount;
  return Math.ceil(
    lines * fontSize * videoTheme.typography.lineHeight + padding * 2,
  );
}

/** Clip the centre-to-centre segment to the target rectangle's boundary. */
function boundaryPoint(
  from: PlacedGraphNode,
  to: PlacedGraphNode,
): GraphPoint {
  const fromCx = from.x + from.width / 2;
  const fromCy = from.y + from.height / 2;
  const toCx = to.x + to.width / 2;
  const toCy = to.y + to.height / 2;
  const dx = fromCx - toCx;
  const dy = fromCy - toCy;
  if (dx === 0 && dy === 0) return { x: toCx, y: toCy };
  const halfW = to.width / 2;
  const halfH = to.height / 2;
  const scale = Math.min(
    dx === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfW / dx),
    dy === 0 ? Number.POSITIVE_INFINITY : Math.abs(halfH / dy),
  );
  return { x: toCx + dx * scale, y: toCy + dy * scale };
}

export function planGraphLayout(
  nodes: readonly GraphLayoutNodeInput[],
  edges: readonly GraphLayoutEdgeInput[],
  area: GraphRect = GRAPH_SAFE_AREA,
): GraphLayoutPlan {
  if (nodes.length === 0)
    return Object.freeze({
      area,
      edges: Object.freeze([]),
      nodes: Object.freeze([]),
      revealCount: 0,
    });

  const rankById = assignRanks(nodes, edges);
  const ranks = Array.from(new Set(nodes.map((node) => rankById.get(node.id)!)))
    .slice()
    .sort((a, b) => a - b);
  const perRank = ranks.map(
    (value) => nodes.filter((node) => rankById.get(node.id) === value).length,
  );
  const columnar =
    ranks.length <= MAX_GRID_COLUMNS &&
    Math.max(...perRank) <= MAX_COLUMNAR_PER_RANK;

  const columns = columnar
    ? ranks.length
    : Math.min(MAX_GRID_COLUMNS, Math.ceil(Math.sqrt(nodes.length)));
  const rows = columnar
    ? Math.max(...perRank)
    : Math.ceil(nodes.length / columns);

  const cellWidth = (area.width - CELL_GAP * (columns - 1)) / columns;
  const cellHeight = (area.height - CELL_GAP * (rows - 1)) / rows;
  const boxWidth = Math.max(80, cellWidth - CELL_GAP);
  const fontSize = rows >= 3 || columns >= 3 ? 24 : 30;

  // Reveal order: rank first, then declaration index within the rank. This is
  // the sequence the narration timeline drives.
  const ordered = nodes
    .map((node, index) => ({ index, node, rank: rankById.get(node.id)! }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  const orderById = new Map(
    ordered.map((entry, order) => [entry.node.id, order]),
  );

  const placed: PlacedGraphNode[] = [];

  if (columnar) {
    ranks.forEach((rankValue, columnIndex) => {
      const inRank = nodes.filter(
        (node) => rankById.get(node.id) === rankValue,
      );
      const x = area.x + columnIndex * (cellWidth + CELL_GAP);
      const blockHeight =
        inRank.length * cellHeight + (inRank.length - 1) * CELL_GAP;
      const top = area.y + (area.height - blockHeight) / 2;
      inRank.forEach((node, rowIndex) => {
        const height = Math.min(
          cellHeight,
          measureNodeHeight(node.label, boxWidth, fontSize),
        );
        const cellTop = top + rowIndex * (cellHeight + CELL_GAP);
        placed.push(
          Object.freeze({
            fontSize,
            height,
            id: node.id,
            order: orderById.get(node.id)!,
            rank: rankValue,
            width: boxWidth,
            x: Math.round(x + (cellWidth - boxWidth) / 2),
            y: Math.round(cellTop + (cellHeight - height) / 2),
          }),
        );
      });
    });
  } else {
    ordered.forEach((entry, position) => {
      const columnIndex = position % columns;
      const rowIndex = Math.floor(position / columns);
      const height = Math.min(
        cellHeight,
        measureNodeHeight(entry.node.label, boxWidth, fontSize),
      );
      const x = area.x + columnIndex * (cellWidth + CELL_GAP);
      const cellTop = area.y + rowIndex * (cellHeight + CELL_GAP);
      placed.push(
        Object.freeze({
          fontSize,
          height,
          id: entry.node.id,
          order: orderById.get(entry.node.id)!,
          rank: entry.rank,
          width: boxWidth,
          x: Math.round(x + (cellWidth - boxWidth) / 2),
          y: Math.round(cellTop + (cellHeight - height) / 2),
        }),
      );
    });
  }

  const placedById = new Map(placed.map((node) => [node.id, node]));
  const nodeCount = placed.length;

  // An edge reveals after both of its endpoints. Order edges by their later
  // endpoint, breaking ties by declaration order, then number them so they
  // always trail every node in the reveal sequence.
  const sortedEdges: PlacedGraphEdge[] = edges
    .map((edge, index) => ({ edge, index }))
    .filter(
      ({ edge }) => placedById.has(edge.from) && placedById.has(edge.to),
    )
    .sort((a, b) => {
      const aLater = Math.max(
        placedById.get(a.edge.from)!.order,
        placedById.get(a.edge.to)!.order,
      );
      const bLater = Math.max(
        placedById.get(b.edge.from)!.order,
        placedById.get(b.edge.to)!.order,
      );
      return aLater - bLater || a.index - b.index;
    })
    .map(({ edge }, sequence) => {
      const source = placedById.get(edge.from)!;
      const target = placedById.get(edge.to)!;
      return Object.freeze({
        from: edge.from,
        id: edge.id,
        order: nodeCount + sequence,
        points: Object.freeze([
          boundaryPoint(target, source),
          boundaryPoint(source, target),
        ] as const),
        to: edge.to,
      });
    });

  return Object.freeze({
    area,
    edges: Object.freeze(sortedEdges),
    nodes: Object.freeze(placed),
    revealCount: nodeCount + sortedEdges.length,
  });
}
