import { WorkflowGraph, outgoingTargets, WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED } from '../../../models/workflow.model';
import { exitsOf } from '../../../utils/workflow/workflow-exits';
import {
  NODE_WIDTH, COLUMN_GAP, ROW_GAP, PADDING, TERMINAL_HEIGHT,
  EdgeRequest, nodeSize, portPositions, routeEdges
} from './workflow-edge.geometry';

/**
 * Flow diagram geometry — PURE functions, NO Angular imports.
 *
 * Same separation as entity-graph.layout.ts (testability without TestBed) but with two
 * important differences:
 *   1) The diagram is laid out TOP TO BOTTOM (entity-graph goes left to right).
 *   2) Layers DO NOT COME FROM THE SERVER. In entity-graph the nodes' `depth` field was
 *      computed by the server; a flow definition has no such field, so
 *      layers are computed here via the longest path from the start step.
 */

// Geometry constants and the edge formula live in workflow-edge.geometry.ts; they are
// re-exported from here so existing importers (spec included) do not change.
export {
  NODE_WIDTH, NODE_HEIGHT, COLUMN_GAP, ROW_GAP,
  PADDING, TERMINAL_HEIGHT, LABEL_OFFSET, BRANCH_LINE_HEIGHT
} from './workflow-edge.geometry';

export const EMPTY_VIEW_BOX = '0 0 100 60';

export interface LayoutNode {
  key: string;
  label: string;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isStart: boolean;
  /** Terminal nodes (completed/rejected) are drawn differently. */
  isTerminal: boolean;
  /** The rejection terminal is in a red tone. */
  isRejection: boolean;
  /** Parallel step — branch names are listed inside the box. */
  isParallel: boolean;
  /**
   * Branch labels of the parallel step (e.g. ["finans", "satinalma"]).
   * They are not drawn as separate nodes: since branches open at the same time and join at the same
   * step, showing them in a single box makes the flow more readable and does not spread the diagram.
   */
  branchLabels: string[];
  /** Join rule badge: "tümü" | "herhangi biri" (all | any). Empty for a single step. */
  joinLabel: string;
}

export interface LayoutEdge {
  key: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
  /** Reject edges are drawn dashed and red. */
  isRejection: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WorkflowLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  viewBox: string;
}

/**
 * Turns the graph into a layout. If the input is null/empty an empty layout is returned —
 * the component handles this with an "add steps for a preview" message.
 */
export function layoutWorkflow(graph: WorkflowGraph | null): WorkflowLayout {
  if (!graph || graph.steps.length === 0) {
    return { nodes: [], edges: [], viewBox: EMPTY_VIEW_BOX };
  }

  const layers = computeLayers(graph);
  const nodes = placeNodes(graph, layers);
  const byKey = new Map(nodes.map(node => [node.key.toLowerCase(), node]));
  const edges = buildEdges(graph, byKey);

  return { nodes, edges, viewBox: computeViewBox(nodes, edges) };
}

/**
 * Computes each step's layer via the LONGEST path from the start.
 *
 * Longest path (not shortest): if a step is reachable via several paths it must be drawn
 * at the layer where it is reached latest, so arrows always flow downward.
 *
 * Cycles (reject → back to a previous step) are legitimate, but the longest path is undefined
 * in a cyclic graph. The previous BFS re-queued a visited node "whenever a deeper layer
 * was found"; in a cycle this was true on every round and only the safety
 * cap stopped it — even the start step could fall to the bottom row.
 * Now there are two phases:
 *   1) Depth-first search from the start; an edge to a node ON THE STACK
 *      counts as a back edge and does not take part in layering (the rest is acyclic).
 *   2) Longest path in topological order over the acyclic edges. The start is always 0.
 * Back edges are routed around the side on the canvas.
 */
