import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, ViewChild, computed, inject, input, signal
} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { PublishedColumn } from '../../../services/published-model.service';
import { PublishedColumnSchema } from '../../../services/published-table.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LanguageService } from '../../../services/language.service';
import { RecordFieldComponent } from '../../shared/record-field/record-field.component';
import { RecordLayoutComponent } from '../../shared/record-layout/record-layout.component';
import {
  FormItem, FormLayout, FormSection, FormTab, GRID_COLUMNS, LayoutColumnFact, LayoutIssue
} from '../../../utils/screen-layout/screen-layout.model';
import { LayoutDesignerStore } from './layout-designer.store';
import {
  DropTarget, ElementKind, addSection, addTab, endOfTab, findItem, findSection, insertElement, moveItem,
  moveItemBy, placeField, placedColumns, removeItem, setSpan
} from './form-layout.commands';
import {
  Rect, colPitch, contains, dropIndex, exceedsDragThreshold, nearestRect, spanFromDrag
} from './form-layout.hit-test';
import { FormInspectorComponent } from './form-inspector.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { dataTypeIcon } from '../../shared/icon/data-type-icon';
import type { IconName } from '../../shared/icon/icons.generated';

/** Paletten sürüklenen ya da tıklanan şey. */
type InsertPayload = { readonly column: string } | { readonly element: ElementKind };

type Session =
  | { kind: 'move'; itemId: string; label: string; startX: number; startY: number; active: boolean }
  | { kind: 'insert'; payload: InsertPayload; label: string; startX: number; startY: number; active: boolean }
  | { kind: 'resize'; itemId: string; startX: number; startSpan: number; pitch: number };

/** Bırakma hedefi + çizginin tuvale göre konumu. */
interface DropPreview {
  readonly target: DropTarget;
  readonly tabId: string | null;
  readonly line: { left: number; top: number; width: number; height: number } | null;
}

const EDGE_SCROLL_PX = 60;
const EDGE_SCROLL_STEP = 14;

/**
 * FormDesignerComponent — ekran tasarımcısının form görünümü: palet · tuval · inceleyici.
 *
 * Tuval 12 kolonluk CSS ızgarasıdır; alanlar gerçek alan bileşeniyle (app-record-field)
 * çizilir ama `inert`'tir — tıklama alanı değil öğeyi seçer. Sürükle-bırak Pointer Events
 * ile (proje bilinçli olarak sürükle-bırak kütüphanesi kullanmıyor): sürükleme sırasında
 * belge değişmez, yalnız bırakma çizgisi çizilir; bırakınca TEK komut gönderilir (tek geri
 * al adımı). Genişlik, öğenin sağ kenarındaki tutamaçla kolon adımına oturtularak ayarlanır.
 *
 * Telefonda (`narrow`) sürükle-bırak yerine yapı listesi editörü gösterilir; önizlemede
 * belge çalışma anı bileşeniyle (app-record-layout) aynen çizilir.
 */
