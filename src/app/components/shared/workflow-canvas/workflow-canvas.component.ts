import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID,
  computed, effect, inject, input, output, signal, untracked, viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WorkflowGraph } from '../../../models/workflow.model';
import { layoutWorkflow } from '../workflow-graph/workflow-graph.layout';
import { EdgeRequest, routeOrthogonal } from '../workflow-graph/workflow-edge.geometry';
import {
  CanvasEdge, CanvasNode, CanvasPort, PortKind,
  nodeAt, resolveNodePositions
} from './workflow-canvas.hit-test';
import {
  Camera, IDENTITY_CAMERA, Point, ViewportRect, ZOOM_STEP,
  boundsOf, fitToView, gridStyle, panBy, screenToWorld, zoomAt, zoomAtCenter
} from './workflow-canvas.camera';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';

export type { CanvasEdge, CanvasNode, CanvasPort, PortKind } from './workflow-canvas.hit-test';

/** Kenar etiketleri bu zoom seviyesinin altında okunamıyor, gizlenir. */
const EDGE_LABEL_MIN_ZOOM = 0.55;

/** Hedefsiz çıkışın (akış burada biter) kısa uç çizgisinin boyu. */
const STUB_LENGTH = 22;

/** Başlangıç hapının ölçüsü ve başlangıç adımının üstündeki boşluk. */
const START_WIDTH = 104;
const START_HEIGHT = 28;
const START_GAP = 36;

/** Bir çıkışın akışı bitirdiği yer: düğüm altındaki kısa çizgi + uç işareti. */
export interface CanvasStub {
  key: string;
  kind: PortKind;
  x: number;
  y1: number;
  y2: number;
}

