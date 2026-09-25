/**
 * Canvas kamerası — SAF fonksiyonlar, Angular ve DOM import'u YOK.
 *
 * Kamera, dünya koordinatını ekrana yansıtan TEK afin dönüşümdür:
 *
 *     ekran = dünya × zoom + pan + viewport.sol
 *
 * Dünya koordinatı hiç değişmez: `layoutWorkflow()`, `step.x/y` ve düğümlerin
 * `left/top` değerleri bugünkü anlamını korur. Tasarımcı yalnızca bu dönüşümü
 * değiştirerek yakınlaşır/kaydırır.
 *
 * Kaydırma `overflow: auto` ile YAPILMAZ. `scrollLeft/scrollTop` ile `transform`
 * aynı anda haritalamaya karışır ve kaydırılabilir alan `scale` ile birlikte
 * büyümez; iki doğruluk kaynağı sürekli bir hata kaynağı olurdu.
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

/** Viewport'un ekrandaki yeri ve ölçüsü — `getBoundingClientRect()` ile uyumlu. */
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
  // NaN savunması: sıfıra bölme sonucu kameraya sızarsa tüm şema kaybolurdu.
  // Sonsuz değerler ayrı ele alınmaz, aşağıdaki kelepçe onları zaten sınıra çeker.
  if (Number.isNaN(zoom)) return 1;

  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Ekran (client) koordinatını dünya koordinatına çevirir. */
export function screenToWorld(clientX: number, clientY: number, rect: ViewportRect, camera: Camera): Point {
  return {
    x: (clientX - rect.left - camera.panX) / camera.zoom,
    y: (clientY - rect.top - camera.panY) / camera.zoom
  };
}

/** Dünya koordinatını ekran (client) koordinatına çevirir. */
export function worldToScreen(x: number, y: number, rect: ViewportRect, camera: Camera): Point {
  return {
    x: x * camera.zoom + camera.panX + rect.left,
    y: y * camera.zoom + camera.panY + rect.top
  };
}

/**
 * İmcin altındaki dünya noktasını SABİT TUTARAK yakınlaştırır.
 *
 * Bu, wheel zoom'un "imce yapışkan" hissini veren tek formül:
 *     pan' = çapa − (çapa − pan) × (zoom' / zoom)
 *
 * Çapasız (merkezden) zoom yapılsaydı kullanıcı her tekerlek hareketinde
 * baktığı yeri kaybederdi.
 */
export function zoomAt(camera: Camera, factor: number, anchorClientX: number, anchorClientY: number, rect: ViewportRect): Camera {
  const zoom = clampZoom(camera.zoom * factor);
  // Kelepçeye çarptıysak oran 1 olur ve pan hiç oynamaz.
  const ratio = zoom / camera.zoom;

  const anchorX = anchorClientX - rect.left;
  const anchorY = anchorClientY - rect.top;

  return {
    zoom,
    panX: anchorX - (anchorX - camera.panX) * ratio,
    panY: anchorY - (anchorY - camera.panY) * ratio
  };
}

/** Viewport merkezinden yakınlaştırır — araç çubuğu düğmeleri için. */
export function zoomAtCenter(camera: Camera, factor: number, rect: ViewportRect): Camera {
  return zoomAt(camera, factor, rect.left + rect.width / 2, rect.top + rect.height / 2, rect);
}

/** Kamerayı ekran pikseli kadar kaydırır. */
export function panBy(camera: Camera, deltaX: number, deltaY: number): Camera {
  return { zoom: camera.zoom, panX: camera.panX + deltaX, panY: camera.panY + deltaY };
}

/**
 * Verilen dünya sınırlarını viewport'a sığdırır ve ortalar.
 *
 * `maxZoom` varsayılanı 1: tek düğümlü bir şemayı ekranı dolduracak kadar
 * büyütmek istemiyoruz, sığdırmak "her şeyi gör" demek, "yakınlaş" demek değil.
 */
export function fitToView(bounds: Bounds, viewport: { width: number; height: number }, padding = 32, maxZoom = 1): Camera {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Ölçüsüz sınır ya da henüz yerleşmemiş viewport: kamerayı oynatma.
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

  return {
    zoom,
    panX: (viewport.width - width * zoom) / 2 - bounds.minX * zoom,
    panY: (viewport.height - height * zoom) / 2 - bounds.minY * zoom
  };
}

/** Düğüm kutularından kapsayan sınır. Liste boşsa null. */
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
