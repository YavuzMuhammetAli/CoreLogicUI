import { GRID_COLUMNS } from '../../../utils/screen-layout/screen-layout.model';

/**
 * Drag-and-drop geometry — PURE (no DOM; rectangles come from the caller).
 *
 * Canvas items flow left to right, row by row, in a CSS grid. Drop index: if the pointer is
 * above a row, the start of that row; if inside a row, before the first item to the right of the
 * pointer; if neither applies, the end of the section.
 */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Top-edge difference (px) within which items count as the same row. */
const ROW_TOLERANCE = 6;

/** Drop index within a section; items are given in DOM (flow) order. */
export function dropIndex(items: readonly Rect[], point: Point): number {
  let i = 0;
  while (i < items.length) {
    // Collect the items on the same row.
    const rowTop = items[i].top;
    let j = i;
    let rowBottom = items[i].bottom;
    while (j + 1 < items.length && Math.abs(items[j + 1].top - rowTop) <= ROW_TOLERANCE) {
      j++;
      rowBottom = Math.max(rowBottom, items[j].bottom);
    }

    if (point.y < rowTop) return i;
    if (point.y <= rowBottom) {
      for (let k = i; k <= j; k++) {
        if (point.x < (items[k].left + items[k].right) / 2) return k;
      }
      return j + 1;
    }
    i = j + 1;
  }
  return items.length;
}

/** Index of the rectangle under the pointer (otherwise the vertically nearest); -1 if the list is empty. */
export function nearestRect(rects: readonly Rect[], point: Point): number {
  let best = -1;
  let bestDistance = Infinity;
  rects.forEach((r, index) => {
    const inside = point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom;
    if (inside) {
      best = index;
      bestDistance = -1;
      return;
    }
    if (bestDistance < 0) return;
    const dy = point.y < r.top ? r.top - point.y : point.y > r.bottom ? point.y - r.bottom : 0;
    const dx = point.x < r.left ? r.left - point.x : point.x > r.right ? point.x - r.right : 0;
    const distance = dy * 4 + dx;   // vertical distance is more decisive
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

/** Gap-inclusive pitch of one grid column: (content width + gap) / 12. */
export function colPitch(gridWidth: number, gap: number): number {
  return (gridWidth + gap) / GRID_COLUMNS;
}

/** Width dragged from the right edge: start + horizontal offset / pitch, 1–12. */
export function spanFromDrag(startSpan: number, dx: number, pitch: number): number {
  if (pitch <= 0) return startSpan;
  return Math.min(GRID_COLUMNS, Math.max(1, Math.round(startSpan + dx / pitch)));
}

/** List header: before the first header to the right of the pointer, otherwise at the end. */
export function headerDropIndex(headers: readonly Rect[], x: number): number {
  for (let i = 0; i < headers.length; i++) {
    if (x < (headers[i].left + headers[i].right) / 2) return i;
  }
  return headers.length;
}

/** Dragged width of a list column (px, within bounds). */
export function widthFromDrag(startWidth: number, dx: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(startWidth + dx)));
}

/** A movement shorter than 4 px is a click, not a drag. */
export function exceedsDragThreshold(dx: number, dy: number, threshold = 4): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}
