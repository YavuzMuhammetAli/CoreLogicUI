import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of, Subject } from 'rxjs';
import { catchError, debounceTime, map } from 'rxjs/operators';
import { PublishedModelService, PublishedModel, PublishedColumn, PagedData } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { PublishedTableService, ModelVersion } from '../../services/published-table.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { cellValue, fieldValue, parseEnumValues } from './model-data.util';
import { asFileRef, FileRef, fileRefUrl } from '../../utils/record-file';
import { markDirty } from '../../utils/change-detection';
import { RecordMetadataService } from '../../services/record-metadata.service';
import { ListLayout } from '../../utils/screen-layout/screen-layout.model';
import { ResolvedListColumn, resolveListColumns } from '../../utils/screen-layout/list-layout.resolve';
import { pageWindow } from '../../utils/pagination';
import {
  ColumnFilter, ColumnFilters, FilterKind, ListSort, activeFilterCount, ariaSortOf, filterKindOf, isSortable, nextSort,
  toListFilters
} from '../../utils/list-query';
import { IconComponent } from '../shared/icon/icon.component';

type DataRow = Record<string, unknown>;

/** Column in the filter panel — kept precomputed so `kind` and options are not recomputed every cycle. */
interface FilterColumn {
  column: PublishedColumn;
  kind: FilterKind;
  options: string[];
}

