import {
  ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID,
  inject, input, output, signal, viewChild, computed
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WorkflowGraph, WorkflowStep, outgoingTargets } from '../../../models/workflow.model';
import {
  layoutWorkflow, NODE_WIDTH, NODE_HEIGHT, BRANCH_LINE_HEIGHT
} from '../workflow-graph/workflow-graph.layout';
import { TranslatePipe } from '../../../pipes/translate.pipe';

/** Canvas'ta çizilen düğüm — konum ve ölçü dahil. */
interface CanvasNode {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isStart: boolean;
  isParallel: boolean;
  branchLabels: string[];
}

/** İki düğüm arasındaki bağlantı. */
interface CanvasEdge {
  key: string;
  path: string;
  labelX: number;
  labelY: number;
  label: string;
  isRejection: boolean;
}

/** Sürüklenen bağlantının hangi çıkıştan başladığı. */
type PortKind = 'approve' | 'reject';

/**
 * Sürükle-bırak akış tasarımcısı (Faz 5).
 *
 * Projede CDK, drag-drop ya da diyagram kütüphanesi YOK; her şey native Pointer
 * Events ile yazıldı — dashboard-build'in sürükleme deseniyle aynı yaklaşım.
 *
 * İki etkileşim var:
 *   1) DÜĞÜM TAŞIMA — gövdeden sürükle. Konum tanıma yazılır (step.x/y).
 *   2) BAĞLANTI ÇİZME — çıkış portundan sürükleyip hedef düğümde bırak.
 *      Yeşil port onay, kırmızı port red yolunu bağlar.
 *
 * Konum tanımda YOKSA otomatik yerleşim (layoutWorkflow) kullanılır; böylece
 * canvas'tan önce yazılmış tanımlar da düzgün açılır ve form tabanlı düzenleme
 * konum belirtmek zorunda kalmaz.
 */
