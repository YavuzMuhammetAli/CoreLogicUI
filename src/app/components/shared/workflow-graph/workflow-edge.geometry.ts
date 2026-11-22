import { WorkflowStep } from '../../../models/workflow.model';

/**
 * Flow diagram geometry — PURE functions, NO Angular imports.
 *
 * This file carries only the MATH: where an edge's path goes, how much space a node
 * takes, where the ports land. The POLICY of "which target is drawn" is not
 * here — the two callers keep it in their own place and deliberately behave
 * differently:
 *
 *   workflow-graph.layout.ts  → drops an empty target to a terminal, draws terminals
 *   workflow-canvas.component → never draws an empty target, does not draw terminals
 *
 * The only shared thing was the formula; that was also what was duplicated. Since the policy stays separate,
 * the behaviour of the two callers does not change with this split.
 */

export const NODE_WIDTH = 168;
/**
 * The canvas box is drawn at this FIXED height (not min-height). It used to be 52
 * and the DOM content (title + key + padding) stretched the box to ~60px; since the model
 * thought it was shorter than it really was, the row below overlapped the box.
 */
export const NODE_HEIGHT = 60;
/** Gap between two boxes in the same layer. */
export const COLUMN_GAP = 56;
/** Gap between layers — the "onay"/"red" (approve/reject) label and the arrowhead must fit here. */
export const ROW_GAP = 80;
export const PADDING = 24;
export const TERMINAL_HEIGHT = 34;
export const LABEL_OFFSET = 6;
/** Height of each branch row in a parallel box. */
export const BRANCH_LINE_HEIGHT = 15;
/** How far outside the rightmost box on its path a returning edge goes around. */
export const BACK_EDGE_BULGE = 40;
/** Horizontal lane spacing between vertically overlapping back edges. */
export const BACK_EDGE_LANE_GAP = 18;
/** An edge counts as "forward" if the target is at least this far below the source. */
export const FORWARD_MIN_GAP = 16;
/** Position of the label along the edge (0 = source): lands just below the port. */
const LABEL_T = 0.3;

export interface Point {
  x: number;
  y: number;
}

/** Rectangle an edge connects to — both LayoutNode and CanvasNode fit this shape. */
export interface EdgeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Edge drawing style.
 *
 * The design canvas uses orthogonal edges with rounded corners (`routeOrthogonal`);
 * on steps with many exits the curves overlapped. The read-only preview diagram
 * is still Bézier (`routeEdges`). `edgeGeometry(…, 'orthogonal')` is the old sharp-cornered
 * style and was not changed because its spec pins the shape.
 */
export type EdgeStyle = 'bezier' | 'orthogonal';

export interface EdgeGeometry {
  /** SVG `d` attribute. */
  path: string;
  labelX: number;
  labelY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /**
   * The path's four control points. Carried so the hit test does not have to
   * re-parse the `d` string. In `bezier` they are the cubic curve's control points,
   * in `orthogonal` the polyline's corners — both are the same four points.
   */
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  style: EdgeStyle;
  /**
   * Corner points of the polyline (orthogonal) path, ends included. If set, the hit
   * test uses them; rounded corners are close enough for hit testing.
   */
  points?: Point[];
}

/**
 * Edge geometry from the bottom of the source to the top-centre of the target.
 *
 * `sourceOffsetX` is the exit point's horizontal position relative to the source's left — so the approve and
 * reject edges leave from their own ports (see `portPositions`) instead of leaving the same point
 * and overlapping. If not given, bottom-centre.
 *
 * Bounds (min/max) are computed only from the END POINTS, not the control points:
 * a vertical curve does not overflow the box drawn by its ends, and the existing viewBox
 * behaviour was built that way.
 */
