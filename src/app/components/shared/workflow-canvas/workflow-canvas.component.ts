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
import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icons.generated';
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

/** Edge labels are unreadable below this zoom level, so they are hidden. */
const EDGE_LABEL_MIN_ZOOM = 0.55;

/** Length of the short end line of an exit without a target (the flow ends here). */
const STUB_LENGTH = 22;

/** Size of the start pill and the gap above the start step. */
const START_WIDTH = 104;
const START_HEIGHT = 28;
const START_GAP = 36;

/** Data type of the node kind dragged from the palette onto the canvas (HTML5 drag-and-drop). */
export const WORKFLOW_NODE_MIME = 'application/x-corelogic-workflow-node';

/**
 * Display info for a node card — computed by the design screen (type label, assignment
 * summary, issue counts); the canvas only draws it. The key is the lower-case step key.
 */
export interface CanvasNodeMeta {
  kindLabel: string;
  tone: NodeTone;
  /** Icon of the node type (`NODE_KINDS`). */
  icon: IconName;
  summary: string;
  errors: number;
  warnings: number;
  /** Tooltip / screen reader text of the issue badge. */
  issueTitle: string;
}

/** Positions at which auto-laid-out neighbours are pinned when a new node's position is given. */
export type CanvasMoves = Array<{ key: string; x: number; y: number }>;

/** Where an exit ends the flow: a short line under the node + end marker. */
export interface CanvasStub {
  key: string;
  /** The step owning the exit and its port — for adding a connected node via "+". */
  from: string;
  port: ExitPort;
  kind: PortKind;
  x: number;
  y1: number;
  y2: number;
}

/** Start pill: above the start step, connected to it. */
export interface CanvasStart {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Line descending from the pill to the start step. */
  path: string;
}

/** Identity of the selected edge: source step + exit port. */
export interface CanvasEdgeRef {
  from: string;
  port: ExitPort;
}

export interface CanvasSelection {
  nodes: string[];
  edge: CanvasEdgeRef | null;
}

/** Document-related actions sent from the context menu to the design screen. */
export type CanvasMenuAction =
  | { type: 'open'; key: string }
  | { type: 'setStart'; key: string }
  | { type: 'duplicate' }
  | { type: 'delete' }
  | {
      type: 'addNode';
      kind: NodeKind;
      /** null: no position given, auto layout places it (while no node is pinned). */
      at: Point | null;
      /** If set, the new node is connected to this exit. */
      from: CanvasEdgeRef | null;
      /** When a position is given, auto-laid-out nodes are pinned too (so they don't jump). */
      pins: CanvasMoves;
    }
  | { type: 'selectAll' };

/** Box a new node will occupy (a parallel node starts with two branches). */
function kindSize(kind: NodeKind): { width: number; height: number } {
  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT + (kind === 'parallel' ? 2 * BRANCH_LINE_HEIGHT : 0)
  };
}

interface MenuItem {
  id: string;
  labelKey: string;
  /** Translated text (for parameterised labels); shown instead of labelKey if present. */
  label?: string;
  danger?: boolean;
  run: () => void;
}

interface MenuState {
  /** Screen (client) coordinate — the menu opens with `position: fixed`. */
  x: number;
  y: number;
  items: MenuItem[];
}

/** The ongoing pointer gesture. Only one can exist at a time. */
type Gesture =
  | {
      kind: 'node';
      key: string;
      startX: number;
      startY: number;
      additive: boolean;
      /** Start positions of the nodes being moved together. */
      origins: Map<string, Point>;
      moved: boolean;
    }
  | {
      kind: 'surface';
      startX: number;
      startY: number;
      origin: Camera;
      /** Edge at the pressed point — selected if no drag happens. */
      edge: CanvasEdge | null;
      moved: boolean;
    }
  | {
      kind: 'lasso';
      start: Point;
      additive: boolean;
    };

