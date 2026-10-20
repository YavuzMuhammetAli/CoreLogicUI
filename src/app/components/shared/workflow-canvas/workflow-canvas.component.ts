import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, PLATFORM_ID,
  afterNextRender, computed, effect, inject, input, model, output, signal, untracked, viewChild
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WorkflowGraph } from '../../../models/workflow.model';
import { ExitPort } from '../../../utils/workflow/workflow-exits';
import { layoutWorkflow } from '../workflow-graph/workflow-graph.layout';
import {
  BRANCH_LINE_HEIGHT, EdgeRequest, NODE_HEIGHT, NODE_WIDTH, routeOrthogonal
} from '../workflow-graph/workflow-edge.geometry';
import { NODE_KINDS, NodeKind, NodeTone, isNodeKind } from '../../../utils/workflow/workflow-node-types';
import { OverlayNodeState, WorkflowOverlay, edgeId } from '../../../utils/workflow/workflow-overlay';
import {
  CanvasEdge, CanvasNode, CanvasPort, PortKind,
  edgeAt, nodeAt, nodesInRect, resolveNodePositions
} from './workflow-canvas.hit-test';
import {
  Camera, IDENTITY_CAMERA, Point, ViewportRect, ZOOM_STEP,
  boundsOf, fitToView, gridStyle, panBy, revealBox, screenToWorld, zoomAt, zoomAtCenter
} from './workflow-canvas.camera';
import {
  centeredAt, clampToWindow, dragPositions, exceedsThreshold, findFreeSpot, normalizedRect,
  nudgeDelta, placeBelow, snapValue
} from './workflow-canvas.interaction';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { HelpHintComponent } from '../help-hint/help-hint.component';

export type { CanvasEdge, CanvasNode, CanvasPort, PortKind } from './workflow-canvas.hit-test';

/** Kenar etiketleri bu zoom seviyesinin altında okunamıyor, gizlenir. */
const EDGE_LABEL_MIN_ZOOM = 0.55;

/** Hedefsiz çıkışın (akış burada biter) kısa uç çizgisinin boyu. */
const STUB_LENGTH = 22;

/** Başlangıç hapının ölçüsü ve başlangıç adımının üstündeki boşluk. */
const START_WIDTH = 104;
const START_HEIGHT = 28;
const START_GAP = 36;

/** Paletten tuvale sürüklenen düğüm türünün veri türü (HTML5 sürükle-bırak). */
export const WORKFLOW_NODE_MIME = 'application/x-corelogic-workflow-node';

/**
 * Düğüm kartının ekran bilgisi — tasarım ekranı hesaplar (tip etiketi, atama
 * özeti, sorun sayıları); tuval yalnız çizer. Anahtar küçük harfli adım anahtarı.
 */
export interface CanvasNodeMeta {
  kindLabel: string;
  tone: NodeTone;
  /** 24×24 stroke ikon yolu. */
  icon: string;
  summary: string;
  errors: number;
  warnings: number;
  /** Sorun rozetinin ipucu / ekran okuyucu metni. */
  issueTitle: string;
}

/** Yeni düğümün konumu verilirken otomatik yerleşimdeki komşuların sabitlenecek konumları. */
export type CanvasMoves = Array<{ key: string; x: number; y: number }>;

/** Bir çıkışın akışı bitirdiği yer: düğüm altındaki kısa çizgi + uç işareti. */
export interface CanvasStub {
  key: string;
  /** Çıkışın sahibi adım ve portu — "+" ile bağlı düğüm eklemek için. */
  from: string;
  port: ExitPort;
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

/** Seçili kenarın kimliği: kaynak adım + çıkış portu. */
export interface CanvasEdgeRef {
  from: string;
  port: ExitPort;
}

export interface CanvasSelection {
  nodes: string[];
  edge: CanvasEdgeRef | null;
}

/** Sağ tık menüsünden tasarım ekranına giden, belgeyi ilgilendiren işlemler. */
export type CanvasMenuAction =
  | { type: 'open'; key: string }
  | { type: 'setStart'; key: string }
  | { type: 'duplicate' }
  | { type: 'delete' }
  | {
      type: 'addNode';
      kind: NodeKind;
      /** null: konum verilmez, otomatik yerleşim yerleştirir (hiçbir düğüm sabit değilken). */
      at: Point | null;
      /** Doluysa yeni düğüm bu çıkışa bağlanır. */
      from: CanvasEdgeRef | null;
      /** Konum verildiğinde otomatik yerleşimdeki düğümler de sabitlenir (zıplamasınlar). */
      pins: CanvasMoves;
    }
  | { type: 'selectAll' };

/** Yeni düğümün kaplayacağı kutu (paralel iki dalla başlar). */
function kindSize(kind: NodeKind): { width: number; height: number } {
  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT + (kind === 'parallel' ? 2 * BRANCH_LINE_HEIGHT : 0)
  };
}

interface MenuItem {
  id: string;
  labelKey: string;
  /** Çevrilmiş metin (parametreli etiketler için); varsa labelKey yerine gösterilir. */
  label?: string;
  danger?: boolean;
  run: () => void;
}

