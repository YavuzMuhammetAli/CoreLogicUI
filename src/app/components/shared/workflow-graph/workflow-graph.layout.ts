import { WorkflowGraph, outgoingTargets, WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED } from '../../../models/workflow.model';
import {
  NODE_WIDTH, COLUMN_GAP, ROW_GAP, PADDING, TERMINAL_HEIGHT,
  EdgeRequest, nodeSize, portPositions, routeEdges
} from './workflow-edge.geometry';

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

// Geometri sabitleri ve kenar formulu workflow-edge.geometry.ts'te; buradan
// yeniden disa aktariliyor ki mevcut ithal edenler (spec dahil) degismesin.
export {
  NODE_WIDTH, NODE_HEIGHT, COLUMN_GAP, ROW_GAP,
  PADDING, TERMINAL_HEIGHT, LABEL_OFFSET, BRANCH_LINE_HEIGHT
} from './workflow-edge.geometry';

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
  /** Paralel adım — kutu içinde dal adları listelenir. */
  isParallel: boolean;
  /**
   * Paralel adımın dal etiketleri (ör. ["finans", "satinalma"]).
   * Ayrı düğüm olarak çizilmezler: dallar aynı anda açılıp aynı adımda birleştiği
   * için tek kutu içinde göstermek akışı daha okunur kılıyor ve şemayı yaymıyor.
   */
  branchLabels: string[];
  /** Join kuralı rozeti: "tümü" | "herhangi biri". Tekil adımda boş. */
  joinLabel: string;
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

    const { approve, reject } = outgoingTargets(step);
    for (const target of [approve, reject]) {
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

/** Yan yana iki kutunun merkezleri arası — onay/red dallanmasının yarısı bu kadar kayar. */
const COLUMN_PITCH = NODE_WIDTH + COLUMN_GAP;

/**
 * Düğümleri yerleştirir.
 *
 * Dikey: her katmanın y'si bir önceki katmanın EN UZUN kutusunun altından
 * ROW_GAP kadar aşağıdadır. Sabit `layer * (NODE_HEIGHT + ROW_GAP)` paralel
 * kutuyu (dal başına uzar) hesaba katmıyor, alt satır onun üstüne biniyordu.
 *
 * Yatay: her düğüm, üst katmandaki ebeveynlerinin altına yerleşmek ister.
 * Ebeveyn İKİ ayrı adıma dallanıyorsa onay hedefi sola, red hedefi sağa yarım
 * sütun kayar — kutudaki yeşil/kırmızı portların sırasıyla aynı. Tek hedefte
 * kayma yok: onay zinciri dikey bir omurga olarak kalır. Aynı yeri isteyen
 * kutular soldan sağa itilir, sonra katman dengede kalsın diye geri ortalanır.
 */
function placeNodes(graph: WorkflowGraph, layers: Map<string, number>): LayoutNode[] {
  const nodes: LayoutNode[] = graph.steps.map(step => {
    const isParallel = step.type === 'parallel';
    const size = nodeSize(step);

    return {
      key: step.key,
      label: step.name || step.key,
      layer: layers.get(step.key.toLowerCase()) ?? 0,
      x: 0,
      y: 0,
      width: size.width,
      // Paralel kutu dalları da listeliyor; yükseklik formülü nodeSize'da.
      height: size.height,
      isStart: eq(step.key, graph.startStep),
      isTerminal: false,
      isRejection: false,
      isParallel,
      branchLabels: isParallel ? (step.branches ?? []).map(b => b.name || b.key) : [],
      joinLabel: isParallel ? (step.mode === 'any' ? 'herhangi biri' : 'tümü') : ''
    };
  });

  // Terminaller yalnızca gerçekten hedeflenmişse çizilir — her şemaya iki kutu
  // eklemek gereksiz gürültü olurdu. Hep en alt katmanda.
  const terminalLayer = Math.max(...nodes.map(n => n.layer)) + 1;

  for (const terminal of collectUsedTerminals(graph)) {
    nodes.push({
      key: terminal,
      label: terminal === WORKFLOW_TERMINAL_REJECTED ? 'Reddedildi' : 'Tamamlandı',
      layer: terminalLayer,
      x: 0,
      y: 0,
      width: NODE_WIDTH,
      height: TERMINAL_HEIGHT,
      isStart: false,
      isTerminal: true,
      isRejection: terminal === WORKFLOW_TERMINAL_REJECTED,
      isParallel: false,
      branchLabels: [],
      joinLabel: ''
    });
  }

  assignRows(nodes);
  assignColumns(graph, nodes);

  return nodes;
}

/** Katman y'lerini birikimli hesaplar: satır yüksekliği = katmandaki en uzun kutu. */
function assignRows(nodes: LayoutNode[]): void {
  const layerHeights = new Map<number, number>();
  for (const node of nodes) {
    layerHeights.set(node.layer, Math.max(layerHeights.get(node.layer) ?? 0, node.height));
  }

  const layerY = new Map<number, number>();
  let y = PADDING;
  for (const layer of [...layerHeights.keys()].sort((a, b) => a - b)) {
    layerY.set(layer, y);
    y += layerHeights.get(layer)! + ROW_GAP;
  }

  for (const node of nodes) {
    node.y = layerY.get(node.layer)!;
  }
}

/**
 * Katman katman, ebeveynler yerleştikten sonra x atar.
 *
 * Yalnızca İLERİ kenarlar (üst katmandan alta) hesaba katılır; geri dönüşler
 * yerleşimi etkilemez, canvas'ta yandan dolaştırılır.
 */
function assignColumns(graph: WorkflowGraph, nodes: LayoutNode[]): void {
  const byKey = new Map(nodes.map(node => [node.key.toLowerCase(), node]));

  // Hedef → [ebeveyn, kayma yönü (-1 sol / 0 / +1 sağ)]
  const parents = new Map<string, Array<{ parent: LayoutNode; bias: number }>>();
  const addParent = (targetKey: string, parent: LayoutNode, bias: number) => {
    const target = byKey.get(targetKey.toLowerCase());
    if (!target || target.layer <= parent.layer) return;

    const list = parents.get(target.key.toLowerCase()) ?? [];
    list.push({ parent, bias });
    parents.set(target.key.toLowerCase(), list);
  };

  for (const step of graph.steps) {
    const source = byKey.get(step.key.toLowerCase());
    if (!source) continue;

    const { approve, reject } = outgoingTargets(step);
    const approveTarget = approve || WORKFLOW_TERMINAL_COMPLETED;
    const rejectTarget = reject || WORKFLOW_TERMINAL_REJECTED;

    // Terminal hedefi dallanma sayılmaz: neredeyse her adımın reddi terminale
    // gider ve bu sayılsaydı onay zinciri her katmanda yarım sütun sola kayardı.
    const forks = !isTerminal(approveTarget) && !isTerminal(rejectTarget)
      && !eq(approveTarget, rejectTarget)
      && isBelow(byKey, source, approveTarget) && isBelow(byKey, source, rejectTarget);

    addParent(approveTarget, source, forks ? -1 : 0);
    addParent(rejectTarget, source, forks ? 1 : 0);
  }

  const layersInOrder = [...new Set(nodes.map(n => n.layer))].sort((a, b) => a - b);
  const center = (node: LayoutNode) => node.x + node.width / 2;

  for (const layer of layersInOrder) {
    const row = nodes.filter(node => node.layer === layer);

    const desired = row.map((node, order) => {
      const incoming = parents.get(node.key.toLowerCase()) ?? [];
      let wanted = incoming.length > 0
        ? incoming.reduce((sum, p) => sum + center(p.parent) + p.bias * COLUMN_PITCH / 2, 0) / incoming.length
        : 0;

      // Terminaller: tamamlandı solda, reddedildi sağda (portlarla aynı sıra).
      if (node.isTerminal) wanted += (node.isRejection ? 1 : -1) * COLUMN_PITCH / 2;

      return { node, left: wanted - node.width / 2, order };
    });

    // Sıralama kararlı: eşitlikte tanım sırası korunur.
    desired.sort((a, b) => a.left - b.left || a.order - b.order);

    let previousRight = -Infinity;
    let drift = 0;
    for (const item of desired) {
      const left = Math.max(item.left, previousRight + COLUMN_GAP);
      drift += left - item.left;
      item.node.x = left;
      previousRight = left + item.node.width;
    }

    // İtme hep sağa doğru; ortalama kayma geri alınır ki katman istediği
    // merkezin etrafında dengeli dursun (aralıklar değişmez, hepsi birlikte kayar).
    const shift = drift / desired.length;
    for (const item of desired) item.node.x -= shift;
  }

  // En soldaki kutu PADDING'den başlasın.
  const minX = Math.min(...nodes.map(n => n.x));
  for (const node of nodes) node.x += PADDING - minX;
}

function isBelow(byKey: Map<string, LayoutNode>, source: LayoutNode, targetKey: string): boolean {
  const target = byKey.get(targetKey.toLowerCase());
  return !!target && target.layer > source.layer;
}

/**
 * Şemada gösterilecek terminaller. Boş hedef de terminal sayılır: boş onApprove
 * "tamamla", boş onReject "reddet" varsayılanına düşer (motorla aynı kural).
 */
function collectUsedTerminals(graph: WorkflowGraph): string[] {
  const used = new Set<string>();

  for (const step of graph.steps) {
    const { approve, reject } = outgoingTargets(step);
    if (!approve || isTerminal(approve)) {
      used.add(approve || WORKFLOW_TERMINAL_COMPLETED);
    }
    if (!reject || isTerminal(reject)) {
      used.add(reject || WORKFLOW_TERMINAL_REJECTED);
    }
  }

  // Sıra sabit: tamamlandı solda, reddedildi sağda.
  return [WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED].filter(t => used.has(t));
}

/**
 * Onay kenarı yeşil porttan, red kenarı kırmızı porttan çıkar (canvas'taki port
 * konumlarıyla aynı formül); geri dönüşler routeEdges'te yandan dolaştırılır.
 */
function buildEdges(graph: WorkflowGraph, byKey: Map<string, LayoutNode>): LayoutEdge[] {
  const pending: Array<{ key: string; label: string; isRejection: boolean; request: EdgeRequest }> = [];

  for (const step of graph.steps) {
    const source = byKey.get(step.key.toLowerCase());
    if (!source) continue;

    const { approve, reject } = outgoingTargets(step);
    const [approvePort, rejectPort] = portPositions(2, source.width);
    const outgoing = [
      { targetKey: approve || WORKFLOW_TERMINAL_COMPLETED, label: 'onay', isRejection: false, port: approvePort },
      { targetKey: reject || WORKFLOW_TERMINAL_REJECTED, label: 'red', isRejection: true, port: rejectPort }
    ];

    for (const edge of outgoing) {
      const target = byKey.get(edge.targetKey.toLowerCase());
      // Hedefi çizilmemiş kenar sessizce atlanır (entity-graph ile aynı davranış).
      if (!target) continue;

      pending.push({
        key: `${source.key}->${edge.targetKey}:${edge.label}`,
        label: edge.label,
        isRejection: edge.isRejection,
        request: { source, target, sourceOffsetX: edge.port }
      });
    }
  }

  const geometries = routeEdges(pending.map(p => p.request), [...byKey.values()]);

  return pending.map((edge, index) => {
    const geometry = geometries[index];

    return {
      key: edge.key,
      path: geometry.path,
      labelX: geometry.labelX,
      labelY: geometry.labelY,
      label: edge.label,
      isRejection: edge.isRejection,
      minX: geometry.minX,
      minY: geometry.minY,
      maxX: geometry.maxX,
      maxY: geometry.maxY
    };
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
