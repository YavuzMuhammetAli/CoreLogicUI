import { WorkflowGraph, WorkflowStep } from '../../../models/workflow.model';
import {
  EdgeGeometry, Point, distanceToEdge, nodeSize, portPositions
} from '../workflow-graph/workflow-edge.geometry';
import { ExitKind, ExitPort, exitsOf } from '../../../utils/workflow/workflow-exits';

/**
 * Canvas node/edge layout and hit testing — PURE functions, no Angular.
 *
 * The component only holds signals, DOM listeners and outputs; position precedence and
 * hit decisions live here, so they can be tested without TestBed.
 */

/** Port kind: positive (approve), negative (reject) or neutral (condition path). */
export type PortKind = ExitKind;

/** An exit port at the bottom of a node. */
export interface CanvasPort {
  port: ExitPort;
  kind: PortKind;
  /** Horizontal position relative to the node's left (px). */
  offset: number;
  /** Target step; if empty the flow ends at this exit (terminal). */
  target: string | null;
  /** Label of the condition case; null for the default path and approve/reject. */
  label: string | null;
}

/** A node drawn on the canvas — including position and size. */
export interface CanvasNode {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isStart: boolean;
  isParallel: boolean;
  branchLabels: string[];
  /**
   * Connectable exits (from the type catalog). A disabled exit (reject on a step with reject
   * turned off) isn't drawn as a port: a connection drawn there would silently vanish on save.
   */
  ports: CanvasPort[];
  /** Whether the position is set in the definition (or while dragging); otherwise it comes from auto layout. */
  pinned: boolean;
}

/** A connection between two nodes. */
export interface CanvasEdge {
  key: string;
  label: string;
  isRejection: boolean;
  /** Key of the source step — tells which field to clear when the edge is deleted. */
  from: string;
  to: string;
  port: PortKind;
  /** The source's actual exit (approve/reject/complete/anyReject) — the edge identity. */
  exitPort: ExitPort;
  geometry: EdgeGeometry;
}

/** Where a node with no position at all lands. */
export const DEFAULT_NODE_X = 24;
export const DEFAULT_NODE_Y = 24;

/** Click tolerance for edges (screen pixels). */
export const EDGE_HIT_TOLERANCE = 8;

/**
 * Resolves node positions in order of precedence:
 *
 *     live drag  >  x/y in the definition  >  auto layout  >  default
 *
 * Auto layout is only the starting point for nodes WITHOUT A POSITION;
 * that way definitions written via the form before the canvas also open properly, and
 * form-based editing doesn't have to specify positions.
 */
export function resolveNodePositions(
  graph: WorkflowGraph | null,
  autoNodes: ReadonlyArray<{ key: string; x: number; y: number }>,
  liveOffsets: Readonly<Record<string, Point>>
): CanvasNode[] {
  if (!graph) return [];

  const auto = new Map(autoNodes.map(node => [node.key.toLowerCase(), node]));

  const nodes = graph.steps.map(step => {
    const fallback = auto.get(step.key.toLowerCase());
    const live = liveOffsets[step.key];
    const size = nodeSize(step);
    const pinned = !!live || (step.x != null && step.y != null);

    const node: CanvasNode = {
      key: step.key,
      label: step.name || step.key,
      x: live?.x ?? step.x ?? fallback?.x ?? DEFAULT_NODE_X,
      y: live?.y ?? step.y ?? fallback?.y ?? DEFAULT_NODE_Y,
      width: size.width,
      height: size.height,
      isStart: eq(step.key, graph.startStep),
      isParallel: step.type === 'parallel',
      branchLabels: branchLabelsOf(step),
      ports: portsOf(step, size.width),
      pinned
    };

    return { node, pinned };
  });

  avoidPinnedOverlap(nodes);

  return nodes.map(entry => entry.node);
}

/** Minimum gap left between boxes (the threshold for counting as an overlap). */
const OVERLAP_MARGIN = 16;
/** Maximum number of attempts to resolve overlaps — must terminate even for a bad definition. */
const OVERLAP_MAX_STEPS = 64;

/**
 * A node WITHOUT a position in the definition (coming from auto layout) that lands on a manually
 * positioned node is pushed down until it finds free space.
 *
 * Auto layout is unaware of manually moved boxes: after the user dragged and dropped a box,
 * a newly added step could land right on top of it.
 * A manually placed box is never moved — that's the user's decision.
 */
function avoidPinnedOverlap(entries: Array<{ node: CanvasNode; pinned: boolean }>): void {
  const settled = entries.filter(entry => entry.pinned).map(entry => entry.node);

  for (const entry of entries) {
    if (entry.pinned) continue;

    const node = entry.node;
    for (let i = 0; i < OVERLAP_MAX_STEPS; i++) {
      const blocker = settled.find(other => overlaps(node, other));
      if (!blocker) break;
      node.y = blocker.y + blocker.height + OVERLAP_MARGIN;
    }

    settled.push(node);
  }
}

function overlaps(a: CanvasNode, b: CanvasNode): boolean {
  return a.x < b.x + b.width + OVERLAP_MARGIN && a.x + a.width + OVERLAP_MARGIN > b.x &&
         a.y < b.y + b.height + OVERLAP_MARGIN && a.y + a.height + OVERLAP_MARGIN > b.y;
}

/**
 * The node the point is over.
 *
 * The list is scanned FROM THE END: a node rendered later is drawn on top in the DOM, so when
 * they overlap it is the node the user sees and thinks they clicked.
 */
export function nodeAt(nodes: ReadonlyArray<CanvasNode>, point: Point): CanvasNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (point.x >= node.x && point.x <= node.x + node.width &&
        point.y >= node.y && point.y <= node.y + node.height) {
      return node;
    }
  }

  return null;
}

/**
 * The edge nearest to the point — if within tolerance.
 *
 * The tolerance is measured in SCREEN, not WORLD, coordinates (`tolerance / zoom`): otherwise
 * edges would become unclickable when zoomed out, and when zoomed in clicking far from
 * an edge would select it.
 */
export function edgeAt(
  edges: ReadonlyArray<CanvasEdge>,
  point: Point,
  zoom: number,
  tolerance = EDGE_HIT_TOLERANCE
): CanvasEdge | null {
  const worldTolerance = tolerance / (zoom || 1);

  let best: CanvasEdge | null = null;
  let bestDistance = Infinity;

  for (const edge of edges) {
    const distance = distanceToEdge(edge.geometry, point);
    if (distance <= worldTolerance && distance < bestDistance) {
      best = edge;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Nodes INTERSECTING the rectangle (lasso selection).
 *
 * Full containment isn't required: when the user drags a small frame over a large node,
 * treating it as selected is the expected behaviour.
 */
export function nodesInRect(nodes: ReadonlyArray<CanvasNode>, a: Point, b: Point): CanvasNode[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  return nodes.filter(node =>
    node.x <= maxX && node.x + node.width >= minX &&
    node.y <= maxY && node.y + node.height >= minY);
}

/** The node's connectable exits, spaced evenly along the bottom edge. */
export function portsOf(step: WorkflowStep, width: number): CanvasPort[] {
  const enabled = exitsOf(step).filter(exit => exit.enabled);
  const offsets = portPositions(enabled.length, width);

  return enabled.map((exit, index) => ({
    port: exit.port,
    kind: exit.kind,
    offset: offsets[index],
    target: exit.target,
    label: exit.label ?? null
  }));
}

function branchLabelsOf(step: WorkflowStep): string[] {
  if (step.type !== 'parallel') return [];

  return (step.branches ?? []).map(branch => branch.name || branch.key);
}

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}
