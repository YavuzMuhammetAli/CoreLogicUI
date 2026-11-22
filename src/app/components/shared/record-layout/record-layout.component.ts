import {
  Component, DestroyRef, ElementRef, Injector, NgZone, afterNextRender, computed, effect, inject, input,
  signal, untracked,
  ChangeDetectionStrategy
} from '@angular/core';
import { AbstractControl, FormGroup } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PublishedColumn } from '../../../services/published-model.service';
import { PublishedColumnSchema } from '../../../services/published-table.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { RecordFieldComponent } from '../record-field/record-field.component';
import { AutoValueFormBinding } from '../../../utils/auto-value/auto-value-form';
import { FormLayout } from '../../../utils/screen-layout/screen-layout.model';
import {
  FormRenderPlan, PlanItem, PlanSection, resolveFormLayout
} from '../../../utils/screen-layout/form-layout.resolve';
import { WidthTier, itemSpan, visibleAtTier, widthTier } from '../../../utils/screen-layout/form-layout.responsive';
import {
  firstInvalidLocation, invalidCountByTab, sectionsWithColumns, tabsWithColumns
} from '../../../utils/screen-layout/form-layout.invalid';
import { IconComponent } from '../icon/icon.component';

const NONE: ReadonlySet<string> = new Set();

/**
 * RecordLayoutComponent — draws a record form's fields according to the layout.
 *
 * Without a published screen design (`layout`) the current view stays as is: fields in an
 * auto-filling grid in `legacyColumns` order. With one, tabs, collapsible sections
 * and a 12-column grid are drawn; `resolveFormLayout` reconciles differences between the document
 * and the schema (new/deleted columns, a required or workflow-step field being hidden).
 *
 * Form controls belong to the caller and include ALL columns; only drawing happens here.
 * Inactive tabs and collapsed sections are hidden with `hidden`, not `@if`: the fields stay alive
 * (the lookup picker doesn't re-request on every tab switch, a selected file isn't lost).
 *
 * The width tier is chosen from this component's width, not the screen's (ResizeObserver):
 * the same form is drawn wide on the page and narrower in the child record pop-up.
 *
 * CHANGE DETECTION `Default`: callers are OnPush and call `markAllAsTouched()` on Save;
 * tab error badges and field errors must see that without inputs changing (see record-field).
 */