export function edgeGeometry(
  source: EdgeBox,
  target: EdgeBox,
  style: EdgeStyle = 'bezier',
  sourceOffsetX?: number
): EdgeGeometry {
  const x1 = source.x + (sourceOffsetX ?? source.width / 2);
  const y1 = source.y + source.height;
  const x2 = target.x + target.width / 2;
  const y2 = target.y;
  const midY = (y1 + y2) / 2;

  const p0: Point = { x: x1, y: y1 };
  const p1: Point = { x: x1, y: midY };
  const p2: Point = { x: x2, y: midY };
  const p3: Point = { x: x2, y: y2 };

  const path = style === 'orthogonal'
    ? `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`
    : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  // The label is near the source, not at the midpoint: you can read which port it leaves from and
  // labels do not pile up above a target with many inputs.
  const label = cubicPointAt(p0, p1, p2, p3, LABEL_T);

  return {
    path,
    labelX: label.x,
    labelY: label.y,
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
    p0, p1, p2, p3,
    style
  };
}

/**
 * Self-loop edge. Leaves from the node's right and enters on its right; a straight line
 * would be invisible.
 */
export function selfLoopGeometry(node: EdgeBox): EdgeGeometry {
  const x = node.x + node.width;
  const yTop = node.y + node.height * 0.3;
  const yBottom = node.y + node.height * 0.7;
  const bulge = 44;

  const p0: Point = { x, y: yBottom };
  const p1: Point = { x: x + bulge, y: yBottom };
  const p2: Point = { x: x + bulge, y: yTop };
  const p3: Point = { x, y: yTop };

  return {
    path: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    labelX: x + bulge,
    labelY: (yTop + yBottom) / 2,
    minX: x,
    minY: yTop,
    maxX: x + bulge,
    maxY: yBottom,
    p0, p1, p2, p3,
    style: 'bezier'
  };
}

/**
 * Returning (rework) edge: the target is not below the source.
 *
 * A curve leaving from the bottom and going down to a target above would pass THROUGH the boxes in between.
 * Instead it leaves from the source's right-centre, opens to the right up to `clearX`,
 * goes around upward and enters the target from its right.
 *
 * A cubic curve cannot reach the x of its control points; the control point is computed so that
 * the curve's rightmost point touches exactly `clearX` (see backControlX).
 */
export function backEdgeGeometry(source: EdgeBox, target: EdgeBox, clearX: number): EdgeGeometry {
  const p0: Point = { x: source.x + source.width, y: source.y + source.height / 2 };
  const p3: Point = { x: target.x + target.width, y: target.y + target.height / 2 };
  const edgeX = Math.max(p0.x, p3.x);
  const controlX = backControlX(p0.x, p3.x, Math.max(clearX, edgeX));

  const p1: Point = { x: controlX, y: p0.y };
  const p2: Point = { x: controlX, y: p3.y };
  const label = cubicPointAt(p0, p1, p2, p3, 0.5);

  return {
    path: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    labelX: label.x,
    labelY: label.y - LABEL_OFFSET,
    minX: Math.min(p0.x, p3.x),
    minY: Math.min(p0.y, p3.y),
    maxX: Math.max(edgeX, clearX),
    maxY: Math.max(p0.y, p3.y),
    p0, p1, p2, p3,
    style: 'bezier'
  };
}

/**
 * For a cubic curve whose two control points share the same `cx`,
 * `x(t) = u³·x0 + 3ut·cx + t³·x3` (u = 1 − t) — for every t it is linear and increasing
 * in cx. The smallest cx at which the curve's apex reaches `clearX` is the minimum of
 * `(clearX − u³·x0 − t³·x3) / 3ut` over t samples. When the ends are at different
 * alignments a fixed ratio (e.g. 3/4) does not hold, and the apex fell short.
 */
function backControlX(x0: number, x3: number, clearX: number): number {
  let best = Infinity;

  for (let i = 1; i < EDGE_SAMPLE_COUNT; i++) {
    const t = i / EDGE_SAMPLE_COUNT;
    const u = 1 - t;
    best = Math.min(best, (clearX - u * u * u * x0 - t * t * t * x3) / (3 * u * t));
  }

  return best;
}

/** Is the target below the source? If not, the edge returns and is routed around the side. */
export function isForward(source: EdgeBox, target: EdgeBox): boolean {
  return target.y >= source.y + source.height + FORWARD_MIN_GAP;
}