@Component({
    selector: 'app-model-data',
    imports: [
        CommonModule, RouterLink, DatePipe, ColumnVisibilityComponent,
        ConfirmDialogComponent, TranslatePipe, IconComponent
    ],
    templateUrl: './model-data.component.html',
    styleUrls: ['./model-data.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelDataComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);
  private readonly metadata = inject(RecordMetadataService);

  private readonly destroyRef = inject(DestroyRef);

  /** Do not fire a query on every keystroke while typing search and filter. */
  private static readonly QUERY_DEBOUNCE_MS = 300;

  /** Width (px) of fixed columns and of columns without a given width in the fixed-width table. */
  static readonly AUTO_COLUMN_PX = 160;
  static readonly ID_COLUMN_PX = 80;
  static readonly SELECT_COLUMN_PX = 44;
  static readonly STATUS_COLUMN_PX = 160;

  typeName = '';
  model: PublishedModel | undefined;

  // Grid state
  rows: DataRow[] = [];
  loadingRows = false;
  loadError: string | null = null;

  // Pagination state
  pageIndex = 1;
  pageSize  = 20;
  total     = 0;
  readonly pageSizeOptions = [20, 50, 100];

  // Search, sort and filter — applied on the server, kept across page changes
  searchTerm = '';
  sort: ListSort | null = null;
  columnFilters: ColumnFilters = {};
  readonly filtersOpen = signal(false);
  private readonly queryChanges = new Subject<void>();
  /** Responses may arrive out of order: only the latest request's result is applied. */
  private rowsRequest = 0;

  // Version panel state
  versions = signal<ModelVersion[]>([]);
  showVersionPanel = signal(false);

  // One-shot retry flag for the "assembly not loaded" error
  private rowsRetried = false;

  // Admin-managed column visibility — null = no setting, all columns visible
  visibleColumnNames: string[] | null = null;
  savingColumnVisibility = false;

  /**
   * Published list layout (screen design). If present, column order and widths come
   * from it and it replaces the "Kolonlar" (Columns) setting; otherwise null.
   */
  listLayout: ListLayout | null = null;

  /** "Ekranı tasarla" (Design screen): open the list design being shown (chosen by the server per role). */
  get designQuery(): Record<string, string | number | null> {
    return { view: 'list', layout: this.metadata.publishedLayoutId(this.typeName, 'list') };
  }

  // Bulk delete state
  /**
   * IDs of the selected rows. Since pagination is SERVER-side, the selection is NOT CARRIED
   * across pages — deleting rows the user cannot see would be a surprise.
   */
  selectedIds = new Set<number>();
  /** Error summary of rows that could not be deleted (the rows stay selected). */
  bulkErrors: string[] = [];
  /** How many records were sent in the last attempt (for the summary text). */
  bulkTotal = 0;
  readonly confirmOpen = signal(false);
  readonly bulkBusy = signal(false);

  constructor(
    private route: ActivatedRoute,
    private publishedModel: PublishedModelService,
    private publishModel: PublishModelService,
    public permissionService: PermissionService,
    public publishedTableService: PublishedTableService,
    private modelColumnSetting: ModelColumnSettingService
  ) {}

  ngOnInit(): void {
    this.queryChanges
      .pipe(debounceTime(ModelDataComponent.QUERY_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef), markDirty(this.cdr))
      .subscribe(() => this.applyQuery());

    // Subscribe to the paramMap observable instead of the snapshot;
    // when the same component instance is reused for different models
    // (Angular route reuse) it fires on every parameter change.
    this.route.paramMap.pipe(markDirty(this.cdr)).subscribe(params => {
      this.typeName = params.get('typeName') ?? '';
      this.resetState();
      this.loadModelMeta();
      this.loadColumnVisibility();
    });
  }

  /** Clear the previous model's state when switching to a new model */
  private resetState(): void {
    this.model = undefined;
    this.rows = [];
    this.loadError = null;
    this.loadingRows = true; // the "not found" panel is not shown until meta is loaded
    this.rowsRetried = false;
    this.showVersionPanel.set(false);
    this.versions.set([]);
    this.pageIndex = 1;
    this.total     = 0;
    this.searchTerm = '';
    this.sort = null;
    this.columnFilters = {};
    this.filtersOpen.set(false);
    this.visibleColumnNames = null;
    this.listLayout = null;
    this.clearSelection();
  }

  /** Resets the selection and the previous bulk delete summary. */
  private clearSelection(): void {
    this.selectedIds = new Set<number>();
    this.bulkErrors = [];
    this.bulkTotal = 0;
  }

  get columns(): PublishedColumn[] {
    return this.model?.columns ?? [];
  }

  /**
   * Cache of column derivatives. The template reads `tableHeaders` on every ROW and the width and visibility
   * lists on every change detection cycle; the getters re-resolved on every read and returned
   * a new array (on a 100-row page ~100 column resolutions per cycle, and @for re-diffing
   * from scratch every cycle). Inputs (layout, model, visibility setting) are compared by
   * reference — none of the three is mutated in place, they are always reassigned.
   */
  private colsMemo?: {
    layout: ListLayout | null;
    model: PublishedModel | undefined;
    visible: string[] | null;
    resolved: ResolvedListColumn[];
    display: PublishedColumn[];
    headers: { key: string; label: string; sortable: boolean; longText: boolean }[];
    filterable: FilterColumn[];
    visibilityItems: ColumnVisibilityItem[];
    effectiveVisible: string[];
  };

  private get cols(): NonNullable<ModelDataComponent['colsMemo']> {
    const m = this.colsMemo;
    if (m && m.layout === this.listLayout && m.model === this.model && m.visible === this.visibleColumnNames) {
      return m;
    }
    const resolved = resolveListColumns(this.listLayout, this.columns, this.visibleColumnNames);
    const display = resolved.map(r => r.column);
    this.colsMemo = {
      layout: this.listLayout,
      model: this.model,
      visible: this.visibleColumnNames,
      resolved,
      display,
      headers: [
        { key: 'ID', label: 'ID', sortable: true, longText: false },
        ...display.map(c => ({
          key: c.columnName, label: this.colLabel(c), sortable: isSortable(c.dataType), longText: c.dataType === 'text'
        }))
      ],
      filterable: display
        .map(column => ({ column, kind: filterKindOf(column.dataType), options: parseEnumValues(column.enumValues) }))
        .filter(f => f.kind !== 'none'),
      visibilityItems: this.columns.map(c => ({ name: c.columnName, required: false })),
      effectiveVisible: this.visibleColumnNames ?? this.columns.map(c => c.columnName)
    };
    return this.colsMemo;
  }

  /** Visible columns and their widths — the list layout, otherwise the "Kolonlar" (Columns) setting, otherwise all. */
  get resolvedColumns(): ResolvedListColumn[] {
    return this.cols.resolved;
  }

  /** Visible columns — all schema columns if there is no setting */
  get displayColumns(): PublishedColumn[] {
    return this.cols.display;
  }

  /**
   * In a list layout column widths are given via `<colgroup>` and the table is drawn with a fixed
   * layout (otherwise the browser redistributes the widths by content). Order: selection checkbox,
   * ID, the layout's columns, workflow status.
   */
  get columnWidths(): number[] {
    const widths: number[] = [];
    if (this.permissionService.can(this.typeName, 'delete')) widths.push(ModelDataComponent.SELECT_COLUMN_PX);
    widths.push(ModelDataComponent.ID_COLUMN_PX);
    for (const c of this.resolvedColumns) widths.push(c.width ?? ModelDataComponent.AUTO_COLUMN_PX);
    if (this.hasWorkflowStatus) widths.push(ModelDataComponent.STATUS_COLUMN_PX);
    return widths;
  }

  get tableWidth(): number {
    return this.columnWidths.reduce((sum, w) => sum + w, 0);
  }

  /** Column list for the column visibility popover (no required columns in the list view) */
  get columnVisibilityItems(): ColumnVisibilityItem[] {
    return this.cols.visibilityItems;
  }

  /** The popover's current effective selection — all columns shown checked if there is no setting */
  get effectiveVisibleColumnNames(): string[] {
    return this.cols.effectiveVisible;
  }

  /** Loads the list-view column setting saved by the admin */
  private loadColumnVisibility(): void {
    const typeName = this.typeName;
    this.modelColumnSetting.get(typeName, 'list').pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName) return; // another model may have been opened in the meantime
        this.visibleColumnNames = (res.success && res.data?.visibleColumns?.length)
          ? res.data.visibleColumns
          : null;
      },
      error: () => { /* if the setting cannot be loaded all columns stay visible */ }
    });
  }

  /** Saves the admin's column visibility setting */
  onSaveColumnVisibility(names: string[]): void {
    this.savingColumnVisibility = true;
    const dto: ModelColumnSettingDto = { typeName: this.typeName, viewType: 'list', visibleColumns: names };
    this.modelColumnSetting.set(dto).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.savingColumnVisibility = false;
        if (res.success) this.visibleColumnNames = names;
      },
      error: () => { this.savingColumnVisibility = false; }
    });
  }

  /** Fetch the model meta from the backend, then load the rows */
  private loadModelMeta(): void {
    // The list layout is read together with the columns — so the table is not first drawn with default columns and then "jumps".
    forkJoin({
      models: this.publishedModel.getModels(),
      layout: this.metadata.listLayout$(this.typeName)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ models: res, layout }) => {
        if (res.success) {
          this.model = (res.data ?? []).find(m => m.typeName === this.typeName);
        }
        this.listLayout = layout;
        this.loadRows();
      },
      error: () => this.loadRows()
    });
  }

  /** Load the records of the current page */
  loadRows(): void {
    this.loadingRows = true;
    this.loadError = null;
    const request = ++this.rowsRequest;

    this.publishedModel.getAllPaged(this.typeName, this.pageIndex, this.pageSize, undefined, undefined, {
      search: this.searchTerm.trim(),
      sortBy: this.sort?.column,
      sortDir: this.sort?.direction,
      filters: toListFilters(this.displayColumns, this.columnFilters)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (request !== this.rowsRequest) return;
        if (res.success) {
          this.loadingRows = false;
          const paged: PagedData<Record<string, unknown>> = res.data;
          this.rows  = (paged?.items ?? []) as DataRow[];
          this.total = paged?.total ?? 0;
          this.rowsRetried = false;
        } else if (!this.rowsRetried && res.message?.includes('Assembly') && this.permissionService.isAdmin()) {
          // If the backend was restarted the assembly is null; load it once and retry.
          // loadAssembly is admin-only — a non-admin user sees the error message directly.
          this.rowsRetried = true;
          this.publishModel.loadAssembly().pipe(markDirty(this.cdr)).subscribe({
            next: () => {
              // Assembly reloaded; fetch the model meta fresh as well (cache bypassed)
              this.publishedModel.invalidateModels();
              this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
                next: metaRes => {
                  if (metaRes.success)
                    this.model = (metaRes.data ?? []).find(m => m.typeName === this.typeName);
                  this.loadRows();
                },
                error: () => this.loadRows()
              });
            },
            error: () => {
              this.loadingRows = false;
              this.loadError = this.languageService.t('model.data.assemblyNotLoaded');
            }
          });
        } else {
          this.loadingRows = false;
          this.loadError = res.message?.includes('Assembly')
            ? this.languageService.t('model.data.assemblyNotLoaded')
            : res.message;
        }
      },
      error: err => {
        if (request !== this.rowsRequest) return;
        this.loadingRows = false;
        this.loadError = err?.error?.message ?? this.languageService.t('model.data.loadFailed');
      }
    });
  }

  // ─── Search, sort, filter ──────────────────────────────────────────────────────

  /** Filter panel columns — only columns visible in the list and filterable. */
  get filterColumns(): FilterColumn[] {
    return this.cols.filterable;
  }

  get activeFilters(): number {
    return activeFilterCount(this.columnFilters);
  }

  /** Whether the list is narrowed by a selection (an empty result says "no match", not "no records"). */
  get isQueryActive(): boolean {
    return !!this.searchTerm.trim() || this.activeFilters > 0;
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.queryChanges.next();
  }

  onFilterInput(column: string, part: keyof ColumnFilter, value: string): void {
    this.columnFilters = { ...this.columnFilters, [column]: { ...this.columnFilters[column], [part]: value } };
    this.queryChanges.next();
  }

  toggleSort(column: string): void {
    this.sort = nextSort(this.sort, column);
    this.applyQuery();
  }

  ariaSort(column: string): 'ascending' | 'descending' | 'none' {
    return ariaSortOf(this.sort, column);
  }

  toggleFilters(): void {
    this.filtersOpen.update(open => !open);
  }

  clearQuery(): void {
    this.searchTerm = '';
    this.columnFilters = {};
    this.applyQuery();
  }

  /** Selection changed: start from the first page; selected rows are not carried to another list. */
  private applyQuery(): void {
    this.pageIndex = 1;
    this.clearSelection();
    this.loadRows();
  }

  /** Model name shown in the header — the model label (e.g. "Teklif"), otherwise the table name. */
  get modelTitle(): string {
    return this.model?.label?.trim() || this.typeName;
  }

  /** Label shown in the UI — the admin-defined Label if any, otherwise the raw columnName. */
  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  /**
   * Determine the table headers (ID + visible schema columns).
   * key: data/lookup key (raw columnName) — the cell value is read with this key.
   * label: text shown to the user (uses the Label if the admin defined one).
   */
  get tableHeaders(): { key: string; label: string; sortable: boolean; longText: boolean }[] {
    return this.cols.headers;
  }

  // ─── Pagination ────────────────────────────────────────────────────────────────

  /** Total page count */
  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize) || 1;
  }

  /** Page start for the "X–Y / N records" display in the footer */
  get pageRangeStart(): number {
    return this.total === 0 ? 0 : (this.pageIndex - 1) * this.pageSize + 1;
  }

  /** Page end for the "X–Y / N records" display in the footer */
  get pageRangeEnd(): number {
    return Math.min(this.pageIndex * this.pageSize, this.total);
  }

  /**
   * Visible range for the page number buttons — at most 5 pages.
   * The window is centred as the page changes (first/last page and an ellipsis are shown).
   */
  get visiblePages(): number[] {
    return pageWindow(this.pageIndex, this.totalPages);
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages || p === this.pageIndex) return;
    this.pageIndex = p;
    this.clearSelection();     // the selection is not carried across pages
    this.loadRows();
  }

  prevPage(): void { this.goToPage(this.pageIndex - 1); }
  nextPage(): void { this.goToPage(this.pageIndex + 1); }

  changePageSize(size: number): void {
    this.pageSize  = size;
    this.pageIndex = 1;
    this.clearSelection();
    this.loadRows();
  }

  // ─── Row selection and bulk delete ─────────────────────────────────────────

  isRowSelected(row: DataRow): boolean {
    return this.selectedIds.has(this.rowId(row));
  }

  toggleRow(row: DataRow): void {
    const id = this.rowId(row);
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get allRowsSelected(): boolean {
    return this.rows.length > 0 && this.rows.every(r => this.selectedIds.has(this.rowId(r)));
  }

  get someRowsSelected(): boolean {
    return this.selectedIds.size > 0 && !this.allRowsSelected;
  }

  toggleAllRows(): void {
    if (this.allRowsSelected) this.selectedIds.clear();
    else this.rows.forEach(r => this.selectedIds.add(this.rowId(r)));
  }

  get bulkDeleteMessage(): string {
    return this.languageService.t('model.data.bulkDeleteMessage', { count: this.selectedCount });
  }

  openBulkDelete(): void {
    if (this.selectedCount === 0) return;
    this.confirmOpen.set(true);
  }

  cancelBulkDelete(): void {
    if (this.bulkBusy()) return;
    this.confirmOpen.set(false);
  }

  /**
   * Deletes the selected records. There is NO bulk delete endpoint on the server; each record is deleted one by one.
   * Partial success is accepted: deleted rows drop out of the list, those that could not be deleted STAY SELECTED and
   * their errors are summarised — the user deals only with the problematic rows.
   */
  confirmBulkDelete(): void {
    const ids = [...this.selectedIds];
    if (ids.length === 0) { this.confirmOpen.set(false); return; }

    this.bulkBusy.set(true);
    this.bulkErrors = [];
    this.bulkTotal = ids.length;

    forkJoin(
      ids.map(id =>
        this.publishedModel.delete(this.typeName, id).pipe(
          map(res => ({ id, ok: res.success, message: res.message })),
          catchError(err => of({
            id,
            ok: false,
            message: (err?.error?.message ?? this.languageService.t('model.data.loadFailed')) as string
          }))
        )
      )
    ).pipe(markDirty(this.cdr)).subscribe(results => {
      this.bulkBusy.set(false);
      this.confirmOpen.set(false);

      const failed = results.filter(r => !r.ok);
      this.selectedIds = new Set(failed.map(r => r.id));
      this.bulkErrors = failed.map(r => `ID:${r.id} — ${r.message}`);

      // If all records on the last page were deleted, step back to the previous page.
      if (failed.length < ids.length && this.pageIndex > 1 && ids.length >= this.rows.length) {
        this.pageIndex = Math.max(1, this.pageIndex - 1);
      }
      this.loadRows();
    });
  }

  // ─── Util delegations — so they can be called directly from the template ──────

  cellValue     = cellValue;
  fileUrl       = fileRefUrl;

  /** File/image display in the cell (the server sends a link, not the content); otherwise null. */
  fileRefOf(row: DataRow, key: string): FileRef | null {
    return asFileRef(fieldValue(row, key));
  }

  rowId(row: DataRow): number {
    return Number(row['ID'] ?? row['id'] ?? 0);
  }

  /**
   * H: The record's status in the open workflow.
   *
   * WorkflowStatus is a SYSTEM column coming from DbBaseObject; it is not among the user
   * columns (tableHeaders) but is carried in the row data.
   * Since the server returns camelCase, both spellings are tried.
   */
  workflowStatusOf(row: DataRow): string {
    const value = row['workflowStatus'] ?? row['WorkflowStatus'];
    return typeof value === 'string' ? value.trim() : '';
  }

  /**
   * The process column is drawn only if at least one row has a status.
   *
   * Always showing the column on models that do not use workflows would leave a
   * permanently empty column; the column list is already managed by the admin and
   * unnecessary width is costly.
   */
  get hasWorkflowStatus(): boolean {
    // The rows array is only ever reassigned; the result does not change for the same array.
    if (this.workflowStatusMemo?.rows !== this.rows) {
      this.workflowStatusMemo = { rows: this.rows, value: this.rows.some(row => this.workflowStatusOf(row) !== '') };
    }
    return this.workflowStatusMemo.value;
  }

  private workflowStatusMemo?: { rows: DataRow[]; value: boolean };

  /** Loads the version history from the backend */
  loadVersions(): void {
    this.publishedTableService.getVersions(this.typeName).pipe(markDirty(this.cdr)).subscribe({
      next: r => {
        if (r.success) {
          this.versions.set(r.data ?? []);
        }
      },
      error: () => { /* skip silently */ }
    });
  }

  /** Open/close the version panel; load the data when opening */
  toggleVersionPanel(): void {
    this.showVersionPanel.update(v => !v);
    if (this.showVersionPanel()) {
      this.loadVersions();
    }
  }

  /** Version awaiting confirmation; the dialog is closed when null. */
  pendingRollbackVersion: number | null = null;
  isRollingBack = false;

  askRollback(version: number): void {
    this.pendingRollbackVersion = version;
  }

  cancelRollback(): void {
    this.pendingRollbackVersion = null;
  }

  /** Sends the rollback request once confirmed; on success refreshes the data + versions */
  confirmRollback(): void {
    const version = this.pendingRollbackVersion;
    if (version === null) return;

    this.pendingRollbackVersion = null;
    this.isRollingBack = true;

    this.publishedTableService.rollback(this.typeName, version).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.isRollingBack = false;
        if (res.success) {
          this.loadRows();
          this.loadVersions();
        }
      },
      error: () => { this.isRollingBack = false; }
    });
  }
}