@Component({
    selector: 'app-form-designer',
    imports: [TranslatePipe, RecordFieldComponent, RecordLayoutComponent, FormInspectorComponent, IconComponent],
    templateUrl: './form-designer.component.html',
    styleUrls: ['./form-designer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormDesignerComponent {
  private readonly zone = inject(NgZone);
  private readonly languageService = inject(LanguageService);

  readonly store = input.required<LayoutDesignerStore<FormLayout>>();
  readonly columns = input.required<readonly PublishedColumn[]>();
  readonly rules = input.required<ReadonlyMap<string, PublishedColumnSchema>>();
  readonly facts = input.required<readonly LayoutColumnFact[]>();
  readonly issues = input<readonly LayoutIssue[]>([]);
  readonly typeName = input.required<string>();
  /** Önizleme: belge çalışma anı bileşeniyle, seçilen genişlikte çizilir. */
  readonly preview = input(false);
  /** Önizleme çerçevesinin genişliği (px); null → tam genişlik. */
  readonly previewWidth = input<number | null>(null);
  /** Telefon: sürükle-bırak yerine yapı listesi. */
  readonly narrow = input(false);

  @ViewChild('canvasBody') private canvasBody?: ElementRef<HTMLElement>;

  readonly doc = computed(() => this.store().doc());
  readonly selection = computed(() => this.store().selection());
  readonly columnByName = computed(() => new Map(this.columns().map(c => [c.columnName, c])));
  readonly mustStay = computed(() => new Set(this.facts().filter(f => f.mustStayVisible).map(f => f.name)));
  readonly gridColumns = Array.from({ length: GRID_COLUMNS }, (_, i) => i);
  readonly spanOptions = Array.from({ length: GRID_COLUMNS }, (_, i) => i + 1);

  // ─── Palet ─────────────────────────────────────────────────────────────────

  readonly search = signal('');

  private matches(column: string): boolean {
    const term = this.search().trim().toLocaleLowerCase();
    if (!term) return true;
    return column.toLocaleLowerCase().includes(term) || this.labelOf(column).toLocaleLowerCase().includes(term);
  }

  /** Ne yerleştirilmiş ne gizlenmiş kolonlar — formun sonuna otomatik eklenecekler. */
  readonly unplaced = computed(() => {
    const placed = placedColumns(this.doc());
    const hidden = new Set(this.doc().hiddenColumns);
    return this.columns().map(c => c.columnName).filter(n => !placed.has(n) && !hidden.has(n) && this.matches(n));
  });

  readonly hidden = computed(() =>
    this.doc().hiddenColumns.filter(n => this.columnByName().has(n) && this.matches(n)));

  /** Belgede olup şemada olmayan (silinmiş) kolonlar. */
  readonly unknown = computed(() => {
    const known = this.columnByName();
    const names = new Set<string>([...placedColumns(this.doc()), ...this.doc().hiddenColumns]);
    return [...names].filter(n => !known.has(n));
  });

  // ─── Tuval ─────────────────────────────────────────────────────────────────

  private readonly activeTabId = signal<string | null>(null);
  readonly currentTab = computed<FormTab | null>(() => {
    const tabs = this.doc().tabs;
    return tabs.find(t => t.id === this.activeTabId()) ?? tabs[0] ?? null;
  });

  /** Tuvalde ve önizlemede alanları çizmek için boş, doğrulayıcısız örnek form. */
  readonly sampleForm = computed(() => {
    const group = new FormGroup<Record<string, FormControl>>({});
    for (const column of this.columns()) {
      group.addControl(column.columnName, new FormControl(column.dataType === 'boolean' ? false : ''));
    }
    return group;
  });

  readonly dragging = signal(false);
  readonly drop = signal<DropPreview | null>(null);
  readonly ghost = signal<{ x: number; y: number; label: string } | null>(null);
  readonly liveSpan = signal<{ itemId: string; span: number } | null>(null);
  readonly draggingItemId = signal<string | null>(null);

  private session: Session | null = null;
  private frame = 0;
  private pointer = { x: 0, y: 0 };
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = (e: PointerEvent) => this.zone.run(() => this.pointerUp(e, false));
  private readonly onCancel = (e: PointerEvent) => this.zone.run(() => this.pointerUp(e, true));

  constructor() {
    inject(DestroyRef).onDestroy(() => this.detach());
  }

  // ─── Görünüm yardımcıları ──────────────────────────────────────────────────

  labelOf(column: string): string {
    return this.columnByName().get(column)?.label?.trim() || column;
  }

  typeIcon(name: string): IconName {
    return dataTypeIcon(this.column(name)?.dataType);
  }

  column(name: string): PublishedColumn {
    return this.columnByName().get(name) ?? { columnName: name, dataType: 'string', isNullable: true };
  }

  isKnown(name: string): boolean {
    return this.columnByName().has(name);
  }

  control(name: string) {
    return this.sampleForm().get(name);
  }

  spanOf(item: FormItem): number {
    if (item.kind === 'divider') return GRID_COLUMNS;
    const live = this.liveSpan();
    return live?.itemId === item.id ? live.span : item.span;
  }

  gridColumn(item: FormItem): string {
    if (item.kind === 'divider') return '1 / -1';
    const span = this.spanOf(item);
    return item.newRow ? `1 / span ${span}` : `span ${span}`;
  }

  isSelected(id: string): boolean {
    return this.selection() === id;
  }

  tabTitle(index: number): string {
    return this.doc().tabs[index]?.title ?? '';
  }

  /** Öğenin kendi sorunu var mı (silinmiş kolon, tipe uymayan gösterim …) — kırmızı çerçeve. */
  hasIssue(item: FormItem): boolean {
    return this.issues().some(i => i.severity === 'error'
      && (i.targetId === item.id || (item.kind === 'field' && i.column === item.column && i.code !== 'requiredHidden')));
  }

  // ─── Seçim ve tıklayarak ekleme ────────────────────────────────────────────

  select(id: string | null): void {
    this.store().selection.set(id);
  }

  selectTab(tabId: string): void {
    this.activeTabId.set(tabId);
    this.select(tabId);
  }

  /** Tıklanan palet öğesinin gideceği yer: seçili öğenin arkası, seçili bölümün sonu ya da sekmenin sonu. */
  private insertionPoint(): DropTarget | null {
    const doc = this.doc();
    const selected = this.selection();
    if (selected) {
      const item = findItem(doc, selected);
      if (item) return { sectionId: item.section.id, index: item.index + 1 };
      const section = findSection(doc, selected);
      if (section) return { sectionId: section.section.id, index: section.section.items.length };
    }
    const tab = this.currentTab();
    return tab ? endOfTab(doc, tab.id) : null;
  }

  addColumn(column: string): void {
    const target = this.insertionPoint();
    if (!target) return;
    this.apply(d => placeField(d, column, target));
    this.selectPlacedColumn(column);
  }

  addElement(kind: ElementKind): void {
    const target = this.insertionPoint();
    if (!target) return;
    const before = new Set(this.allItemIds());
    this.apply(d => insertElement(d, kind, target));
    this.select(this.allItemIds().find(id => !before.has(id)) ?? null);
  }

  addSectionToCurrentTab(): void {
    const tab = this.currentTab();
    if (!tab) return;
    this.apply(d => addSection(d, tab.id));
    const sections = this.doc().tabs.find(t => t.id === tab.id)?.sections ?? [];
    this.select(sections[sections.length - 1]?.id ?? null);
  }

  addTab(): void {
    const title = this.languageTitle();
    this.apply(d => addTab(d, title));
    const tab = this.doc().tabs[this.doc().tabs.length - 1];
    if (tab) this.selectTab(tab.id);
  }

  /** Yeni sekmenin varsayılan adı — "Sekme 3". Admin inceleyicide değiştirir. */
  private languageTitle(): string {
    return this.languageService.t('screen.form.untitledTab', { n: this.doc().tabs.length + 1 });
  }

  private selectPlacedColumn(column: string): void {
    for (const tab of this.doc().tabs) for (const section of tab.sections) {
      const item = section.items.find(i => i.kind === 'field' && i.column === column);
      if (item) {
        this.activeTabId.set(tab.id);
        this.select(item.id);
        return;
      }
    }
  }

  private allItemIds(): string[] {
    return this.doc().tabs.flatMap(t => t.sections.flatMap(s => s.items.map(i => i.id)));
  }

  private apply(command: (doc: FormLayout) => FormLayout, reason = ''): void {
    this.store().dispatch(reason, command);
  }

  // ─── Telefon yapı editörü ──────────────────────────────────────────────────

  moveBy(itemId: string, delta: -1 | 1): void {
    this.apply(d => moveItemBy(d, itemId, delta));
  }

  setItemSpan(itemId: string, span: number): void {
    this.apply(d => setSpan(d, itemId, span));
  }

  removeItem(itemId: string): void {
    this.apply(d => removeItem(d, itemId));
  }

  addColumnTo(section: FormSection, column: string): void {
    if (!column) return;
    this.apply(d => placeField(d, column, { sectionId: section.id, index: section.items.length }));
  }

  itemLabel(item: FormItem): string {
    switch (item.kind) {
      case 'field': return this.labelOf(item.column);
      case 'note': return item.text || '—';
      default: return '';
    }
  }

  // ─── Sürükle-bırak ─────────────────────────────────────────────────────────

  onItemPointerDown(event: PointerEvent, item: FormItem): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    this.select(item.id);
    (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
    this.begin(event, {
      kind: 'move', itemId: item.id, label: this.itemLabel(item) || item.kind,
      startX: event.clientX, startY: event.clientY, active: false
    });
  }

  onPalettePointerDown(event: PointerEvent, payload: InsertPayload, label: string): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    this.begin(event, { kind: 'insert', payload, label, startX: event.clientX, startY: event.clientY, active: false });
  }

  onElementPointerDown(event: PointerEvent, kind: ElementKind): void {
    this.onPalettePointerDown(event, { element: kind }, this.languageService.t('screen.designer.' + kind));
  }

  onResizePointerDown(event: PointerEvent, item: FormItem): void {
    if (!event.isPrimary || event.button !== 0 || item.kind === 'divider') return;
    event.preventDefault();
    event.stopPropagation();
    this.select(item.id);
    const grid = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-section-grid]');
    if (!grid) return;
    const style = getComputedStyle(grid);
    const width = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const pitch = colPitch(width, parseFloat(style.columnGap) || 0);
    this.liveSpan.set({ itemId: item.id, span: item.span });
    this.begin(event, { kind: 'resize', itemId: item.id, startX: event.clientX, startSpan: item.span, pitch });
  }

  private begin(event: PointerEvent, session: Session): void {
    this.detach();
    this.session = session;
    this.pointer = { x: event.clientX, y: event.clientY };
    // Hareket dinleyicisi bölge dışında: her pointermove'da değişiklik algılaması koşmasın;
    // durum kare başına bir kez bölgeye girilerek güncellenir.
    this.zone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.onMove);
      document.addEventListener('pointerup', this.onUp);
      document.addEventListener('pointercancel', this.onCancel);
    });
  }

  private pointerMove(event: PointerEvent): void {
    this.pointer = { x: event.clientX, y: event.clientY };
    if (this.frame) return;
    // Kare başına bir hesap: ölçüm (getBoundingClientRect) her olayda yapılsa sürükleme takılır.
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
      this.liveSpan.set({ itemId: session.itemId, span: spanFromDrag(session.startSpan, x - session.startX, session.pitch) });
      return;
    }

    if (!session.active) {
      if (!exceedsDragThreshold(x - session.startX, y - session.startY)) return;
      session.active = true;
      this.dragging.set(true);
      if (session.kind === 'move') this.draggingItemId.set(session.itemId);
    }

    this.ghost.set({ x, y, label: session.label });
    this.drop.set(this.computeDrop(x, y, session.kind === 'move' ? session.itemId : null));
    this.edgeScroll(y);
  }

  private pointerUp(event: PointerEvent, cancelled: boolean): void {
    const session = this.session;
    this.pointer = { x: event.clientX, y: event.clientY };
    if (session && !cancelled) {
      if (session.kind === 'resize') {
        const live = this.liveSpan();
        if (live) this.apply(d => setSpan(d, session.itemId, live.span));
      } else if (session.active) {
        const drop = this.computeDrop(event.clientX, event.clientY, session.kind === 'move' ? session.itemId : null);
        if (drop) this.commitDrop(session, drop.target);
      } else if (session.kind === 'insert') {
        // Sürüklenmeden bırakıldı: tıklama — seçimin yanına eklenir.
        if ('column' in session.payload) this.addColumn(session.payload.column);
        else this.addElement(session.payload.element);
      }
    }
    this.detach();
  }

  private commitDrop(session: Extract<Session, { kind: 'move' | 'insert' }>, target: DropTarget): void {
    if (session.kind === 'move') {
      this.apply(d => moveItem(d, session.itemId, target));
      this.revealTargetTab(target);
      return;
    }
    const payload = session.payload;
    if ('column' in payload) {
      this.apply(d => placeField(d, payload.column, target));
      this.selectPlacedColumn(payload.column);
    } else {
      const before = new Set(this.allItemIds());
      this.apply(d => insertElement(d, payload.element, target));
      this.select(this.allItemIds().find(id => !before.has(id)) ?? null);
      this.revealTargetTab(target);
    }
  }

  private revealTargetTab(target: DropTarget): void {
    const where = findSection(this.doc(), target.sectionId);
    if (where) this.activeTabId.set(where.tab.id);
  }

  private detach(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onCancel);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.session = null;
    this.dragging.set(false);
    this.drop.set(null);
    this.ghost.set(null);
    this.liveSpan.set(null);
    this.draggingItemId.set(null);
  }

  /**
   * İmlecin altındaki bırakma hedefi. Sekme başlığı → o sekmenin sonu. Bölüm → içindeki
   * sıra (taşınan öğenin kendisi hesaba katılmaz: sıra, öğe çıkarıldıktan sonraki diziye göredir).
   */
  private computeDrop(x: number, y: number, excludeId: string | null): DropPreview | null {
    const host = this.canvasBody?.nativeElement;
    if (!host) return null;
    const point = { x, y };
    const origin = host.getBoundingClientRect();

    for (const tabButton of Array.from(host.querySelectorAll<HTMLElement>('[data-tab-id]'))) {
      if (!contains(tabButton.getBoundingClientRect(), point)) continue;
      const tabId = tabButton.dataset['tabId']!;
      const target = endOfTab(this.doc(), tabId);
      return target ? { target, tabId, line: null } : null;
    }

    const grids = Array.from(host.querySelectorAll<HTMLElement>('[data-section-grid]'));
    const index = nearestRect(grids.map(g => g.getBoundingClientRect()), point);
    if (index < 0) return null;
    const grid = grids[index];
    const gridRect = grid.getBoundingClientRect();

    const itemEls = Array.from(grid.querySelectorAll<HTMLElement>(':scope > [data-item-id]'))
      .filter(el => el.dataset['itemId'] !== excludeId);
    const rects: Rect[] = itemEls.map(el => el.getBoundingClientRect());
    const at = dropIndex(rects, point);
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;

    let line: DropPreview['line'];
    if (rects.length === 0) {
      line = { left: gridRect.left - origin.left, top: gridRect.top - origin.top + 4, width: gridRect.width, height: 3 };
    } else if (at < rects.length) {
      const r = rects[at];
      line = { left: r.left - origin.left - gap / 2 - 1.5, top: r.top - origin.top, width: 3, height: r.bottom - r.top };
    } else {
      const r = rects[rects.length - 1];
      line = { left: r.right - origin.left + gap / 2 - 1.5, top: r.top - origin.top, width: 3, height: r.bottom - r.top };
    }
    return { target: { sectionId: grid.dataset['sectionGrid']!, index: at }, tabId: null, line };
  }

  /** İmleç pencere kenarına yaklaşınca sayfa kayar (uzun formda aşağıdaki bölüme bırakabilmek için). */
  private edgeScroll(y: number): void {
    const scroller = this.canvasBody?.nativeElement.closest<HTMLElement>('.designer--fullscreen') ?? null;
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    const delta = y < top + EDGE_SCROLL_PX ? -EDGE_SCROLL_STEP : y > bottom - EDGE_SCROLL_PX ? EDGE_SCROLL_STEP : 0;
    if (!delta) return;
    if (scroller) scroller.scrollBy(0, delta);
    else window.scrollBy(0, delta);
  }

  trackItem = (_: number, item: FormItem) => item.id;
}
