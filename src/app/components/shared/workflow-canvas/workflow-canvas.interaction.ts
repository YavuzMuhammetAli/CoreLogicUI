import { GRID_STEP, Point } from './workflow-canvas.camera';

/**
 * Tuval etkileşim kuralları — SAF fonksiyonlar, DOM yok.
 *
 * Bileşen olayları dinler; "bu bir tıklama mı sürükleme mi", "düğüm nereye
 * yapışır", "çoklu sürüklemede kim nereye gider" kararları burada ve spec'li.
 */

/**
 * Basıp bu kadar (ekran pikseli) kıpırdamadan bırakmak tıklamadır. Eşiksiz her
 * tıklama bir "taşıma" sayılıyor ve elin titremesi düğümü 1 px oynatıp geri al
 * geçmişine boş bir adım düşürüyordu.
 */
export const DRAG_THRESHOLD = 4;

/** Ok tuşuyla itme adımı (px); Shift ile ızgara adımı. */
export const NUDGE_STEP = 1;

export function exceedsThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/**
 * Değeri ızgaraya yapıştırır. `Math.round` (floor değil): negatif ve pozitif
 * yönde simetrik — ızgara çizgisinin iki yanındaki düğüm en yakın çizgiye gider.
 */
export function snapValue(value: number, enabled: boolean, grid = GRID_STEP): number {
  if (!enabled || grid <= 0) return value;
  // -0 yerine 0 (yuvarlamada -0.4 → -0 çıkıyor).
  return Math.round(value / grid) * grid + 0;
}

/**
 * Sürüklenen düğümlerin yeni konumları.
 *
 * Ekran farkı dünya birimine çevrilir (`/ zoom`); aksi halde uzaklaşınca düğüm
 * imlecin gerisinde kalırdı. Yapıştırma her düğümün KENDİ konumuna uygulanır
 * (grubun ortak ofsetine değil) — zaten ızgaraya oturmuş düğümler birlikte
 * hizalı kalır. Negatif konuma izin verilmez: tuvalin dışına kaçan düğüm geri
 * getirilemezdi.
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
      x: Math.max(0, snapValue(origin.x + screenDx / scale, snap)),
      y: Math.max(0, snapValue(origin.y + screenDy / scale, snap))
    });
  }

  return result;
}

/** Ok tuşu yönü → dünya kayması. Shift ızgara adımı kadar iter. */
export function nudgeDelta(direction: 'left' | 'right' | 'up' | 'down', large: boolean): Point {
  const step = large ? GRID_STEP : NUDGE_STEP;
  switch (direction) {
    case 'left':  return { x: -step, y: 0 };
    case 'right': return { x: step, y: 0 };
    case 'up':    return { x: 0, y: -step };
    case 'down':  return { x: 0, y: step };
  }
}

/** Açılan menünün pencere kenarına bırakılan boşluk (px). */
export const MENU_MARGIN = 8;

/**
 * Açılır menüyü pencereye sığdırır. Sağa sığmazsa imlecin soluna, alta
 * sığmazsa üstüne açılır (işletim sistemi menüleri gibi); o da sığmazsa
 * kenara yaslanır. Pencereden büyük menü sol-üst kenara oturur.
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

/** İki köşeden normalleştirilmiş dikdörtgen (lasso çizimi için). */
export function normalizedRect(a: Point, b: Point): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}