@Component({
    selector: 'app-record-layout',
    imports: [RecordFieldComponent, TranslatePipe, RouterLink, IconComponent],
    templateUrl: './record-layout.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    styleUrls: ['./record-layout.component.scss']
})
export class RecordLayoutComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** The record's form — controls for all columns. */
  readonly form = input.required<FormGroup>();
  /** All columns of the model (schema order). */
  readonly columns = input.required<readonly PublishedColumn[]>();
  /** Schema rules (required, regex message …). */
  readonly rules = input<ReadonlyMap<string, PublishedColumnSchema>>(new Map());
  /** Published form layout; null → the current default view. */
  readonly layout = input<FormLayout | null>(null);
  /** Columns drawn in the default view (filtered by the caller's "Kolonlar" (Columns) setting). */
  readonly legacyColumns = input<readonly PublishedColumn[]>([]);
  /** Columns that must be visible even if hidden in the design (required, workflow step). */
  readonly forcedVisible = input<ReadonlySet<string>>(NONE);
  /** Columns never drawn (FK, ID in the pop-up). */
  readonly excluded = input<ReadonlySet<string>>(NONE);
  /** Fields of the assignee whose turn it is — highlighted, their tab is selected on open. */
  readonly stepColumns = input<ReadonlySet<string>>(NONE);
  /** Unique id prefix on the screen (so nested pop-ups don't collide). */
  readonly idPrefix = input('field-');
  /** Auto-value rules bound to the form (ƒx badge, "kaydedince atanır" (assigned on save) hint). */
  readonly autoValues = input<AutoValueFormBinding | null>(null);
  /** Designer link in the admin's "design is out of date" warning; null → no warning. */
  readonly designLink = input<string[] | null>(null);
  /** Fix the tier instead of measuring it (the designer's preview selector). */
  readonly forceTier = input<WidthTier | null>(null);

  /**
   * Columns that are invalid yet hidden in the design — made visible on Save
   * (e.g. an old record's value doesn't match a regex added later). They stay until the form is rebuilt.
   */
  private readonly revealed = signal<ReadonlySet<string>>(NONE);

  readonly plan = computed<FormRenderPlan | null>(() => {
    const layout = this.layout();
    if (!layout) return null;
    const revealed = this.revealed();
    const forced = revealed.size === 0 ? this.forcedVisible() : new Set([...this.forcedVisible(), ...revealed]);
    return resolveFormLayout(layout, this.columns(), { forcedVisible: forced, excluded: this.excluded() });
  });

  private readonly measuredTier = signal<WidthTier>('wide');
  readonly tier = computed<WidthTier>(() => this.forceTier() ?? this.measuredTier());

  private readonly activeTab = signal<string | null>(null);
  readonly currentTabId = computed(() => {
    const plan = this.plan();
    if (!plan) return null;
    const active = this.activeTab();
    return plan.tabs.some(t => t.id === active) ? active : plan.tabs[0]?.id ?? null;
  });
  readonly showTabBar = computed(() => (this.plan()?.tabs.length ?? 0) > 1);

  /** Sections the user toggled (id → open?); otherwise the design's default. */
  private readonly sectionOpen = signal<ReadonlyMap<string, boolean>>(new Map());

  /** Save was attempted — tab error badges only appear after this. */
  private readonly submitted = signal(false);

  constructor() {
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.measuredTier.set(widthTier(element.clientWidth));
      // ResizeObserver isn't patched by zone.js: the zone is entered when the tier changes.
      const observer = new ResizeObserver(entries => {
        const next = widthTier(entries[0]?.contentRect.width ?? element.clientWidth);
        if (next !== this.measuredTier()) this.zone.run(() => this.measuredTier.set(next));
      });
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });

    // When the assignee opens the record, the tab of the fields they'll fill is selected and its sections opened.
    effect(() => {
      const plan = this.plan();
      const steps = this.stepColumns();
      if (!plan || steps.size === 0) return;
      untracked(() => this.revealColumns(plan, steps));
    });

    // When the form is rebuilt, traces of the previous Save attempt are cleared.
    effect(() => {
      this.form();
      untracked(() => {
        this.submitted.set(false);
        if (this.revealed().size > 0) this.revealed.set(NONE);
      });
    });
  }

  // ─── Template helpers ────────────────────────────────────────────────────

  control(column: string): AbstractControl | null {
    return this.form().get(column);
  }

  isStep(column: string): boolean {
    return this.stepColumns().has(column);
  }

  isVisible(item: PlanItem): boolean {
    return visibleAtTier(item, this.tier());
  }

  /** CSS grid-column: width per tier, "new row" starts at the first column. */
  gridColumn(item: PlanItem): string {
    if (item.kind === 'divider') return '1 / -1';
    const span = itemSpan(item, this.tier());
    return item.newRow ? `1 / span ${span}` : `span ${span}`;
  }

  isSectionOpen(section: PlanSection): boolean {
    if (!section.collapsible) return true;
    return this.sectionOpen().get(section.id) ?? !section.collapsed;
  }

  toggleSection(section: PlanSection): void {
    this.setSectionOpen(section.id, !this.isSectionOpen(section));
  }

  selectTab(tabId: string): void {
    this.activeTab.set(tabId);
  }

  /** WAI-ARIA tab pattern: arrow keys / Home / End move between tabs. */
  onTabKeydown(event: KeyboardEvent, index: number): void {
    const tabs = this.plan()?.tabs ?? [];
    if (tabs.length === 0) return;
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.activeTab.set(tabs[next].id);
    afterNextRender(() => this.focusById(this.idPrefix() + 'tab-' + tabs[next].id), { injector: this.injector });
  }

  /** Number of invalid fields in the tab — only after Save was attempted. */
  tabErrorCount(tabId: string): number {
    const plan = this.plan();
    if (!plan || !this.submitted()) return 0;
    return invalidCountByTab(plan, this.invalidColumns()).get(tabId) ?? 0;
  }

  // ─── Revealing the invalid field ────────────────────────────────────────────────

  /**
   * Called when Save stops on an invalid form: switches to the first invalid field's tab, opens its
   * section, centres and focuses the field. Makes an invalid field hidden in the design visible.
   * Returns false if there's no field to show.
   */
  revealFirstInvalid(): boolean {
    this.submitted.set(true);
    const invalid = this.invalidColumns();
    if (invalid.size === 0) return false;

    let column: string | null = null;
    let plan = this.plan();
    if (plan) {
      const hiddenInvalid = [...invalid].filter(c => !plan!.location.has(c) && !this.excluded().has(c));
      if (hiddenInvalid.length > 0) {
        this.revealed.set(new Set([...this.revealed(), ...hiddenInvalid]));
        plan = this.plan();
      }
      const where = plan ? firstInvalidLocation(plan, invalid) : null;
      if (where) {
        this.activeTab.set(where.tabId);
        this.setSectionOpen(where.sectionId, true);
        column = where.column;
      }
    } else {
      column = this.legacyColumns().find(c => invalid.has(c.columnName))?.columnName ?? null;
    }

    if (!column) return false;
    const id = this.idPrefix() + column;
    afterNextRender(() => {
      const element = this.findById(id);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element?.focus({ preventScroll: true });
    }, { injector: this.injector });
    return true;
  }

  /** Column names of invalid (and enabled) controls. A disabled control never counts as invalid. */
  private invalidColumns(): Set<string> {
    const out = new Set<string>();
    const controls = this.form().controls;
    for (const name of Object.keys(controls)) {
      if (controls[name].invalid) out.add(name);
    }
    return out;
  }

  private revealColumns(plan: FormRenderPlan, columns: ReadonlySet<string>): void {
    const tabs = tabsWithColumns(plan, columns);
    if (tabs.length > 0) this.activeTab.set(tabs[0]);
    for (const sectionId of sectionsWithColumns(plan, columns)) this.setSectionOpen(sectionId, true);
  }

  private setSectionOpen(sectionId: string, open: boolean): void {
    const next = new Map(this.sectionOpen());
    next.set(sectionId, open);
    this.sectionOpen.set(next);
  }

  private findById(id: string): HTMLElement | null {
    return this.host.nativeElement.querySelector<HTMLElement>('#' + CSS.escape(id));
  }

  private focusById(id: string): void {
    this.findById(id)?.focus();
  }
}
