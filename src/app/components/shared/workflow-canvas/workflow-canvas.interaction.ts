import { GRID_STEP, Point } from './workflow-canvas.camera';

/**
 * Canvas interaction rules — PURE functions, no DOM.
 *
 * The component listens to events; the "is this a click or a drag", "where does the node
 * snap", "where does each node go in a multi-drag" decisions live here, with specs.
 */

/**
 * Pressing and releasing without moving this much (screen pixels) is a click. Without a threshold every
 * click counted as a "move", and a shaky hand nudged the node by 1 px and dropped an empty step
 * into the undo history.
 */
export const DRAG_THRESHOLD = 4;

/** Arrow-key nudge step (px); a grid step with Shift. */
export const NUDGE_STEP = 1;

export function exceedsThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/**
 * Snaps the value to the grid. `Math.round` (not floor): symmetric in the negative and positive
 * directions — a node on either side of a grid line goes to the nearest line.
 */
export function snapValue(value: number, enabled: boolean, grid = GRID_STEP): number {
  if (!enabled || grid <= 0) return value;
  // 0 instead of -0 (rounding -0.4 gives -0).
  return Math.round(value / grid) * grid + 0;
}

/**
 * New positions of the dragged nodes.
 *
 * The screen delta is converted to world units (`/ zoom`); otherwise when zoomed out the node
 * would lag behind the cursor. Snapping is applied to each node's OWN position
 * (not the group's shared offset) — nodes already on the grid stay aligned
 * together. Negative positions are allowed: since the canvas can be panned in every direction
 * (camera + "fit"), nodes must be movable to the left of/above the drawing too.
 */
export function dragPositions(
  origins: ReadonlyMap<string, Point>,
  screenDx: number,
  screenDy: number,
  zoom: number,
  snap: boolean
): Map<string, Point> {
  const scale = zoom > 0 ? zoom : 1;
  const result = new Map<string, Point>();

  for (const [key, origin] of origins) {
    result.set(key, {
      x: snapValue(origin.x + screenDx / scale, snap),
      y: snapValue(origin.y + screenDy / scale, snap)
    });
  }

  return result;
}

/** Arrow key direction → world offset. Shift nudges by a grid step. */
export function nudgeDelta(direction: 'left' | 'right' | 'up' | 'down', large: boolean): Point {
  const step = large ? GRID_STEP : NUDGE_STEP;
  switch (direction) {
    case 'left':  return { x: -step, y: 0 };
    case 'right': return { x: step, y: 0 };
    case 'up':    return { x: 0, y: -step };
    case 'down':  return { x: 0, y: step };
  }
}

/** Gap left between an opened menu and the window edge (px). */
export const MENU_MARGIN = 8;

/**
 * Fits a dropdown menu inside the window. If it doesn't fit to the right it opens left of the cursor,
 * if it doesn't fit below it opens above (like OS menus); if that doesn't fit either it
 * leans against the edge. A menu larger than the window sits at the top-left edge.
 */
export function clampToWindow(
  at: Point,
  size: { width: number; height: number },
  windowSize: { width: number; height: number },
  margin = MENU_MARGIN
): Point {
  const axis = (start: number, extent: number, limit: number): number => {
    if (start + extent <= limit - margin) return start;
    const flipped = start - extent;
    if (flipped >= margin) return flipped;
    return Math.max(margin, limit - margin - extent);
  };

  return {
    x: axis(at.x, size.width, windowSize.width),
    y: axis(at.y, size.height, windowSize.height)
  };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Minimum gap to leave between a new node and its neighbours (px). */
export const PLACEMENT_MARGIN = 16;
/** A new node is placed this far below the exit (layer gap — so the "onay" (approve) label fits). */
export const PLACEMENT_ROW_GAP = 80;
/** Maximum number of shifts to the right when looking for space — so it terminates even in the worst case. */
const PLACEMENT_MAX_TRIES = 24;

function overlaps(a: Box, b: Box, margin: number): boolean {
  return a.x < b.x + b.width + margin && b.x < a.x + a.width + margin
    && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
}

/**
 * Position of a node added as connected: below the source, aligned with the connected port. If that
 * spot is taken, free space is searched by shifting right by the node width (siblings in the same exit
 * order line up side by side). Snaps to the grid.
 */
export function placeBelow(
  source: Box,
  portOffset: number,
  size: { width: number; height: number },
  others: ReadonlyArray<Box>,
  grid = GRID_STEP
): Point {
  const start = {
    x: source.x + portOffset - size.width / 2,
    y: source.y + source.height + PLACEMENT_ROW_GAP
  };
  return findFreeSpot(start, size, others, grid);
}

/**
 * The first grid position, starting from `start` and moving right, that overlaps no box.
 * If none is found, the start position is returned (the user moves it; no infinite loop).
 */
export function findFreeSpot(
  start: Point,
  size: { width: number; height: number },
  others: ReadonlyArray<Box>,
  grid = GRID_STEP
): Point {
  const startX = snapValue(start.x, true, grid);
  const y = snapValue(start.y, true, grid);

  let x = startX;
  for (let i = 0; i < PLACEMENT_MAX_TRIES; i++) {
    const candidate = { x, y, width: size.width, height: size.height };
    if (!others.some(box => overlaps(candidate, box, PLACEMENT_MARGIN))) return { x, y };
    x = snapValue(x + size.width + PLACEMENT_MARGIN * 2, true, grid);
  }
  return { x: startX, y };
}

/** Node position centred on the dropped / right-clicked point, snapped to the grid. */
export function centeredAt(point: Point, size: { width: number; height: number }, grid = GRID_STEP): Point {
  return {
    x: snapValue(point.x - size.width / 2, true, grid),
    y: snapValue(point.y - size.height / 2, true, grid)
  };
}

/** Rectangle normalised from two corners (for drawing the lasso). */
export function normalizedRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}
