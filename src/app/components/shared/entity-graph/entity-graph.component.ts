import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { EntityGraph, EntityGraphEdge } from '../../../models/relationship.model';

/** SVG içinde konumlandırılmış düğüm. */
interface LayoutNode {
  modelName: string;
  depth: number;
  isRoot: boolean;
  exceedsMaxDepth: boolean;
  columnCount: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** SVG içinde çizilecek kenar. */
interface LayoutEdge {
  key: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
  isLegacy: boolean;
  required: boolean;
  /** Kaynak ve hedef aynı düğüm — kendine dönen ilmek olarak çizilir. */
  isSelf: boolean;
}

/**
 * Entity graph görselleştirmesi — elle yazılmış inline SVG.
 *
 * Neden kütüphane yok: projede graph çizen bir bağımlılık bulunmuyor
 * (ApexCharts yalnızca grafik/rapor içindir) ve tek bir yönlü katmanlı
 * diyagram için yeni bağımlılık eklemek gereksiz.
 *
 * Yerleşim: düğümler DERİNLİĞE göre sütunlara dizilir (kök en solda).
 * Kenarlar kaynak sütunun sağından hedef sütunun soluna bezier eğrisiyle çizilir.
 */
@Component({
  selector: 'app-entity-graph',
  standalone: true,
  imports: [CommonModule, TranslatePipe],
  templateUrl: './entity-graph.component.html',
  styleUrls: ['./entity-graph.component.scss']
})
export class EntityGraphComponent {
  graph = input<EntityGraph | null>(null);

  // ── Yerleşim sabitleri ────────────────────────────────────────────────────
  private readonly nodeWidth = 150;
  private readonly nodeHeight = 46;
  private readonly columnGap = 90;
  private readonly rowGap = 26;
  private readonly padding = 20;

  /** Derinliğe göre sütunlara yerleştirilmiş düğümler. */
  readonly nodes = computed<LayoutNode[]>(() => {
    const graph = this.graph();
    if (!graph || graph.nodes.length === 0) return [];

    // Derinlik → o derinlikteki düğümler
    const byDepth = new Map<number, string[]>();
    for (const node of graph.nodes) {
      const list = byDepth.get(node.depth) ?? [];
      list.push(node.modelName);
      byDepth.set(node.depth, list);
    }

    const result: LayoutNode[] = [];
    for (const node of graph.nodes) {
      const column = byDepth.get(node.depth) ?? [];
      const rowIndex = column.indexOf(node.modelName);

      result.push({
        modelName: node.modelName,
        depth: node.depth,
        isRoot: node.isRoot,
        exceedsMaxDepth: node.exceedsMaxDepth,
        columnCount: node.columnCount,
        x: this.padding + node.depth * (this.nodeWidth + this.columnGap),
        y: this.padding + rowIndex * (this.nodeHeight + this.rowGap),
        width: this.nodeWidth,
        height: this.nodeHeight
      });
    }

    return result;
  });

  /** Düğüm konumlarına göre hesaplanmış kenarlar. */
  readonly edges = computed<LayoutEdge[]>(() => {
    const graph = this.graph();
    if (!graph) return [];

    const positions = new Map(this.nodes().map(n => [n.modelName.toLowerCase(), n]));
    const result: LayoutEdge[] = [];

    graph.edges.forEach((edge, index) => {
      const source = positions.get(edge.sourceModel.toLowerCase());
      const target = positions.get(edge.targetModel.toLowerCase());
      if (!source || !target) return;

      result.push(
        source === target
          ? this.buildSelfLoop(edge, source, index)
          : this.buildEdge(edge, source, target, index)
      );
    });

    return result;
  });

  /** SVG viewBox boyutu — içerik kadar. */
  readonly viewBox = computed(() => {
    const nodes = this.nodes();
    if (nodes.length === 0) return '0 0 100 60';

    const maxX = Math.max(...nodes.map(n => n.x + n.width));
    const maxY = Math.max(...nodes.map(n => n.y + n.height));
    // Kendine dönen ilmek düğümün üstüne taşar; ek boşluk bırakılır.
    return `0 0 ${maxX + this.padding} ${maxY + this.padding + 26}`;
  });

  readonly isEmpty = computed(() => this.nodes().length === 0);

  /** Farklı derinlik seviyeleri — sütun başlıkları için. */
  readonly depths = computed(() =>
    [...new Set(this.nodes().map(n => n.depth))].sort((a, b) => a - b));

  depthColumnX(depth: number): number {
    return this.padding + depth * (this.nodeWidth + this.columnGap);
  }

  private buildEdge(edge: EntityGraphEdge, source: LayoutNode, target: LayoutNode, index: number): LayoutEdge {
    // Kaynak sağ kenar ortası → hedef sol kenar ortası
    const x1 = source.x + source.width;
    const y1 = source.y + source.height / 2;
    const x2 = target.x;
    const y2 = target.y + target.height / 2;
    const midX = (x1 + x2) / 2;

    return {
      key: `${edge.relationshipId}-${index}`,
      path: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      labelX: midX,
      labelY: (y1 + y2) / 2 - 6,
      label: this.buildLabel(edge),
      isLegacy: edge.isLegacy,
      required: edge.required,
      isSelf: false
    };
  }

  private buildSelfLoop(edge: EntityGraphEdge, node: LayoutNode, index: number): LayoutEdge {
    // Düğümün üstünde küçük bir ilmek
    const x1 = node.x + node.width * 0.3;
    const x2 = node.x + node.width * 0.7;
    const y = node.y;
    const top = y - 22;

    return {
      key: `${edge.relationshipId}-${index}`,
      path: `M ${x1} ${y} C ${x1} ${top}, ${x2} ${top}, ${x2} ${y}`,
      labelX: node.x + node.width / 2,
      labelY: top - 3,
      label: this.buildLabel(edge),
      isLegacy: edge.isLegacy,
      required: edge.required,
      isSelf: true
    };
  }

  private buildLabel(edge: EntityGraphEdge): string {
    return edge.propertyName || edge.relationshipType;
  }
}