/** `routeEdges` input: an edge's ends and exit port. */
export interface EdgeRequest {
  source: EdgeBox;
  target: EdgeBox;
  sourceOffsetX?: number;
}

/**
 * Routes all edges together — back edges' lane assignment depends on each other,
 * so they cannot be computed one by one.
 *
 *   - Forward edge: bezier from the port to the target's top-centre.
 *   - Back edge: from the right of the rightmost box within its vertical range (`obstacles`),
 *     in an outer lane as many as the earlier back edges vertically overlapping it.
 *     Short loops are routed first so they stay inside, long ones open outward.
 *
 * The result is returned in the SAME order as the input.
 */
export function routeEdges(
  requests: ReadonlyArray<EdgeRequest>,
  obstacles: ReadonlyArray<EdgeBox>
): EdgeGeometry[] {
  const result: EdgeGeometry[] = new Array(requests.length);
  const back: Array<{ index: number; top: number; bottom: number }> = [];

  requests.forEach((request, index) => {
    const { source, target, sourceOffsetX } = request;

    if (isForward(source, target)) {
      result[index] = edgeGeometry(source, target, 'bezier', sourceOffsetX);
      return;
    }

    back.push({
      index,
      top: Math.min(source.y, target.y),
      bottom: Math.max(source.y + source.height, target.y + target.height)
    });
  });

  back.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top));

  const routed: Array<{ top: number; bottom: number }> = [];

  for (const item of back) {
    const { source, target } = requests[item.index];

    const rightmost = Math.max(
      source.x + source.width,
      target.x + target.width,
      ...obstacles
        .filter(box => box.y < item.bottom && box.y + box.height > item.top)
        .map(box => box.x + box.width));

    const lane = routed.filter(other => other.top < item.bottom && other.bottom > item.top).length;

    result[item.index] = backEdgeGeometry(
      source, target, rightmost + BACK_EDGE_BULGE + lane * BACK_EDGE_LANE_GAP);
    routed.push({ top: item.top, bottom: item.bottom });
  }

  return result;
}

/**
 * The box a step occupies. Since a parallel step also lists its branches it grows by
 * one row height per branch.
 *
 * This formula used to live separately in the layout and the canvas; it was moved to one place
 * to close the risk of silent drift between the two.
 */
export function nodeSize(step: WorkflowStep): { width: number; height: number } {
  const branchCount = step.type === 'parallel' ? (step.branches ?? []).length : 0;

  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT + branchCount * BRANCH_LINE_HEIGHT
  };
}

/**
 * Horizontal positions of the exit ports below a node (px, relative to the node's left).
 *
 * Evenly spaced and symmetric: `width * (i + 1) / (count + 1)`. For two ports
 * 1/3 and 2/3 — the old fixed 32%/62% values were not symmetric (their centre landed
 * at 47) and could not be generalised to N ports.
 */
export function portPositions(count: number, width: number): number[] {
  if (count <= 0) return [];

  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push((width * (i + 1)) / (count + 1));
  }

  return positions;
}

/** Coordinate of the point at t ∈ [0,1] on a cubic Bézier. */
export function cubicPointAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}

/** Number of samples used in the edge hit test. */
export const EDGE_SAMPLE_COUNT = 24;

/**
 * Shortest distance from a point to an edge (in world coordinates).
 *
 * `path.getTotalLength()` / `isPointInStroke()` are NOT USED: both depend on the DOM,
 * cannot be tested without TestBed and blur the tolerance calculation
 * under zoom. Analytic sampling is cheap enough — 100 edges × 24 samples stay
 * under a millisecond per click.
 */
