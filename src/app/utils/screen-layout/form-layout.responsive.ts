import { GRID_COLUMNS } from './screen-layout.model';
import { PlanItem } from './form-layout.resolve';

/**
 * Responsive width — PURE.
 *
 * The tier is chosen from the width of the form's CONTAINER, not the screen: the same form sits in a
 * wide container on the record page and a narrower one in the sub-record pop-up, and each must
 * behave according to its own width. (CSS container queries were deliberately not used: the container
 * can become the containing block for `position: fixed` descendants and the lookup picker's dropdown
 * relies on viewport coordinates.)
 *
 *  - wide   (≥ 720 px): the designed width.
 *  - medium (480–719):  6 and below become half, above becomes a full row.
 *  - narrow (< 480):    everything is a full row; spacer items are not drawn.
 */
export type WidthTier = 'wide' | 'medium' | 'narrow';

export const WIDE_MIN_PX = 720;
export const MEDIUM_MIN_PX = 480;

export function widthTier(px: number): WidthTier {
  if (px >= WIDE_MIN_PX) return 'wide';
  if (px >= MEDIUM_MIN_PX) return 'medium';
  return 'narrow';
}

export function effectiveSpan(span: number, tier: WidthTier): number {
  const clamped = Math.min(GRID_COLUMNS, Math.max(1, Math.round(span)));
  if (tier === 'wide') return clamped;
  if (tier === 'medium') return clamped <= GRID_COLUMNS / 2 ? GRID_COLUMNS / 2 : GRID_COLUMNS;
  return GRID_COLUMNS;
}

/** In a narrow container a spacer would waste a whole row — not drawn. */
export function visibleAtTier(item: PlanItem, tier: WidthTier): boolean {
  return !(item.kind === 'spacer' && tier === 'narrow');
}

/** Number of grid columns the item occupies (a divider is always a full row). */
export function itemSpan(item: PlanItem, tier: WidthTier): number {
  return item.kind === 'divider' ? GRID_COLUMNS : effectiveSpan(item.span, tier);
}
