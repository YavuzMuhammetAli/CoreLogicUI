import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, ViewChild, computed, effect, inject, input,
  signal, untracked
} from '@angular/core';
import { PublishedColumn, PublishedModelService } from '../../../services/published-model.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LAYOUT_LIMITS, ListColumn, ListLayout } from '../../../utils/screen-layout/screen-layout.model';
import { cellValue, fieldValue, isBase64Value } from '../../model-data/model-data.util';
import { LayoutDesignerStore } from './layout-designer.store';
import {
  hideListColumn, moveColumn, moveColumnBy, setColumnWidth, showColumn
} from './list-layout.commands';
import { contains, exceedsDragThreshold, headerDropIndex, widthFromDrag } from './form-layout.hit-test';
import { IconComponent } from '../../shared/icon/icon.component';

type DataRow = Record<string, unknown>;

type Session =
  | { kind: 'move'; column: string; startX: number; startY: number; active: boolean }
  | { kind: 'insert'; column: string; startX: number; startY: number; active: boolean }
  | { kind: 'resize'; column: string; startX: number; startWidth: number };

/** Liste ekranının (model-data) sabit kolonları ve otomatik genişlik — aynı değerler. */
const AUTO_WIDTH = 160;
const ID_WIDTH = 80;

/**
 * ListDesignerComponent — liste ekranının kolon sırası ve genişliği.
 *
 * Önizleme modelin ilk 5 gerçek kaydıyla çizilir (genişliğin içeriğe uyup uymadığı ancak
 * böyle görülür). Başlık sürüklenerek sıralanır, başlığın sağ kenarı sürüklenerek genişlik
 * verilir (çift tık → otomatik). ID sabit ilk kolondur; tasarıma girmez.
 */
