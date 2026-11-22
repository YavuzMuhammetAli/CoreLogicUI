import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, forwardRef, HostListener, Input, inject, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PublishedColumn, PublishedModelService } from '../../../services/published-model.service';
import { RecordMetadataService, TypeMeta } from '../../../services/record-metadata.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../../pipes/model-label.pipe';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { RecordLayoutComponent } from '../record-layout/record-layout.component';
import { fieldValue, toInputValue } from '../../model-data/model-data.util';
import {
  StagedNode, DataRow, createStagedNode, childrenOf, upsertChild, removeChild,
  validatorsFor, fkColumnFor, normalizeRow
} from '../../model-detail/staged-tree.util';
import { markDirty } from '../../../utils/change-detection';
import { AutoValueFormBinding } from '../../../utils/auto-value/auto-value-form';
import { buildAutoValuePlan } from '../../../utils/auto-value/auto-value';
import { mustStayVisible } from '../../../utils/record-field/column-required';
import { FormLayout, ListLayout } from '../../../utils/screen-layout/screen-layout.model';
import { resolveListColumns } from '../../../utils/screen-layout/list-layout.resolve';
import { IconComponent } from '../icon/icon.component';

/** View state of a child model tab inside the dialog. */
interface ChildTabView {
  typeName: string;
  meta: TypeMeta | null;
  /** Whether the saved child rows on the server have been fetched once (lazy loading flag). */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** The child type's published list layout — table columns come from it if present. */
  listLayout: ListLayout | null;
}

/**
 * RecordFormDialogComponent — edits a dynamic record in a large pop-up
 * and shows that model's own child models as tabs BELOW it.
 *
 * It is RECURSIVE via `forwardRef`: clicking a child model row opens the same component
 * again in a higher layer (same pattern as model-node). This lets the user build the
 * main model → child model → grandchild chain in a single flow, and the selection/bulk delete
 * design works the same at every depth.
 *
 * SAVE SEMANTICS: new records are staged in memory (`StagedNode`) and the tree is sent only when
 * "Kaydet" (Save) is pressed on the top model — no level requires "save the parent first".
 * In contrast, for rows that ALREADY EXIST ON THE SERVER two operations happen
 * immediately: LISTING and DELETING saved child rows. For those,
 * "wait until save" semantics make no sense.
 */
