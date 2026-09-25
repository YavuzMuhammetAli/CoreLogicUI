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
export const NODE_HEIGHT = 52;
export const COLUMN_GAP = 40;
export const ROW_GAP = 56;
export const PADDING = 24;
export const TERMINAL_HEIGHT = 34;
export const LABEL_OFFSET = 6;
/** Paralel kutuda her dal satırının yüksekliği. */
export const BRANCH_LINE_HEIGHT = 15;

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
 * Kaynağın alt-ortasından hedefin üst-ortasına kenar geometrisi.
 *
 * Sınırlar (min/max) yalnızca UÇ NOKTALARDAN hesaplanır, kontrol noktalarından
 * değil: dikey eğri uçların çizdiği kutunun dışına taşmaz ve mevcut viewBox
 * davranışı böyle kurulmuştu.
 */
export function edgeGeometry(source: EdgeBox, target: EdgeBox, style: EdgeStyle = 'bezier'): EdgeGeometry {
  const x1 = source.x + source.width / 2;
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

  return {
    path,
    labelX: (x1 + x2) / 2,
    labelY: midY - LABEL_OFFSET,
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