function computeLayers(graph: WorkflowGraph): Map<string, number> {
  const byKey = new Map(graph.steps.map(step => [step.key.toLowerCase(), step]));
  const start = byKey.get((graph.startStep ?? '').toLowerCase()) ?? graph.steps[0];
  const startKey = start.key.toLowerCase();

  const state = new Map<string, 'visiting' | 'done'>();
  const forward = new Map<string, string[]>();
  const postorder: string[] = [];

  const visit = (key: string): void => {
    state.set(key, 'visiting');
    const targets: string[] = [];

    for (const exit of exitsOf(byKey.get(key)!)) {
      const target = exit.target?.toLowerCase();
      if (!target || isTerminal(target) || !byKey.has(target)) continue;

      const seen = state.get(target);
      if (seen === 'visiting') continue;       // back edge — does not take part in layering
      targets.push(target);
      if (seen === undefined) visit(target);
    }

    forward.set(key, targets);
    state.set(key, 'done');
    postorder.push(key);
  };

  visit(startKey);

  // Reverse postorder is a valid topological order for the acyclic edges.
  const layers = new Map<string, number>([[startKey, 0]]);
  for (const key of postorder.reverse()) {
    const layer = layers.get(key) ?? 0;
    for (const target of forward.get(key) ?? []) {
      if ((layers.get(target) ?? -1) < layer + 1) layers.set(target, layer + 1);
    }
  }

  // Unreachable steps must be drawn too — the user should see the disconnection.
  // (The validator counts it as an error; the diagram makes that error visible.)
  let orphanLayer = Math.max(0, ...layers.values()) + 1;
  for (const step of graph.steps) {
    if (!layers.has(step.key.toLowerCase())) {
      layers.set(step.key.toLowerCase(), orphanLayer++);
    }
  }

  return layers;
}

/** Distance between the centres of two side-by-side boxes — half of an approve/reject branching shifts by this much. */
const COLUMN_PITCH = NODE_WIDTH + COLUMN_GAP;

/**
 * Places the nodes.
 *
 * Vertical: each layer's y is ROW_GAP below the bottom of the TALLEST box of the
 * previous layer. A fixed `layer * (NODE_HEIGHT + ROW_GAP)` did not account for the parallel
 * box (it grows per branch), and the row below overlapped it.
 *
 * Horizontal: each node wants to sit below its parents in the layer above.
 * If the parent branches into TWO separate steps, the approve target shifts left and the reject target right by half a
 * column — the same order as the green/red ports on the box. With a single target there is
 * no shift: the approval chain stays a vertical spine. Boxes wanting the same spot
 * are pushed left to right, then re-centred so the layer stays balanced.
 */
function placeNodes(graph: WorkflowGraph, layers: Map<string, number>): LayoutNode[] {
  const nodes: LayoutNode[] = graph.steps.map(step => {
    const isParallel = step.type === 'parallel';
    const size = nodeSize(step);

    return {
      key: step.key,
      label: step.name || step.key,
      layer: layers.get(step.key.toLowerCase()) ?? 0,
      x: 0,
      y: 0,
      width: size.width,
      // The parallel box also lists its branches; the height formula is in nodeSize.
      height: size.height,
      isStart: eq(step.key, graph.startStep),
      isTerminal: false,
      isRejection: false,
      isParallel,
      branchLabels: isParallel ? (step.branches ?? []).map(b => b.name || b.key) : [],
      joinLabel: isParallel ? (step.mode === 'any' ? 'any' : 'all') : ''
    };
  });

  // Terminals are drawn only if actually targeted — adding two boxes to every diagram
  // would be needless noise. Always on the bottom layer.
  const terminalLayer = Math.max(...nodes.map(n => n.layer)) + 1;

  for (const terminal of collectUsedTerminals(graph)) {
    nodes.push({
      key: terminal,
      label: terminal === WORKFLOW_TERMINAL_REJECTED ? 'Rejected' : 'Completed',
      layer: terminalLayer,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: TERMINAL_HEIGHT,
      isStart: false,
      isTerminal: true,
      isRejection: terminal === WORKFLOW_TERMINAL_REJECTED,
      isParallel: false,
      branchLabels: [],
      joinLabel: ''
    });
  }

  assignRows(nodes);
  assignColumns(graph, nodes);

  return nodes;
}