@Component({
    selector: 'app-record-form-dialog',
    imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ModelLabelPipe,
    ConfirmDialogComponent,
    RecordLayoutComponent,
    forwardRef(() => RecordFormDialogComponent),
    IconComponent
],
    templateUrl: './record-form-dialog.component.html',
    styleUrls: ['./record-form-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordFormDialogComponent implements OnInit, OnDestroy {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly metadata = inject(RecordMetadataService);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly languageService = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  /** The node being edited. For a new record it must be created with empty `values`. */
  @Input({ required: true }) node!: StagedNode;

  /** Nesting level (root dialog = 1). For z-index and the depth limit. */
  @Input() depth = 1;

  /** Whether an existing record is being edited (for the title text). */
  @Input() isEdit = false;

  /**
   * Name of the FK column linking this type to its PARENT record (e.g. `SiparisId`). Hidden in the form
   * and assigned by the server at save time. If not given, no column counts as an FK.
   */
  @Input() fkColumn: string | null = null;

  /** Read-only FK info of a saved row (shown as a badge in the header). */
  @Input() fkHint: string | null = null;

  /** The user pressed "Kaydet" (Save) — the node is returned updated (no HTTP made). */
  @Output() saved = new EventEmitter<StagedNode>();
  @Output() cancelled = new EventEmitter<void>();

  /** Maximum depth of the child model tree — same as MAX_DEPTH on the schema side. */
  readonly maxDepth = 4;

  meta: TypeMeta | null = null;
  loading = true;
  form: FormGroup | null = null;
  /** Auto-value rules bound to the form (null if there are no rules). */
  autoValues: AutoValueFormBinding | null = null;

  /** This type's published form layout (screen design); null → default view. */
  formLayout: FormLayout | null = null;
  /** Columns drawn in the form — excluding FK and ID (computed once). */
  editable: PublishedColumn[] = [];
  /** Columns never drawn in the pop-up: ID and the FK linking to the parent record. */
  excludedColumns: ReadonlySet<string> = new Set();
  /** Required columns that must be drawn even if hidden in the design. */
  forcedColumns: ReadonlySet<string> = new Set();

  /** When Save stops on an invalid form, reveals the invalid field (including a closed tab/section). */
  @ViewChild(RecordLayoutComponent) private recordLayout?: RecordLayoutComponent;

  childTabs: ChildTabView[] = [];
  activeChildTab = '';

  /** Nested dialog open on top of this one (child model record). */
  nestedOpen = false;
  nestedNode: StagedNode | null = null;
  nestedTypeName = '';
  nestedIsEdit = false;

  /** childTypeName → temporary localIds of the selected rows (for bulk delete). */
  selected: Record<string, Set<number>> = {};
  /** childTypeName → error summary of rows that couldn't be deleted. */
  bulkErrors: Record<string, string[]> = {};
  /** childTypeName → record count in the last bulk delete attempt. */
  bulkTotals: Record<string, number> = {};
  /** Target child type of the confirm dialog; null means closed. */
  bulkTypeName: string | null = null;
  bulkBusy = false;

  // Util delegations (called from the template)
  childrenOf = childrenOf;

  ngOnInit(): void {
    forkJoin({
      meta: this.metadata.meta$(this.node.typeName),
      layout: this.metadata.formLayout$(this.node.typeName)
    }).pipe(markDirty(this.cdr)).subscribe(({ meta, layout }) => {
      this.meta = meta;
      this.formLayout = layout;
      this.editable = this.editableColumns(meta);
      this.excludedColumns = new Set(['ID', 'Id', ...(this.fkColumn ? [this.fkColumn] : [])]);
      this.forcedColumns = new Set(this.editable
        .filter(c => mustStayVisible(c, meta.rules.get(c.columnName)))
        .map(c => c.columnName));
      this.form = this.buildForm(meta);
      this.bindAutoValues(meta, this.form);
      this.childTabs = meta.childTypeNames.map(typeName => ({
        typeName, meta: null, loaded: false, loading: false, error: null, listLayout: null
      }));
      // Child table columns follow the child type's list layout (default if it can't be read).
      for (const tab of this.childTabs) {
        this.metadata.listLayout$(tab.typeName).pipe(markDirty(this.cdr)).subscribe(l => { tab.listLayout = l; });
      }
      this.activeChildTab = this.childTabs[0]?.typeName ?? '';
      this.loading = false;
      // If we're editing a saved record, fetch the existing child rows of the first tab.
      this.ensureChildRowsLoaded(this.activeChildTab);
    });
  }

  // ─── Form ───────────────────────────────────────────────────────────────────

  /**
   * Builds the form together with the schema rules — regex/length/range are bound here,
   * so errors show under the field before going to the server.
   */
  private buildForm(meta: TypeMeta): FormGroup {
    const controls: Record<string, unknown> = {};
    for (const col of this.editableColumns(meta)) {
      // The node may have come from a saved server row (camelCase keys);
      // read case-insensitively, otherwise the fields open empty.
      // If a raw ISO date value is bound directly, the datetime-local box silently
      // drops it and the field opens EMPTY; when the user touches it the browser writes the current time.
      const value = toInputValue(col.dataType, fieldValue(this.node.values, col.columnName)) ?? '';
      controls[col.columnName] = [value, validatorsFor(col, meta.rules.get(col.columnName))];
    }
    return this.fb.group(controls);
  }

  /**
   * Binds the auto-value rules to the form. Open-time rules run only on a (new) row not yet
   * written to the server; the FK column isn't in the form, so it isn't part of the plan.
   */
  private bindAutoValues(meta: TypeMeta, form: FormGroup): void {
    this.autoValues?.stop();
    const plan = buildAutoValuePlan(this.editableColumns(meta).map(col => {
      const rule = meta.rules.get(col.columnName);
      return {
        name: col.columnName,
        dataType: col.dataType,
        autoValueTrigger: rule?.autoValueTrigger,
        autoValueExpression: rule?.autoValueExpression,
        isReadOnly: rule?.isReadOnly
      };
    }));
    this.autoValues = plan.rules.length > 0
      ? new AutoValueFormBinding(form, plan, this.node.savedId === null).start()
      : null;
  }

  ngOnDestroy(): void {
    this.autoValues?.stop();
  }

  /** The FK column isn't shown in the form — it is assigned automatically at save time. */
  editableColumns(meta: TypeMeta): PublishedColumn[] {
    return meta.columns.filter(c => !this.isFkColumn(c.columnName));
  }

  /**
   * Only the primary key and the REAL FK column are hidden.
   *
   * Previously every column ending in `Id` was assumed to be an FK and hidden; business columns
   * such as `TcId` / `VergiNoId` therefore never appeared in the form and were never saved.
   * The FK name isn't guessed — it is given explicitly via the `fkColumn` Input.
   */
  private isFkColumn(columnName: string): boolean {
    if (columnName === 'ID' || columnName === 'Id') return true;
    return !!this.fkColumn && columnName === this.fkColumn;
  }

  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  // Lookup options are no longer loaded here: app-lookup-picker fetches its own data
  // lazily (50 at a time) and searches on the server. Previously ALL rows of the target
  // table were loaded up front.

  // ─── Child model tabs ────────────────────────────────────────────────────

  setChildTab(typeName: string): void {
    this.activeChildTab = typeName;
    this.ensureChildRowsLoaded(typeName);
  }

  /** Whether to show child model tabs in this dialog (depth limit). */
  get canShowChildren(): boolean {
    return this.depth < this.maxDepth && this.childTabs.length > 0;
  }

  tabView(typeName: string): ChildTabView | undefined {
    return this.childTabs.find(t => t.typeName === typeName);
  }

  /**
   * Fetches the saved child rows from the server ONCE and writes them into the tree as `StagedNode`.
   *
   * That way the table, status badge and edit flow use the same code as in-memory rows;
   * since `upsertChild` de-duplicates by `localId`, a repeated call doesn't produce duplicate
   * rows. Runs only for the active tab — no unnecessary requests in deep trees.
   *
   * `toTreeDto` sends these nodes with `existingId`: the server does NOT re-ADD them,
   * they only serve as FK targets for new grandchildren added beneath them.
   */
  private ensureChildRowsLoaded(typeName: string): void {
    if (!typeName || this.node.savedId === null) return;   // new record: no rows to fetch
    const tab = this.tabView(typeName);
    if (!tab || tab.loaded || tab.loading) return;

    const parentId = this.node.savedId;
    tab.loading = true;
    tab.error = null;

    forkJoin({
      meta: this.metadata.meta$(typeName),
      res: this.publishedModel.getAll(typeName, fkColumnFor(this.node.typeName), parentId)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ meta, res }) => {
        tab.loading = false;
        tab.meta = meta;
        if (!res.success) {
          tab.error = res.message ?? this.languageService.t('record.childRowsLoadFailed');
          return;
        }
        tab.loaded = true;
        for (const row of (res.data ?? []) as DataRow[]) {
          const id = Number(fieldValue(row, 'ID') ?? 0);
          if (!id) continue;
          const child = createStagedNode(typeName, normalizeRow(meta.columns, row));
          child.savedId = id;
          upsertChild(this.node, typeName, child);
        }
      },
      error: () => {
        tab.loading = false;
        tab.error = this.languageService.t('record.childRowsLoadFailed');
      }
    });
  }

  childRows(typeName: string): StagedNode[] {
    return childrenOf(this.node, typeName);
  }

  /** Columns shown in the table for child model rows (empty if meta isn't loaded). */
  childColumns(typeName: string): PublishedColumn[] {
    const tab = this.childTabs.find(t => t.typeName === typeName);
    if (!tab) return [];
    if (!tab.meta) {
      this.metadata.meta$(typeName).pipe(markDirty(this.cdr)).subscribe(m => { tab.meta = m; });
      return [];
    }
    // The child type's FK points to this node's type; business columns aren't filtered by name pattern.
    const childFk = fkColumnFor(this.node.typeName);
    const columns = tab.meta.columns.filter(c => c.columnName !== 'ID' && c.columnName !== childFk);
    // If there's a list layout, its order (at most 6 columns since the pop-up is narrow); otherwise the first 4.
    return tab.listLayout
      ? resolveListColumns(tab.listLayout, columns, null).slice(0, 6).map(r => r.column)
      : columns.slice(0, 4);
  }

  /** The child's FK column name — passed to the recursive dialog. */
  childFkColumn(): string {
    return fkColumnFor(this.node.typeName);
  }

  childCell(row: StagedNode, columnName: string): string {
    const v = fieldValue(row.values, columnName);
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  openNestedAdd(typeName: string): void {
    this.nestedTypeName = typeName;
    this.nestedNode = createStagedNode(typeName, {});
    this.nestedIsEdit = false;
    this.nestedOpen = true;
  }

  openNestedEdit(typeName: string, row: StagedNode): void {
    this.nestedTypeName = typeName;
    this.nestedNode = row;
    this.nestedIsEdit = true;
    this.nestedOpen = true;
  }

  onNestedSaved(child: StagedNode): void {
    upsertChild(this.node, this.nestedTypeName, child);
    this.closeNested();
  }

  closeNested(): void {
    this.nestedOpen = false;
    this.nestedNode = null;
    this.nestedTypeName = '';
  }

  // ─── Child row selection ───────────────────────────────────────────────────────

  private selectionOf(typeName: string): Set<number> {
    return (this.selected[typeName] ??= new Set<number>());
  }

  isRowSelected(typeName: string, row: StagedNode): boolean {
    return this.selectionOf(typeName).has(row.localId);
  }

  toggleRow(typeName: string, row: StagedNode): void {
    const sel = this.selectionOf(typeName);
    if (sel.has(row.localId)) sel.delete(row.localId);
    else sel.add(row.localId);
  }

  selectedCount(typeName: string): number {
    return this.selectionOf(typeName).size;
  }

  allRowsSelected(typeName: string): boolean {
    const rows = this.childRows(typeName);
    const sel = this.selectionOf(typeName);
    return rows.length > 0 && rows.every(r => sel.has(r.localId));
  }

  someRowsSelected(typeName: string): boolean {
    return this.selectedCount(typeName) > 0 && !this.allRowsSelected(typeName);
  }

  toggleAllRows(typeName: string): void {
    const sel = this.selectionOf(typeName);
    if (this.allRowsSelected(typeName)) sel.clear();
    else this.childRows(typeName).forEach(r => sel.add(r.localId));
  }

  errorsOf(typeName: string): string[] {
    return this.bulkErrors[typeName] ?? [];
  }

  totalOf(typeName: string): number {
    return this.bulkTotals[typeName] ?? 0;
  }

  // ─── Bulk deletion of child rows ─────────────────────────────────────────

  openBulkDelete(typeName: string): void {
    if (this.selectedCount(typeName) === 0) return;
    this.bulkTypeName = typeName;
  }

  cancelBulkDelete(): void {
    if (this.bulkBusy) return;
    this.bulkTypeName = null;
  }

  get bulkDeleteMessage(): string {
    if (!this.bulkTypeName) return '';
    return this.languageService.t('record.bulkDeleteMessage', {
      count: this.selectedCount(this.bulkTypeName)
    });
  }

  /** The confirm dialog must sit ABOVE this dialog — whose own overlay is 1000 + depth*10. */
  get confirmZIndex(): number {
    return this.overlayZIndex + 5;
  }

  /**
   * Deletes the selected child rows. A mixed selection runs in a single flow:
   * in-memory rows are only removed from the tree, SAVED ones are deleted on the server
   * (they already exist; "wait for the parent's Save" semantics make no sense).
   *
   * Partial failure is accepted: deleted rows drop from the list, the ones that couldn't be deleted STAY SELECTED and
   * their errors are summarised above the table.
   */
  confirmBulkDelete(): void {
    const typeName = this.bulkTypeName;
    if (!typeName || this.bulkBusy) return;

    const sel = this.selectionOf(typeName);
    const rows = this.childRows(typeName).filter(r => sel.has(r.localId));
    const staged = rows.filter(r => r.savedId === null);
    const savedRows = rows.filter(r => r.savedId !== null);

    // No request for in-memory rows — they drop straight from the tree.
    for (const row of staged) removeChild(this.node, typeName, row.localId);

    if (savedRows.length === 0) {
      sel.clear();
      this.bulkErrors[typeName] = [];
      this.bulkTypeName = null;
      return;
    }

    this.bulkBusy = true;
    this.bulkTotals[typeName] = rows.length;

    forkJoin(
      savedRows.map(row =>
        this.publishedModel.delete(typeName, row.savedId!).pipe(
          map(res => ({ row, ok: res.success, message: res.message })),
          catchError(err => of({
            row,
            ok: false,
            message: (err?.error?.message ?? this.languageService.t('record.childRowsLoadFailed')) as string
          }))
        )
      )
    ).pipe(markDirty(this.cdr)).subscribe(results => {
      this.bulkBusy = false;
      this.bulkTypeName = null;

      sel.clear();
      const failed: string[] = [];
      for (const r of results) {
        if (r.ok) {
          removeChild(this.node, typeName, r.row.localId);
        } else {
          sel.add(r.row.localId);            // keep the failed row selected
          failed.push(`ID:${r.row.savedId} — ${r.message}`);
        }
      }
      this.bulkErrors[typeName] = failed;
    });
  }

  // ─── Save / close ─────────────────────────────────────────────────────────

  /** Validates the form and writes the node to memory — NO HTTP is made for the record itself. */
  submit(): void {
    if (!this.form) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.recordLayout?.revealFirstInvalid();
      return;
    }
    this.autoValues?.runSave();
    // getRawValue: so read-only (disabled) auto fields are written to the node too.
    this.node.values = { ...this.node.values, ...this.form.getRawValue() };
    // Values were fixed; the previous save error no longer applies.
    this.node.error = null;
    // For a saved node `addTree` can't update it; a separate `update()` is needed.
    this.node.dirty = true;
    this.saved.emit(this.node);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }

  /**
   * ESC closes only the TOPMOST dialog. Since all layers listen on `document`,
   * `stopPropagation` isn't enough — only `stopImmediatePropagation` stops the other
   * listeners on the same target.
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.nestedOpen) return;        // the layer above will handle it itself
    event.stopImmediatePropagation();
    this.cancel();
  }

  /** Nested layers must stack — each level above the previous one. */
  get overlayZIndex(): number {
    return 1000 + this.depth * 10;
  }
}
