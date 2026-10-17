import { WorkflowGraph, WorkflowStep } from '../../../models/workflow.model';
import {
  EdgeGeometry, Point, distanceToEdge, nodeSize, portPositions
} from '../workflow-graph/workflow-edge.geometry';
import { ExitPort, exitsOf } from '../../../utils/workflow/workflow-exits';

/**
 * Canvas düğüm/kenar yerleşimi ve isabet testi — SAF fonksiyonlar, Angular yok.
 *
 * Component yalnızca sinyal, DOM dinleyicisi ve output tutar; konum önceliği ve
 * isabet kararı buradadır, dolayısıyla TestBed'siz test edilebilir.
 */

/** Sürüklenen bağlantının hangi çıkıştan başladığı. */
export type PortKind = 'approve' | 'reject';

/** Düğümün altındaki bir çıkış portu. */
export interface CanvasPort {
  port: ExitPort;
  kind: PortKind;
  /** Düğümün soluna göre yatay konum (px). */
  offset: number;
  /** Hedef adım; boşsa akış bu çıkışta biter (terminal). */
  target: string | null;
}

/** Canvas'ta çizilen düğüm — konum ve ölçü dahil. */
export interface CanvasNode {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isStart: boolean;
  isParallel: boolean;
  branchLabels: string[];
  /**
   * Bağlanabilir çıkışlar (tip kataloğundan). Kapalı çıkış (red kapalı adımda
   * red) port olarak çizilmez: oraya çizilen bağlantı kayıtta sessizce kaybolurdu.
   */
  ports: CanvasPort[];
}

/** İki düğüm arasındaki bağlantı. */
export interface CanvasEdge {
  key: string;
  label: string;
  isRejection: boolean;
  /** Kaynak adımın anahtarı — kenar silinince hangi alanın temizleneceğini söyler. */
  from: string;
  to: string;
  port: PortKind;
  geometry: EdgeGeometry;
}

/** Konumu hiç belirlenmemiş düğümün düşeceği yer. */
export const DEFAULT_NODE_X = 24;
export const DEFAULT_NODE_Y = 24;

/** Kenara tıklama toleransı (ekran pikseli). */
export const EDGE_HIT_TOLERANCE = 8;

/**
 * Düğüm konumlarını öncelik sırasıyla çözer:
 *
 *     canlı sürükleme  >  tanımdaki x/y  >  otomatik yerleşim  >  varsayılan
 *
 * Otomatik yerleşim yalnızca KONUMU OLMAYAN düğümler için başlangıç noktasıdır;
 * böylece canvas'tan önce form ile yazılmış tanımlar da düzgün açılır ve form
 * tabanlı düzenleme konum belirtmek zorunda kalmaz.
 */
export function resolveNodePositions(
  graph: WorkflowGraph | null,
  autoNodes: ReadonlyArray<{ key: string; x: number; y: number }>,
  liveOffsets: Readonly<Record<string, Point>>
): CanvasNode[] {
  if (!graph) return [];

  const auto = new Map(autoNodes.map(node => [node.key.toLowerCase(), node]));

  const nodes = graph.steps.map(step => {
    const fallback = auto.get(step.key.toLowerCase());
    const live = liveOffsets[step.key];
    const size = nodeSize(step);
    const pinned = !!live || (step.x != null && step.y != null);

    const node: CanvasNode = {
      key: step.key,
      label: step.name || step.key,
      x: live?.x ?? step.x ?? fallback?.x ?? DEFAULT_NODE_X,
      y: live?.y ?? step.y ?? fallback?.y ?? DEFAULT_NODE_Y,
      width: size.width,
      height: size.height,
      isStart: eq(step.key, graph.startStep),
      isParallel: step.type === 'parallel',
      branchLabels: branchLabelsOf(step),
      ports: portsOf(step, size.width)
    };

    return { node, pinned };
  });

  avoidPinnedOverlap(nodes);

  return nodes.map(entry => entry.node);
}

/** Kutular arasında bırakılan asgari boşluk (çakışma sayılma eşiği). */
const OVERLAP_MARGIN = 16;
/** Çakışma çözümünün en fazla deneme sayısı — kötü bir tanımda bile sonlanmalı. */
const OVERLAP_MAX_STEPS = 64;

