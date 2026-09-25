import { WorkflowStep } from '../../../models/workflow.model';

/**
 * Akış şeması geometrisi — SAF fonksiyonlar, Angular import'u YOK.
 *
 * Bu dosya yalnızca MATEMATİĞİ taşır: bir kenarın yolu nereden geçer, bir düğüm
 * ne kadar yer kaplar, portlar nereye düşer. "Hangi hedef çizilir" POLİTİKASI
 * burada değildir — onu iki çağıran kendi yerinde tutar ve kasıtlı olarak farklı
 * davranırlar:
 *
 *   workflow-graph.layout.ts  → boş hedefi terminale düşürür, terminalleri çizer
 *   workflow-canvas.component → boş hedefi hiç çizmez, terminalleri çizmez
 *
 * Ortak olan tek şey formüldü; duplike olan da oydu. Politika ayrı kaldığı için
 * iki çağıranın davranışı bu ayrıştırmayla değişmez.
 */

export const NODE_WIDTH = 168;
/**
 * Canvas kutusu bu yükseklikte SABİT çizilir (min-height değil). Daha önce 52'ydi
 * ve DOM içeriği (başlık + anahtar + padding) kutuyu ~60px'e uzatıyordu; model
 * gerçekte olduğundan kısa sandığı için alt satır kutunun üstüne biniyordu.
 */
export const NODE_HEIGHT = 60;
/** Aynı katmandaki iki kutu arası. */
export const COLUMN_GAP = 56;
/** Katmanlar arası — "onay"/"red" etiketi ve ok başı buraya sığmalı. */
export const ROW_GAP = 80;
export const PADDING = 24;
export const TERMINAL_HEIGHT = 34;
export const LABEL_OFFSET = 6;
/** Paralel kutuda her dal satırının yüksekliği. */
export const BRANCH_LINE_HEIGHT = 15;
/** Geri dönen kenarın, yolundaki en sağ kutudan ne kadar açıkta dolaşacağı. */
export const BACK_EDGE_BULGE = 40;
/** Dikeyde örtüşen geri dönüşler arasındaki yatay şerit aralığı. */
export const BACK_EDGE_LANE_GAP = 18;
/** Hedef, kaynağın altından en az bu kadar aşağıdaysa kenar "ileri" sayılır. */
export const FORWARD_MIN_GAP = 16;
/** Etiketin kenar üzerindeki konumu (0 = kaynak): portun hemen altına düşer. */
const LABEL_T = 0.3;

export interface Point {
  x: number;
  y: number;
}

/** Kenarın bağlandığı dikdörtgen — hem LayoutNode hem CanvasNode bu şekle uyar. */
export interface EdgeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Kenar çizim biçimi.
 *
 * `orthogonal` bugün kullanılmıyor ama parametre şimdiden duruyor: N-yollu
 * dallanma geldiğinde aynı iki düğüm arasındaki paralel eğriler üst üste biner
 * ve dik köşeli yola geçmek gerekir. Parametreyi sonradan eklemek iki çağıranı
 * da tekrar açmak demekti.
 */
export type EdgeStyle = 'bezier' | 'orthogonal';

export interface EdgeGeometry {
  /** SVG `d` özniteliği. */
  path: string;
  labelX: number;
  labelY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /**
   * Yolun dört kontrol noktası. Hit-test'in `d` string'ini yeniden ayrıştırmak
   * zorunda kalmaması için taşınır. `bezier`de kübik eğrinin kontrol noktaları,
   * `orthogonal`de kırık çizginin köşeleri — ikisi de aynı dört nokta.
   */
  p0: Point;
  p1: Point;
  p2: Point;
  p3: Point;
  style: EdgeStyle;
}

/**
 * Kaynağın altından hedefin üst-ortasına kenar geometrisi.
 *
 * `sourceOffsetX` çıkış noktasının kaynağın soluna göre yatay konumudur — onay ve
 * red kenarları kendi portlarından (bkz. `portPositions`) çıksın, aynı noktadan
 * çıkıp üst üste binmesin diye. Verilmezse alt-orta.
 *
 * Sınırlar (min/max) yalnızca UÇ NOKTALARDAN hesaplanır, kontrol noktalarından
 * değil: dikey eğri uçların çizdiği kutunun dışına taşmaz ve mevcut viewBox
 * davranışı böyle kurulmuştu.
 */