@Component({
  selector: 'app-workflow-canvas',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './workflow-canvas.component.html',
  styleUrl: './workflow-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowCanvasComponent {
  readonly graph = input<WorkflowGraph | null>(null);
  readonly selectedKey = input<string | null>(null);

  /** Düğüm taşındı — (key, x, y). Konum tanıma yazılmalı. */
  readonly nodeMoved = output<{ key: string; x: number; y: number }>();
  /** Bağlantı kuruldu — kaynak adımın onApprove/onReject'i güncellenmeli. */
  readonly edgeCreated = output<{ from: string; to: string; port: PortKind }>();
  readonly nodeSelected = output<string>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly canvasRef = viewChild<ElementRef<HTMLElement>>('canvas');

  /**
   * Sürükleme sırasında konumlar burada tutulur ve her pointer olayında
   * tanıma yazılmaz — form değişimi tüm grafiği yeniden kurar ve sürükleme
   * takılırdı. Tanıma yazma yalnızca bırakışta (pointerup) yapılır.
   */
  private readonly liveOffsets = signal<Record<string, { x: number; y: number }>>({});

  /** Bağlantı çizilirken imcin bulunduğu nokta — geçici çizgi için. */
  readonly pendingEdge = signal<{ from: string; port: PortKind; x: number; y: number } | null>(null);

  readonly nodes = computed<CanvasNode[]>(() => {
    const graph = this.graph();
    if (!graph) return [];

    // Otomatik yerleşim yalnızca KONUMU OLMAYAN düğümler için başlangıç noktası.
    const auto = layoutWorkflow(graph);
    const offsets = this.liveOffsets();

    return graph.steps.map(step => {
      const fallback = auto.nodes.find(n => n.key.toLowerCase() === step.key.toLowerCase());
      const live = offsets[step.key];
      const branchLabels = step.type === 'parallel'
        ? (step.branches ?? []).map(b => b.name || b.key)
        : [];

      return {
        key: step.key,
        label: step.name || step.key,
        x: live?.x ?? step.x ?? fallback?.x ?? 24,
        y: live?.y ?? step.y ?? fallback?.y ?? 24,
        width: NODE_WIDTH,
        height: step.type === 'parallel'
          ? NODE_HEIGHT + branchLabels.length * BRANCH_LINE_HEIGHT
          : NODE_HEIGHT,
        isStart: step.key.toLowerCase() === (graph.startStep ?? '').toLowerCase(),
        isParallel: step.type === 'parallel',
        branchLabels
      };
    });
  });

  /** Kenarlar düğüm konumlarından türetilir; sürüklerken canlı takip eder. */
  readonly edges = computed<CanvasEdge[]>(() => {
    const graph = this.graph();
    if (!graph) return [];

    const byKey = new Map(this.nodes().map(n => [n.key.toLowerCase(), n]));
    const edges: CanvasEdge[] = [];

    for (const step of graph.steps) {
      const source = byKey.get(step.key.toLowerCase());
      if (!source) continue;

      const { approve, reject } = outgoingTargets(step);
      this.pushEdge(edges, byKey, source, approve, 'onay', false);
      this.pushEdge(edges, byKey, source, reject, 'red', true);
    }

    return edges;
  });

  private pushEdge(
    edges: CanvasEdge[],
    byKey: Map<string, CanvasNode>,
    source: CanvasNode,
    targetKey: string | null | undefined,
    label: string,
    isRejection: boolean
  ): void {
    // Terminal ve boş hedefler canvas'ta çizilmez: her düğümden iki terminale
    // ok çekmek şemayı okunmaz hale getirirdi. Terminaller form sekmesinde görünür.
    if (!targetKey) return;

    const target = byKey.get(targetKey.toLowerCase());
    if (!target) return;

    // Kaynağın alt-orta noktasından hedefin üst-orta noktasına kübik eğri.
    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height;
    const x2 = target.x + target.width / 2;
    const y2 = target.y;
    const midY = (y1 + y2) / 2;

    edges.push({
      key: `${source.key}->${targetKey}:${label}`,
      path: `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: midY - 6,
      label,
      isRejection
    });
  }

  /** Sürüklenen geçici bağlantının yolu. */
  readonly pendingPath = computed(() => {
    const pending = this.pendingEdge();
    if (!pending) return null;

    const source = this.nodes().find(n => n.key === pending.from);
    if (!source) return null;

    const x1 = source.x + source.width / 2;
    const y1 = source.y + source.height;
    const midY = (y1 + pending.y) / 2;

    return `M ${x1} ${y1} C ${x1} ${midY}, ${pending.x} ${midY}, ${pending.x} ${pending.y}`;
  });

  // ── Düğüm taşıma ──────────────────────────────────────────────────────────

  private dragState: {
    key: string; startX: number; startY: number; originX: number; originY: number;
  } | null = null;

  onNodeDragStart(event: PointerEvent, node: CanvasNode): void {
    if (!isPlatformBrowser(this.platformId)) return;

    event.preventDefault();
    event.stopPropagation();

    this.nodeSelected.emit(node.key);
    this.dragState = {
      key: node.key,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y
    };

    document.addEventListener('pointermove', this.onNodeDragMove);
    document.addEventListener('pointerup', this.onNodeDragEnd);
  }

  // Ok fonksiyonu: `this` bağlanır ve removeEventListener referansla çalışır.
  private readonly onNodeDragMove = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state) return;

    // Negatif konuma izin verilmez; düğüm canvas'ın dışına kaçarsa geri
    // getirmenin tek yolu tanımı elle düzenlemek olurdu.
    const x = Math.max(0, state.originX + (event.clientX - state.startX));
    const y = Math.max(0, state.originY + (event.clientY - state.startY));

    this.liveOffsets.update(current => ({ ...current, [state.key]: { x, y } }));
  };

  private readonly onNodeDragEnd = (): void => {
    const state = this.dragState;
    this.dragState = null;
    document.removeEventListener('pointermove', this.onNodeDragMove);
    document.removeEventListener('pointerup', this.onNodeDragEnd);

    if (!state) return;

    const position = this.liveOffsets()[state.key];
    if (position) this.nodeMoved.emit({ key: state.key, ...position });
  };

  // ── Bağlantı çizme ────────────────────────────────────────────────────────

  onPortDragStart(event: PointerEvent, node: CanvasNode, port: PortKind): void {
    if (!isPlatformBrowser(this.platformId)) return;

    event.preventDefault();
    event.stopPropagation();

    const point = this.toCanvasPoint(event);
    this.pendingEdge.set({ from: node.key, port, x: point.x, y: point.y });

    document.addEventListener('pointermove', this.onPortDragMove);
    document.addEventListener('pointerup', this.onPortDragEnd);
  }

  private readonly onPortDragMove = (event: PointerEvent): void => {
    const pending = this.pendingEdge();
    if (!pending) return;

    const point = this.toCanvasPoint(event);
    this.pendingEdge.set({ ...pending, x: point.x, y: point.y });
  };

  private readonly onPortDragEnd = (event: PointerEvent): void => {
    const pending = this.pendingEdge();
    this.pendingEdge.set(null);
    document.removeEventListener('pointermove', this.onPortDragMove);
    document.removeEventListener('pointerup', this.onPortDragEnd);

    if (!pending) return;

    const target = this.nodeAt(this.toCanvasPoint(event));
    // Kendine bağlantı yok sayılır: sonsuz döngü kurmanın en kolay yolu bu
    // ve kullanıcının bunu isteyerek yaptığı bir senaryo yok.
    if (!target || target.key === pending.from) return;

    this.edgeCreated.emit({ from: pending.from, to: target.key, port: pending.port });
  };

  /** Ekran koordinatını canvas koordinatına çevirir (kaydırma dahil). */
  private toCanvasPoint(event: PointerEvent): { x: number; y: number } {
    const element = this.canvasRef()?.nativeElement;
    if (!element) return { x: event.clientX, y: event.clientY };

    const rect = element.getBoundingClientRect();
    return {
      x: event.clientX - rect.left + element.scrollLeft,
      y: event.clientY - rect.top + element.scrollTop
    };
  }

  private nodeAt(point: { x: number; y: number }): CanvasNode | null {
    return this.nodes().find(n =>
      point.x >= n.x && point.x <= n.x + n.width &&
      point.y >= n.y && point.y <= n.y + n.height) ?? null;
  }

  /** Canvas yüzeyinin gerekli boyutu — düğümler taşınca büyür. */
  readonly canvasSize = computed(() => {
    const nodes = this.nodes();
    if (nodes.length === 0) return { width: 600, height: 320 };

    return {
      width: Math.max(600, ...nodes.map(n => n.x + n.width + 80)),
      height: Math.max(320, ...nodes.map(n => n.y + n.height + 80))
    };
  });

  isSelected(node: CanvasNode): boolean {
    return this.selectedKey() === node.key;
  }
}
