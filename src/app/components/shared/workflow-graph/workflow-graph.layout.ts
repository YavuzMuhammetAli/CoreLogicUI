import { WorkflowGraph, WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED } from '../../../models/workflow.model';

/**
 * Akış şeması geometrisi — SAF fonksiyon, Angular import'u YOK.
 *
 * entity-graph.layout.ts ile aynı ayrım (TestBed'siz test edilebilirlik) ama iki
 * önemli farkla:
 *   1) Şema YUKARIDAN AŞAĞI dizilir (entity-graph soldan sağa).
 *   2) Katman SUNUCUDAN GELMEZ. entity-graph'ta düğümlerin `depth` alanı sunucu
 *      tarafından hesaplanıyordu; akış tanımında böyle bir alan yok, bu yüzden
 *      katmanlar başlangıç adımından en uzun yol ile burada hesaplanıyor.
 */

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 52;
export const COLUMN_GAP = 40;
export const ROW_GAP = 56;
export const PADDING = 24;
export const TERMINAL_HEIGHT = 34;
export const LABEL_OFFSET = 6;

export const EMPTY_VIEW_BOX = '0 0 100 60';

export interface LayoutNode {
  key: string;
  label: string;
  layer: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isStart: boolean;
  /** Terminal düğümler (tamamlandı/reddedildi) farklı çizilir. */
  isTerminal: boolean;
  /** Reddedilme terminali kırmızı tonda. */
  isRejection: boolean;
}

export interface LayoutEdge {
  key: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
  /** Red kenarları kesikli ve kırmızı çizilir. */
  isRejection: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WorkflowLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  viewBox: string;
}

/**
 * Grafiği yerleşime çevirir. Girdi null/boşsa boş yerleşim döner —
 * bileşen bu durumu "önizleme için adım ekleyin" mesajıyla karşılar.
 */
export function layoutWorkflow(graph: WorkflowGraph | null): WorkflowLayout {
  if (!graph || graph.steps.length === 0) {
    return { nodes: [], edges: [], viewBox: EMPTY_VIEW_BOX };
  }

  const layers = computeLayers(graph);
  const nodes = placeNodes(graph, layers);
  const byKey = new Map(nodes.map(node => [node.key.toLowerCase(), node]));
  const edges = buildEdges(graph, byKey);

  return { nodes, edges, viewBox: computeViewBox(nodes, edges) };
}

/**
 * Her adımın katmanını başlangıçtan EN UZUN yol ile hesaplar.
 *
 * En uzun yol (en kısa değil): bir adım birden çok yoldan ulaşılabiliyorsa, en
 * geç ulaşıldığı katmanda çizilmeli ki oklar hep aşağı doğru aksın ve şema
 * karışmasın. Döngüler (red → önceki adıma dönüş) meşrudur, bu yüzden ziyaret
 * edilen düğüm tekrar işlenmez — aksi halde sonsuz döngüye girilirdi.
 */
function computeLayers(graph: WorkflowGraph): Map<string, number> {
  const layers = new Map<string, number>();
  const start = graph.steps.find(s => eq(s.key, graph.startStep)) ?? graph.steps[0];

  const queue: Array<{ key: string; layer: number }> = [{ key: start.key, layer: 0 }];
  layers.set(start.key.toLowerCase(), 0);

  // Güvenlik tavanı: bozuk bir tanımda bile döngü sonlanmalı.
  let guard = graph.steps.length * graph.steps.length + 16;

  while (queue.length > 0 && guard-- > 0) {
    const current = queue.shift()!;
    const step = graph.steps.find(s => eq(s.key, current.key));
    if (!step) continue;

    for (const target of [step.onApprove, step.onReject]) {
      if (!target || isTerminal(target)) continue;

      const targetKey = target.toLowerCase();
      const nextLayer = current.layer + 1;
      const known = layers.get(targetKey);

      // Yalnızca DAHA DERİN bir katman bulunursa güncellenir.
      if (known === undefined || nextLayer > known) {
        layers.set(targetKey, nextLayer);
        queue.push({ key: target, layer: nextLayer });
      }
    }
  }

  // Ulaşılamayan adımlar da çizilmeli — kullanıcı kopukluğu görmeli.
  // (Doğrulayıcı bunu hata sayar; şema o hatayı görünür kılar.)
  let orphanLayer = Math.max(0, ...layers.values()) + 1;
  for (const step of graph.steps) {
    if (!layers.has(step.key.toLowerCase())) {
      layers.set(step.key.toLowerCase(), orphanLayer++);
    }
  }

  return layers;
}