export function distanceToEdge(geometry: EdgeGeometry, point: Point, samples = EDGE_SAMPLE_COUNT): number {
  const { p0, p1, p2, p3 } = geometry;
  let best = Infinity;

  if (geometry.points && geometry.points.length >= 2) {
    return distanceToPolyline(geometry.points, point);
  }

  if (geometry.style === 'orthogonal') {
    // Polyline: check the nearest of the three straight segments.
    best = Math.min(
      distanceToSegment(point, p0, p1),
      distanceToSegment(point, p1, p2),
      distanceToSegment(point, p2, p3)
    );
    return best;
  }

  let previous = cubicPointAt(p0, p1, p2, p3, 0);
  for (let i = 1; i <= samples; i++) {
    const current = cubicPointAt(p0, p1, p2, p3, i / samples);
    best = Math.min(best, distanceToSegment(point, previous, current));
    previous = current;
  }

  return best;
}

/** Distance from the point to the segment [a,b]. */
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  // Zero-length segment: distance to a single point.
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  // Projections beyond the segment are clamped to the ends.
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));

  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** Shortest distance from the point to a polyline (consecutive segments). */
export function distanceToPolyline(points: ReadonlyArray<Point>, point: Point): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    best = Math.min(best, distanceToSegment(point, points[i - 1], points[i]));
  }
  return best;
}

// ── Orthogonal routing ──────────────────────────────────────

/** Corner rounding radius of an orthogonal edge (px). */
export const EDGE_CORNER_RADIUS = 8;

/**
 * SVG path for a polyline with rounded corners.
 *
 * Each corner is smoothed with a quadratic curve (Q) that does not exceed half of the shorter
 * of the incoming and outgoing segments — so on a short segment the radius does not collide with
 * the neighbouring corner. Intermediate points repeated at the same spot or lying on the same line
 * are dropped; two ends in straight alignment become a single line.
 */
export function roundedPolyline(points: ReadonlyArray<Point>, radius = EDGE_CORNER_RADIUS): string {
  const pts = simplifyPolyline(points);
  if (pts.length === 0) return '';

  let d = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const corner = pts[i];
    const next = pts[i + 1];

    const r = Math.min(radius, distance(prev, corner) / 2, distance(corner, next) / 2);
    const entry = towards(corner, prev, r);
    const exit = towards(corner, next, r);

    d += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
  }

  if (pts.length > 1) {
    const last = pts[pts.length - 1];
    d += ` L ${last.x} ${last.y}`;
  }

  return d;
}

/** Drops repeated intermediate points and those on the same line. */
export function simplifyPolyline(points: ReadonlyArray<Point>): Point[] {
  const unique: Point[] = [];
  for (const point of points) {
    const last = unique[unique.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) unique.push(point);
  }

  if (unique.length < 3) return unique;

  const result: Point[] = [unique[0]];
  for (let i = 1; i < unique.length - 1; i++) {
    const a = result[result.length - 1];
    const b = unique[i];
    const c = unique[i + 1];
    const collinear = (a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y);
    if (!collinear) result.push(b);
  }
  result.push(unique[unique.length - 1]);

  return result;
}

/**
 * Routes all edges orthogonally; the result is returned in the SAME order as the input.
 *
 *   - Forward edge: down from the port, through a horizontal "channel" to the target's alignment, then
 *     to the target's top-centre. The channel is first tried in the gap just below the source;
 *     if the vertical segment going down from there would pass through another box, the gap just
 *     above the target is used (so edges skipping many layers do not cut the boxes in
 *     between). Aligned ends are a single vertical line.
 *   - Back edge (target not below the source): leaves from the source's right, goes around through
 *     the lane outside the rightmost box within its vertical range, enters the target
 *     from its right. Short loops are routed first so they stay inside (see routeEdges).
 */
