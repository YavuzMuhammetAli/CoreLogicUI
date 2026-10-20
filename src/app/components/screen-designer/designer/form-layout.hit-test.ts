import { GRID_COLUMNS } from '../../../utils/screen-layout/screen-layout.model';

/**
 * Sürükle-bırak geometrisi — SAF (DOM yok; dikdörtgenler çağırandan gelir).
 *
 * Tuval öğeleri CSS grid'de soldan sağa, satır satır akar. Bırakma sırası: imleç bir satırın
 * üstündeyse o satırın başı; satırın içindeyse imlecin solunda kalan ilk öğenin önü; hiçbirine
 * uymuyorsa bölümün sonu.
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

/** Aynı satırda sayılan öğelerin üst kenar farkı (px). */
const ROW_TOLERANCE = 6;

/** Bölüm içindeki bırakma sırası; öğeler DOM (akış) sırasıyla verilir. */
export function dropIndex(items: readonly Rect[], point: Point): number {
  let i = 0;
  while (i < items.length) {
    // Aynı satırdaki öğeleri topla.
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

/** İmlecin üstünde olduğu (yoksa dikeyde en yakın) dikdörtgenin sırası; liste boşsa -1. */
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
    const distance = dy * 4 + dx;   // dikey uzaklık daha belirleyici
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

/** Bir ızgara kolonunun aralıklı adımı: (içerik genişliği + aralık) / 12. */
export function colPitch(gridWidth: number, gap: number): number {
  return (gridWidth + gap) / GRID_COLUMNS;
}

/** Sağ kenardan sürüklenen genişlik: başlangıç + yatay kayma / adım, 1–12. */
export function spanFromDrag(startSpan: number, dx: number, pitch: number): number {
  if (pitch <= 0) return startSpan;
  return Math.min(GRID_COLUMNS, Math.max(1, Math.round(startSpan + dx / pitch)));
}

/** Liste başlığı: imlecin solunda kalan ilk başlığın önü, yoksa sona. */
export function headerDropIndex(headers: readonly Rect[], x: number): number {
  for (let i = 0; i < headers.length; i++) {
    if (x < (headers[i].left + headers[i].right) / 2) return i;
  }
  return headers.length;
}

/** Liste kolonunun sürüklenen genişliği (px, sınırlar içinde). */
export function widthFromDrag(startWidth: number, dx: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(startWidth + dx)));
}

/** 4 px'ten kısa hareket tıklamadır, sürükleme değil. */
export function exceedsDragThreshold(dx: number, dy: number, threshold = 4): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}