export function edgeGeometry(
  source: EdgeBox,
  target: EdgeBox,
  style: EdgeStyle = 'bezier',
  sourceOffsetX?: number
): EdgeGeometry {
  const x1 = source.x + (sourceOffsetX ?? source.width / 2);
  const y1 = source.y + source.height;
  const x2 = target.x + target.width / 2;
  const y2 = target.y;
  const midY = (y1 + y2) / 2;

  const p0: Point = { x: x1, y: y1 };
  const p1: Point = { x: x1, y: midY };
  const p2: Point = { x: x2, y: midY };
  const p3: Point = { x: x2, y: y2 };

  const path = style === 'orthogonal'
    ? `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`
    : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  // Etiket orta noktada değil kaynağa yakın: hangi porttan çıktığı okunur ve
  // çok girişli bir hedefin üstünde etiketler üst üste yığılmaz.
  const label = cubicPointAt(p0, p1, p2, p3, LABEL_T);

  return {
    path,
    labelX: label.x,
    labelY: label.y,
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
    p0, p1, p2, p3,
    style
  };
}

/**
 * Kendine dönen kenar. Düğümün sağından çıkıp sağından girer; düz bir çizgi
 * görünmez olurdu.
 */
export function selfLoopGeometry(node: EdgeBox): EdgeGeometry {
  const x = node.x + node.width;
  const yTop = node.y + node.height * 0.3;
  const yBottom = node.y + node.height * 0.7;
  const bulge = 44;

  const p0: Point = { x, y: yBottom };
  const p1: Point = { x: x + bulge, y: yBottom };
  const p2: Point = { x: x + bulge, y: yTop };
  const p3: Point = { x, y: yTop };

  return {
    path: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    labelX: x + bulge,
    labelY: (yTop + yBottom) / 2,
    minX: x,
    minY: yTop,
    maxX: x + bulge,
    maxY: yBottom,
    p0, p1, p2, p3,
    style: 'bezier'
  };
}

/**
 * Geri dönen (rework) kenar: hedef kaynağın altında değil.
 *
 * Alttan çıkıp üstteki hedefe inen bir eğri aradaki kutuların İÇİNDEN geçerdi.
 * Bunun yerine kaynağın sağ-ortasından çıkar, `clearX` hizasına kadar sağa açılıp
 * yukarı dolaşır ve hedefe sağından girer.
 *
 * Kübik eğri kontrol noktalarının x'ine ulaşamaz; kontrol noktası, eğrinin en
 * sağ noktası tam `clearX`'e dayanacak şekilde hesaplanır (bkz. backControlX).
 */
export function backEdgeGeometry(source: EdgeBox, target: EdgeBox, clearX: number): EdgeGeometry {
  const p0: Point = { x: source.x + source.width, y: source.y + source.height / 2 };
  const p3: Point = { x: target.x + target.width, y: target.y + target.height / 2 };
  const edgeX = Math.max(p0.x, p3.x);
  const controlX = backControlX(p0.x, p3.x, Math.max(clearX, edgeX));

  const p1: Point = { x: controlX, y: p0.y };
  const p2: Point = { x: controlX, y: p3.y };
  const label = cubicPointAt(p0, p1, p2, p3, 0.5);

  return {
    path: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    labelX: label.x,
    labelY: label.y - LABEL_OFFSET,
    minX: Math.min(p0.x, p3.x),
    minY: Math.min(p0.y, p3.y),
    maxX: Math.max(edgeX, clearX),
    maxY: Math.max(p0.y, p3.y),
    p0, p1, p2, p3,
    style: 'bezier'
  };
}

/**
 * İki kontrol noktası da aynı `cx`'te olan kübik eğride
 * `x(t) = u³·x0 + 3ut·cx + t³·x3` (u = 1 − t) — her t için cx'e göre artan
 * doğrusal. Eğrinin tepesinin `clearX`'e ulaştığı en küçük cx, t örnekleri
 * üzerinden `(clearX − u³·x0 − t³·x3) / 3ut`'nin en küçüğüdür. Uçlar farklı
 * hizadayken sabit bir oran (ör. 3/4) tutmuyor, tepe kısa kalıyordu.
 */
function backControlX(x0: number, x3: number, clearX: number): number {
  let best = Infinity;

  for (let i = 1; i < EDGE_SAMPLE_COUNT; i++) {
    const t = i / EDGE_SAMPLE_COUNT;
    const u = 1 - t;
    best = Math.min(best, (clearX - u * u * u * x0 - t * t * t * x3) / (3 * u * t));
  }

  return best;
}

/** Hedef kaynağın altında mı? Değilse kenar geri döner ve yandan dolaştırılır. */
export function isForward(source: EdgeBox, target: EdgeBox): boolean {
  return target.y >= source.y + source.height + FORWARD_MIN_GAP;
}

/** `routeEdges` girdisi: bir kenarın uçları ve çıkış portu. */
export interface EdgeRequest {
  source: EdgeBox;
  target: EdgeBox;
  sourceOffsetX?: number;
}