function placeNodes(graph: WorkflowGraph, layers: Map<string, number>): LayoutNode[] {
  // Katman → o katmandaki adımlar (tanım sırasını korur).
  const byLayer = new Map<number, string[]>();
  for (const step of graph.steps) {
    const layer = layers.get(step.key.toLowerCase()) ?? 0;
    const bucket = byLayer.get(layer) ?? [];
    bucket.push(step.key);
    byLayer.set(layer, bucket);
  }

  const nodes: LayoutNode[] = [];

  for (const step of graph.steps) {
    const layer = layers.get(step.key.toLowerCase()) ?? 0;
    const column = byLayer.get(layer) ?? [];
    const columnIndex = column.indexOf(step.key);

    nodes.push({
      key: step.key,
      label: step.name || step.key,
      layer,
      x: PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING + layer * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      isStart: eq(step.key, graph.startStep),
      isTerminal: false,
      isRejection: false
    });
  }

  // Terminaller yalnızca gerçekten hedeflenmişse çizilir — her şemaya iki kutu
  // eklemek gereksiz gürültü olurdu.
  const maxLayer = Math.max(...nodes.map(n => n.layer));
  const usedTerminals = collectUsedTerminals(graph);
  let terminalIndex = 0;

  for (const terminal of usedTerminals) {
    nodes.push({
      key: terminal,
      label: terminal === WORKFLOW_TERMINAL_REJECTED ? 'Reddedildi' : 'Tamamlandı',
      layer: maxLayer + 1,
      x: PADDING + terminalIndex * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING + (maxLayer + 1) * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: TERMINAL_HEIGHT,
      isStart: false,
      isTerminal: true,
      isRejection: terminal === WORKFLOW_TERMINAL_REJECTED
    });
    terminalIndex++;
  }

  return nodes;
}

/**
 * Şemada gösterilecek terminaller. Boş hedef de terminal sayılır: boş onApprove
 * "tamamla", boş onReject "reddet" varsayılanına düşer (motorla aynı kural).
 */
function collectUsedTerminals(graph: WorkflowGraph): string[] {
  const used = new Set<string>();

  for (const step of graph.steps) {
    if (!step.onApprove || isTerminal(step.onApprove)) {
      used.add(step.onApprove || WORKFLOW_TERMINAL_COMPLETED);
    }
    if (!step.onReject || isTerminal(step.onReject)) {
      used.add(step.onReject || WORKFLOW_TERMINAL_REJECTED);
    }
  }

  // Sıra sabit: tamamlandı solda, reddedildi sağda.
  return [WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED].filter(t => used.has(t));
}

function buildEdges(graph: WorkflowGraph, byKey: Map<string, LayoutNode>): LayoutEdge[] {
  const edges: LayoutEdge[] = [];

  for (const step of graph.steps) {
    const source = byKey.get(step.key.toLowerCase());
    if (!source) continue;

    const approveTarget = step.onApprove || WORKFLOW_TERMINAL_COMPLETED;
    const rejectTarget = step.onReject || WORKFLOW_TERMINAL_REJECTED;

    pushEdge(edges, byKey, source, approveTarget, 'onay', false);
    pushEdge(edges, byKey, source, rejectTarget, 'red', true);
  }

  return edges;
}

function pushEdge(
  edges: LayoutEdge[],
  byKey: Map<string, LayoutNode>,
  source: LayoutNode,
  targetKey: string,
  label: string,
  isRejection: boolean
): void {
  const target = byKey.get(targetKey.toLowerCase());
  // Hedefi çizilmemiş kenar sessizce atlanır (entity-graph ile aynı davranış).
  if (!target) return;

  const x1 = source.x + source.width / 2;
  const y1 = source.y + source.height;
  const x2 = target.x + target.width / 2;
  const y2 = target.y;

  const midY = (y1 + y2) / 2;
  const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

  edges.push({
    key: `${source.key}->${targetKey}:${label}`,
    path,
    labelX: (x1 + x2) / 2,
    labelY: midY - LABEL_OFFSET,
    label,
    isRejection,
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2)
  });
}

/**
 * Görünüm kutusu. Sol üst köşe 0 0 OLAMAZ: geri dönen (rework) kenarlar düğümün
 * soluna taşabiliyor ve sabit bir başlangıç bu kısmı kırpardı — entity-graph'taki
 * self-loop taşmasıyla aynı gerekçe.
 */
function computeViewBox(nodes: LayoutNode[], edges: LayoutEdge[]): string {
  if (nodes.length === 0) return EMPTY_VIEW_BOX;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + node.width);
    maxY = Math.max(maxY, node.y + node.height);
  }

  for (const edge of edges) {
    minX = Math.min(minX, edge.minX);
    minY = Math.min(minY, edge.minY);
    maxX = Math.max(maxX, edge.maxX);
    maxY = Math.max(maxY, edge.maxY);
  }

  const x = minX - PADDING;
  const y = minY - PADDING;
  const width = maxX - minX + PADDING * 2;
  const height = maxY - minY + PADDING * 2;

  return `${x} ${y} ${width} ${height}`;
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function eq(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}

function isTerminal(key: string): boolean {
  return key === WORKFLOW_TERMINAL_COMPLETED || key === WORKFLOW_TERMINAL_REJECTED;
}
