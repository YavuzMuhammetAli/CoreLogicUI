import {
  ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID,
  inject, input, output, signal, viewChild, computed
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WorkflowGraph, outgoingTargets } from '../../../models/workflow.model';
import { layoutWorkflow } from '../workflow-graph/workflow-graph.layout';
import { EdgeRequest, portPositions, routeEdges } from '../workflow-graph/workflow-edge.geometry';
import {
  CanvasEdge, CanvasNode, PortKind,
  nodeAt, resolveNodePositions
} from './workflow-canvas.hit-test';
import {
  Camera, IDENTITY_CAMERA, Point, ViewportRect, ZOOM_STEP,
  boundsOf, fitToView, gridStyle, panBy, screenToWorld, zoomAt, zoomAtCenter
} from './workflow-canvas.camera';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';

export type { CanvasEdge, CanvasNode, PortKind } from './workflow-canvas.hit-test';

/** Kenar etiketleri bu zoom seviyesinin altında okunamıyor, gizlenir. */
const EDGE_LABEL_MIN_ZOOM = 0.55;

/**
 * Sürükle-bırak akış tasarımcısı.
 *
 * Projede CDK, drag-drop ya da diyagram kütüphanesi YOK; her şey native Pointer
 * Events ile yazıldı — dashboard-build'in sürükleme desenindeki yaklaşım.
 *
 * Dört etkileşim var:
 *   1) DÜĞÜM TAŞIMA   — gövdeden sürükle. Konum tanıma yazılır (step.x/y).
 *   2) BAĞLANTI ÇİZME — çıkış portundan sürükleyip hedef düğümde bırak.
 *   3) KAYDIRMA       — boş zeminde ya da orta tuşla sürükle.
 *   4) YAKINLAŞTIRMA  — Ctrl/Cmd + tekerlek (imce altındaki nokta sabit kalır).
 *
 * Kamera tek bir CSS transform'dur (`.canvas-world`); dünya koordinatları hiç
 * değişmez, dolayısıyla `layoutWorkflow()` ve `step.x/y` bugünkü anlamını korur.
 * Geometri, kamera ve isabet testi saf modüllerde (bkz. kardeş dosyalar) —
 * bu component yalnızca sinyal, DOM dinleyicisi ve output tutar.
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
  /**
   * Salt-okunur mod: taşıma ve bağlantı kapalı, yakınlaştırma/kaydırma/seçim
   * açık. Yayınlanmış akışın şemasını göstermek ve (Faz 9) çalışan süreci
   * izlemek için. Alan adı `locked`, çünkü `readonly` bir sınıf üyesi adı
   * olarak kullanılamıyor.
   */
  readonly locked = input(false, { alias: 'readonly' });

  /** Düğüm taşındı — (key, x, y). Konum tanıma yazılmalı. */
  readonly nodeMoved = output<{ key: string; x: number; y: number }>();
  /** Bağlantı kuruldu — kaynak adımın onApprove/onReject'i güncellenmeli. */
  readonly edgeCreated = output<{ from: string; to: string; port: PortKind }>();
  readonly nodeSelected = output<string>();
  /** Düğüme çift tıklandı — adım ayrıntı pop-up'ı açılmalı (salt-okunurda da). */
  readonly nodeOpened = output<string>();
  /**
   * "Otomatik düzenle" — tüm adımların elle verilmiş konumu silinmeli ki
   * otomatik yerleşim devreye girsin. Elle yerleşim kendiliğinden ezilmez;
   * yalnızca kullanıcı isteyince.
   */
  readonly layoutReset = output<void>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly languageService = inject(LanguageService);
  private readonly viewportRef = viewChild<ElementRef<HTMLElement>>('viewport');

  /**
   * Sürükleme sırasında konumlar burada tutulur ve her pointer olayında
   * tanıma yazılmaz — form değişimi tüm grafiği yeniden kurar ve sürükleme
   * takılırdı. Tanıma yazma yalnızca bırakışta (pointerup) yapılır.
   */
  private readonly liveOffsets = signal<Record<string, Point>>({});

  /** Bağlantı çizilirken imcin bulunduğu nokta — geçici çizgi için. */
  readonly pendingEdge = signal<{ from: string; port: PortKind; x: number; y: number } | null>(null);

  readonly camera = signal<Camera>(IDENTITY_CAMERA);
  readonly zoomPercent = computed(() => Math.round(this.camera().zoom * 100));
  readonly showEdgeLabels = computed(() => this.camera().zoom > EDGE_LABEL_MIN_ZOOM);

  /** Viewport'taki noktalı ızgara — kamerayla birlikte ölçeklenir ve kayar. */
  readonly grid = computed(() => {
    const { step, offsetX, offsetY } = gridStyle(this.camera());
    return { size: `${step}px ${step}px`, position: `${offsetX}px ${offsetY}px` };
  });

  /**
   * Otomatik yerleşim AYRI bir computed'de duruyor.
   *
   * Daha önce `nodes` içinde `liveOffsets()` ile aynı yerde okunuyordu; sürükleme
   * saniyede ~60 kez `liveOffsets`'i değiştirdiği için BFS + yerleştirme + kenar
   * kurulumu 60 Hz yeniden koşuyordu. Ayrılınca yerleşim yalnızca grafik
   * değiştiğinde hesaplanır.
   */
  private readonly autoLayout = computed(() => layoutWorkflow(this.graph()));

  readonly nodes = computed<CanvasNode[]>(() =>
    resolveNodePositions(this.graph(), this.autoLayout().nodes, this.liveOffsets()));

  /**
   * Kenarlar düğüm konumlarından türetilir; sürüklerken canlı takip eder.
   *
   * Onay kenarı yeşil, red kenarı kırmızı porttan çıkar — ikisi aynı noktadan
   * çıksaydı üst üste binerdi. Hedef kaynağın altında değilse (red → önceki
   * adım) kenar kutuların içinden değil sağından dolaştırılır (bkz. routeEdges).
   */
  readonly edges = computed<CanvasEdge[]>(() => {
    const graph = this.graph();
    if (!graph) return [];

    const nodes = this.nodes();
    const byKey = new Map(nodes.map(node => [node.key.toLowerCase(), node]));
    const approveLabel = this.languageService.t('workflow.canvas.edgeApprove');
    const rejectLabel = this.languageService.t('workflow.canvas.edgeReject');
    const pending: Array<Omit<CanvasEdge, 'geometry'> & { request: EdgeRequest }> = [];

    for (const step of graph.steps) {
      const source = byKey.get(step.key.toLowerCase());
      if (!source) continue;

      const { approve, reject } = outgoingTargets(step);
      const [approvePort, rejectPort] = portPositions(2, source.width);
      const outgoing: Array<{ targetKey: string | null | undefined; label: string; port: PortKind; offset: number }> = [
        { targetKey: approve, label: approveLabel, port: 'approve', offset: approvePort },
        { targetKey: reject, label: rejectLabel, port: 'reject', offset: rejectPort }
      ];

      for (const edge of outgoing) {
        // Terminal ve boş hedefler canvas'ta çizilmez: her düğümden iki terminale
        // ok çekmek şemayı okunmaz hale getirirdi. Terminaller form sekmesinde görünür.
        if (!edge.targetKey) continue;

        const target = byKey.get(edge.targetKey.toLowerCase());
        if (!target) continue;

        pending.push({
          key: `${source.key}->${edge.targetKey}:${edge.port}`,
          label: edge.label,
          isRejection: edge.port === 'reject',
          from: source.key,
          to: edge.targetKey,
          port: edge.port,
          request: { source, target, sourceOffsetX: edge.offset }
        });
      }
    }

    const geometries = routeEdges(pending.map(edge => edge.request), nodes);

    return pending.map(({ request, ...edge }, index) => ({ ...edge, geometry: geometries[index] }));
  });

  /** Sürüklenen geçici bağlantının yolu — sürüklenen portun kendisinden başlar. */
  readonly pendingPath = computed(() => {
    const pending = this.pendingEdge();
    if (!pending) return null;

    const source = this.nodes().find(node => node.key === pending.from);
    if (!source) return null;

    const [approvePort, rejectPort] = portPositions(2, source.width);
    const x1 = source.x + (pending.port === 'approve' ? approvePort : rejectPort);
    const y1 = source.y + source.height;
    const midY = (y1 + pending.y) / 2;

    return `M ${x1} ${y1} C ${x1} ${midY}, ${pending.x} ${midY}, ${pending.x} ${pending.y}`;
  });

  /** Çıkış portlarının düğüm içindeki yatay konumu (px). */
  readonly portOffsets = computed(() => portPositions(2, this.nodes()[0]?.width ?? 168));

  /** Canvas yüzeyinin gerekli boyutu — düğümler taşınca büyür. */
  readonly canvasSize = computed(() => {
    const nodes = this.nodes();
    if (nodes.length === 0) return { width: 600, height: 320 };

    return {
      width: Math.max(600, ...nodes.map(node => node.x + node.width + 80)),
      height: Math.max(320, ...nodes.map(node => node.y + node.height + 80))
    };
  });

  // ── Kamera ────────────────────────────────────────────────────────────────

  /**
   * Tekerlek: Ctrl/Cmd ile imce merkezli yakınlaştırma, düz tekerlekle kaydırma.
   * Trackpad pinch hareketi de tarayıcıda `ctrlKey` ile geldiği için aynı yoldan
   * geçer.
   *
   * Dinleyici şablondan bağlanıyor; `wheel` yalnızca window/document/body'ye
   * eklendiğinde varsayılan olarak passive olur, sıradan bir div'de değil —
   * dolayısıyla `preventDefault()` burada çalışır.
   */
  onWheel(event: WheelEvent): void {
    const rect = this.viewportRect();
    if (!rect) return;

    event.preventDefault();

    if (event.ctrlKey || event.metaKey) {
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      this.camera.update(camera => zoomAt(camera, factor, event.clientX, event.clientY, rect));
      return;
    }

    const deltaX = event.shiftKey ? -event.deltaY : -event.deltaX;
    const deltaY = event.shiftKey ? 0 : -event.deltaY;
    this.camera.update(camera => panBy(camera, deltaX, deltaY));
  }

  zoomIn(): void {
    const rect = this.viewportRect();
    if (rect) this.camera.update(camera => zoomAtCenter(camera, ZOOM_STEP, rect));
  }

  zoomOut(): void {
    const rect = this.viewportRect();
    if (rect) this.camera.update(camera => zoomAtCenter(camera, 1 / ZOOM_STEP, rect));
  }

  resetZoom(): void {
    this.camera.set(IDENTITY_CAMERA);
  }

  /** Elle konumları bırakıp otomatik yerleşime döner; kamera başa alınır. */
  autoArrange(): void {
    this.liveOffsets.set({});
    this.camera.set(IDENTITY_CAMERA);
    this.layoutReset.emit();
  }

  /**
   * Tüm şemayı görünüre sığdırır ve sol-üst köşeye yaslar.
   *
   * Sınıra kenarlar da girer: sağdan dolaşan geri dönüş eğrileri kutuların
   * dışına taşıyor, yalnız düğümlere göre sığdırınca kırpılıyordu.
   */
  fitToScreen(): void {
    const element = this.viewportRef()?.nativeElement;
    const bounds = boundsOf([
      ...this.nodes(),
      ...this.edges().map(({ geometry: g }) => ({
        x: g.minX, y: g.minY, width: g.maxX - g.minX, height: g.maxY - g.minY
      }))
    ]);
    if (!element || !bounds) return;

    this.camera.set(fitToView(bounds, {
      width: element.clientWidth,
      height: element.clientHeight
    }, 32, 1, 'start'));
  }

  private viewportRect(): ViewportRect | null {
    const element = this.viewportRef()?.nativeElement;
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  /** Ekran koordinatını dünya koordinatına çevirir. */
  private toWorldPoint(event: PointerEvent): Point {
    const rect = this.viewportRect();
    if (!rect) return { x: event.clientX, y: event.clientY };

    return screenToWorld(event.clientX, event.clientY, rect, this.camera());
  }

  // ── Zemin kaydırma ────────────────────────────────────────────────────────

  private panState: { startX: number; startY: number; origin: Camera } | null = null;
  readonly panning = signal(false);

  /**
   * Boş zeminde ya da orta tuşla sürükleme kamerayı kaydırır. Düğüm ve port
   * kendi `pointerdown`'larında `stopPropagation()` çağırdığı için buraya
   * yalnızca gerçekten boş zemine yapılan basışlar düşer.
   */
  onSurfacePointerDown(event: PointerEvent): void {
    if (!isPlatformBrowser(this.platformId)) return;
    // Sağ tuş menüsü Faz 7'de gelecek; şimdilik tarayıcıya bırakılıyor.
    if (event.button !== 0 && event.button !== 1) return;
    // Dokunmatikte ikinci parmak panState'i sıfırlayıp görünümü zıplatıyordu.
    if (!event.isPrimary) return;

    event.preventDefault();

    this.panState = { startX: event.clientX, startY: event.clientY, origin: this.camera() };
    this.panning.set(true);

    document.addEventListener('pointermove', this.onSurfacePointerMove);
    document.addEventListener('pointerup', this.onSurfacePointerUp);
    // pointercancel: tarayıcı jesti devralırsa (ör. sistem kaydırması) sürükleme takılı kalmasın.
    document.addEventListener('pointercancel', this.onSurfacePointerUp);
  }

  private readonly onSurfacePointerMove = (event: PointerEvent): void => {
    const state = this.panState;
    if (!state || !event.isPrimary) return;

    this.camera.set(panBy(
      state.origin,
      event.clientX - state.startX,
      event.clientY - state.startY));
  };

  private readonly onSurfacePointerUp = (): void => {
    this.panState = null;
    this.panning.set(false);
    document.removeEventListener('pointermove', this.onSurfacePointerMove);
    document.removeEventListener('pointerup', this.onSurfacePointerUp);
    document.removeEventListener('pointercancel', this.onSurfacePointerUp);
  };

  // ── Düğüm taşıma ──────────────────────────────────────────────────────────

  private dragState: {
    key: string; startX: number; startY: number; originX: number; originY: number;
  } | null = null;

  onNodeDragStart(event: PointerEvent, node: CanvasNode): void {
    if (!isPlatformBrowser(this.platformId) || !event.isPrimary) return;

    event.preventDefault();
    event.stopPropagation();

    this.nodeSelected.emit(node.key);
    // Salt-okunur modda seçim çalışır, taşıma çalışmaz.
    if (this.locked()) return;

    this.dragState = {
      key: node.key,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y
    };

    document.addEventListener('pointermove', this.onNodeDragMove);
    document.addEventListener('pointerup', this.onNodeDragEnd);
    document.addEventListener('pointercancel', this.onNodeDragEnd);
  }

  // Ok fonksiyonu: `this` bağlanır ve removeEventListener referansla çalışır.
  private readonly onNodeDragMove = (event: PointerEvent): void => {
    const state = this.dragState;
    if (!state || !event.isPrimary) return;

    // Ekran pikseli dünya birimine çevrilir; aksi halde uzaklaşınca düğüm
    // imcin çok gerisinde kalırdı.
    const zoom = this.camera().zoom;

    // Negatif konuma izin verilmez; düğüm canvas'ın dışına kaçarsa geri
    // getirmenin tek yolu tanımı elle düzenlemek olurdu.
    const x = Math.max(0, state.originX + (event.clientX - state.startX) / zoom);
    const y = Math.max(0, state.originY + (event.clientY - state.startY) / zoom);

    this.liveOffsets.update(current => ({ ...current, [state.key]: { x, y } }));
  };

  private readonly onNodeDragEnd = (): void => {
    const state = this.dragState;
    this.dragState = null;
    document.removeEventListener('pointermove', this.onNodeDragMove);
    document.removeEventListener('pointerup', this.onNodeDragEnd);
    document.removeEventListener('pointercancel', this.onNodeDragEnd);

    if (!state) return;

    const position = this.liveOffsets()[state.key];
    if (position) this.nodeMoved.emit({ key: state.key, ...position });
  };

  // ── Bağlantı çizme ────────────────────────────────────────────────────────

  onPortDragStart(event: PointerEvent, node: CanvasNode, port: PortKind): void {
    if (!isPlatformBrowser(this.platformId) || this.locked() || !event.isPrimary) return;

    event.preventDefault();
    event.stopPropagation();

    const point = this.toWorldPoint(event);
    this.pendingEdge.set({ from: node.key, port, x: point.x, y: point.y });

    document.addEventListener('pointermove', this.onPortDragMove);
    document.addEventListener('pointerup', this.onPortDragEnd);
    document.addEventListener('pointercancel', this.onPortDragCancel);
  }

  private readonly onPortDragMove = (event: PointerEvent): void => {
    const pending = this.pendingEdge();
    if (!pending || !event.isPrimary) return;

    const point = this.toWorldPoint(event);
    this.pendingEdge.set({ ...pending, x: point.x, y: point.y });
  };

  /** İptal edilen jest bağlantı oluşturmaz — yalnız yarım çizgiyi temizler. */
  private readonly onPortDragCancel = (): void => {
    this.pendingEdge.set(null);
    document.removeEventListener('pointermove', this.onPortDragMove);
    document.removeEventListener('pointerup', this.onPortDragEnd);
    document.removeEventListener('pointercancel', this.onPortDragCancel);
  };

  private readonly onPortDragEnd = (event: PointerEvent): void => {
    const pending = this.pendingEdge();
    this.pendingEdge.set(null);
    document.removeEventListener('pointermove', this.onPortDragMove);
    document.removeEventListener('pointerup', this.onPortDragEnd);
    document.removeEventListener('pointercancel', this.onPortDragCancel);

    if (!pending) return;

    const target = nodeAt(this.nodes(), this.toWorldPoint(event));
    // Kendine bağlantı yok sayılır: sonsuz döngü kurmanın en kolay yolu bu
    // ve kullanıcının bunu isteyerek yaptığı bir senaryo yok.
    if (!target || target.key === pending.from) return;

    this.edgeCreated.emit({ from: pending.from, to: target.key, port: pending.port });
  };

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  isSelected(node: CanvasNode): boolean {
    return this.selectedKey() === node.key;
  }
}
