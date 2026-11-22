/**
 * Canvas camera — PURE functions, NO Angular or DOM imports.
 *
 * The camera is the SINGLE affine transform projecting world coordinates onto the screen:
 *
 *     screen = world × zoom + pan + viewport.left
 *
 * World coordinates never change: `layoutWorkflow()`, `step.x/y` and the nodes'
 * `left/top` values keep their current meaning. The designer zooms/pans only by
 * changing this transform.
 *
 * Panning is NOT done with `overflow: auto`. `scrollLeft/scrollTop` and `transform`
 * would both take part in the mapping, and the scrollable area doesn't grow along with
 * `scale`; two sources of truth would be a constant source of bugs.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
}

/** On-screen position and size of the viewport — compatible with `getBoundingClientRect()`. */
export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 1.15;

export const IDENTITY_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 };

export function clampZoom(zoom: number): number {
  // NaN guard: if a division-by-zero result leaked into the camera, the whole diagram would vanish.
  // Infinite values aren't handled separately; the clamp below pulls them to the limit anyway.
  if (Number.isNaN(zoom)) return 1;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Converts a screen (client) coordinate to a world coordinate. */
export function screenToWorld(clientX: number, clientY: number, rect: ViewportRect, camera: Camera): Point {
  return {
    x: (clientX - rect.left - camera.panX) / camera.zoom,
    y: (clientY - rect.top - camera.panY) / camera.zoom
  };
}

/** Converts a world coordinate to a screen (client) coordinate. */
export function worldToScreen(x: number, y: number, rect: ViewportRect, camera: Camera): Point {
  return {
    x: x * camera.zoom + camera.panX + rect.left,
    y: y * camera.zoom + camera.panY + rect.top
  };
}

/**
 * Zooms while KEEPING the world point under the cursor FIXED.
 *
 * This is the one formula that gives wheel zoom its "sticks to the cursor" feel:
 *     pan' = anchor − (anchor − pan) × (zoom' / zoom)
 *
 * With anchorless (centre) zoom the user would lose the spot they were looking at
 * on every wheel movement.
 */
export function zoomAt(camera: Camera, factor: number, anchorClientX: number, anchorClientY: number, rect: ViewportRect): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  // If we hit the clamp the ratio is 1 and pan doesn't move at all.
  const ratio = zoom / camera.zoom;

  const anchorX = anchorClientX - rect.left;
  const anchorY = anchorClientY - rect.top;

  return {
    zoom,
    panX: anchorX - (anchorX - camera.panX) * ratio,
    panY: anchorY - (anchorY - camera.panY) * ratio
  };
}

/** Zooms from the viewport centre — for the toolbar buttons. */
export function zoomAtCenter(camera: Camera, factor: number, rect: ViewportRect): Camera {
  return zoomAt(camera, factor, rect.left + rect.width / 2, rect.top + rect.height / 2, rect);
}

/** Pans the camera by screen pixels. */
export function panBy(camera: Camera, deltaX: number, deltaY: number): Camera {
  return { zoom: camera.zoom, panX: camera.panX + deltaX, panY: camera.panY + deltaY };
}

/**
 * Fits the given world bounds into the viewport.
 *
 * `maxZoom` defaults to 1: we don't want to enlarge a single-node diagram to fill the
 * screen; fitting means "see everything", not "zoom in".
 *
 * `align`: `center` centres the bounds; `start` aligns them to the top-left corner (inset by the
 * padding). The designer uses `start` — a small diagram left at zoom 1 sitting in the middle with
 * space all around looked "not fitted".
 */
export function fitToView(
  bounds: Bounds,
  viewport: { width: number; height: number },
  padding = 32,
  maxZoom = 1,
  align: 'center' | 'start' = 'center'
): Camera {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Zero-size bounds or a viewport not yet laid out: don't move the camera.
  if (width <= 0 || height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return IDENTITY_CAMERA;
  }

  const available = {
    width: Math.max(1, viewport.width - padding * 2),
    height: Math.max(1, viewport.height - padding * 2)
  };

  const zoom = clampZoom(Math.min(
    Math.min(available.width / width, available.height / height),
    Math.min(maxZoom, MAX_ZOOM)
  ));

  if (align === 'start') {
    return {
      zoom,
      panX: padding - bounds.minX * zoom,
      panY: padding - bounds.minY * zoom
    };
  }

  return {
    zoom,
    panX: (viewport.width - width * zoom) / 2 - bounds.minX * zoom,
    panY: (viewport.height - height * zoom) / 2 - bounds.minY * zoom
  };
}

/**
 * The SMALLEST pan that brings the box (world coordinates) into view; if it's already
 * visible the same camera object is returned. Zoom doesn't change. If the box is larger than
 * the visible area its left/top edge is aligned (so the title and name are visible).
 */
export function revealBox(
  camera: Camera,
  box: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  margin = 24
): Camera {
  const axis = (start: number, extent: number, pan: number, size: number): number => {
    const from = start * camera.zoom + pan;
    const to = (start + extent) * camera.zoom + pan;
    if (from < margin || to - from > size - margin * 2) return margin - from;
    if (to > size - margin) return size - margin - to;
    return 0;
  };

  if (viewport.width <= 0 || viewport.height <= 0) return camera;

  const dx = axis(box.x, box.width, camera.panX, viewport.width);
  const dy = axis(box.y, box.height, camera.panY, viewport.height);
  return dx === 0 && dy === 0 ? camera : panBy(camera, dx, dy);
}

/** Base grid spacing in world units (px between dots at zoom 1). */
export const GRID_STEP = 20;
/** A grid denser than this turns into noise; the spacing is doubled. */
export const GRID_MIN_SCREEN_STEP = 10;

/**
 * Screen-space size and offset of the dotted grid in the viewport background.
 *
 * The grid is drawn on the viewport, not on `.canvas-world`: the world element is only as large
 * as its content, so when zooming out/panning the rest of the window was left without a grid.
 * To stay in sync with the camera the spacing scales with zoom and shifts by pan —
 * the dots stay tied to world coordinates and move with the nodes.
 */
export function gridStyle(camera: Camera): { step: number; offsetX: number; offsetY: number } {
  let step = GRID_STEP * camera.zoom;
  // As you zoom out the spacing doubles (like in design tools). zoom ≤ 0
  // guard: avoid an infinite loop.
  while (step > 0 && step < GRID_MIN_SCREEN_STEP) step *= 2;
  if (step <= 0) step = GRID_STEP;

  return { step, offsetX: positiveMod(camera.panX, step), offsetY: positiveMod(camera.panY, step) };
}

/** JS `%` can return a negative result; background-position needs the range [0, m). */
function positiveMod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/** Enclosing bounds of the node boxes. Null if the list is empty. */
export function boundsOf(boxes: ReadonlyArray<{ x: number; y: number; width: number; height: number }>): Bounds | null {
  if (boxes.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const box of boxes) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }

  return { minX, minY, maxX, maxY };
}
