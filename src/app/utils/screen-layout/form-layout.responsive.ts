import { GRID_COLUMNS } from './screen-layout.model';
import { PlanItem } from './form-layout.resolve';

/**
 * Duyarlı genişlik — SAF.
 *
 * Kademe ekranın değil, formun KABININ genişliğinden seçilir: aynı form kayıt sayfasında
 * geniş, alt kayıt pop-up'ında daha dar bir kapta durur ve ikisi kendi genişliğine göre
 * davranmalıdır. (CSS container query bilinçli kullanılmadı: kap `position: fixed` torunlar
 * için kapsayan blok olabiliyor ve lookup seçicinin açılır listesi viewport koordinatına
 * güveniyor.)
 *
 *  - wide   (≥ 720 px): tasarlanan genişlik.
 *  - medium (480–719):  6 ve altı yarıma, üstü tam satıra.
 *  - narrow (< 480):    her şey tam satır; boşluk öğeleri çizilmez.
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

/** Dar kapta boşluk öğesi bir satırı boş yere kaplardı — çizilmez. */
export function visibleAtTier(item: PlanItem, tier: WidthTier): boolean {
  return !(item.kind === 'spacer' && tier === 'narrow');
}

/** Öğenin ızgara hücresinde kapladığı kolon sayısı (ayırıcı hep tam satır). */
export function itemSpan(item: PlanItem, tier: WidthTier): number {
  return item.kind === 'divider' ? GRID_COLUMNS : effectiveSpan(item.span, tier);
}