interface MenuState {
  /** Ekran (client) koordinatı — menü `position: fixed` ile açılır. */
  x: number;
  y: number;
  items: MenuItem[];
}

/** Süren işaretçi jesti. Aynı anda yalnız biri olabilir. */
type Gesture =
  | {
      kind: 'node';
      key: string;
      startX: number;
      startY: number;
      additive: boolean;
      /** Birlikte taşınan düğümlerin başlangıç konumları. */
      origins: Map<string, Point>;
      moved: boolean;
    }
  | {
      kind: 'surface';
      startX: number;
      startY: number;
      origin: Camera;
      /** Basılan yerdeki kenar — sürüklenmezse seçilir. */
      edge: CanvasEdge | null;
      moved: boolean;
    }
  | {
      kind: 'lasso';
      start: Point;
      additive: boolean;
    };

/**
 * Sürükle-bırak akış tasarımcısı.
 *
 * Projede CDK, drag-drop ya da diyagram kütüphanesi YOK; her şey native Pointer
 * Events ile yazıldı — dashboard-build'in sürükleme desenindeki yaklaşım.
 *
 * Etkileşimler:
 *   - SEÇİM        — düğüme ya da kenara tıkla; Shift/Ctrl ile ekle/çıkar;
 *                    Shift + boş zemini sürükle = çerçeve (lasso) seçimi.
 *   - TAŞIMA       — seçili düğüm(ler)i gövdeden sürükle; 20 px ızgaraya
 *                    yapışır, Alt basılıyken serbest.
 *   - BAĞLANTI     — çıkış portundan sürükleyip hedef düğümde bırak.
 *   - KAYDIRMA     — boş zemini ya da orta tuşla sürükle; tekerlek.
 *   - YAKINLAŞTIRMA— Ctrl/Cmd + tekerlek (imlecin altındaki nokta sabit kalır).
 *   - SAĞ TIK      — düğüm/kenar/zemin menüsü.
 * Klavye kısayollarını tasarım ekranı dinler ve buradaki yöntemleri çağırır.
 *
 * Kamera tek bir CSS transform'dur (`.canvas-world`); dünya koordinatları hiç
 * değişmez. Geometri, kamera, isabet testi ve etkileşim kuralları saf
 * modüllerde — bu component yalnızca sinyal, DOM dinleyicisi ve output tutar.
 */
@Component({
  selector: 'app-workflow-canvas',
  standalone: true,
  imports: [TranslatePipe, HelpHintComponent],
  templateUrl: './workflow-canvas.component.html',
  styleUrl: './workflow-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.canvas--fill]': 'fillHeight()' }
})
export class WorkflowCanvasComponent {
  readonly graph = input<WorkflowGraph | null>(null);
  readonly selectedNodes = input<string[]>([]);
  readonly selectedEdge = input<CanvasEdgeRef | null>(null);
  /**
   * Salt-okunur mod: taşıma, bağlantı ve düzenleyen menü maddeleri kapalı;
   * yakınlaştırma/kaydırma/seçim açık. Alan adı `locked`, çünkü `readonly` bir
   * sınıf üyesi adı olarak kullanılamıyor.
   */
  readonly locked = input(false, { alias: 'readonly' });

  /**
   * Kamera iki yönlü bağlanır (`[(camera)]`): tuval sekme değişiminde DOM'dan
   * kalkıyor, dönüşte kaldığı yerden açılsın diye değer ekranda saklanır.
   */
  readonly camera = model<Camera>(IDENTITY_CAMERA);

  /** İçerik ilk geldiğinde şema sığdırılsın mı (saklı kamera varsa hayır). */
  readonly fitOnOpen = input(true);

  /** Araç çubuğu ipucunun çeviri anahtarı — verilmezse düzenleme / salt-okunur varsayılanı. */
  readonly hintKey = input<string | null>(null);

  /**
   * Sabit 560px yerine bulunduğu hücreyi doldur (tasarımcının tam ekranı). Kamera
   * etkilenmez: sığdırma/yakınlaştırma viewport ölçüsünü her çağrıda yeniden okur.
   */
  readonly fillHeight = input(false);

  /** Kartların tip/özet/sorun bilgisi (anahtar küçük harfli). Yoksa kart anahtarı gösterir. */
  readonly nodeMeta = input<Readonly<Record<string, CanvasNodeMeta>>>({});

  /**
   * Yol katmanı (simülasyon, çalışan süreç): geçilen düğümler ve kenarlar
   * vurgulanır, kalanlar soluklaşır. null → normal çizim.
   */
  readonly overlay = input<WorkflowOverlay | null>(null);

  /**
   * Yalnız yol: overlay'deki adımlar ve izlenen kenarlar çizilir, ulaşılmayanlar
   * HİÇ çizilmez (kayıt ekranındaki "Akışı görüntüle"). Konumlar yine tüm grafiğin
   * yerleşiminden gelir — şema tasarımcıdaki yerinde durur, yalnız eksik görünür.
   */
  readonly pathOnly = input(false);

  private readonly overlayEdges = computed(() => new Set(this.overlay()?.edges ?? []));