/** Başlangıç hapı: başlangıç adımının üstünde, ona bağlı. */
export interface CanvasStart {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Haptan başlangıç adımına inen çizgi. */
  path: string;
}

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
  /** Bağlantı kuruldu — kaynak adımın ilgili çıkışı güncellenmeli. */
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
   * tanıma yazılmaz — tanım değişimi tüm grafiği yeniden kurar ve sürükleme
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
   * Otomatik yerleşim AYRI bir computed'de duruyor: sürükleme saniyede ~60 kez
   * `liveOffsets`'i değiştiriyor; yerleşim aynı yerde okunsaydı her karede
   * yeniden hesaplanırdı. Ayrılınca yalnızca grafik değiştiğinde hesaplanır.
   */
  private readonly autoLayout = computed(() => layoutWorkflow(this.graph()));

  readonly nodes = computed<CanvasNode[]>(() =>
    resolveNodePositions(this.graph(), this.autoLayout().nodes, this.liveOffsets()));

  private readonly nodesByKey = computed(() =>
    new Map(this.nodes().map(node => [node.key.toLowerCase(), node])));

  /**
   * Kenarlar düğüm konumlarından türetilir; sürüklerken canlı takip eder.
   *
   * Dik açılı ve yuvarlak köşeli: her kenar kendi portundan çıkar, yatay bir
   * kanalda hedefin hizasına gelir. Hedef kaynağın altında değilse (red → önceki
   * adım) kenar kutuların sağından dolaştırılır (bkz. routeOrthogonal).
   */
  readonly edges = computed<CanvasEdge[]>(() => {
    const nodes = this.nodes();
    const byKey = this.nodesByKey();
    const labels: Record<PortKind, string> = {
      approve: this.languageService.t('workflow.canvas.edgeApprove'),
      reject: this.languageService.t('workflow.canvas.edgeReject')
    };
    const pending: Array<Omit<CanvasEdge, 'geometry'> & { request: EdgeRequest }> = [];

    for (const source of nodes) {
      for (const port of source.ports) {
        // Hedefsiz çıkış kenar değil uç işaretidir (bkz. stubs).
        if (!port.target) continue;

        const target = byKey.get(port.target.toLowerCase());
        if (!target) continue;

        pending.push({
          key: `${source.key}->${port.target}:${port.kind}`,
          label: labels[port.kind],
          isRejection: port.kind === 'reject',
          from: source.key,
          to: port.target,
          port: port.kind,
          request: { source, target, sourceOffsetX: port.offset }
        });
      }
    }

    const geometries = routeOrthogonal(pending.map(edge => edge.request), nodes);

    return pending.map(({ request, ...edge }, index) => ({ ...edge, geometry: geometries[index] }));
  });

  /**
   * Akışın bittiği çıkışlar: düğümün altında kısa bir çizgi ve uç işareti
   * (onay/tamamlanma yeşil, red kırmızı). Eskiden hiç çizilmiyordu ve hangi
   * çıkışın süreci bitirdiği şemadan okunamıyordu. Hedefi silinmiş (bulunamayan)
   * çıkış da burada değil, doğrulama panelinde görünür.
   */
  readonly stubs = computed<CanvasStub[]>(() =>
    this.nodes().flatMap(node => node.ports
      .filter(port => !port.target)
      .map(port => ({
        key: `${node.key}:${port.port}`,
        kind: port.kind,
        x: node.x + port.offset,
        y1: node.y + node.height,
        y2: node.y + node.height + STUB_LENGTH
      }))));

  /** Başlangıç hapı — başlangıç adımı varsa onun üstünde. */
  readonly start = computed<CanvasStart | null>(() => {
    const node = this.nodes().find(n => n.isStart);
    if (!node) return null;

    const centerX = node.x + node.width / 2;
    const x = centerX - START_WIDTH / 2;
    const y = node.y - START_GAP - START_HEIGHT;

    return {
      x, y, width: START_WIDTH, height: START_HEIGHT,
      path: `M ${centerX} ${y + START_HEIGHT} L ${centerX} ${node.y}`
    };
  });

  /** Sürüklenen geçici bağlantının yolu — sürüklenen portun kendisinden başlar. */
  readonly pendingPath = computed(() => {
    const pending = this.pendingEdge();
    if (!pending) return null;

    const source = this.nodesByKey().get(pending.from.toLowerCase());
    const port = source?.ports.find(p => p.kind === pending.port);
    if (!source || !port) return null;

    const x1 = source.x + port.offset;
    const y1 = source.y + source.height;
    const midY = (y1 + pending.y) / 2;

    return `M ${x1} ${y1} C ${x1} ${midY}, ${pending.x} ${midY}, ${pending.x} ${pending.y}`;
  });

  /**
   * Çizilen her şeyin dünya sınırı: düğümler, kenarlar (sağdan dolaşan geri
   * dönüşler kutuların dışına taşar), uç işaretleri ve başlangıç hapı.
   */
  private readonly contentBounds = computed(() => {
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [...this.nodes()];

    for (const { geometry: g } of this.edges()) {
      boxes.push({ x: g.minX, y: g.minY, width: g.maxX - g.minX, height: g.maxY - g.minY });
    }
    for (const stub of this.stubs()) {
      boxes.push({ x: stub.x - 6, y: stub.y1, width: 12, height: stub.y2 - stub.y1 + 6 });
    }

    const start = this.start();
    if (start) boxes.push(start);

    return boundsOf(boxes);
  });

  /**
   * Canvas yüzeyinin gerekli boyutu — içerik taşınınca büyür. Kenarlar da
   * hesaba katılır: önceden yalnız düğümlere bakılıyordu ve sağdan dolaşan
   * geri dönüş kenarları SVG'nin dışında kalıp kırpılıyordu.
   */
  readonly canvasSize = computed(() => {
    const bounds = this.contentBounds();
    if (!bounds) return { width: 600, height: 320 };

    return {
      width: Math.max(600, bounds.maxX + 80),
      height: Math.max(320, bounds.maxY + 80)
    };
  });

  constructor() {
    // Tanım değişince (bırakış sonrası yazım, geri alma, başka sekmeden düzenleme)
    // canlı ofsetler bırakılır: aksi halde bir kez sürüklenmiş düğüm, tanımdaki
    // konumunu sonsuza dek gölgelerdi.
    effect(() => {
      this.graph();
      untracked(() => {
        if (!this.dragState) this.liveOffsets.set({});
      });
    }, { allowSignalWrites: true });

    // İçerik ilk geldiğinde şema görünüre sığdırılır. Başlangıç hapı ve sağdan
    // dolaşan kenarlar dünya koordinatında negatif/uzak yerlere düşebiliyor;
    // sabit (0,0) kamerayla açılışta ekran dışında kalırlardı.
    effect(() => {
      if (this.fitted || this.nodes().length === 0) return;
      this.fitted = true;
      this.fitAfterRender();
    });

    // Jest yarıda kalırken bileşen kapanırsa (sekme değişimi) document
    // dinleyicileri sızmasın.
    inject(DestroyRef).onDestroy(() => this.detachAll());
  }

  /** İlk sığdırma yapıldı mı — sonraki tanım değişiklikleri kamerayı oynatmaz. */
  private fitted = false;

  /** Viewport DOM'a yerleştikten sonra sığdırır (ölçüsü ancak o zaman bilinir). */
  private fitAfterRender(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    requestAnimationFrame(() => this.fitToScreen());
  }

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

  /**
   * %100'e döner, baktığı yeri kaybetmeden (viewport merkezi sabit). Eskiden
   * kamera başlangıç noktasına zıplıyordu; şema ve başlangıç hapı görünürden
   * kayboluyordu.
   */
  resetZoom(): void {
    const rect = this.viewportRect();
    if (!rect) {
      this.camera.set(IDENTITY_CAMERA);
      return;
    }
    this.camera.update(camera => zoomAtCenter(camera, 1 / camera.zoom, rect));
  }

  /** Elle konumları bırakıp otomatik yerleşime döner; yeni yerleşim görünüre sığdırılır. */
  autoArrange(): void {
    this.liveOffsets.set({});
    this.layoutReset.emit();
    this.fitAfterRender();
  }

  /** Tüm şemayı (başlangıç hapı, geri dönüşler ve uç işaretleri dahil) görünüre sığdırır. */
  fitToScreen(): void {
    const element = this.viewportRef()?.nativeElement;
    const bounds = this.contentBounds();
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

  // ── Kare başına tek güncelleme ────────────────────────────────────────────

  private frameRequest = 0;
  private frameJob: (() => void) | null = null;

  /**
   * pointermove saniyede 60'tan fazla gelebilir (yüksek tazelemeli ekran,
   * tablet kalemi); her biri sinyal yazıp kenarları yeniden yönlendirseydi
   * sürükleme takılırdı. Kare başına yalnız EN SON hareket uygulanır.
   */
  private scheduleFrame(job: () => void): void {
    this.frameJob = job;
    if (this.frameRequest) return;

    this.frameRequest = requestAnimationFrame(() => {
      this.frameRequest = 0;
      const pending = this.frameJob;
      this.frameJob = null;
      pending?.();
    });
  }

  /** Bırakışta bekleyen son hareketi hemen uygular — bırakılan konum kaybolmasın. */
  private flushFrame(): void {
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    const pending = this.frameJob;
    this.frameJob = null;
    pending?.();
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
    // Sağ tuş tarayıcıya bırakılır (sağ tık menüsü sonraki adımda).
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

    const { clientX, clientY } = event;
    this.scheduleFrame(() => this.camera.set(panBy(
      state.origin, clientX - state.startX, clientY - state.startY)));
  };

  private readonly onSurfacePointerUp = (): void => {
    this.flushFrame();
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
    // Yalnız sol tuş: sağ/orta tuş düğümü sürüklemeye başlıyor ve menü açıldığı
    // için pointerup hiç gelmeyince düğüm imleci izlemeye devam ediyordu.
    if (event.button !== 0) return;

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

    this.scheduleFrame(() =>
      this.liveOffsets.update(current => ({ ...current, [state.key]: { x, y } })));
  };

  private readonly onNodeDragEnd = (): void => {
    this.flushFrame();
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

  onPortDragStart(event: PointerEvent, node: CanvasNode, port: CanvasPort): void {
    if (!isPlatformBrowser(this.platformId) || this.locked() || !event.isPrimary) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const point = this.toWorldPoint(event);
    this.pendingEdge.set({ from: node.key, port: port.kind, x: point.x, y: point.y });

    document.addEventListener('pointermove', this.onPortDragMove);
    document.addEventListener('pointerup', this.onPortDragEnd);
    document.addEventListener('pointercancel', this.onPortDragCancel);
  }

  private readonly onPortDragMove = (event: PointerEvent): void => {
    if (!this.pendingEdge() || !event.isPrimary) return;

    const point = this.toWorldPoint(event);
    this.scheduleFrame(() => {
      const pending = this.pendingEdge();
      if (pending) this.pendingEdge.set({ ...pending, x: point.x, y: point.y });
    });
  };

  /** İptal edilen jest bağlantı oluşturmaz — yalnız yarım çizgiyi temizler. */
  private readonly onPortDragCancel = (): void => {
    this.flushFrame();
    this.pendingEdge.set(null);
    document.removeEventListener('pointermove', this.onPortDragMove);
    document.removeEventListener('pointerup', this.onPortDragEnd);
    document.removeEventListener('pointercancel', this.onPortDragCancel);
  };

  private readonly onPortDragEnd = (event: PointerEvent): void => {
    this.flushFrame();
    const pending = this.pendingEdge();
    this.pendingEdge.set(null);
    document.removeEventListener('pointermove', this.onPortDragMove);
    document.removeEventListener('pointerup', this.onPortDragEnd);
    document.removeEventListener('pointercancel', this.onPortDragCancel);

    if (!pending) return;

    const target = nodeAt(this.nodes(), this.toWorldPoint(event));
    // Kendine bağlantı yok sayılır: sonsuz döngü kurmanın en kolay yolu bu
    // ve kullanıcının bunu isteyerek yaptığı bir senaryo yok.
    if (!target || target.key.toLowerCase() === pending.from.toLowerCase()) return;

    this.edgeCreated.emit({ from: pending.from, to: target.key, port: pending.port });
  };

  /** Bileşen kapanırken yarım kalan jestlerin document dinleyicilerini söker. */
  private detachAll(): void {
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.frameJob = null;
    if (!isPlatformBrowser(this.platformId)) return;

    document.removeEventListener('pointermove', this.onSurfacePointerMove);
    document.removeEventListener('pointerup', this.onSurfacePointerUp);
    document.removeEventListener('pointercancel', this.onSurfacePointerUp);
    document.removeEventListener('pointermove', this.onNodeDragMove);
    document.removeEventListener('pointerup', this.onNodeDragEnd);
    document.removeEventListener('pointercancel', this.onNodeDragEnd);
    document.removeEventListener('pointermove', this.onPortDragMove);
    document.removeEventListener('pointerup', this.onPortDragEnd);
    document.removeEventListener('pointercancel', this.onPortDragCancel);
  }

  // ── Yardımcılar ───────────────────────────────────────────────────────────

  isSelected(node: CanvasNode): boolean {
    return (this.selectedKey() ?? '').toLowerCase() === node.key.toLowerCase();
  }
}