/**
 * Drag-and-drop workflow designer.
 *
 * The project has NO CDK, drag-drop or diagram library; everything is written with native Pointer
 * Events — the same approach as the drag pattern in dashboard-build.
 *
 * Interactions:
 *   - SELECT       — click a node or edge; add/remove with Shift/Ctrl;
 *                    Shift + drag on empty background = frame (lasso) selection.
 *   - MOVE         — drag the selected node(s) by the body; snaps to the 20 px
 *                    grid, free while Alt is held.
 *   - CONNECT      — drag from an exit port and drop on the target node.
 *   - PAN          — drag the empty background or with the middle button; wheel.
 *   - ZOOM         — Ctrl/Cmd + wheel (the point under the cursor stays fixed).
 *   - RIGHT CLICK  — node/edge/background menu.
 * Keyboard shortcuts are listened to by the design screen, which calls the methods here.
 *
 * The camera is a single CSS transform (`.canvas-world`); world coordinates never
 * change. Geometry, camera, hit testing and interaction rules live in pure
 * modules — this component only holds signals, DOM listeners and outputs.
 */
@Component({
    selector: 'app-workflow-canvas',
    imports: [TranslatePipe, HelpHintComponent, IconComponent],
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
   * Read-only mode: moving, connecting and editing menu items are off;
   * zoom/pan/selection are on. The field is named `locked` because `readonly` can't
   * be used as a class member name.
   */
  readonly locked = input(false, { alias: 'readonly' });

  /**
   * The camera is two-way bound (`[(camera)]`): the canvas leaves the DOM on a tab switch,
   * so the value is kept by the screen to reopen where it left off on return.
   */
  readonly camera = model<Camera>(IDENTITY_CAMERA);

  /** Whether to fit the diagram when content first arrives (no if there's a saved camera). */
  readonly fitOnOpen = input(true);

  /** Translation key of the toolbar hint — if omitted, the edit / read-only default. */
  readonly hintKey = input<string | null>(null);

  /**
   * Fill the containing cell instead of a fixed 560px (the designer's full screen). The camera
   * isn't affected: fit/zoom re-read the viewport size on every call.
   */
  readonly fillHeight = input(false);

  /** Type/summary/issue info of the cards (lower-case keys). Without it the card shows the key. */
  readonly nodeMeta = input<Readonly<Record<string, CanvasNodeMeta>>>({});

  /**
   * Path overlay (simulation, running process): traversed nodes and edges are
   * highlighted, the rest are faded. null → normal drawing.
   */
  readonly overlay = input<WorkflowOverlay | null>(null);

  /**
   * Path only: the steps in the overlay and traversed edges are drawn, unreached ones are
   * NOT drawn at all ("Akışı görüntüle" (View workflow) on the record screen). Positions still come from
   * the whole graph's layout — the diagram stays where it is in the designer, it just looks incomplete.
   */
  readonly pathOnly = input(false);

  private readonly overlayEdges = computed(() => new Set(this.overlay()?.edges ?? []));

  /** Steps shown in path-only mode (lower-case); null → all. */
  private readonly visibleKeys = computed<ReadonlySet<string> | null>(() => {
    const overlay = this.overlay();
    return this.pathOnly() && overlay ? new Set(Object.keys(overlay.nodes)) : null;
  });

  /**
   * Nodes were moved — the positions must be written to the definition in a SINGLE change. On the first
   * manual move, the other nodes whose positions come from auto layout are added too
   * (see pinAll): so they don't "jump" when the layout changes on later additions.
   */
  readonly nodesMoved = output<Array<{ key: string; x: number; y: number }>>();
  /** A connection was made — the source step's corresponding exit must be updated. */
  readonly edgeCreated = output<{ from: string; to: string; port: PortKind; exitPort: ExitPort }>();
  readonly selectionChange = output<CanvasSelection>();
  /** A node was double-clicked — the step detail pop-up should open (in read-only too). */
  readonly nodeOpened = output<string>();
  /** "Otomatik düzenle" (Auto arrange) — manually set positions must be cleared. */
  readonly layoutReset = output<void>();
  readonly menuAction = output<CanvasMenuAction>();
  /**
   * The mouse entered (key) / left (null) a node — for the detail tooltip.
   * Mouse only: there's no hover on touch, where tap selection (selectionChange) is used.
   */
  readonly nodeHover = output<string | null>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly languageService = inject(LanguageService);
  private readonly injector = inject(Injector);
  private readonly viewportRef = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly menuRef = viewChild<ElementRef<HTMLElement>>('menu');

  /**
   * During a drag the positions are kept here and not written to the definition on every
   * pointer event — a definition change rebuilds the whole graph and the drag would
   * stutter. Writing to the definition happens only on release (pointerup).
   */
  private readonly liveOffsets = signal<Record<string, Point>>({});

  /** Cursor point while drawing a connection — for the temporary line. */
  readonly pendingEdge = signal<{ from: string; port: PortKind; exitPort: ExitPort; x: number; y: number } | null>(null);

  /** Lasso frame (world coordinates); null when not drawing. */
  readonly lasso = signal<{ x: number; y: number; width: number; height: number } | null>(null);

  readonly menu = signal<MenuState | null>(null);

  readonly zoomPercent = computed(() => Math.round(this.camera().zoom * 100));
  readonly showEdgeLabels = computed(() => this.camera().zoom > EDGE_LABEL_MIN_ZOOM);

  /** The dotted grid in the viewport — scales and shifts together with the camera. */
  readonly grid = computed(() => {
    const { step, offsetX, offsetY } = gridStyle(this.camera());
    return { size: `${step}px ${step}px`, position: `${offsetX}px ${offsetY}px` };
  });

  /**
   * Auto layout lives in a SEPARATE computed: dragging changes `liveOffsets` ~60 times
   * per second; if the layout were read in the same place it would be recomputed every
   * frame. Separated, it is computed only when the graph changes.
   */
  private readonly autoLayout = computed(() => layoutWorkflow(this.graph()));

  private readonly positionedNodes = computed<CanvasNode[]>(() =>
    resolveNodePositions(this.graph(), this.autoLayout().nodes, this.liveOffsets()));

  /** Drawn nodes — in path-only mode unreached ones drop out (edges/ends/bounds derive from this). */
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
   * Edges are derived from node positions; they follow live while dragging.
   *
   * Orthogonal with rounded corners: each edge leaves its own port and reaches the target's
   * alignment in a horizontal channel. If the target isn't below the source (reject → previous
   * step) the edge is routed around the right of the boxes (see routeOrthogonal).
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
    // In path-only mode an untraversed edge drops out BEFORE routing: invisible
    // edges must not reserve channels and make the visible ones detour needlessly.
    const takenOnly = this.visibleKeys() !== null;
    const taken = this.overlayEdges();

    for (const source of nodes) {
      for (const port of source.ports) {
        // An exit without a target is an end marker, not an edge (see stubs).
        if (!port.target) continue;
        if (takenOnly && !taken.has(edgeId(source.key, port.port))) continue;

        const target = byKey.get(port.target.toLowerCase());
        if (!target) continue;

        pending.push({
          // The port id is in the key: two cases of a condition may go to the same target.
          key: `${source.key}->${port.target}:${port.port}`,
          // An automatic action's single "next" exit is drawn unlabelled — "Diğer" (Other) would mislead.
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
   * Exits where the flow ends: a short line under the node and an end marker
   * (approve/complete green, reject red). An exit whose target was deleted (not found)
   * shows up in the validation panel, not here.
   */
  readonly stubs = computed<CanvasStub[]>(() => {
    // In path-only mode only the end where the process finished (the traversed target-less exit) is drawn.
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

  /** Start pill — above the start step if there is one. */
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

  /** Path of the temporary connection being dragged — starts at the dragged port itself. */
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
   * World bounds of everything drawn: nodes, edges (loop-backs routed around the right
   * overflow the boxes), end markers and the start pill.
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
   * Required size of the canvas surface — grows when content is moved. Edges are
   * taken into account too: previously only nodes were considered, and loop-back edges
   * routed around the right ended up outside the SVG and were clipped.
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
    // When the definition changes (write after release, undo, edit from another tab)
    // the live offsets are dropped: otherwise a node dragged once would shadow its
    // position in the definition forever.
    effect(() => {
      this.graph();
      untracked(() => {
        if (this.gesture?.kind !== 'node') this.liveOffsets.set({});
      });
    });

    // When content first arrives the diagram is fitted into view. The start pill and edges
    // routed around the right can fall at negative/far world coordinates;
    // with a fixed (0,0) camera they would be off-screen on open.
    effect(() => {
      if (this.fitted || this.nodes().length === 0) return;
      this.fitted = true;
      if (untracked(this.fitOnOpen)) this.fitAfterRender();
    });

    // If the component closes mid-gesture (tab switch) the document
    // listeners must not leak.
    inject(DestroyRef).onDestroy(() => this.detachAll());
  }

  /** Whether the initial fit was done — later definition changes don't move the camera. */
  private fitted = false;

  /** Fits once the viewport is laid out in the DOM (its size is known only then). */
  private fitAfterRender(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    requestAnimationFrame(() => this.fitToScreen());
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  /**
   * Wheel: cursor-centred zoom with Ctrl/Cmd, pan with a plain wheel.
   * A trackpad pinch also arrives in the browser with `ctrlKey`, so it goes the same way.
   * The listener is bound from the template; on an ordinary div `wheel` isn't passive,
   * so `preventDefault()` works.
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
   * Returns to 100% without losing the spot being viewed (the viewport centre stays fixed). Previously
   * the camera jumped to the origin; the diagram and the start pill disappeared from
   * view.
   */
  resetZoom(): void {
    const rect = this.viewportRect();
    if (!rect) {
      this.camera.set(IDENTITY_CAMERA);
      return;
    }
    this.camera.update(camera => zoomAtCenter(camera, 1 / camera.zoom, rect));
  }

  /** Drops manual positions and returns to auto layout; the new layout is fitted into view. */
  autoArrange(): void {
    this.liveOffsets.set({});
    this.layoutReset.emit();
    this.fitAfterRender();
  }

  /** Fits the whole diagram (including the start pill, loop-backs and end markers) into view. */
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
   * Brings a newly added node into view (with the smallest pan; zoom doesn't
   * change). If the whole diagram fits at the current zoom, all of it is brought in:
   * auto layout can shift the NEIGHBOURS too for a new node, and looking only at the new
   * node left them off-screen. If `preferContent` is false
   * (jumping to a step from the issue list) only the node is brought in. Since the position is only
   * final after drawing, this runs on the next render.
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

  /** World coordinate of the viewport centre — position for a step added via keyboard. */
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

  // ── One update per frame ────────────────────────────────────────────

  private frameRequest = 0;
  private frameJob: (() => void) | null = null;

  /**
   * pointermove can fire more than 60 times per second (high refresh rate screen,
   * tablet pen); if each wrote a signal and re-routed the edges the drag
   * would stutter. Only the LATEST move per frame is applied.
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

  /** On release, applies the pending last move immediately — so the release position isn't lost. */
  private flushFrame(): void {
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
    const pending = this.frameJob;
    this.frameJob = null;
    pending?.();
  }

  // ── Selection helpers ────────────────────────────────────────────────────

  isSelected(node: CanvasNode): boolean {
    return this.selectedSet().has(node.key.toLowerCase());
  }

  overlayOf(node: CanvasNode): OverlayNodeState | null {
    return this.overlay()?.nodes[node.key.toLowerCase()] ?? null;
  }

  isEdgeTaken(edge: CanvasEdge): boolean {
    return this.overlayEdges().has(edgeId(edge.from, edge.exitPort));
  }

  /** Whether the process ended through this target-less exit — the end marker isn't faded. */
  isStubTaken(stub: CanvasStub): boolean {
    return this.overlayEdges().has(edgeId(stub.from, stub.port));
  }

  // ── Node hover tooltip (read-only views) ─────────────────────────────

  onNodePointerEnter(event: PointerEvent, node: CanvasNode): void {
    if (event.pointerType === 'mouse') this.nodeHover.emit(node.key);
  }

  onNodePointerLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.nodeHover.emit(null);
  }

  /** On-screen box of the node card — for positioning the tooltip next to it; null if not drawn. */
  nodeScreenRect(key: string): DOMRect | null {
    const viewport = this.viewportRef()?.nativeElement;
    if (!viewport) return null;
    const element = Array.from(viewport.querySelectorAll<HTMLElement>('.canvas-node'))
      .find(el => el.dataset['key']?.toLowerCase() === key.toLowerCase());
    return element?.getBoundingClientRect() ?? null;
  }

  /** Screen reader text of the port button — the case label on a condition path. */
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
   * Node selection: added/removed with a modifier key; on a press without a modifier, if the node is already
   * selected the selection is kept (so they drag together), otherwise only it is selected.
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

  // ── Node: selection + moving ─────────────────────────────────────────────────

  onNodePointerDown(event: PointerEvent, node: CanvasNode): void {
    if (!isPlatformBrowser(this.platformId) || !event.isPrimary) return;
    // Left button only: the right/middle button started dragging the node, and since the menu opened
    // no pointerup ever arrived and the node kept following the cursor.
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
    this.focusViewport();

    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const selection = this.selectionAfterPress(node.key, additive);
    this.emitSelection(selection);

    // In read-only, selection works but moving doesn't. A node removed from the selection
    // with a modifier key isn't moved either.
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

  /** Node double-click: detail pop-up. */
  onNodeDoubleClick(node: CanvasNode): void {
    this.nodeOpened.emit(node.key);
  }

  // ── Background: pan, edge selection, lasso ──────────────────────────────────

  onSurfacePointerDown(event: PointerEvent): void {
    if (!isPlatformBrowser(this.platformId) || !event.isPrimary) return;
    // The right button is the menu (contextmenu event); only the left and middle buttons here.
    if (event.button !== 0 && event.button !== 1) return;

    event.preventDefault();
    this.closeMenu();
    this.focusViewport();

    const world = this.toWorld(event.clientX, event.clientY);

    // Shift + left button: frame selection.
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
    // Grid snapping is off while Alt is held (fine-tuning).
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
      // A background click released without dragging: select the edge if there is one, otherwise clear the selection.
      if (gesture.edge) {
        this.emitSelection([], { from: gesture.edge.from, port: gesture.edge.exitPort });
      } else {
        this.emitSelection([]);
      }
      return;
    }

    // Node gesture.
    if (!gesture.moved) {
      // A click without a modifier reduces a multi-selection to a single node (if no drag started).
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
   * Adds the current positions of the OTHER nodes, whose positions come from auto layout,
   * to the moved nodes. After the first manual move the definition switches fully to "manual
   * layout": even if auto layout changes when steps are added later,
   * boxes the user didn't place don't jump.
   */
  private pinAll(moves: Array<{ key: string; x: number; y: number }>): Array<{ key: string; x: number; y: number }> {
    const movedKeys = new Set(moves.map(m => m.key.toLowerCase()));
    const unpinned = this.nodes()
      .filter(node => !node.pinned && !movedKeys.has(node.key.toLowerCase()))
      .map(node => ({ key: node.key, x: node.x, y: node.y }));

    return [...moves, ...unpinned];
  }

  /** Nudges the selected nodes with the arrow keys (Shift: grid step). */
  nudge(direction: 'left' | 'right' | 'up' | 'down', large: boolean): void {
    if (this.locked()) return;

    const selected = this.nodes().filter(node => this.selectedSet().has(node.key.toLowerCase()));
    if (selected.length === 0) return;

    const delta = nudgeDelta(direction, large);
    const moves = selected.map(node => ({
      key: node.key,
      x: large ? snapValue(node.x + delta.x, true) : node.x + delta.x,
      y: large ? snapValue(node.y + delta.y, true) : node.y + delta.y
    }));

    // The new position is written to the live offset too: since change detection is deferred to the next
    // frame (eventCoalescing), a second press in the same frame still sees the old `graph`
    // input, and the nudges would overwrite each other instead of accumulating.
    // The offsets are dropped anyway once the definition updates (see constructor).
    this.liveOffsets.update(current => {
      const next = { ...current };
      for (const move of moves) next[move.key] = { x: move.x, y: move.y };
      return next;
    });

    this.nodesMoved.emit(this.pinAll(moves));
  }

  // ── Drawing connections ────────────────────────────────────────────────────────

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

    // A cancelled gesture creates no connection — it only clears the half-drawn line.
    if (!pending || event.type === 'pointercancel') return;

    const target = nodeAt(this.nodes(), this.toWorld(event.clientX, event.clientY));
    // A self-connection is ignored: it's the easiest way to build an infinite loop
    // and there's no scenario where the user does it on purpose.
    if (!target || target.key.toLowerCase() === pending.from.toLowerCase()) return;

    this.edgeCreated.emit({ from: pending.from, to: target.key, port: pending.port, exitPort: pending.exitPort });
  };

  // ── Context menu ────────────────────────────────────────────────────────

  /**
   * Context-sensitive menu for a node, edge or background. The menu is drawn as a
   * SIBLING of the viewport with `position: fixed`: a fixed element inside a transformed
   * ancestor would be positioned relative to that ancestor, not the screen.
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
   * The menu is measured after drawing and fitted into the window: on a right click near the
   * bottom/right edge of the screen the menu overflowed the window (entirely on a phone).
   * The first item is focused — so Tab/Enter and Escape work from the keyboard.
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

  // ── New node: quick add, drag-and-drop, palette ───────────────────────────

  private addLabel(kindLabelKey: string): string {
    return this.languageService.t('workflow.canvas.menu.addKind', { kind: this.languageService.t(kindLabelKey) });
  }

  /**
   * The "+" at the tip of an unconnected exit: asks what kind of node to add;
   * the chosen node is added connected to that exit.
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
   * Position of the new node. If no node is manually positioned, no position is given —
   * auto layout puts the connected node on its own layer. Otherwise it is placed in a free spot
   * below the connected exit (or in the middle of the visible area), and the
   * auto-laid-out neighbours are pinned.
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

  /** A node dropped from the palette is centred on the drop point. */
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

  /** Pressing outside the menu closes it (pressing a menu item doesn't). */
  private readonly onOutsidePointerDown = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target?.closest?.('.canvas-menu')) return;
    this.closeMenu();
  };

  // ── Listener management ────────────────────────────────────────────────────

  private attach(move: (e: PointerEvent) => void, end: (e: PointerEvent) => void): void {
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', end);
    // pointercancel: if the browser takes over the gesture (system scroll), the gesture must not get stuck.
    document.addEventListener('pointercancel', end);
  }

  private detach(move: (e: PointerEvent) => void, end: (e: PointerEvent) => void): void {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', end);
    document.removeEventListener('pointercancel', end);
  }

  /** The viewport is focused so keyboard shortcuts work while the canvas has focus too. */
  private focusViewport(): void {
    this.viewportRef()?.nativeElement.focus({ preventScroll: true });
  }

  /** Removes the document listeners of unfinished gestures when the component closes. */
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