/**
 * Konumu tanımda OLMAYAN (otomatik yerleşimden gelen) düğüm, elle konumlanmış
 * bir düğümün üstüne düşerse boş yer bulana dek aşağı itilir.
 *
 * Otomatik yerleşim elle taşınmış kutulardan habersizdir: kullanıcı bir kutuyu
 * sürükleyip bıraktıktan sonra yeni eklenen adım tam onun üstüne düşebiliyordu.
 * Elle konulmuş kutu hiç kıpırdatılmaz — kullanıcının kararı.
 */
function avoidPinnedOverlap(entries: Array<{ node: CanvasNode; pinned: boolean }>): void {
  const settled = entries.filter(entry => entry.pinned).map(entry => entry.node);

  for (const entry of entries) {
    if (entry.pinned) continue;

    const node = entry.node;
    for (let i = 0; i < OVERLAP_MAX_STEPS; i++) {
      const blocker = settled.find(other => overlaps(node, other));
      if (!blocker) break;
      node.y = blocker.y + blocker.height + OVERLAP_MARGIN;
    }

    settled.push(node);
  }
}

function overlaps(a: CanvasNode, b: CanvasNode): boolean {
  return a.x < b.x + b.width + OVERLAP_MARGIN && a.x + a.width + OVERLAP_MARGIN > b.x &&
         a.y < b.y + b.height + OVERLAP_MARGIN && a.y + a.height + OVERLAP_MARGIN > b.y;
}

/**
 * Noktanın üzerinde bulunduğu düğüm.
 *
 * Liste SONDAN taranır: sonra render edilen düğüm DOM'da üstte çizilir, örtüşme
 * halinde kullanıcının gördüğü ve tıkladığını sandığı düğüm odur.
 */
export function nodeAt(nodes: ReadonlyArray<CanvasNode>, point: Point): CanvasNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (point.x >= node.x && point.x <= node.x + node.width &&
        point.y >= node.y && point.y <= node.y + node.height) {
      return node;
    }
  }

  return null;
}

/**
 * Noktaya en yakın kenar — tolerans içindeyse.
 *
 * Tolerans DÜNYA değil EKRAN koordinatında ölçülür (`tolerance / zoom`): aksi
 * halde uzaklaştıkça kenarlar tıklanamaz, yakınlaştıkça da kenardan uzağa
 * tıklamak kenarı seçerdi.
 */
export function edgeAt(
  edges: ReadonlyArray<CanvasEdge>,
  point: Point,
  zoom: number,
  tolerance = EDGE_HIT_TOLERANCE
): CanvasEdge | null {
  const worldTolerance = tolerance / (zoom || 1);

  let best: CanvasEdge | null = null;
  let bestDistance = Infinity;

  for (const edge of edges) {
    const distance = distanceToEdge(edge.geometry, point);
    if (distance <= worldTolerance && distance < bestDistance) {
      best = edge;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Dikdörtgenle KESİŞEN düğümler (lasso seçimi).
 *
 * Tamamen içinde kalma şartı aranmaz: kullanıcı büyük bir düğümün üzerinden
 * küçük bir çerçeve geçirdiğinde onu seçmiş saymak beklenen davranıştır.
 */
export function nodesInRect(nodes: ReadonlyArray<CanvasNode>, a: Point, b: Point): CanvasNode[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  return nodes.filter(node =>
    node.x <= maxX && node.x + node.width >= minX &&
    node.y <= maxY && node.y + node.height >= minY);
}

/** Düğümün bağlanabilir çıkışları, alt kenara eşit aralıkla dizilmiş. */
export function portsOf(step: WorkflowStep, width: number): CanvasPort[] {
  const enabled = exitsOf(step).filter(exit => exit.enabled);
  const offsets = portPositions(enabled.length, width);

  return enabled.map((exit, index) => ({
    port: exit.port,
    kind: exit.kind,
    offset: offsets[index],
    target: exit.target
  }));
}

function branchLabelsOf(step: WorkflowStep): string[] {
  if (step.type !== 'parallel') return [];

  return (step.branches ?? []).map(branch => branch.name || branch.key);
}

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}
