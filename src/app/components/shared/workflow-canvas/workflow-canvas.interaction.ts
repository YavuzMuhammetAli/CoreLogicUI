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

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Yeni düğümle komşuları arasında bırakılacak asgari boşluk (px). */
export const PLACEMENT_MARGIN = 16;
/** Yeni düğüm çıkışın bu kadar altına konur (katman aralığı — "onay" etiketi sığsın). */
export const PLACEMENT_ROW_GAP = 80;
/** Yer aranırken en fazla kaç kez sağa kaydırılır — kötü durumda bile sonlansın. */
const PLACEMENT_MAX_TRIES = 24;

function overlaps(a: Box, b: Box, margin: number): boolean {
  return a.x < b.x + b.width + margin && b.x < a.x + a.width + margin
    && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
}

/**
 * Bağlı eklenen düğümün yeri: kaynağın, bağlanan portun hizasında altı. Oradaki
 * yer doluysa düğüm genişliği kadar sağa kayarak boş yer aranır (aynı çıkış
 * sırasındaki kardeşler yan yana dizilir). Izgaraya oturur, negatife düşmez.
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
 * `start`tan başlayıp sağa doğru, hiçbir kutuya binmeyen ilk ızgara konumu.
 * Yer bulunamazsa başlangıç konumu döner (kullanıcı taşır; sonsuz döngü olmaz).
 */
export function findFreeSpot(
  start: Point,
  size: { width: number; height: number },
  others: ReadonlyArray<Box>,
  grid = GRID_STEP
): Point {
  const startX = Math.max(0, snapValue(start.x, true, grid));
  const y = Math.max(0, snapValue(start.y, true, grid));

  let x = startX;
  for (let i = 0; i < PLACEMENT_MAX_TRIES; i++) {
    const candidate = { x, y, width: size.width, height: size.height };
    if (!others.some(box => overlaps(candidate, box, PLACEMENT_MARGIN))) return { x, y };
    x = snapValue(x + size.width + PLACEMENT_MARGIN * 2, true, grid);
  }
  return { x: startX, y };
}

/** Bırakılan / sağ tıklanan noktaya ortalanmış, ızgaraya oturmuş düğüm konumu. */
export function centeredAt(point: Point, size: { width: number; height: number }, grid = GRID_STEP): Point {
  return {
    x: Math.max(0, snapValue(point.x - size.width / 2, true, grid)),
    y: Math.max(0, snapValue(point.y - size.height / 2, true, grid))
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
