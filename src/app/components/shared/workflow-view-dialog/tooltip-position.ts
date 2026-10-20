export interface AnchorBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

export interface TipPlacement {
  top: number;
  left: number;
  side: 'above' | 'below';
}

/**
 * Düğüm ipucunun ekrandaki yeri — SAF (help-hint ile aynı kural).
 *
 * Önce düğümün altı denenir, sığmazsa üstü; ikisine de sığmıyorsa (uzun rol üye
 * listesi, alçak telefon ekranı) daha geniş taraf seçilip ekrana kenetlenir.
 * Yatayda düğüme ortalanır, sonra kenar payı kadar içeride tutulur.
 */
export function placeTooltip(
  anchor: AnchorBox,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
  margin = 8
): TipPlacement {
  const roomBelow = viewport.height - anchor.bottom - gap - margin;
  const roomAbove = anchor.top - gap - margin;

  let side: TipPlacement['side'];
  if (tip.height <= roomBelow) side = 'below';
  else if (tip.height <= roomAbove) side = 'above';
  else side = roomBelow >= roomAbove ? 'below' : 'above';

  const rawTop = side === 'below' ? anchor.bottom + gap : anchor.top - gap - tip.height;
  const maxTop = Math.max(margin, viewport.height - tip.height - margin);
  const top = Math.min(Math.max(rawTop, margin), maxTop);

  const centered = anchor.left + anchor.width / 2 - tip.width / 2;
  const maxLeft = Math.max(margin, viewport.width - tip.width - margin);
  const left = Math.min(Math.max(centered, margin), maxLeft);

  return { top, left, side };
}