  /** Yalnız-yol modunda gösterilecek adımlar (küçük harfli); null → hepsi. */
  private readonly visibleKeys = computed<ReadonlySet<string> | null>(() => {
    const overlay = this.overlay();
    return this.pathOnly() && overlay ? new Set(Object.keys(overlay.nodes)) : null;
  });

  /**
   * Düğümler taşındı — konumlar tanıma TEK değişiklikte yazılmalı. İlk elle
   * taşımada konumu otomatik yerleşimden gelen diğer düğümler de eklenir
   * (bkz. pinAll): sonraki eklemelerde yerleşim değişince "zıplamasınlar".
   */
  readonly nodesMoved = output<Array<{ key: string; x: number; y: number }>>();
  /** Bağlantı kuruldu — kaynak adımın ilgili çıkışı güncellenmeli. */
  readonly edgeCreated = output<{ from: string; to: string; port: PortKind; exitPort: ExitPort }>();
  readonly selectionChange = output<CanvasSelection>();
  /** Düğüme çift tıklandı — adım ayrıntı pop-up'ı açılmalı (salt-okunurda da). */
  readonly nodeOpened = output<string>();
  /** "Otomatik düzenle" — elle verilmiş konumlar silinmeli. */
  readonly layoutReset = output<void>();
  readonly menuAction = output<CanvasMenuAction>();
  /**
   * Fare düğümün üstüne geldi (anahtar) / ayrıldı (null) — ayrıntı ipucu için.
   * Yalnız fare: dokunmatikte hover yok, orada dokunuş seçimi (selectionChange) kullanılır.
   */
  readonly nodeHover = output<string | null>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly viewportRef = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly menuRef = viewChild<ElementRef<HTMLElement>>('menu');

  /**
   * Sürükleme sırasında konumlar burada tutulur ve her pointer olayında
   * tanıma yazılmaz — tanım değişimi tüm grafiği yeniden kurar ve sürükleme
   * takılırdı. Tanıma yazma yalnızca bırakışta (pointerup) yapılır.
   */
  private readonly liveOffsets = signal<Record<string, Point>>({});

  /** Bağlantı çizilirken imcin bulunduğu nokta — geçici çizgi için. */
  readonly pendingEdge = signal<{ from: string; port: PortKind; exitPort: ExitPort; x: number; y: number } | null>(null);

  /** Lasso çerçevesi (dünya koordinatı); çizilmiyorken null. */
  readonly lasso = signal<{ x: number; y: number; width: number; height: number } | null>(null);

  readonly menu = signal<MenuState | null>(null);

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

  private readonly positionedNodes = computed<CanvasNode[]>(() =>
    resolveNodePositions(this.graph(), this.autoLayout().nodes, this.liveOffsets()));

  /** Çizilen düğümler — yalnız-yol modunda ulaşılmayanlar düşer (kenar/uç/sınır buradan türer). */
  readonly nodes = computed<CanvasNode[]>(() => {
    const all = this.positionedNodes();
    const visible = this.visibleKeys();
    return visible ? all.filter(node => visible.has(node.key.toLowerCase())) : all;
  });

  private readonly nodesByKey = computed(() =>
    new Map(this.nodes().map(node => [node.key.toLowerCase(), node])));

