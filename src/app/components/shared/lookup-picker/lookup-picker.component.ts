import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  OnDestroy, effect, forwardRef, inject, input, signal, viewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { LookupOption, PublishedModelService } from '../../../services/published-model.service';
import { LookupLabelService } from '../../../services/lookup-label.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { markDirty } from '../../../utils/change-detection';
import { closeOnOutsidePointer } from '../../../utils/outside-pointer';
import { IconComponent } from '../icon/icon.component';

/** Page size — this many records arrive on open and on every "load more" request. */
const PAGE_SIZE = 50;

/** Delay after typing before going to the server (ms). */
const SEARCH_DEBOUNCE = 300;

/** Counter to make each instance's DOM ids unique (a form can have several lookups). */
let instanceCounter = 0;

/**
 * Lookup (FK) picker — lazily loaded combobox with server-side search.
 *
 * WHY IT EXISTS: the old `<select>` loaded ALL rows of the target table (Musteri: 12,025
 * rows / 5 MB / ~3.9 s). Here 50 records arrive on open, 50 more are appended as the list
 * is scrolled to the bottom, search runs on the server and the same scrolling continues in search results.
 *
 * CRITICAL — silent FK loss: the control value is the raw FK id and the selected record may not
 * be among the first 50 options. That's why `writeValue` resolves the label separately via `?ids=`.
 * Otherwise the user sees an empty box, saves without touching the form and the FK is wiped.
 *
 * A11y: role="combobox" + aria-expanded/aria-controls/aria-activedescendant, listbox/option
 * roles, ↑/↓/Enter/Esc keyboard support, scrolling the active option into view.
 * (The pattern comes from `shared/model-autocomplete`; that component couldn't be used directly
 * because it is built on a string list and its DOM ids are fixed.)
 */