/** Computes layer y values cumulatively: row height = the tallest box in the layer. */
function assignRows(nodes: LayoutNode[]): void {
  const layerHeights = new Map<number, number>();
  for (const node of nodes) {
    layerHeights.set(node.layer, Math.max(layerHeights.get(node.layer) ?? 0, node.height));
  }

  const layerY = new Map<number, number>();
  let y = PADDING;
  for (const layer of [...layerHeights.keys()].sort((a, b) => a - b)) {
    layerY.set(layer, y);
    y += layerHeights.get(layer)! + ROW_GAP;
  }

  for (const node of nodes) {
    node.y = layerY.get(node.layer)!;
  }
}

/**
 * Assigns x layer by layer, after the parents are placed.
 *
 * Only FORWARD edges (from an upper layer to a lower one) are considered; back edges
 * do not affect the layout, they are routed around the side on the canvas.
 */
function assignColumns(graph: WorkflowGraph, nodes: LayoutNode[]): void {
  const byKey = new Map(nodes.map(node => [node.key.toLowerCase(), node]));

  // Target → [parent, shift direction (-1 left / 0 / +1 right)]
  const parents = new Map<string, Array<{ parent: LayoutNode; bias: number }>>();
  const addParent = (targetKey: string, parent: LayoutNode, bias: number) => {
    const target = byKey.get(targetKey.toLowerCase());
    if (!target || target.layer <= parent.layer) return;

    const list = parents.get(target.key.toLowerCase()) ?? [];
    list.push({ parent, bias });
    parents.set(target.key.toLowerCase(), list);
  };

  for (const step of graph.steps) {
    const source = byKey.get(step.key.toLowerCase());
    if (!source) continue;

    const { approve, reject } = outgoingTargets(step);
    const approveTarget = approve || WORKFLOW_TERMINAL_COMPLETED;
    const rejectTarget = reject || WORKFLOW_TERMINAL_REJECTED;

    // A terminal target does not count as branching: almost every step's reject goes to the terminal,
    // and if it counted, the approval chain would shift half a column left on every layer.
    const forks = !isTerminal(approveTarget) && !isTerminal(rejectTarget)
      && !eq(approveTarget, rejectTarget)
      && isBelow(byKey, source, approveTarget) && isBelow(byKey, source, rejectTarget);

    addParent(approveTarget, source, forks ? -1 : 0);
    addParent(rejectTarget, source, forks ? 1 : 0);
  }

  const layersInOrder = [...new Set(nodes.map(n => n.layer))].sort((a, b) => a - b);
  const center = (node: LayoutNode) => node.x + node.width / 2;

  for (const layer of layersInOrder) {
    const row = nodes.filter(node => node.layer === layer);

    const desired = row.map((node, order) => {
      const incoming = parents.get(node.key.toLowerCase()) ?? [];
      let wanted = incoming.length > 0
        ? incoming.reduce((sum, p) => sum + center(p.parent) + p.bias * COLUMN_PITCH / 2, 0) / incoming.length
        : 0;

      // Terminals: completed on the left, rejected on the right (same order as the ports).
      if (node.isTerminal) wanted += (node.isRejection ? 1 : -1) * COLUMN_PITCH / 2;

      return { node, left: wanted - node.width / 2, order };
    });

    // Sorting is stable: definition order is kept on ties.
    desired.sort((a, b) => a.left - b.left || a.order - b.order);

    let previousRight = -Infinity;
    let drift = 0;
    for (const item of desired) {
      const left = Math.max(item.left, previousRight + COLUMN_GAP);
      drift += left - item.left;
      item.node.x = left;
      previousRight = left + item.node.width;
    }

    // Pushing is always to the right; the average shift is undone so the layer stays
    // balanced around the centre it wants (gaps don't change, everything shifts together).
    const shift = drift / desired.length;
    for (const item of desired) item.node.x -= shift;
  }

  // The leftmost box should start at PADDING.
  const minX = Math.min(...nodes.map(n => n.x));
  for (const node of nodes) node.x += PADDING - minX;
}