/**
 * Kenarların hepsini birlikte yönlendirir — geri dönüşlerin şerit ataması
 * birbirine bağlı olduğu için tek tek hesaplanamaz.
 *
 *   - İleri kenar: porttan hedefin üst-ortasına bezier.
 *   - Geri kenar: dikey aralığındaki (`obstacles`) en sağ kutunun sağından,
 *     kendisiyle dikeyde örtüşen önceki geri dönüş sayısı kadar dış şeritte.
 *     Kısa döngüler önce yönlendirilir ki içte kalsın, uzunlar dışa açılsın.
 *
 * Sonuç girdiyle AYNI sırada döner.
 */
export function routeEdges(
  requests: ReadonlyArray<EdgeRequest>,
  obstacles: ReadonlyArray<EdgeBox>
): EdgeGeometry[] {
  const result: EdgeGeometry[] = new Array(requests.length);
  const back: Array<{ index: number; top: number; bottom: number }> = [];

  requests.forEach((request, index) => {
    const { source, target, sourceOffsetX } = request;

    if (isForward(source, target)) {
      result[index] = edgeGeometry(source, target, 'bezier', sourceOffsetX);
      return;
    }

    back.push({
      index,
      top: Math.min(source.y, target.y),
      bottom: Math.max(source.y + source.height, target.y + target.height)
    });
  });

  back.sort((a, b) => (a.bottom - a.top) - (b.bottom - b.top));

  const routed: Array<{ top: number; bottom: number }> = [];

  for (const item of back) {
    const { source, target } = requests[item.index];

    const rightmost = Math.max(
      source.x + source.width,
      target.x + target.width,
      ...obstacles
        .filter(box => box.y < item.bottom && box.y + box.height > item.top)
        .map(box => box.x + box.width));

    const lane = routed.filter(other => other.top < item.bottom && other.bottom > item.top).length;

    result[item.index] = backEdgeGeometry(
      source, target, rightmost + BACK_EDGE_BULGE + lane * BACK_EDGE_LANE_GAP);
    routed.push({ top: item.top, bottom: item.bottom });
  }

  return result;
}

/**
 * Adımın kapladığı kutu. Paralel adım dallarını da listelediği için dal başına
 * bir satır yüksekliği büyür.
 *
 * Bu formül daha önce layout ve canvas'ta ayrı ayrı duruyordu; ikisi arasındaki
 * sessiz sapma riskini kapatmak için tek yere indi.
 */
export function nodeSize(step: WorkflowStep): { width: number; height: number } {
  const branchCount = step.type === 'parallel' ? (step.branches ?? []).length : 0;

  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT + branchCount * BRANCH_LINE_HEIGHT
  };
}

/**
 * Düğüm altındaki çıkış portlarının yatay konumları (px, düğümün soluna göre).
 *
 * Eşit aralıklı ve simetrik: `width * (i + 1) / (count + 1)`. İki port için
 * 1/3 ve 2/3 — eski sabit %32/%62 değerleri simetrik değildi (merkezleri 47'ye
 * düşüyordu), N porta genellenemezdi.
 */
export function portPositions(count: number, width: number): number[] {
  if (count <= 0) return [];

  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    positions.push((width * (i + 1)) / (count + 1));
  }

  return positions;
}

/** Kübik Bézier üzerinde t ∈ [0,1] noktasının koordinatı. */
export function cubicPointAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y
  };
}

/** Kenar hit-test'inde kullanılan örnek sayısı. */
export const EDGE_SAMPLE_COUNT = 24;

/**
 * Bir noktanın kenara en kısa uzaklığı (dünya koordinatında).
 *
 * `path.getTotalLength()` / `isPointInStroke()` KULLANILMAZ: ikisi de DOM'a
 * bağlıdır, TestBed'siz test edilemez ve zoom altında tolerans hesabını
 * bulandırır. Analitik örnekleme yeterince ucuz — 100 kenar × 24 örnek tıklama
 * başına milisaniyenin altında kalıyor.
 */
export function distanceToEdge(geometry: EdgeGeometry, point: Point, samples = EDGE_SAMPLE_COUNT): number {
  const { p0, p1, p2, p3 } = geometry;
  let best = Infinity;

  if (geometry.style === 'orthogonal') {
    // Kırık çizgi: üç düz parçanın en yakınına bak.
    best = Math.min(
      distanceToSegment(point, p0, p1),
      distanceToSegment(point, p1, p2),
      distanceToSegment(point, p2, p3)
    );
    return best;
  }

  let previous = cubicPointAt(p0, p1, p2, p3, 0);
  for (let i = 1; i <= samples; i++) {
    const current = cubicPointAt(p0, p1, p2, p3, i / samples);
    best = Math.min(best, distanceToSegment(point, previous, current));
    previous = current;
  }

  return best;
}

/** Noktanın [a,b] doğru parçasına uzaklığı. */
function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  // Sıfır uzunluklu parça: tek noktaya uzaklık.
  if (lengthSquared === 0) return Math.hypot(point.x - a.x, point.y - a.y);

  // Parçanın dışına taşan izdüşümler uçlara kelepçelenir.
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));

  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}