  private readonly selectedSet = computed(() =>
    new Set(this.selectedNodes().map(key => key.toLowerCase())));

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
      reject: this.languageService.t('workflow.canvas.edgeReject'),
      neutral: this.languageService.t('workflow.canvas.edgeDefault')
    };
    const pending: Array<Omit<CanvasEdge, 'geometry'> & { request: EdgeRequest }> = [];
    // Yalnız-yol modunda izlenmeyen kenar rotalamadan ÖNCE düşer: görünmeyen
    // kenarlar kanal ayırıp görünenleri gereksiz yere dolaştırmasın.
    const takenOnly = this.visibleKeys() !== null;
    const taken = this.overlayEdges();

    for (const source of nodes) {
      for (const port of source.ports) {
        // Hedefsiz çıkış kenar değil uç işaretidir (bkz. stubs).
        if (!port.target) continue;
        if (takenOnly && !taken.has(edgeId(source.key, port.port))) continue;

        const target = byKey.get(port.target.toLowerCase());
        if (!target) continue;

        pending.push({
          // Port kimliği anahtarda: koşulun iki durumu aynı hedefe gidebilir.
          key: `${source.key}->${port.target}:${port.port}`,
          // Otomatik eylemin tek "sonraki" çıkışı etiketsiz çizilir — "Diğer" yanıltırdı.
          label: port.port === 'next' ? '' : port.kind === 'neutral' ? (port.label ?? labels.neutral) : labels[port.kind],
          isRejection: port.kind === 'reject',
          from: source.key,
          to: port.target,
          port: port.kind,
          exitPort: port.port,
          request: { source, target, sourceOffsetX: port.offset }
        });
      }
    }

    const geometries = routeOrthogonal(pending.map(edge => edge.request), nodes);

    return pending.map(({ request, ...edge }, index) => ({ ...edge, geometry: geometries[index] }));
  });

  /**
   * Akışın bittiği çıkışlar: düğümün altında kısa bir çizgi ve uç işareti
   * (onay/tamamlanma yeşil, red kırmızı). Hedefi silinmiş (bulunamayan) çıkış
   * burada değil, doğrulama panelinde görünür.
   */
  readonly stubs = computed<CanvasStub[]>(() => {
    // Yalnız-yol modunda yalnız sürecin bittiği uç (izlenen hedefsiz çıkış) çizilir.
    const takenOnly = this.visibleKeys() !== null;
    const taken = this.overlayEdges();
    return this.nodes().flatMap(node => node.ports
      .filter(port => !port.target && (!takenOnly || taken.has(edgeId(node.key, port.port))))
      .map(port => ({
        key: `${node.key}:${port.port}`,
        from: node.key,
        port: port.port,
        kind: port.kind,
        x: node.x + port.offset,
        y1: node.y + node.height,
        y2: node.y + node.height + STUB_LENGTH
      })));
  });

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
    const port = source?.ports.find(p => p.port === pending.exitPort);
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
        if (this.gesture?.kind !== 'node') this.liveOffsets.set({});
      });
    }, { allowSignalWrites: true });

    // İçerik ilk geldiğinde şema görünüre sığdırılır. Başlangıç hapı ve sağdan
    // dolaşan kenarlar dünya koordinatında negatif/uzak yerlere düşebiliyor;
    // sabit (0,0) kamerayla açılışta ekran dışında kalırlardı.
    effect(() => {
      if (this.fitted || this.nodes().length === 0) return;
      this.fitted = true;
      if (untracked(this.fitOnOpen)) this.fitAfterRender();
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
   * geçer. Dinleyici şablondan bağlanıyor; sıradan bir div'de `wheel` passive
   * değildir, `preventDefault()` çalışır.
   */
  onWheel(event: WheelEvent): void {
    const rect = this.viewportRect();
    if (!rect) return;

    event.preventDefault();
    this.closeMenu();

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

  /**
   * Yeni eklenen düğümü görünür alana getirir (en küçük kaydırmayla, zoom
   * değişmez). Şemanın tamamı mevcut zoom'da sığıyorsa tamamı getirilir:
   * otomatik yerleşim yeni düğüm için KOMŞULARI da kaydırabiliyor ve yalnız yeni
   * düğüme bakmak onları ekran dışında bırakıyordu. `preferContent` false ise
   * (sorun listesinden adıma gitmek) yalnız düğüm getirilir. Konum ancak
   * çizimden sonra kesinleştiği için bir sonraki render'da çalışır.
   */
  reveal(key: string, preferContent = true): void {
    if (!isPlatformBrowser(this.platformId)) return;

    afterNextRender(() => {
      const node = this.nodesByKey().get(key.toLowerCase());
      const element = this.viewportRef()?.nativeElement;
      const bounds = this.contentBounds();
      if (!node || !element) return;

      const view = { width: element.clientWidth, height: element.clientHeight };
      const margin = 24;
      const zoom = this.camera().zoom;
      const content = bounds
        ? { x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY }
        : null;
      const fits = preferContent && !!content
        && content.width * zoom <= view.width - margin * 2
        && content.height * zoom <= view.height - margin * 2;

      this.camera.update(camera => revealBox(camera, fits ? content! : node, view, margin));
    }, { injector: this.injector });
  }

  /** Viewport merkezinin dünya koordinatı — klavyeyle eklenen adım için konum. */
  viewportCenter(): Point | null {
    const rect = this.viewportRect();
    if (!rect) return null;
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2, rect, this.camera());
  }

  private viewportRect(): ViewportRect | null {
    const element = this.viewportRef()?.nativeElement;
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  private toWorld(clientX: number, clientY: number): Point {
    const rect = this.viewportRect();
    if (!rect) return { x: clientX, y: clientY };
    return screenToWorld(clientX, clientY, rect, this.camera());
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

  // ── Seçim yardımcıları ────────────────────────────────────────────────────

  isSelected(node: CanvasNode): boolean {
    return this.selectedSet().has(node.key.toLowerCase());
  }

  overlayOf(node: CanvasNode): OverlayNodeState | null {
    return this.overlay()?.nodes[node.key.toLowerCase()] ?? null;
  }

  isEdgeTaken(edge: CanvasEdge): boolean {
    return this.overlayEdges().has(edgeId(edge.from, edge.exitPort));
  }

  /** Süreç bu hedefsiz çıkıştan bitti mi — uç işareti soluklaşmaz. */
  isStubTaken(stub: CanvasStub): boolean {
    return this.overlayEdges().has(edgeId(stub.from, stub.port));
  }

  // ── Düğüm üstü ipucu (salt-okunur görünümler) ─────────────────────────────

  onNodePointerEnter(event: PointerEvent, node: CanvasNode): void {
    if (event.pointerType === 'mouse') this.nodeHover.emit(node.key);
  }

  onNodePointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.nodeHover.emit(null);
  }

  /** Düğüm kartının ekrandaki kutusu — ipucunu yanına konumlamak için; çizili değilse null. */
  nodeScreenRect(key: string): DOMRect | null {
    const viewport = this.viewportRef()?.nativeElement;
    if (!viewport) return null;
    const element = Array.from(viewport.querySelectorAll<HTMLElement>('.canvas-node'))
      .find(el => el.dataset['key']?.toLowerCase() === key.toLowerCase());
    return element?.getBoundingClientRect() ?? null;
  }

  /** Port düğmesinin ekran okuyucu metni — koşul yolunda durumun etiketi. */
  portAria(port: CanvasPort): string {
    if (port.port === 'next') return this.languageService.t('workflow.canvas.portNext');
    if (port.kind === 'neutral') {
      return this.languageService.t('workflow.canvas.portCase', {
        label: port.label ?? this.languageService.t('workflow.canvas.edgeDefault')
      });
    }
    return this.languageService.t(port.kind === 'approve' ? 'workflow.canvas.portApprove' : 'workflow.canvas.portReject');
  }

  metaOf(node: CanvasNode): CanvasNodeMeta | null {
    return this.nodeMeta()[node.key.toLowerCase()] ?? null;
  }

  isEdgeSelected(edge: CanvasEdge): boolean {
    const selected = this.selectedEdge();
    return !!selected
      && selected.port === edge.exitPort
      && selected.from.toLowerCase() === edge.from.toLowerCase();
  }

  private emitSelection(nodes: string[], edge: CanvasEdgeRef | null = null): void {
    this.selectionChange.emit({ nodes, edge });
  }

  /**
   * Düğüm seçimi: ek tuşla eklenir/çıkarılır; ek tuşsuz basışta düğüm zaten
   * seçiliyse seçim korunur (birlikte sürüklensin diye), değilse yalnız o seçilir.
   */
  private selectionAfterPress(key: string, additive: boolean): string[] {
    const current = this.selectedNodes();
    const isSelected = this.selectedSet().has(key.toLowerCase());

    if (additive) {
      return isSelected
        ? current.filter(k => k.toLowerCase() !== key.toLowerCase())
        : [...current, key];
    }
    return isSelected ? current : [key];
  }

  // ── Düğüm: seçim + taşıma ─────────────────────────────────────────────────

  onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    if (!isPlatformBrowser(this.platformId) || !event.isPrimary) return;
    // Yalnız sol tuş: sağ/orta tuş düğümü sürüklemeye başlıyor ve menü açıldığı
    // için pointerup hiç gelmeyince düğüm imleci izlemeye devam ediyordu.
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
    this.focusViewport();

    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const selection = this.selectionAfterPress(node.key, additive);
    this.emitSelection(selection);

    // Salt-okunurda seçim çalışır, taşıma çalışmaz. Ek tuşla seçimden çıkarılan
    // düğüm de taşınmaz.
    if (this.locked() || !selection.some(k => k.toLowerCase() === node.key.toLowerCase())) return;

    const byKey = this.nodesByKey();
    const origins = new Map<string, Point>();
    for (const key of selection) {
      const selected = byKey.get(key.toLowerCase());
      if (selected) origins.set(selected.key, { x: selected.x, y: selected.y });
    }

    this.gesture = {
      kind: 'node', key: node.key, startX: event.clientX, startY: event.clientY,
      additive, origins, moved: false
    };
    this.attach(this.onGestureMove, this.onGestureEnd);
  }

  /** Düğüm çift tıklaması: ayrıntı pop-up'ı. */
  onNodeDoubleClick(node: CanvasNode): void {
    this.nodeOpened.emit(node.key);
  }

  // ── Zemin: kaydırma, kenar seçimi, lasso ──────────────────────────────────

  onSurfacePointerDown(event: PointerEvent): void {
    if (!isPlatformBrowser(this.platformId) || !event.isPrimary) return;
    // Sağ tuş menüdür (contextmenu olayı); burada yalnız sol ve orta tuş.
    if (event.button !== 0 && event.button !== 1) return;

    event.preventDefault();
    this.closeMenu();
    this.focusViewport();

    const world = this.toWorld(event.clientX, event.clientY);

    // Shift + sol tuş: çerçeveyle seçim.
    if (event.button === 0 && event.shiftKey) {
      this.gesture = { kind: 'lasso', start: world, additive: true };
      this.lasso.set({ x: world.x, y: world.y, width: 0, height: 0 });
      this.attach(this.onGestureMove, this.onGestureEnd);
      return;
    }

    this.gesture = {
      kind: 'surface',
      startX: event.clientX,
      startY: event.clientY,
      origin: this.camera(),
      edge: event.button === 0 ? edgeAt(this.edges(), world, this.camera().zoom) : null,
      moved: false
    };
    this.attach(this.onGestureMove, this.onGestureEnd);
  }

  private gesture: Gesture | null = null;
  readonly panning = signal(false);

  private readonly onGestureMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || !event.isPrimary) return;

    const { clientX, clientY, altKey } = event;

    if (gesture.kind === 'lasso') {
      const point = this.toWorld(clientX, clientY);
      this.scheduleFrame(() => this.lasso.set(normalizedRect(gesture.start, point)));
      return;
    }

    const dx = clientX - gesture.startX;
    const dy = clientY - gesture.startY;
    if (!gesture.moved && !exceedsThreshold(dx, dy)) return;

    if (gesture.kind === 'surface') {
      if (!gesture.moved) this.panning.set(true);
      gesture.moved = true;
      this.scheduleFrame(() => this.camera.set(panBy(gesture.origin, dx, dy)));
      return;
    }

    gesture.moved = true;
    const zoom = this.camera().zoom;
    // Alt basılıyken ızgaraya yapışma kapalı (ince ayar).
    const positions = dragPositions(gesture.origins, dx, dy, zoom, !altKey);
    this.scheduleFrame(() => this.liveOffsets.update(current => {
      const next = { ...current };
      for (const [key, point] of positions) next[key] = point;
      return next;
    }));
  };

  private readonly onGestureEnd = (event: PointerEvent): void => {
    this.flushFrame();
    const gesture = this.gesture;
    this.gesture = null;
    this.detach(this.onGestureMove, this.onGestureEnd);
    this.panning.set(false);

    if (!gesture) return;

    if (gesture.kind === 'lasso') {
      const rect = this.lasso();
      this.lasso.set(null);
      if (!rect) return;

      const hits = nodesInRect(this.nodes(),
        { x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height });
      const merged = gesture.additive
        ? [...this.selectedNodes(), ...hits.map(n => n.key)
            .filter(key => !this.selectedSet().has(key.toLowerCase()))]
        : hits.map(n => n.key);
      this.emitSelection(merged);
      return;
    }

    if (gesture.kind === 'surface') {
      if (gesture.moved || event.type === 'pointercancel') return;
      // Sürüklenmeden bırakılan zemin tıklaması: kenar varsa onu seç, yoksa seçimi temizle.
      if (gesture.edge) {
        this.emitSelection([], { from: gesture.edge.from, port: gesture.edge.exitPort });
      } else {
        this.emitSelection([]);
      }
      return;
    }

    // Düğüm jesti.
    if (!gesture.moved) {
      // Ek tuşsuz tıklama çoklu seçimi tek düğüme indirir (sürükleme başlamadıysa).
      if (!gesture.additive && this.selectedNodes().length > 1) this.emitSelection([gesture.key]);
      return;
    }
    if (event.type === 'pointercancel') {
      this.liveOffsets.set({});
      return;
    }

    const live = this.liveOffsets();
    const moved = [...gesture.origins.keys()]
      .map(key => ({ key, ...(live[key] ?? gesture.origins.get(key)!) }));
    this.nodesMoved.emit(this.pinAll(moved));
  };

  /**
   * Taşınan düğümlere, konumu otomatik yerleşimden gelen DİĞER düğümlerin
   * mevcut konumlarını ekler. İlk elle taşımadan sonra tanım tamamen "elle
   * yerleşim"e geçer: sonradan adım eklenince otomatik yerleşim değişse de
   * kullanıcının yerleştirmediği kutular zıplamaz.
   */
  private pinAll(moves: Array<{ key: string; x: number; y: number }>): Array<{ key: string; x: number; y: number }> {
    const movedKeys = new Set(moves.map(m => m.key.toLowerCase()));
    const unpinned = this.nodes()
      .filter(node => !node.pinned && !movedKeys.has(node.key.toLowerCase()))
      .map(node => ({ key: node.key, x: node.x, y: node.y }));

    return [...moves, ...unpinned];
  }

  /** Seçili düğümleri ok tuşuyla iter (Shift: ızgara adımı). */
  nudge(direction: 'left' | 'right' | 'up' | 'down', large: boolean): void {
    if (this.locked()) return;

    const selected = this.nodes().filter(node => this.selectedSet().has(node.key.toLowerCase()));
    if (selected.length === 0) return;

    const delta = nudgeDelta(direction, large);
    const moves = selected.map(node => ({
      key: node.key,
      x: Math.max(0, large ? snapValue(node.x + delta.x, true) : node.x + delta.x),
      y: Math.max(0, large ? snapValue(node.y + delta.y, true) : node.y + delta.y)
    }));

    // Yeni konum canlı ofsete de yazılır: değişiklik algılama sonraki kareye
    // ertelendiği için (eventCoalescing) aynı karede gelen ikinci basış `graph`
    // girdisini hâlâ eski görür ve itmeler birikmek yerine üst üste yazılırdı.
    // Tanım güncellenince ofsetler zaten bırakılır (bkz. constructor).
    this.liveOffsets.update(current => {
      const next = { ...current };
      for (const move of moves) next[move.key] = { x: move.x, y: move.y };
      return next;
    });

    this.nodesMoved.emit(this.pinAll(moves));
  }

  // ── Bağlantı çizme ────────────────────────────────────────────────────────

  onPortDragStart(event: PointerEvent, node: CanvasNode, port: CanvasPort): void {
    if (!isPlatformBrowser(this.platformId) || this.locked() || !event.isPrimary) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();

    const point = this.toWorld(event.clientX, event.clientY);
    this.pendingEdge.set({ from: node.key, port: port.kind, exitPort: port.port, x: point.x, y: point.y });
    this.attach(this.onPortDragMove, this.onPortDragEnd);
  }

  private readonly onPortDragMove = (event: PointerEvent): void => {
    if (!this.pendingEdge() || !event.isPrimary) return;

    const point = this.toWorld(event.clientX, event.clientY);
    this.scheduleFrame(() => {
      const pending = this.pendingEdge();
      if (pending) this.pendingEdge.set({ ...pending, x: point.x, y: point.y });
    });
  };

  private readonly onPortDragEnd = (event: PointerEvent): void => {
    this.flushFrame();
    const pending = this.pendingEdge();
    this.pendingEdge.set(null);
    this.detach(this.onPortDragMove, this.onPortDragEnd);

    // İptal edilen jest bağlantı oluşturmaz — yalnız yarım çizgiyi temizler.
    if (!pending || event.type === 'pointercancel') return;

    const target = nodeAt(this.nodes(), this.toWorld(event.clientX, event.clientY));
    // Kendine bağlantı yok sayılır: sonsuz döngü kurmanın en kolay yolu bu
    // ve kullanıcının bunu isteyerek yaptığı bir senaryo yok.
    if (!target || target.key.toLowerCase() === pending.from.toLowerCase()) return;

    this.edgeCreated.emit({ from: pending.from, to: target.key, port: pending.port, exitPort: pending.exitPort });
  };

  // ── Sağ tık menüsü ────────────────────────────────────────────────────────

  /**
   * Düğüm, kenar ya da zemin için bağlama duyarlı menü. Menü viewport'un
   * KARDEŞİ olarak `position: fixed` ile çizilir: dönüştürülmüş (transform)
   * bir atanın içindeki fixed eleman ekrana değil o ataya göre konumlanırdı.
   */
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (!isPlatformBrowser(this.platformId)) return;

    const world = this.toWorld(event.clientX, event.clientY);
    const node = nodeAt(this.nodes(), world);
    const editable = !this.locked();
    const items: MenuItem[] = [];

    if (node) {
      if (!this.selectedSet().has(node.key.toLowerCase())) this.emitSelection([node.key]);

      items.push({
        id: 'open', labelKey: editable ? 'workflow.canvas.menu.edit' : 'workflow.canvas.menu.details',
        run: () => this.menuAction.emit({ type: 'open', key: node.key })
      });
      if (editable) {
        if (!node.isStart) {
          items.push({
            id: 'start', labelKey: 'workflow.canvas.menu.setStart',
            run: () => this.menuAction.emit({ type: 'setStart', key: node.key })
          });
        }
        items.push({
          id: 'duplicate', labelKey: 'workflow.canvas.menu.duplicate',
          run: () => this.menuAction.emit({ type: 'duplicate' })
        });
        items.push({
          id: 'delete', labelKey: 'workflow.canvas.menu.delete', danger: true,
          run: () => this.menuAction.emit({ type: 'delete' })
        });
      }
    } else {
      const edge = edgeAt(this.edges(), world, this.camera().zoom);
      if (edge) {
        this.emitSelection([], { from: edge.from, port: edge.exitPort });
        if (editable) {
          items.push({
            id: 'deleteEdge', labelKey: 'workflow.canvas.menu.deleteEdge', danger: true,
            run: () => this.menuAction.emit({ type: 'delete' })
          });
        }
      } else {
        if (editable) {
          for (const info of NODE_KINDS) {
            items.push({
              id: `add-${info.kind}`, labelKey: info.labelKey, label: this.addLabel(info.labelKey),
              run: () => this.menuAction.emit({
                type: 'addNode', kind: info.kind, at: centeredAt(world, kindSize(info.kind)),
                from: null, pins: this.pinAll([])
              })
            });
          }
          items.push({
            id: 'arrange', labelKey: 'workflow.canvas.autoLayout',
            run: () => this.autoArrange()
          });
        }
        items.push({ id: 'fit', labelKey: 'workflow.canvas.fit', run: () => this.fitToScreen() });
        items.push({
          id: 'all', labelKey: 'workflow.canvas.menu.selectAll',
          run: () => this.menuAction.emit({ type: 'selectAll' })
        });
      }
    }

    if (items.length === 0) {
      this.closeMenu();
      return;
    }

    this.menu.set({ x: event.clientX, y: event.clientY, items });
    document.addEventListener('pointerdown', this.onOutsidePointerDown, true);
    afterNextRender(() => this.placeMenu(), { injector: this.injector });
  }

  /**
   * Menü çizildikten sonra ölçülür ve pencereye sığdırılır: ekranın alt/sağ
   * kenarına yakın sağ tıkta menü pencereden taşıyordu (telefonda tümüyle).
   * İlk madde odaklanır — klavyeyle Tab/Enter ve Escape çalışsın.
   */
  private placeMenu(): void {
    const menu = this.menu();
    const element = this.menuRef()?.nativeElement;
    if (!menu || !element) return;

    const placed = clampToWindow(
      { x: menu.x, y: menu.y },
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight });
    if (placed.x !== menu.x || placed.y !== menu.y) this.menu.set({ ...menu, ...placed });

    element.querySelector<HTMLElement>('.canvas-menu-item')?.focus({ preventScroll: true });
  }

  // ── Yeni düğüm: hızlı ekle, sürükle-bırak, palet ───────────────────────────

  private addLabel(kindLabelKey: string): string {
    return this.languageService.t('workflow.canvas.menu.addKind', { kind: this.languageService.t(kindLabelKey) });
  }

  /**
   * Bağlantısız çıkışın ucundaki "+": hangi türde düğüm ekleneceğini sorar,
   * seçilen düğüm o çıkışa bağlı olarak eklenir.
   */
  openQuickAdd(event: MouseEvent, stub: CanvasStub): void {
    event.stopPropagation();
    if (this.locked() || !isPlatformBrowser(this.platformId)) return;

    const anchor = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    const from: CanvasEdgeRef = { from: stub.from, port: stub.port };
    const items: MenuItem[] = NODE_KINDS.map(info => ({
      id: `quick-${info.kind}`, labelKey: info.labelKey, label: this.addLabel(info.labelKey),
      run: () => {
        const placement = this.placeNew(info.kind, from);
        this.menuAction.emit({ type: 'addNode', kind: info.kind, from, ...placement });
      }
    }));

    this.menu.set({
      x: anchor ? anchor.left : event.clientX,
      y: anchor ? anchor.bottom + 4 : event.clientY,
      items
    });
    document.addEventListener('pointerdown', this.onOutsidePointerDown, true);
    afterNextRender(() => this.placeMenu(), { injector: this.injector });
  }

  /**
   * Yeni düğümün yeri. Hiçbir düğüm elle konumlanmamışsa konum verilmez —
   * otomatik yerleşim bağlı düğümü kendi katmanına koyar. Aksi halde bağlanan
   * çıkışın altına (ya da görünür alanın ortasına), boş bir yere konur ve
   * otomatik yerleşimdeki komşular sabitlenir.
   */
  placeNew(kind: NodeKind, from: CanvasEdgeRef | null): { at: Point | null; pins: CanvasMoves } {
    const nodes = this.nodes();
    if (!nodes.some(node => node.pinned)) return { at: null, pins: [] };

    const size = kindSize(kind);
    const source = from ? this.nodesByKey().get(from.from.toLowerCase()) : undefined;

    if (source) {
      const port = source.ports.find(p => p.port === from!.port);
      return { at: placeBelow(source, port?.offset ?? source.width / 2, size, nodes), pins: this.pinAll([]) };
    }

    const center = this.viewportCenter() ?? { x: 0, y: 0 };
    const start = centeredAt(center, size);
    return { at: findFreeSpot(start, size, nodes), pins: this.pinAll([]) };
  }

  onDragOver(event: DragEvent): void {
    if (this.locked() || !event.dataTransfer?.types.includes(WORKFLOW_NODE_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  /** Paletten bırakılan düğüm, bırakılan noktaya ortalanır. */
  onDrop(event: DragEvent): void {
    const kind = event.dataTransfer?.getData(WORKFLOW_NODE_MIME);
    if (this.locked() || !isNodeKind(kind)) return;

    event.preventDefault();
    this.focusViewport();
    const at = centeredAt(this.toWorld(event.clientX, event.clientY), kindSize(kind));
    this.menuAction.emit({ type: 'addNode', kind, at, from: null, pins: this.pinAll([]) });
  }

  runMenuItem(item: MenuItem): void {
    this.closeMenu();
    item.run();
  }

  closeMenu(): void {
    if (!this.menu()) return;
    this.menu.set(null);
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('pointerdown', this.onOutsidePointerDown, true);
    }
  }

  /** Menü dışına basış menüyü kapatır (menü maddesine basış kapatmaz). */
  private readonly onOutsidePointerDown = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target?.closest?.('.canvas-menu')) return;
    this.closeMenu();
  };

  // ── Dinleyici yönetimi ────────────────────────────────────────────────────

  private attach(move: (e: PointerEvent) => void, end: (e: PointerEvent) => void): void {
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    // pointercancel: tarayıcı jesti devralırsa (sistem kaydırması) jest takılı kalmasın.
    document.addEventListener('pointercancel', end);
  }

  private detach(move: (e: PointerEvent) => void, end: (e: PointerEvent) => void): void {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', end);
    document.removeEventListener('pointercancel', end);
  }

  /** Klavye kısayolları tuval odaktayken de çalışsın diye viewport odaklanır. */
  private focusViewport(): void {
    this.viewportRef()?.nativeElement.focus({ preventScroll: true });
  }

  /** Bileşen kapanırken yarım kalan jestlerin document dinleyicilerini söker. */
  private detachAll(): void {
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    this.frameJob = null;
    this.gesture = null;
    if (!isPlatformBrowser(this.platformId)) return;

    this.detach(this.onGestureMove, this.onGestureEnd);
    this.detach(this.onPortDragMove, this.onPortDragEnd);
    document.removeEventListener('pointerdown', this.onOutsidePointerDown, true);
  }
}