function isBelow(byKey: Map<string, LayoutNode>, source: LayoutNode, targetKey: string): boolean {
  const target = byKey.get(targetKey.toLowerCase());
  return !!target && target.layer > source.layer;
}

/**
 * Terminals to show on the diagram. An empty target counts as a terminal too: an empty onApprove
 * falls back to the "complete" default, an empty onReject to "reject" (same rule as the engine).
 */
function collectUsedTerminals(graph: WorkflowGraph): string[] {
  const used = new Set<string>();

  for (const step of graph.steps) {
    const { approve, reject } = outgoingTargets(step);
    if (!approve || isTerminal(approve)) {
      used.add(approve || WORKFLOW_TERMINAL_COMPLETED);
    }
    if (!reject || isTerminal(reject)) {
      used.add(reject || WORKFLOW_TERMINAL_REJECTED);
    }
  }

  // Fixed order: completed on the left, rejected on the right.
  return [WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED].filter(t => used.has(t));
}

/**
 * The approve edge leaves from the green port, the reject edge from the red port (same formula as
 * the port positions on the canvas); back edges are routed around the side in routeEdges.
 */
function buildEdges(graph: WorkflowGraph, byKey: Map<string, LayoutNode>): LayoutEdge[] {
  const pending: Array<{ key: string; label: string; isRejection: boolean; request: EdgeRequest }> = [];

  for (const step of graph.steps) {
    const source = byKey.get(step.key.toLowerCase());
    if (!source) continue;

    const { approve, reject } = outgoingTargets(step);
    const [approvePort, rejectPort] = portPositions(2, source.width);
    const outgoing = [
      { targetKey: approve || WORKFLOW_TERMINAL_COMPLETED, label: 'approve', isRejection: false, port: approvePort },
      { targetKey: reject || WORKFLOW_TERMINAL_REJECTED, label: 'reject', isRejection: true, port: rejectPort }
    ];

    for (const edge of outgoing) {
      const target = byKey.get(edge.targetKey.toLowerCase());
      // An edge whose target is not drawn is silently skipped (same behaviour as entity-graph).
      if (!target) continue;

      pending.push({
        key: `${source.key}->${edge.targetKey}:${edge.label}`,
        label: edge.label,
        isRejection: edge.isRejection,
        request: { source, target, sourceOffsetX: edge.port }
      });
    }
  }

  const geometries = routeEdges(pending.map(p => p.request), [...byKey.values()]);

  return pending.map((edge, index) => {
    const geometry = geometries[index];

    return {
      key: edge.key,
      path: geometry.path,
      labelX: geometry.labelX,
      labelY: geometry.labelY,
      label: edge.label,
      isRejection: edge.isRejection,
      minX: geometry.minX,
      minY: geometry.minY,
      maxX: geometry.maxX,
      maxY: geometry.maxY
    };
  });
}

/**
 * View box. The top-left corner CANNOT be 0 0: returning (rework) edges can overflow
 * to the left of a node and a fixed origin would clip that part — same rationale as
 * the self-loop overflow in entity-graph.
 */
function computeViewBox(nodes: LayoutNode[], edges: LayoutEdge[]): string {
  if (nodes.length === 0) return EMPTY_VIEW_BOX;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  for (const edge of edges) {
    minX = Math.min(minX, edge.minX);
    minY = Math.min(minY, edge.minY);
    maxX = Math.max(maxX, edge.maxX);
    maxY = Math.max(maxY, edge.maxY);
  }

  const x = minX - PADDING;
  const y = minY - PADDING;
  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;

  return `${x} ${y} ${width} ${height}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}

function isTerminal(key: string): boolean {
  return key === WORKFLOW_TERMINAL_COMPLETED || key === WORKFLOW_TERMINAL_REJECTED;
}