@Component({
    selector: 'app-lookup-picker',
    imports: [TranslatePipe, IconComponent],
    templateUrl: './lookup-picker.component.html',
    styleUrls: ['./lookup-picker.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => LookupPickerComponent),
            multi: true
        }
    ]
})
export class LookupPickerComponent implements ControlValueAccessor, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly lookupLabels = inject(LookupLabelService);
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Target model (lookupTargetTable). */
  readonly typeName = input.required<string>();
  /** Label column (lookupDisplayColumn); if empty the server uses the ID. */
  readonly displayColumn = input<string | null | undefined>(null);
  readonly placeholder = input('');
  readonly ariaLabel = input('');
  readonly invalid = input(false);
  readonly inputId = input<string>('');

  // ── State ────────────────────────────────────────────────────────────────
  readonly options = signal<LookupOption[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly isOpen = signal(false);
  readonly activeIndex = signal(-1);
  readonly query = signal('');
  readonly disabled = signal(false);

  /** Label of the selected record — resolved separately even if it isn't among the first 50. */
  readonly selectedLabel = signal<string | null>(null);

  private value: number | null = null;
  private page = 1;
  /** Whether the first page for this search term is loaded (to avoid re-requesting on focus). */
  private loadedForQuery: string | null = null;

  private readonly uid = ++instanceCounter;
  private readonly search$ = new Subject<string>();
  private readonly subs = new Subscription();
  private observer?: IntersectionObserver;

  private readonly sentinel = viewChild<ElementRef<HTMLElement>>('sentinel');
  private readonly inputEl = viewChild<ElementRef<HTMLInputElement>>('lkInput');

  /**
   * Position of the open list relative to the viewport. Since the list is `position: fixed`
   * (it must escape the clipping `.panel`/`.dialog-panel` ancestors) the coordinates
   * are computed here and bound as inline style.
   */
  readonly listPos = signal({ top: '0px', left: '0px', width: '0px', maxHeight: '260px' });

  /** Listener that refreshes the position on scroll/resize while the list is open. */
  private readonly reposition = () => this.positionList();

  private onChange: (value: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  constructor() {
    // Close on an outside tap — the listener is attached only while the list is open (see utils/outside-pointer).
    closeOnOutsidePointer(this.isOpen, () => this.host.nativeElement, () => this.close());
    // Typing → wait 300 ms → don't re-query the same term → cancel the previous request.
    this.subs.add(
      this.search$.pipe(
        debounceTime(SEARCH_DEBOUNCE),
        distinctUntilChanged(),
        switchMap(term => {
          this.page = 1;
          this.loading.set(true);
          return this.publishedModel.lookupOptions(this.typeName(), this.displayColumn(), {
            search: term, page: 1, pageSize: PAGE_SIZE
          });
        }),
        markDirty(this.cdr)
      ).subscribe({
        next: res => {
          this.loading.set(false);
          if (!res.success) return;
          this.options.set(res.data?.items ?? []);
          this.total.set(res.data?.total ?? 0);
          this.activeIndex.set(-1);
          this.loadedForQuery = this.query();
        },
        error: () => this.loading.set(false)
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.observer?.disconnect();
    // If the component is destroyed while the list is open, the listeners must not leak.
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
  }

  // ── ControlValueAccessor ─────────────────────────────────────────────────

  writeValue(value: unknown): void {
    const id = value === null || value === undefined || value === '' ? null : Number(value);
    this.value = Number.isFinite(id as number) ? (id as number) : null;

    if (this.value === null) {
      this.selectedLabel.set(null);
      this.cdr.markForCheck();
      return;
    }

    // The selected record's label comes from the shared label cache (LookupLabelService): child tables
    // already resolve labels of the same target in bulk; every time the form was rebuilt a separate
    // request was sent per field. If it's not cached it is resolved with a single request.
    const selected = this.value;
    const target = this.typeName();
    const column = this.displayColumn();
    this.lookupLabels.ensure(target, column, [selected])
      .pipe(markDirty(this.cdr))
      .subscribe(() => {
        if (this.value !== selected) return;   // another value was written in the meantime
        // If the label can't be resolved (deleted record etc.) the raw id is shown — the value is KEPT.
        this.selectedLabel.set(this.lookupLabels.label(target, column, selected) ?? String(selected));
      });
  }

  registerOnChange(fn: (value: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); this.cdr.markForCheck(); }

  // ── Interaction ────────────────────────────────────────────────────────────

  /** Text shown in the box: the typed term while the list is open, the selected label while closed. */
  displayText(): string {
    return this.isOpen() ? this.query() : (this.selectedLabel() ?? '');
  }

  open(): void {
    if (this.disabled() || this.isOpen()) return;
    this.isOpen.set(true);
    this.query.set('');
    this.activeIndex.set(-1);

    // If the first page for an empty search was already loaded, don't request it again.
    if (this.loadedForQuery !== '') this.loadFirstPage('');

    // The position depends only on the input's rect; it can be computed even if the list
    // isn't rendered yet. Attaching to the sentinel, however, must wait for the render — that
    // is done by the effect below (see sentinelEffect).
    this.positionList();

    // If the page or one of the inner scrollers scrolls, the list must not detach from the input.
    // capture: true — inner scroll containers are caught too (scroll doesn't bubble).
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
    // On mobile the keyboard only shrinks the VISIBLE area (visualViewport); no window resize fires.
    window.visualViewport?.addEventListener('resize', this.reposition);
    window.visualViewport?.addEventListener('scroll', this.reposition);
  }

  /**
   * Attaches the infinite scroll observer when the sentinel enters the DOM and releases it when it leaves.
   *
   * Since viewChild is a signal, it fires once rendering completes; previously
   * queueMicrotask was used, and because it ran BEFORE change detection it often
   * couldn't find the sentinel (the list stayed stuck at the first 50).
   * The sentinel is rendered only while hasMore(); on reaching the last page the observer
   * detaches by itself.
   */
  private readonly sentinelEffect = effect(() => {
    const el = this.sentinel()?.nativeElement;
    const open = this.isOpen();

    this.observer?.disconnect();
    if (!open || !el) return;

    this.observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) this.loadMore(); },
      { root: el.parentElement, rootMargin: '120px' }   // fire a little before reaching the bottom
    );
    this.observer.observe(el);
  });

  close(): void {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.activeIndex.set(-1);
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('resize', this.reposition);
    window.visualViewport?.removeEventListener('scroll', this.reposition);
    this.onTouched();
  }

  /**
   * Positions the list right below the input (above it if there's no room).
   *
   * If it doesn't fit below it opens upwards; in both cases the height is trimmed to the
   * remaining space, so the list never overflows the screen.
   *
   * Bounds are taken from `visualViewport`: on mobile `innerHeight` doesn't change when the keyboard
   * opens, only the visible area shrinks (and shifts on iOS). Had innerHeight been used, the list
   * would open behind the keyboard.
   */
  private positionList(): void {
    const input = this.inputEl()?.nativeElement;
    if (!input) return;

    const rect = input.getBoundingClientRect();
    const gap = 4;
    const margin = 8;                       // margin left at the viewport edge
    const preferred = 260;

    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const spaceBelow = viewBottom - rect.bottom - gap - margin;
    const spaceAbove = rect.top - viewTop - gap - margin;

    // Open upwards if there's no reasonable room below and more room above.
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const available = openUp ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(120, Math.min(preferred, available));

    this.listPos.set({
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      top: openUp ? `${rect.top - gap - maxHeight}px` : `${rect.bottom + gap}px`,
      maxHeight: `${maxHeight}px`
    });
  }

  onInput(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.query.set(term);
    this.isOpen.set(true);
    this.search$.next(term.trim());
  }

  select(option: LookupOption): void {
    this.value = option.id;
    this.selectedLabel.set(option.label);
    this.onChange(option.id);
    this.close();
  }

  clear(): void {
    this.value = null;
    this.selectedLabel.set(null);
    this.query.set('');
    this.onChange(null);
    this.cdr.markForCheck();
  }

  hasMore(): boolean {
    return this.options().length < this.total();
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  private loadFirstPage(term: string): void {
    this.page = 1;
    this.loading.set(true);
    this.publishedModel
      .lookupOptions(this.typeName(), this.displayColumn(), { search: term, page: 1, pageSize: PAGE_SIZE })
      .pipe(markDirty(this.cdr))
      .subscribe({
        next: res => {
          this.loading.set(false);
          if (!res.success) return;
          this.options.set(res.data?.items ?? []);
          this.total.set(res.data?.total ?? 0);
          this.loadedForQuery = term;
        },
        error: () => this.loading.set(false)
      });
  }

  /** Appends the next page to the END of the current list. */
  loadMore(): void {
    if (this.loading() || !this.hasMore()) return;

    this.loading.set(true);
    const nextPage = this.page + 1;

    this.publishedModel
      .lookupOptions(this.typeName(), this.displayColumn(), {
        search: this.query().trim(), page: nextPage, pageSize: PAGE_SIZE
      })
      .pipe(markDirty(this.cdr))
      .subscribe({
        next: res => {
          this.loading.set(false);
          if (!res.success) return;
          this.page = nextPage;
          this.options.update(current => [...current, ...(res.data?.items ?? [])]);
          this.total.set(res.data?.total ?? 0);
        },
        error: () => this.loading.set(false)
      });
  }

  // ── Keyboard ───────────────────────────────────────────────────────────────

  onKeydown(event: KeyboardEvent): void {
    if (this.disabled()) return;
    const list = this.options();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.isOpen()) { this.open(); return; }
        this.activeIndex.update(i => (list.length === 0 ? -1 : (i + 1) % list.length));
        this.scrollActiveIntoView();
        // Near the end, request the next page ahead of time (lazy loading via keyboard too).
        if (this.activeIndex() >= list.length - 5) this.loadMore();
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (!this.isOpen()) { this.open(); return; }
        this.activeIndex.update(i => (list.length === 0 ? -1 : (i <= 0 ? list.length - 1 : i - 1)));
        this.scrollActiveIntoView();
        break;

      case 'Enter': {
        const index = this.activeIndex();
        if (this.isOpen() && index >= 0 && index < list.length) {
          event.preventDefault();
          this.select(list[index]);
        }
        break;
      }

      case 'Escape':
        if (this.isOpen()) { event.preventDefault(); this.close(); }
        break;

      case 'Tab':
        this.close();
        break;
    }
  }

  /** With 50+ options in a 220px list the active row easily goes out of view. */
  private scrollActiveIntoView(): void {
    const index = this.activeIndex();
    if (index < 0) return;
    queueMicrotask(() => {
      const el = this.host.nativeElement.querySelector(`#${this.optionId(index)}`) as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  // ── DOM ids (unique per instance) ─────────────────────────────────

  optionId(index: number): string { return `lk-${this.uid}-opt-${index}`; }
  get listboxId(): string { return `lk-${this.uid}-listbox`; }
  get activeDescendantId(): string | null {
    const index = this.activeIndex();
    return index >= 0 ? this.optionId(index) : null;
  }
}