export function routeOrthogonal(
  requests: ReadonlyArray<EdgeRequest>,
  obstacles: ReadonlyArray<EdgeBox>,
  radius = EDGE_CORNER_RADIUS
): EdgeGeometry[] {
  const result: EdgeGeometry[] = new Array(requests.length);
  const back: Array<{ index: number; top: number; bottom: number }> = [];

  requests.forEach((request, index) => {
    if (isForward(request.source, request.target)) {
      result[index] = forwardOrthogonal(request, obstacles, radius);
      return;
    }

    const { source, target } = request;
    back.push({
      index,
      top: Math.min(source.y, target.y),
      bottom: Math.max(source.y + source.height, target.y + target.height)
    });
  });

  back.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top));
  const routed: Array<{ top: number; bottom: number }> = [];

  for (const item of back) {
    const { source, target } = requests[item.index];

    const rightmost = Math.max(
      source.x + source.width,
      target.x + target.width,
      ...obstacles
        .filter(box => box.y < item.bottom && box.y + box.height > item.top)
        .map(box => box.x + box.width));

    const lane = routed.filter(other => other.top < item.bottom && other.bottom > item.top).length;
    const clearX = rightmost + BACK_EDGE_BULGE + lane * BACK_EDGE_LANE_GAP;

    const start: Point = { x: source.x + source.width, y: source.y + source.height / 2 };
    const end: Point = { x: target.x + target.width, y: target.y + target.height / 2 };
    const points = [start, { x: clearX, y: start.y }, { x: clearX, y: end.y }, end];

    result[item.index] = polylineGeometry(points, radius, {
      x: clearX,
      y: (start.y + end.y) / 2 - LABEL_OFFSET
    });
    routed.push({ top: item.top, bottom: item.bottom });
  }

  return result;
}

function forwardOrthogonal(request: EdgeRequest, obstacles: ReadonlyArray<EdgeBox>, radius: number): EdgeGeometry {
  const { source, target, sourceOffsetX } = request;

  const x1 = source.x + (sourceOffsetX ?? source.width / 2);
  const y1 = source.y + source.height;
  const x2 = target.x + target.width / 2;
  const y2 = target.y;

  // The label is just below the port: you can read which exit it leaves from.
  const label = { x: x1, y: y1 + Math.min(16, (y2 - y1) / 2) };

  if (Math.abs(x1 - x2) < 0.5) {
    return polylineGeometry([{ x: x1, y: y1 }, { x: x1, y: y2 }], radius, label);
  }

  const half = Math.min(ROW_GAP / 2, (y2 - y1) / 2);
  const others = obstacles.filter(box => box !== source && box !== target);

  const below = y1 + half;
  if (!verticalHits(others, x2, below, y2)) {
    return polylineGeometry(
      [{ x: x1, y: y1 }, { x: x1, y: below }, { x: x2, y: below }, { x: x2, y: y2 }], radius, label);
  }

  const above = y2 - half;
  const viaAbove = [{ x: x1, y: y1 }, { x: x1, y: above }, { x: x2, y: above }, { x: x2, y: y2 }];
  if (!verticalHits(others, x1, y1, above)) {
    return polylineGeometry(viaAbove, radius, label);
  }

  // Both channels pass through a box: the one closer to the source is preferred (so the edge
  // is at least readable where it leaves).
  return polylineGeometry(
    [{ x: x1, y: y1 }, { x: x1, y: below }, { x: x2, y: below }, { x: x2, y: y2 }], radius, label);
}

/** Does the vertical segment [y1, y2] at x pass through any box? */
function verticalHits(boxes: ReadonlyArray<EdgeBox>, x: number, y1: number, y2: number): boolean {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return boxes.some(box =>
    x > box.x && x < box.x + box.width && box.y < bottom && box.y + box.height > top);
}

function polylineGeometry(points: Point[], radius: number, label: Point): EdgeGeometry {
  const simplified = simplifyPolyline(points);
  const xs = simplified.map(p => p.x);
  const ys = simplified.map(p => p.y);
  const first = simplified[0];
  const last = simplified[simplified.length - 1];

  return {
    path: roundedPolyline(simplified, radius),
    labelX: label.x,
    labelY: label.y,
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    p0: first,
    p1: simplified[1] ?? last,
    p2: simplified[simplified.length - 2] ?? first,
    p3: last,
    style: 'orthogonal',
    points: simplified
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point advanced by `length` from `from` towards `to`. */
function towards(from: Point, to: Point, length: number): Point {
  const total = distance(from, to);
  if (total === 0) return { ...from };
  return {
    x: from.x + ((to.x - from.x) / total) * length,
    y: from.y + ((to.y - from.y) / total) * length
  };
}