@Component({
    selector: 'app-list-designer',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './list-designer.component.html',
    styleUrls: ['./list-designer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ListDesignerComponent {
  private readonly zone = inject(NgZone);
  private readonly publishedModel = inject(PublishedModelService);

  readonly store = input.required<LayoutDesignerStore<ListLayout>>();
  readonly columns = input.required<readonly PublishedColumn[]>();
  readonly typeName = input.required<string>();
  readonly narrow = input(false);

  @ViewChild('canvas') private canvas?: ElementRef<HTMLElement>;

  readonly limits = LAYOUT_LIMITS;
  readonly idWidth = ID_WIDTH;

  readonly doc = computed(() => this.store().doc());
  readonly selection = computed(() => this.store().selection());
  private readonly columnByName = computed(() => new Map(this.columns().map(c => [c.columnName, c])));

  readonly hiddenColumns = computed(() => {
    const shown = new Set(this.doc().columns.map(c => c.column));
    return this.columns().map(c => c.columnName).filter(n => !shown.has(n));
  });

  readonly selectedEntry = computed(() => this.doc().columns.find(c => c.column === this.selection()) ?? null);
  readonly selectedIndex = computed(() => this.doc().columns.findIndex(c => c.column === this.selection()));

  readonly rows = signal<DataRow[]>([]);
  readonly loadingRows = signal(false);

  readonly dragging = signal(false);
  readonly draggingColumn = signal<string | null>(null);
  readonly dropLine = signal<{ left: number; top: number; height: number } | null>(null);
  readonly liveWidth = signal<{ column: string; width: number } | null>(null);
  readonly ghost = signal<{ x: number; y: number; label: string } | null>(null);

  private session: Session | null = null;
  private frame = 0;
  private pointer = { x: 0, y: 0 };
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = (e: PointerEvent) => this.zone.run(() => this.pointerUp(e, false));
  private readonly onCancel = (e: PointerEvent) => this.zone.run(() => this.pointerUp(e, true));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detach());

    // Önizleme satırları: modelin ilk 5 kaydı (okunamazsa boş tablo).
    effect(() => {
      const typeName = this.typeName();
      untracked(() => {
        this.loadingRows.set(true);
        this.publishedModel.getAllPaged(typeName, 1, 5).subscribe({
          next: res => {
            this.rows.set(res.success ? ((res.data?.items ?? []) as DataRow[]) : []);
            this.loadingRows.set(false);
          },
          error: () => {
            this.rows.set([]);
            this.loadingRows.set(false);
          }
        });
      });
    });
  }

  // ─── Görünüm yardımcıları ──────────────────────────────────────────────────

  label(name: string): string {
    return this.columnByName().get(name)?.label?.trim() || name;
  }

  isKnown(name: string): boolean {
    return this.columnByName().has(name);
  }

  widthOf(entry: ListColumn): number {
    const live = this.liveWidth();
    if (live?.column === entry.column) return live.width;
    return entry.width ?? AUTO_WIDTH;
  }

  explicitWidth(entry: ListColumn): number | null {
    const live = this.liveWidth();
    if (live?.column === entry.column) return live.width;
    return entry.width ?? null;
  }

  readonly tableWidth = computed(() =>
    this.doc().columns.reduce((sum, c) => sum + this.widthOf(c), ID_WIDTH));

  rowId(row: DataRow): unknown {
    return fieldValue(row, 'ID') ?? '—';
  }

  cell(row: DataRow, column: string): string {
    const value = fieldValue(row, column);
    if (isBase64Value(value)) return '📎';
    return cellValue(row, column);
  }

  select(column: string | null): void {
    this.store().selection.set(column);
  }

  // ─── Komutlar ──────────────────────────────────────────────────────────────

  private apply(command: (doc: ListLayout) => ListLayout, reason = ''): void {
    this.store().dispatch(reason, command);
  }

  show(column: string): void {
    this.apply(d => showColumn(d, column));
    this.select(column);
  }

  hide(column: string): void {
    this.apply(d => hideListColumn(d, column));
    this.select(null);
  }

  moveBy(column: string, delta: -1 | 1): void {
    this.apply(d => moveColumnBy(d, column, delta));
  }

  setWidth(column: string, value: string): void {
    const width = value.trim() === '' ? null : Number(value);
    if (width !== null && !Number.isFinite(width)) return;
    this.apply(d => setColumnWidth(d, column, width), `inspector:width:${column}`);
  }

  autoWidth(column: string): void {
    this.apply(d => setColumnWidth(d, column, null));
  }

  // ─── Sürükle-bırak ─────────────────────────────────────────────────────────

  onHeaderPointerDown(event: PointerEvent, column: string): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    this.select(column);
    (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
    this.begin(event, { kind: 'move', column, startX: event.clientX, startY: event.clientY, active: false });
  }

  onPalettePointerDown(event: PointerEvent, column: string): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    this.begin(event, { kind: 'insert', column, startX: event.clientX, startY: event.clientY, active: false });
  }

  onResizePointerDown(event: PointerEvent, entry: ListColumn): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.select(entry.column);
    const startWidth = this.widthOf(entry);
    this.liveWidth.set({ column: entry.column, width: startWidth });
    this.begin(event, { kind: 'resize', column: entry.column, startX: event.clientX, startWidth });
  }

  private begin(event: PointerEvent, session: Session): void {
    this.detach();
    this.session = session;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.zone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.onMove);
      document.addEventListener('pointerup', this.onUp);
      document.addEventListener('pointercancel', this.onCancel);
    });
  }

  private pointerMove(event: PointerEvent): void {
    this.pointer = { x: event.clientX, y: event.clientY };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.zone.run(() => this.update());
    });
  }

  private update(): void {
    const session = this.session;
    if (!session) return;
    const { x, y } = this.pointer;

    if (session.kind === 'resize') {
      this.liveWidth.set({
        column: session.column,
        width: widthFromDrag(session.startWidth, x - session.startX, LAYOUT_LIMITS.minWidth, LAYOUT_LIMITS.maxWidth)
      });
      return;
    }

    if (!session.active) {
      if (!exceedsDragThreshold(x - session.startX, y - session.startY)) return;
      session.active = true;
      this.dragging.set(true);
      if (session.kind === 'move') this.draggingColumn.set(session.column);
    }
    this.ghost.set({ x, y, label: this.label(session.column) });
    this.dropLine.set(this.computeDrop(x, y, session.kind === 'move' ? session.column : null)?.line ?? null);
  }

  private pointerUp(event: PointerEvent, cancelled: boolean): void {
    const session = this.session;
    if (session && !cancelled) {
      if (session.kind === 'resize') {
        const live = this.liveWidth();
        if (live && live.width !== session.startWidth) this.apply(d => setColumnWidth(d, session.column, live.width));
      } else if (session.active) {
        const drop = this.computeDrop(event.clientX, event.clientY, session.kind === 'move' ? session.column : null);
        if (drop) {
          if (session.kind === 'move') this.apply(d => moveColumn(d, session.column, drop.index));
          else {
            this.apply(d => showColumn(d, session.column, drop.index));
            this.select(session.column);
          }
        }
      } else if (session.kind === 'insert') {
        this.show(session.column);
      }
    }
    this.detach();
  }

  private detach(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onCancel);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.session = null;
    this.dragging.set(false);
    this.draggingColumn.set(null);
    this.dropLine.set(null);
    this.liveWidth.set(null);
    this.ghost.set(null);
  }

  /** Bırakma sırası — imleç tablonun üstündeyse; taşınan başlık hesaba katılmaz. */
  private computeDrop(x: number, y: number, exclude: string | null): { index: number; line: { left: number; top: number; height: number } } | null {
    const host = this.canvas?.nativeElement;
    const table = host?.querySelector<HTMLElement>('table');
    if (!host || !table) return null;
    const tableRect = table.getBoundingClientRect();
    const area = { left: tableRect.left - 40, right: tableRect.right + 40, top: tableRect.top - 40, bottom: tableRect.bottom + 40 };
    if (!contains(area, { x, y })) return null;

    const headers = Array.from(host.querySelectorAll<HTMLElement>('th[data-col]'))
      .filter(th => th.dataset['col'] !== exclude);
    const rects = headers.map(th => th.getBoundingClientRect());
    const index = headerDropIndex(rects, x);
    const origin = host.getBoundingClientRect();
    const edge = rects.length === 0
      ? tableRect.left + ID_WIDTH
      : index < rects.length ? rects[index].left : rects[rects.length - 1].right;
    return { index, line: { left: edge - origin.left - 1.5, top: tableRect.top - origin.top, height: tableRect.height } };
  }
}
