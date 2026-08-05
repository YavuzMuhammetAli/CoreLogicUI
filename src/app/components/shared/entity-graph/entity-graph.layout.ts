import { EntityGraph, EntityGraphEdge } from '../../../models/relationship.model';

/**
 * Entity graph yerleşim hesabı — SAF geometri, Angular'a bağımlı değildir.
 *
 * Component'ten ayrı tutulmasının nedeni test edilebilirlik: kırpılma/taşma gibi
 * geometri hataları ancak TestBed kurmadan çalıştırılabilen saf bir fonksiyonla
 * yakalanabilir. (Projede aynı ayrım model-data.util.ts, staged-tree.util.ts ve
 * chart-mapping.ts'te de uygulanır.)
 */

/** SVG içinde konumlandırılmış düğüm. */
export interface LayoutNode {
  modelName: string;
  depth: number;
  isRoot: boolean;
  exceedsMaxDepth: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** SVG içinde çizilecek kenar. */
export interface LayoutEdge {
  key: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
  isLegacy: boolean;
  required: boolean;
  /** Kaynak ve hedef aynı düğüm — kendine dönen ilmek olarak çizilir. */
  isSelf: boolean;
  /** Kenarın (etiketi dahil) kapladığı sınırlar — viewBox hesabında kullanılır. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  viewBox: string;
}

// ── Yerleşim sabitleri ──────────────────────────────────────────────────────
const NODE_WIDTH = 150;
const NODE_HEIGHT = 46;
const COLUMN_GAP = 90;
const ROW_GAP = 26;
const PADDING = 20;

/** Kendine dönen ilmeğin düğüm üstünde kapladığı yükseklik. */
const SELF_LOOP_HEIGHT = 22;
/** Etiketin çizgiden yukarıdaki boşluğu. */
const LABEL_OFFSET = 3;
/** Etiket metninin yaklaşık yüksekliği (sınır hesabı için). */
const LABEL_HEIGHT = 12;

/** Boş graf için kullanılan viewBox. */
const EMPTY_VIEW_BOX = '0 0 100 60';

/**
 * Grafı SVG koordinatlarına yerleştirir: düğümler derinliğe göre sütunlara
 * dizilir (kök en solda), kenarlar bezier eğrisiyle bağlanır.
 */
export function layoutGraph(graph: EntityGraph | null): GraphLayout {
  const nodes = layoutNodes(graph);
  if (nodes.length === 0)
    return { nodes: [], edges: [], viewBox: EMPTY_VIEW_BOX };

  const edges = layoutEdges(graph!, nodes);
  return { nodes, edges, viewBox: computeViewBox(nodes, edges) };
}

function layoutNodes(graph: EntityGraph | null): LayoutNode[] {
  if (!graph || graph.nodes.length === 0) return [];

  // Derinlik → o derinlikteki düğüm adları (sütun içi satır sırasını belirler)
  const byDepth = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const column = byDepth.get(node.depth) ?? [];
    column.push(node.modelName);
    byDepth.set(node.depth, column);
  }

  return graph.nodes.map(node => {
    const column = byDepth.get(node.depth) ?? [];
    const rowIndex = column.indexOf(node.modelName);

    return {
      modelName: node.modelName,
      depth: node.depth,
      isRoot: node.isRoot,
      exceedsMaxDepth: node.exceedsMaxDepth,
      x: PADDING + node.depth * (NODE_WIDTH + COLUMN_GAP),
      y: PADDING + rowIndex * (NODE_HEIGHT + ROW_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT
    };
  });
}

function layoutEdges(graph: EntityGraph, nodes: LayoutNode[]): LayoutEdge[] {
  const positions = new Map(nodes.map(n => [n.modelName.toLowerCase(), n]));
  const result: LayoutEdge[] = [];

  graph.edges.forEach((edge, index) => {
    const source = positions.get(edge.sourceModel.toLowerCase());
    const target = positions.get(edge.targetModel.toLowerCase());
    if (!source || !target) return;

    result.push(source === target
      ? buildSelfLoop(edge, source, index)
      : buildEdge(edge, source, target, index));
  });

  return result;
}

function buildEdge(
  edge: EntityGraphEdge, source: LayoutNode, target: LayoutNode, index: number): LayoutEdge {
  // Kaynak sağ kenar ortası → hedef sol kenar ortası
  const x1 = source.x + source.width;
  const y1 = source.y + source.height / 2;
  const x2 = target.x;
  const y2 = target.y + target.height / 2;
  const midX = (x1 + x2) / 2;
  const labelY = (y1 + y2) / 2 - 6;

  return {
    key: `${edge.relationshipId}-${index}`,
    path: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
    labelX: midX,
    labelY,
    label: buildLabel(edge),
    isLegacy: edge.isLegacy,
    required: edge.required,
    isSelf: false,
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2, labelY - LABEL_HEIGHT),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2)
  };
}

function buildSelfLoop(edge: EntityGraphEdge, node: LayoutNode, index: number): LayoutEdge {
  // Düğümün ÜSTÜNDE küçük bir ilmek — negatif y'ye taşabilir, viewBox bunu kapsar.
  const x1 = node.x + node.width * 0.3;
  const x2 = node.x + node.width * 0.7;
  const y = node.y;
  const top = y - SELF_LOOP_HEIGHT;
  const labelY = top - LABEL_OFFSET;

  return {
    key: `${edge.relationshipId}-${index}`,
    path: `M ${x1} ${y} C ${x1} ${top}, ${x2} ${top}, ${x2} ${y}`,
    labelX: node.x + node.width / 2,
    labelY,
    label: buildLabel(edge),
    isLegacy: edge.isLegacy,
    required: edge.required,
    isSelf: true,
    minX: x1,
    minY: labelY - LABEL_HEIGHT,
    maxX: x2,
    maxY: y
  };
}

function buildLabel(edge: EntityGraphEdge): string {
  return edge.propertyName || edge.relationshipType;
}

/**
 * İçeriği saran viewBox. Sol/üst köşe SABİT DEĞİLDİR: kendine dönen ilmek ve
 * etiketi negatif koordinatlara taşar; köşe "0 0" bırakılırsa kırpılır.
 */
function computeViewBox(nodes: LayoutNode[], edges: LayoutEdge[]): string {
  const minX = Math.min(...nodes.map(n => n.x), ...edges.map(e => e.minX));
  const minY = Math.min(...nodes.map(n => n.y), ...edges.map(e => e.minY));
  const maxX = Math.max(...nodes.map(n => n.x + n.width), ...edges.map(e => e.maxX));
  const maxY = Math.max(...nodes.map(n => n.y + n.height), ...edges.map(e => e.maxY));

  const left = minX - PADDING;
  const top = minY - PADDING;

  return `${left} ${top} ${maxX + PADDING - left} ${maxY + PADDING - top}`;
}
