import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Location } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, Observable, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DisplayRowsCache, selectDisplayRows } from './display-rows.util';
import { TreeStep, applyTreeResult, applyUpdateResults } from './tree-save.util';
import {
  PublishedModelService, PublishedModel, PublishedColumn, TreeSaveResult
} from '../../services/published-model.service';
import { PermissionService } from '../../services/permission.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { RecordMetadataService } from '../../services/record-metadata.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { RecordFormDialogComponent } from '../shared/record-form-dialog/record-form-dialog.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { RecordLayoutComponent } from '../shared/record-layout/record-layout.component';
import { TaskActionDialogComponent, TaskActionResult } from '../shared/task-action-dialog/task-action-dialog.component';
import { WorkflowViewDialogComponent } from '../shared/workflow-view-dialog/workflow-view-dialog.component';
import { WorkflowInstanceService, WorkflowTaskService } from '../../services/workflow-task.service';
import { NotificationService } from '../../services/notification.service';
import { MyRecordTask, RecordWorkflowState, StartableWorkflow } from '../../models/workflow.model';
import { buildRecordValues, lockedColumns, missingRequired } from './workflow-lock.util';
import { LookupLabelService } from '../../services/lookup-label.service';
import {
  StagedNode,
  createStagedNode,
  normalizeRow,
  fkColumnFor,
  validatorsFor,
  toTreeDto,
  flattenNodes,
  dirtyNodes,
  hasInserts,
  hasErrors as treeHasErrors,
  pendingCount as treePendingCount
} from './staged-tree.util';
import {
  isImage,
  imageSrc,
  isBase64Value,
  downloadFile,
  sanitizePayload,
  fieldValue,
  toInputValue
} from '../model-data/model-data.util';
import { asFileRef, FileRef, fileRefUrl } from '../../utils/record-file';
import { markDirty } from '../../utils/change-detection';
import { AutoValueFormBinding } from '../../utils/auto-value/auto-value-form';
import { buildAutoValuePlan } from '../../utils/auto-value/auto-value';
import { mustStayVisible } from '../../utils/record-field/column-required';
import { FormLayout, ListLayout } from '../../utils/screen-layout/screen-layout.model';
import { resolveListColumns } from '../../utils/screen-layout/list-layout.resolve';
import { IconComponent } from '../shared/icon/icon.component';

type DataRow = Record<string, unknown>;

/** Full state of a sub-model tab */
interface TabState {
  typeName: string;
  columns: PublishedColumn[];
  fkColumn: string;

  /** SAVED rows from the server (filled only in existing-record mode). */
  rows: DataRow[];
  loading: boolean;
  error: string | null;

  /**
   * Rows not yet saved OR that failed while saving — with their own subtrees.
   * This list is NEVER cleared on a save error; the user fixes it and retries.
   */
  staged: StagedNode[];

  searchTerm: string;
  sortCol: string;
  sortDir: 'asc' | 'desc';

  fileNames: Record<string, string>;

  /** IDs of the selected SAVED rows for bulk delete. */
  selectedIds: Set<number>;
  /** Temporary localIds of the selected PENDING rows for bulk removal. */
  selectedStaged: Set<number>;
  /** Error summary of the rows that could not be deleted in bulk delete (rows stay selected). */
  bulkErrors: string[];
  /** How many records were sent in the last bulk delete attempt (for the summary text). */
  bulkTotal: number;

  /** Cache of the getDisplayRows() result (see display-rows.util). */
  displayCache?: DisplayRowsCache;

  // Admin-managed table column visibility — null = no setting, all visible.
  // Shares the SAME setting as the sub-model's own list page ('list' viewType).
  visibleColumnNames: string[] | null;
  savingColumnVisibility: boolean;
  /** The sub-model's published list layout (screen design) — column order comes from it if present. */
  listLayout: ListLayout | null;

  /** Cache of the table columns/headers (see ModelDetailComponent.tableColumns). */
  colsMemo?: TabColumnsMemo;

  /** Maximum number of rendered rows; "Daha fazla göster" (Show more) increases it. */
  renderLimit?: number;

  /** renderedRows() slice — returns the same array when source and limit are unchanged (so @for does not diff every turn). */
  renderCache?: { source: DataRow[]; limit: number; result: DataRow[] };
}

/** A tab's table columns — the same object while the inputs do not change. */
interface TabColumnsMemo {
  layout: ListLayout | null;
  columns: PublishedColumn[];
  visible: string[] | null;
  lang: string;
  cols: PublishedColumn[];
  headers: { key: string; label: string }[];
  byName: Map<string, PublishedColumn>;
  /** Column names scanned by search. */
  searchable: string[];
}

/** A child table renders at most this many rows on first open. */
const TAB_RENDER_STEP = 100;

@Component({
    selector: 'app-model-detail',
    imports: [
    ReactiveFormsModule,
    RouterLink,
    ColumnVisibilityComponent,
    TranslatePipe,
    RecordFormDialogComponent,
    ConfirmDialogComponent,
    RecordLayoutComponent,
    TaskActionDialogComponent,
    WorkflowViewDialogComponent,
    IconComponent
],
    templateUrl: './model-detail.component.html',
    styleUrls: ['./model-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelDetailComponent implements OnInit, OnDestroy {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);
  private readonly metadata = inject(RecordMetadataService);
  /** Resolves lookup FK ids in table cells to labels in bulk. */
  private readonly lookupLabels = inject(LookupLabelService);
  /** To update the address bar without reloading the page (new → edit transition). */
  private readonly location = inject(Location);
  private readonly taskService = inject(WorkflowTaskService);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly notification = inject(NotificationService);

  /** Layout of the parent form — shows the invalid field when Save stops on an invalid form. */
  @ViewChild(RecordLayoutComponent) private recordLayout?: RecordLayoutComponent;

  // ─── Form-based workflow ────────────────────────────────────────────────────
  //
  // For a saved record the server's lock decision (recordState) is kept: while the
  // process runs, only the person whose turn it is edits only their own step's
  // columns. The lock is enforced on the server too; this is only its reflection on screen.

  /** The record's process state; null for a new record or when the module is not installed. */
  wfState: RecordWorkflowState | null = null;
  /** Workflows that can be started manually on a new record (wfState.startable for saved ones). */
  private newStartable: StartableWorkflow[] = [];
  /** Running workflow action — spinner on the pressed button: 'start:{code}' | 'approve:{id}' | 'reject:{id}'. */
  wfBusy: string | null = null;
  /** Workflow code to start once Save completes successfully ("{Akış} Başlat" / Start {workflow}). */
  private pendingStart: string | null = null;
  /** Step action dialog (extra decision fields / rejection note). */
  actionDialog: { task: MyRecordTask; decision: 'approve' | 'reject'; error: string | null } | null = null;
  /**
   * The newest process of the record visible to the user (running or finished) — the
   * "Akışı görüntüle" (View workflow) button (see loadLatestInstance); the visibility decision is on the server
   * (Read + View workflow permission, starter or assignee).
   */
  latestInstanceId: number | null = null;
  /** Process of the open "Akışı görüntüle" (View workflow) dialog; null → closed. */
  viewInstanceId: number | null = null;

  typeName = '';
  recordId = 0;
  /** New record mode (route data: { mode: 'new' }) */
  isNew = false;

  // Parent record
  record: DataRow | null = null;
  model: PublishedModel | null = null;
  loadingRecord = false;
  recordError: string | null = null;

  // Parent record delete state
  deleting = false;

  // Parent record edit / new record form (inline, not a modal)
  showEditForm = false;
  editForm: FormGroup | null = null;
  editLoading = false;
  editMsg: string | null = null;
  editOk: boolean | null = null;

  // Sub-models (tabs)
  childModelNames: string[] = [];
  activeTab = '';
  allModels: PublishedModel[] = [];
  tabStates = new Map<string, TabState>();
  loadingChildren = false;

  /** Schema rules of the parent model (regex/length/range) — for client-side validation. */
  private parentRules = new Map<string, PublishedColumnSchema>();

  /**
   * Auto-value rules bound to the parent form. Whenever the form is rebuilt (rules
   * arrive, after a workflow action) the old one is released and the new one bound.
   */
  private autoValues: AutoValueFormBinding | null = null;

  /** List of records that could not be saved after a bulk save (rows STAY on screen, this is just a summary) */
  childSaveErrors: string[] = [];

  // ─── Record pop-up (add/edit sub-model) ─────────────────────────────────────

  dialogOpen = false;
  dialogNode: StagedNode | null = null;
  dialogTabName = '';
  dialogIsEdit = false;
  /** FK column of the type in the open dialog — the only `...Id` field that must be hidden in the form. */
  dialogFkColumn: string | null = null;
  /** ID of the edited row if it is saved on the server; null for a row pending in memory. */
  private dialogSavedId: number | null = null;

  // Admin-managed parent form column visibility — null = no setting, all visible
  visibleParentColumnNames: string[] | null = null;
  savingColumnVisibility = false;

  // ─── Screen design ──────────────────────────────────────────────────────────
  //
  // If a published form layout exists, fields are drawn into its tab/section/grid and it
  // replaces the "Kolonlar" (Columns) setting. The sets passed to the layout component are kept
  // as fields (a getter would create a new object every turn and needlessly recompute the plan).

  /** Published form layout; null → default view. */
  formLayout: FormLayout | null = null;
  /** Columns the assignee whose turn it is will fill (with real column names). */
  stepColumnSet: ReadonlySet<string> = new Set();
  /** Columns that must be drawn even if hidden in the design: required ones + step columns. */
  forcedParentColumns: ReadonlySet<string> = new Set();

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publishedModel: PublishedModelService,
    private fb: FormBuilder,
    public permission: PermissionService,
    private modelColumnSetting: ModelColumnSettingService
  ) {}

  ngOnInit(): void {
    // Determine the mode from route data once (snapshot; new and edit routes differ)
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    this.routeSub = this.route.paramMap.pipe(markDirty(this.cdr)).subscribe(params => {
      this.typeName = params.get('typeName') ?? '';
      this.recordId = Number(params.get('id') ?? 0);
      this.reset();
      this.loadAll();
      this.loadColumnVisibility();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.autoValues?.stop();
  }

  // ─── Util delegations ────────────────────────────────────────────────────────

  isImage        = isImage;
  imageSrc       = imageSrc;
  isBase64Value  = isBase64Value;
  fileUrl        = fileRefUrl;

  /**
   * Saved file/image in the cell (the server sends a link, not the content); null otherwise.
   * Unsaved (pending) child rows still carry the file as base64 — those are drawn the old way.
   */
  fileRefOf(row: DataRow, key: string): FileRef | null {
    return asFileRef(fieldValue(row, key));
  }

  // ─── Lookup labels (for table cells) ────────────────────────────────────────
  //
  // The dropdown is now lazy-loaded (app-lookup-picker), so the full list of the target
  // table is not kept anywhere. To show labels in cells, the unique FK ids in the visible
  // rows are collected and resolved with ONE request per column.

  /** Resolves the labels of lookup ids in the visible rows (the missing ones). */
  private resolveLookupLabels(columns: PublishedColumn[], rows: DataRow[]): void {
    if (rows.length === 0) return;

    for (const col of columns) {
      if (col.dataType !== 'lookup' || !col.lookupTargetTable) continue;

      const ids = rows
        .map(r => Number(fieldValue(r, col.columnName)))
        .filter(n => Number.isFinite(n) && n > 0);

      if (ids.length === 0) continue;

      this.lookupLabels
        .ensure(col.lookupTargetTable, col.lookupDisplayColumn, ids)
        .pipe(markDirty(this.cdr))
        .subscribe();
    }
  }

  /** Converts a lookup FK ID in a table cell to its label (shows the raw ID if unresolved). */
  lookupCellLabel(col: PublishedColumn, value: unknown): string {
    if (value == null || value === '') return '—';
    const target = col.lookupTargetTable;
    if (!target) return String(value);
    return this.lookupLabels.label(target, col.lookupDisplayColumn, Number(value)) ?? String(value);
  }

  downloadTabFile(b64: string, colName: string, state: TabState): void {
    downloadFile(b64, colName, state.fileNames);
  }

  // ─── Reset ──────────────────────────────────────────────────────────────────

  private reset(): void {
    this.record = null;
    this.model = null;
    this.loadingRecord = false;
    this.recordError = null;
    this.deleting = false;
    this.showEditForm = false;
    this.editForm = null;
    this.editMsg = null;
    this.editOk = null;
    this.childModelNames = [];
    this.activeTab = '';
    this.allModels = [];
    this.tabStates.clear();
    this.loadingChildren = false;
    this.childSaveErrors = [];
    this.parentRules = new Map();
    this.autoValues?.stop();
    this.autoValues = null;
    this.closeRecordDialog();
    this.visibleParentColumnNames = null;
    this.formLayout = null;
    this.stepColumnSet = new Set();
    this.forcedParentColumns = new Set();
    this.wfState = null;
    this.newStartable = [];
    this.wfBusy = null;
    this.pendingStart = null;
    this.actionDialog = null;
    this.latestInstanceId = null;
    this.viewInstanceId = null;
  }

  // ─── Data loading ───────────────────────────────────────────────────────────

  private loadAll(): void {
    this.loadingRecord = true;

    if (this.isNew) {
      // New record mode: load the model schema + prepare the sub tabs
      // The layout is read on the first load too: otherwise the form would first be drawn with
      // the default view and then "jump" to the layout.
      forkJoin({
        models: this.publishedModel.getModels(),
        layout: this.metadata.formLayout$(this.typeName)
      }).pipe(markDirty(this.cdr)).subscribe({
        next: ({ models: res, layout }) => {
          this.loadingRecord = false;
          this.formLayout = layout;
          if (res.success) {
            this.allModels = res.data ?? [];
            this.model = this.allModels.find(m => m.typeName === this.typeName) ?? null;
          }
          this.refreshLayoutInputs();
          if (this.model) {
            this.buildNewForm();
            // If the schema exists, load the sub tabs too (without fetching data from the server)
            this.loadChildrenForNew();
            this.loadStartable();
          } else {
            this.recordError = this.languageService.t('model.detail.modelNotFound', { typeName: this.typeName });
          }
        },
        error: err => {
          this.loadingRecord = false;
          const e = err as { error?: { message?: string }; message?: string };
          this.recordError = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.schemaLoadFailed');
        }
      });
      return;
    }

    // Existing record mode: model schema + record data
    forkJoin({
      models: this.publishedModel.getModels(),
      record: this.publishedModel.get(this.typeName, this.recordId),
      layout: this.metadata.formLayout$(this.typeName)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ models, record, layout }) => {
        this.loadingRecord = false;
        this.formLayout = layout;

        if (models.success) {
          this.allModels = models.data ?? [];
          this.model = this.allModels.find(m => m.typeName === this.typeName) ?? null;
        }
        this.refreshLayoutInputs();

        if (record.success && record.data) {
          this.record = record.data as DataRow;
          // Record arrived — open the edit form directly (there is no read-only mode)
          this.openEditMode();
          this.loadWorkflowState();
          this.loadLatestInstance();
        } else {
          this.recordError = record.message ?? this.languageService.t('model.detail.recordNotFound');
        }

        this.loadChildren();
        // Note: partial record errors are no longer carried via route state — unsaved
        // rows stay in place in `state.staged` without ever leaving the page.
      },
      error: err => {
        this.loadingRecord = false;
        const e = err as { error?: { message?: string }; message?: string };
        this.recordError = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.recordLoadFailed');
      }
    });
  }

  private loadChildren(): void {
    this.loadingChildren = true;
    // Sub-model names come from the cache (RecordMetadataService; dropped on schema change) — previously
    // they were re-requested on every record open.
    this.metadata.childTypeNames$(this.typeName).pipe(markDirty(this.cdr)).subscribe({
      next: names => {
        this.loadingChildren = false;
        // A sub-model tab without read permission is not opened: the getall fetching its rows returns 403
        // and would throw the user from the record to /models. For admin the filter is always true.
        const readable = names.filter(name => this.permission.can(name, 'read'));
        if (readable.length) {
          this.childModelNames = readable;
          this.activeTab = readable[0];
          for (const name of readable) {
            const meta = this.allModels.find(m => m.typeName === name);
            const state = this.buildTabState(name, meta?.columns ?? []);
            this.tabStates.set(name, state);
            this.loadTabRows(state);
            this.loadTabColumnVisibility(state);
          }
        }
      },
      error: () => { this.loadingChildren = false; }
    });
  }

  /**
   * Prepares the sub tabs in new record mode — loads the schema, fetches no rows.
   * The user accumulates staged rows here; the FK is assigned at save time.
   */
  private loadChildrenForNew(): void {
    this.loadingChildren = true;
    this.publishedModel.getChildModels(this.typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loadingChildren = false;
        if (res.success && res.data?.length) {
          this.childModelNames = res.data;
          this.activeTab = res.data[0];
          for (const name of res.data) {
            const meta = this.allModels.find(m => m.typeName === name);
            const state = this.buildTabState(name, meta?.columns ?? []);
            // No data is fetched from the server in new record mode; rows stay empty
            this.tabStates.set(name, state);
            this.loadTabColumnVisibility(state);
          }
        }
      },
      error: () => { this.loadingChildren = false; }
    });
  }

  // ─── Parent record fields ───────────────────────────────────────────────────

  /** All columns of the parent record */
  get parentColumns(): PublishedColumn[] {
    return this.model?.columns ?? [];
  }

  /**
   * Columns to render in the form: filtered by the admin setting, but required
   * columns are always included — otherwise the form stays invalid and Save silently
   * does nothing because of the error in a hidden field. Requiredness is read from the schema rule
   * (see mustStayVisible): `isNullable` is always true for text/file columns.
   * Note: editForm is always built with ALL columns (openEditMode/buildNewForm); this getter
   * only filters rendering, it does not affect form integrity.
   */
  get visibleParentColumns(): PublishedColumn[] {
    if (!this.visibleParentColumnNames) return this.parentColumns;
    const visible = new Set(this.visibleParentColumnNames);
    // The step's columns to fill are always visible too: even if the admin hid them from the
    // detail view, the assignee cannot advance the step without filling that field.
    return this.parentColumns.filter(c =>
      mustStayVisible(c, this.parentRules.get(c.columnName)) || visible.has(c.columnName) || this.isStepColumn(c));
  }

  /** Column list for the column visibility popover — required fields cannot be hidden */
  get parentColumnVisibilityItems(): ColumnVisibilityItem[] {
    return this.parentColumns.map(c => ({
      name: c.columnName,
      required: mustStayVisible(c, this.parentRules.get(c.columnName))
    }));
  }

  /** The popover's current effective selection — all columns shown checked when there is no setting */
  get effectiveVisibleParentColumnNames(): string[] {
    return this.visibleParentColumnNames ?? this.parentColumns.map(c => c.columnName);
  }

  /** Loads the admin's saved detail-view column setting */
  private loadColumnVisibility(): void {
    const typeName = this.typeName;
    this.modelColumnSetting.get(typeName, 'detail').pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName) return; // another model may have been opened meanwhile
        this.visibleParentColumnNames = (res.success && res.data?.visibleColumns?.length)
          ? res.data.visibleColumns
          : null;
      },
      error: () => { /* if the setting cannot be loaded all columns stay visible */ }
    });
  }

  /** Saves the admin column visibility setting */
  onSaveColumnVisibility(names: string[]): void {
    this.savingColumnVisibility = true;
    const dto: ModelColumnSettingDto = { typeName: this.typeName, viewType: 'detail', visibleColumns: names };
    this.modelColumnSetting.set(dto).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.savingColumnVisibility = false;
        if (res.success) this.visibleParentColumnNames = names;
      },
      error: () => { this.savingColumnVisibility = false; }
    });
  }

  /** Returns the raw value of a given column from the record */
  recordRaw(col: PublishedColumn): unknown {
    if (!this.record) return null;
    return fieldValue(this.record, col.columnName);
  }

  /** Label to show in the UI — the admin-defined Label if any, otherwise the raw columnName. */
  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  /** Model name shown in the header — the model label (e.g. "Teklif"), otherwise the table name. */
  get modelTitle(): string {
    return this.model?.label?.trim() || this.typeName;
  }

  /** Name shown on the sub-model tab — its label if any, otherwise the table name. */
  childLabel(typeName: string): string {
    return this.allModels.find(m => m.typeName === typeName)?.label?.trim() || typeName;
  }

  // ─── Parent record form ─────────────────────────────────────────────────────

  /**
   * Loads the parent model's schema rules (regex/length/range) and rebuilds the form.
   * The rules come from the SAME source as backend `ValidateDynamicEntity` — so the
   * user sees errors under the field before anything reaches the server.
   */
  private loadParentRules(rebuild: () => void): void {
    this.metadata.rules$(this.typeName).pipe(markDirty(this.cdr)).subscribe(rules => {
      this.parentRules = rules;
      this.refreshLayoutInputs();
      rebuild();
    });
  }

  /** Validators of a parent-record column — based on the schema rule if any. */
  private parentValidators(col: PublishedColumn) {
    return validatorsFor(col, this.parentRules.get(col.columnName));
  }

  // ─── Auto value ─────────────────────────────────────────────────────────────

  /** Binds the columns' auto-value rules (from the schema) to the newly built form. */
  private bindAutoValues(isNew: boolean): void {
    this.autoValues?.stop();
    this.autoValues = null;
    if (!this.editForm) return;

    const plan = buildAutoValuePlan(this.parentColumns.map(col => {
      const rule = this.parentRules.get(col.columnName);
      return {
        name: col.columnName,
        dataType: col.dataType,
        autoValueTrigger: rule?.autoValueTrigger,
        autoValueExpression: rule?.autoValueExpression,
        isReadOnly: rule?.isReadOnly
      };
    }));
    if (plan.rules.length === 0) return;
    this.autoValues = new AutoValueFormBinding(this.editForm, plan, isNew).start();
  }

  /**
   * Reflects the values the server computed after saving (SEQ number, rules that run
   * on save and read-only rules) into the form. No request is sent when there are no rules.
   * Since openEditMode resets the message, the save result message is preserved.
   */
  private reloadAfterAutoValues(): void {
    if (!this.autoValues || this.recordId <= 0) return;
    const typeName = this.typeName;
    const id = this.recordId;

    this.publishedModel.get(typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId || !res.success || !res.data) return;
        const { editMsg, editOk } = this;
        this.record = res.data as DataRow;
        this.openEditMode();
        this.editMsg = editMsg;
        this.editOk = editOk;
      },
      error: () => { /* if unreadable, the (client) values in the form stay */ }
    });
  }

  /** Build the edit form from the existing record */
  openEditMode(): void {
    if (!this.model || !this.record) return;
    const build = () => {
      const controls: Record<string, unknown> = {};
      for (const col of this.parentColumns) {
        // If the raw ISO date value is bound directly, the datetime-local box silently
        // drops it and the field opens EMPTY; when touched, the browser writes the current time.
        const v = toInputValue(col.dataType, this.recordRaw(col)) ?? '';
        controls[col.columnName] = [v, this.parentValidators(col)];
      }
      this.editForm = this.fb.group(controls);
      this.bindAutoValues(false);
      // The form is REBUILT when the rules arrive; the lock must be applied on every build,
      // otherwise the second build clears the disabled state.
      this.applyWorkflowLock();
    };
    build();                          // keep the form usable until the rules arrive
    this.loadParentRules(build);      // rebuilt with validators once the rules arrive
    this.editMsg = null;
    this.editOk = null;
    this.showEditForm = true;
  }

  /** Build an empty form for new record mode */
  private buildNewForm(): void {
    const build = () => {
      // getRawValue: carry the values of read-only (disabled) auto fields too
      const previous = this.editForm?.getRawValue() ?? {};
      const controls: Record<string, unknown> = {};
      for (const col of this.parentColumns) {
        controls[col.columnName] = [previous[col.columnName] ?? '', this.parentValidators(col)];
      }
      this.editForm = this.fb.group(controls);
      // Opening rules write only to EMPTY fields — when the rules arrive and the form is
      // rebuilt, what the user has typed so far is not overwritten.
      this.bindAutoValues(true);
    };
    build();
    this.loadParentRules(build);
    this.editMsg = null;
    this.editOk = null;
    this.showEditForm = true;
  }

  /** Schema rules of the parent model — passed to the layout component (the reference changes when the rules arrive). */
  get parentRuleMap(): ReadonlyMap<string, PublishedColumnSchema> {
    return this.parentRules;
  }

  /** Auto-value rules bound to the form — passed to the layout component. */
  get autoValuesBinding(): AutoValueFormBinding | null {
    return this.autoValues;
  }

  /**
   * Query params of the designer link: open the design shown on screen (the server chose it by role)
   * — if the admin is looking at a role-specific design, edit that one rather than the default.
   */
  designQuery(typeName: string, view: 'form' | 'list'): Record<string, string | number | null> {
    return { view: view === 'list' ? 'list' : null, layout: this.metadata.publishedLayoutId(typeName, view) };
  }

  /** Designer link for admins (the "out of date" warning in the layout component); null for others. */
  get designLink(): string[] | null {
    return this.permission.isAdmin() ? ['/build', this.typeName, 'screen'] : null;
  }

  /**
   * Rebuilds the layout component's sets: step columns and columns that cannot be hidden.
   * Called when the rules, the model or the workflow state change.
   */
  private refreshLayoutInputs(): void {
    const byLower = new Map(this.parentColumns.map(c => [c.columnName.toLowerCase(), c.columnName]));
    const steps = new Set<string>();
    for (const task of this.myStepTasks) {
      for (const field of task.recordFields) {
        const name = byLower.get(field.column.toLowerCase());
        if (name) steps.add(name);
      }
    }
    this.stepColumnSet = steps;

    const forced = new Set(steps);
    for (const col of this.parentColumns) {
      if (mustStayVisible(col, this.parentRules.get(col.columnName))) forced.add(col.columnName);
    }
    this.forcedParentColumns = forced;
  }

  /**
   * Saves. If `startCode` is given ("{Akış} Başlat" / Start {workflow}), that workflow is started
   * after the record is FULLY written; on a save error the process does not start.
   */
  submitEdit(startCode?: string): void {
    if (!this.editForm || this.editForm.invalid || this.editLoading) {
      this.editForm?.markAllAsTouched();
      // The invalid field may be in a closed tab/section — so the user does not think "nothing happened".
      if (this.editForm?.invalid && !this.editLoading) this.recordLayout?.revealFirstInvalid();
      return;
    }
    this.pendingStart = startCode ?? null;
    this.editLoading = true;
    this.editMsg = null;
    this.editOk = null;
    // "On save" rules — the server recomputes them too; this is only for immediate display.
    this.autoValues?.runSave();

    if (this.isNew) {
      // New record: main record + the whole pending subtree in ONE request, ONE transaction.
      // The root does not exist yet → existingRootId null; the server generates and returns the IDs.
      this.saveTree(null);
    } else {
      if (this.recordLockedForUser) {
        // Record in an approval process: only the step's columns, written with task authority.
        this.saveStepFields();
        return;
      }

      // Update the existing record — stay on the page, show a success message
      const jsonData: DataRow = { ...sanitizePayload(this.parentColumns, this.editForm.getRawValue()), ID: this.recordId };
      this.publishedModel.update(this.typeName, jsonData).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.editOk = res.success;
          this.editMsg = res.message;
          if (res.success) {
            // Optimistically update the record, stay on the page
            this.record = { ...this.record, ...jsonData };
          }
          // If there are pending child records the same "Kaydet" (Save) sends them too. The root already exists:
          // it is passed via existingRootId, so the main record is NOT CREATED A SECOND TIME.
          if (this.totalStagedCount > 0 && res.success) {
            this.saveTree(this.recordId);
          } else {
            this.editLoading = false;
            if (res.success) this.editForm?.markAsPristine();
            this.afterSave(res.success);
          }
        },
        error: err => {
          this.editLoading = false;
          this.pendingStart = null;
          this.editOk = false;
          const e = err as { error?: { message?: string }; message?: string };
          this.editMsg = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.updateFailed');
        }
      });
    }
  }

  /**
   * Switches from "new record" mode to "edit" mode without reloading the page.
   *
   * If the route changed, the component would be recreated and the staged tree in memory lost —
   * which is exactly the data the user used to lose. So only the address bar is
   * updated (same pattern as the create → edit transition in table-detail).
   */
  private switchToEditMode(newId: number): void {
    this.isNew = false;
    this.recordId = newId;
    this.record = { ...(this.editForm?.getRawValue() ?? {}), ID: newId } as DataRow;
    this.location.replaceState(`/models/${this.typeName}/${newId}`);
  }

  /** Parent record delete awaiting confirmation; true means the dialog is open. */
  deleteRecordConfirmOpen = false;

  /** Delete the parent record — used only in existing-record mode */
  askDeleteRecord(): void {
    if (this.isNew || this.deleting) return;
    this.deleteRecordConfirmOpen = true;
  }

  cancelDeleteRecord(): void {
    this.deleteRecordConfirmOpen = false;
  }

  confirmDeleteRecord(): void {
    if (this.isNew || this.deleting) return;

    this.deleteRecordConfirmOpen = false;
    this.deleting = true;
    this.publishedModel.delete(this.typeName, this.recordId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.deleting = false;
        if (res.success) {
          this.router.navigate(['/models', this.typeName]);
        }
      },
      error: () => {
        this.deleting = false;
      }
    });
  }

  // ─── Tab management ─────────────────────────────────────────────────────────

  setTab(name: string): void {
    this.activeTab = name;
  }

  /** On narrow screens the tab bar scrolls horizontally (scrollbar hidden): the selected tab should not be half visible. */
  revealTab(event: Event): void {
    (event.currentTarget as HTMLElement | null)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  /** If one of the upcoming steps is overdue, a "Gecikmiş" (Overdue) badge is shown on the strip. */
  get hasOverdueStep(): boolean {
    return this.myStepTasks.some(task => task.isOverdue);
  }

  tabState(name: string): TabState | undefined {
    return this.tabStates.get(name);
  }

  tabRowCount(name: string): number {
    return this.tabStates.get(name)?.rows.length ?? 0;
  }

  // ─── Tab data ────────────────────────────────────────────────────────────────

  private buildTabState(typeName: string, columns: PublishedColumn[]): TabState {
    return {
      typeName,
      columns,
      fkColumn: fkColumnFor(this.typeName),
      rows: [],
      loading: false,
      error: null,
      staged: [],
      searchTerm: '',
      sortCol: 'ID',
      sortDir: 'asc',
      fileNames: {},
      selectedIds: new Set<number>(),
      selectedStaged: new Set<number>(),
      bulkErrors: [],
      bulkTotal: 0,
      visibleColumnNames: null,
      savingColumnVisibility: false,
      listLayout: null
    };
  }

  /**
   * Refreshes the SAVED rows from the server.
   *
   * `state.staged` (pending/failed rows) is NEVER cleared here — previously the
   * server response overwrote all rows and the unsaved record disappeared from the screen.
   */
  loadTabRows(state: TabState): void {
    if (this.isNew || !this.recordId) return;   // no parent record yet, so no rows to fetch either
    state.loading = true;
    state.error = null;
    this.publishedModel.getAll(state.typeName, state.fkColumn, this.recordId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        state.loading = false;
        state.rows = res.success ? (res.data ?? []) as DataRow[] : [];
        // Rows arrived: resolve the labels of this page's lookup FKs with one request
        // per column (the dropdown no longer keeps the full list).
        this.resolveLookupLabels(state.columns, state.rows);
        // Do not keep IDs of rows that no longer exist selected.
        const ids = new Set(state.rows.map(r => this.rowId(r)));
        state.selectedIds = new Set([...state.selectedIds].filter(id => ids.has(id)));
        if (!res.success) state.error = res.message ?? this.languageService.t('model.detail.recordsFetchFailed');
      },
      error: err => {
        state.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        state.error = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.recordsLoadFailed');
      }
    });
  }

  // ─── Tab filtering and sorting ───────────────────────────────────────────────

  /** Columns other than the FK column — used by the (add/edit) forms, NEVER filtered */
  visibleCols(state: TabState): PublishedColumn[] {
    return state.columns.filter(c => c.columnName !== state.fkColumn);
  }

  /**
   * Columns to show in the table: FK excluded + filtered by the admin setting.
   * Kept separate from `visibleCols` so form integrity is not affected — even if the admin
   * hides a column from the table view, that field does not disappear from the add/edit form.
   */
  displayCols(state: TabState): PublishedColumn[] {
    return this.tableColumns(state).cols;
  }

  /** Table headers — key is the data/sort key (raw columnName), label the displayed text. */
  tableHeaders(state: TabState): { key: string; label: string }[] {
    return this.tableColumns(state).headers;
  }

  /**
   * The tab's table columns, headers and column map — CACHED.
   *
   * The template used to call these INSIDE the row loop (every row, every cell), and since every
   * keystroke in the record form re-evaluates the whole template, a single key in a 300-row child
   * table meant hundreds of column resolutions and thousands of `columns.find` calls. While the inputs (layout,
   * columns, visibility setting, language) do not change, the same object is returned.
   */
  private tableColumns(state: TabState): TabColumnsMemo {
    const lang = this.languageService.lang();
    const memo = state.colsMemo;
    if (memo && memo.layout === state.listLayout && memo.columns === state.columns
        && memo.visible === state.visibleColumnNames && memo.lang === lang) {
      return memo;
    }

    // If a published list layout exists, order and visibility come from it (the FK column is never in this table).
    const cols = resolveListColumns(state.listLayout, this.visibleCols(state), state.visibleColumnNames)
      .map(r => r.column);
    state.colsMemo = {
      layout: state.listLayout,
      columns: state.columns,
      visible: state.visibleColumnNames,
      lang,
      cols,
      headers: [{ key: 'ID', label: 'ID' }, ...cols.map(c => ({ key: c.columnName, label: this.colLabel(c) }))],
      byName: new Map(state.columns.map(c => [c.columnName, c] as const)),
      searchable: cols.map(c => c.columnName)
    };
    return state.colsMemo;
  }

  /** Column list for the column visibility popover — no required-field enforcement in the sub-model table */
  tabColumnVisibilityItems(state: TabState): ColumnVisibilityItem[] {
    return this.visibleCols(state).map(c => ({ name: c.columnName, required: false }));
  }

  /** The popover's current effective selection — all columns shown checked when there is no setting */
  effectiveTabVisibleColumnNames(state: TabState): string[] {
    return state.visibleColumnNames ?? this.visibleCols(state).map(c => c.columnName);
  }

  /**
   * Loads the SAME column setting as the sub-model's own list page (`'list'` viewType) —
   * the admin picks a model's columns once, and wherever the model is listed
   * (its own list page + this tab of the parent record) it looks the same.
   */
  private loadTabColumnVisibility(state: TabState): void {
    this.modelColumnSetting.get(state.typeName, 'list').pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        state.visibleColumnNames = (res.success && res.data?.visibleColumns?.length)
          ? res.data.visibleColumns
          : null;
      },
      error: () => { /* if the setting cannot be loaded all columns stay visible */ }
    });
    // The list layout from the screen design replaces the "Kolonlar" (Columns) setting (null if unreadable).
    this.metadata.listLayout$(state.typeName).pipe(markDirty(this.cdr)).subscribe(layout => {
      state.listLayout = layout;
    });
  }

  /** Saves the admin column visibility setting for the sub-model table (updates the 'list' setting) */
  onSaveTabColumnVisibility(state: TabState, names: string[]): void {
    state.savingColumnVisibility = true;
    const dto: ModelColumnSettingDto = { typeName: state.typeName, viewType: 'list', visibleColumns: names };
    this.modelColumnSetting.set(dto).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        state.savingColumnVisibility = false;
        if (res.success) state.visibleColumnNames = names;
      },
      error: () => { state.savingColumnVisibility = false; }
    });
  }

  toggleSort(state: TabState, col: string): void {
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }
  }

  /**
   * Filtered + sorted rows. The computation lives in a pure function
   * (display-rows.util); only the cache is kept here.
   */
  getDisplayRows(state: TabState): DataRow[] {
    state.displayCache = selectDisplayRows(
      {
        rows: state.rows,
        searchTerm: state.searchTerm,
        sortCol: state.sortCol,
        sortDir: state.sortDir,
        searchableColumns: this.tableColumns(state).searchable,
        locale: this.languageService.lang()
      },
      state.displayCache
    );

    return state.displayCache.result;
  }

  /** Rows to render: the first `renderLimit` of the visible rows (counting and selection work on all). */
  renderedRows(state: TabState): DataRow[] {
    const rows = this.getDisplayRows(state);
    const limit = state.renderLimit ?? TAB_RENDER_STEP;
    if (rows.length <= limit) return rows;
    const cache = state.renderCache;
    if (cache && cache.source === rows && cache.limit === limit) return cache.result;
    state.renderCache = { source: rows, limit, result: rows.slice(0, limit) };
    return state.renderCache.result;
  }

  /** Number of rows not rendered (for the "Daha fazla göster" / Show more button). */
  hiddenRowCount(state: TabState): number {
    return Math.max(0, this.getDisplayRows(state).length - (state.renderLimit ?? TAB_RENDER_STEP));
  }

  showMoreRows(state: TabState): void {
    state.renderLimit = (state.renderLimit ?? TAB_RENDER_STEP) + TAB_RENDER_STEP;
  }

  rowId(row: DataRow): number {
    return Number(fieldValue(row, 'ID') ?? 0);
  }

  cellVal(row: DataRow, col: string): string {
    const v = fieldValue(row, col);
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  /** Display value for a table cell — lookup columns show the display value instead of the FK ID. */
  tabCellDisplay(state: TabState, row: DataRow, columnName: string): string {
    const col = this.tableColumns(state).byName.get(columnName);
    if (col?.dataType === 'lookup') {
      return this.lookupCellLabel(col, fieldValue(row, columnName));
    }
    return this.cellVal(row, columnName);
  }

  strVal(row: DataRow, col: string): string {
    const v = fieldValue(row, col);
    return typeof v === 'string' ? v : '';
  }

  // ─── Row selection (saved rows) ─────────────────────────────────────────────
  // Selection works over the VISIBLE rows that pass the search filter: when the user
  // says "select all" they mean what they see on screen, not the hidden rows.

  isRowSelected(state: TabState, row: DataRow): boolean {
    return state.selectedIds.has(this.rowId(row));
  }

  toggleRow(state: TabState, row: DataRow): void {
    const id = this.rowId(row);
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
  }

  selectedCount(state: TabState): number {
    return state.selectedIds.size;
  }

  allRowsSelected(state: TabState): boolean {
    const rows = this.getDisplayRows(state);
    return rows.length > 0 && rows.every(r => state.selectedIds.has(this.rowId(r)));
  }

  someRowsSelected(state: TabState): boolean {
    return state.selectedIds.size > 0 && !this.allRowsSelected(state);
  }

  toggleAllRows(state: TabState): void {
    const rows = this.getDisplayRows(state);
    if (this.allRowsSelected(state)) {
      for (const r of rows) state.selectedIds.delete(this.rowId(r));
    } else {
      for (const r of rows) state.selectedIds.add(this.rowId(r));
    }
  }

  // ─── Row selection (pending rows) ───────────────────────────────────────────

  isStagedSelected(state: TabState, node: StagedNode): boolean {
    return state.selectedStaged.has(node.localId);
  }

  toggleStaged(state: TabState, node: StagedNode): void {
    if (state.selectedStaged.has(node.localId)) state.selectedStaged.delete(node.localId);
    else state.selectedStaged.add(node.localId);
  }

  selectedStagedCount(state: TabState): number {
    return state.selectedStaged.size;
  }

  allStagedSelected(state: TabState): boolean {
    return state.staged.length > 0 && state.staged.every(n => state.selectedStaged.has(n.localId));
  }

  someStagedSelected(state: TabState): boolean {
    return state.selectedStaged.size > 0 && !this.allStagedSelected(state);
  }

  toggleAllStaged(state: TabState): void {
    if (this.allStagedSelected(state)) state.selectedStaged.clear();
    else state.staged.forEach(n => state.selectedStaged.add(n.localId));
  }

  // ─── Bulk delete / remove ───────────────────────────────────────────────────

  /** Target of the confirm dialog; null means the dialog is closed. */
  bulkState: TabState | null = null;
  /** 'saved' = delete from the server, 'staged' = remove from memory. */
  bulkMode: 'saved' | 'staged' = 'saved';
  bulkBusy = false;

  openBulkDelete(state: TabState): void {
    this.bulkState = state;
    this.bulkMode = 'saved';
  }

  openBulkRemoveStaged(state: TabState): void {
    this.bulkState = state;
    this.bulkMode = 'staged';
  }

  cancelBulk(): void {
    if (this.bulkBusy) return;
    this.bulkState = null;
  }

  get bulkTitle(): string {
    return this.languageService.t(
      this.bulkMode === 'staged' ? 'model.detail.bulkRemoveStagedTitle' : 'model.detail.bulkDeleteTitle'
    );
  }

  get bulkMessage(): string {
    if (!this.bulkState) return '';
    const count = this.bulkMode === 'staged'
      ? this.selectedStagedCount(this.bulkState)
      : this.selectedCount(this.bulkState);
    return this.languageService.t(
      this.bulkMode === 'staged' ? 'model.detail.bulkRemoveStagedMessage' : 'model.detail.bulkDeleteMessage',
      { count }
    );
  }

  /**
   * Applies the confirmed bulk operation.
   *
   * The server has NO bulk delete endpoint; each record is deleted one by one. Partial success is accepted:
   * deleted ones drop out of the list, the ones that could not be deleted STAY SELECTED and their errors
   * are summarized — so the user deals only with the problematic rows.
   */
  confirmBulk(): void {
    const state = this.bulkState;
    if (!state || this.bulkBusy) return;

    if (this.bulkMode === 'staged') {
      state.staged = state.staged.filter(n => !state.selectedStaged.has(n.localId));
      state.selectedStaged.clear();
      this.bulkState = null;
      return;
    }

    const ids = [...state.selectedIds];
    if (ids.length === 0) { this.bulkState = null; return; }

    this.bulkBusy = true;
    state.bulkErrors = [];
    state.bulkTotal = ids.length;

    forkJoin(
      ids.map(id =>
        this.publishedModel.delete(state.typeName, id).pipe(
          map(res => ({ id, ok: res.success, message: res.message })),
          catchError(err => of({ id, ok: false, message: this.errMsg(err) }))
        )
      )
    ).pipe(markDirty(this.cdr)).subscribe(results => {
      this.bulkBusy = false;
      this.bulkState = null;

      const failed = results.filter(r => !r.ok);
      state.selectedIds = new Set(failed.map(r => r.id));
      state.bulkErrors = failed.map(r => `ID:${r.id} — ${r.message}`);

      this.lookupLabels.invalidate(state.typeName);
      this.loadTabRows(state);
    });
  }

  // ─── Record pop-up (add/edit sub-model) ────────────────────────────────────
  // The inline form was removed: adding/editing is now done with app-record-form-dialog,
  // and that dialog also shows its own sub-models nested.

  /** New record for a sub-model — opens a node pending in memory, no HTTP. */
  openChildAdd(state: TabState): void {
    this.dialogTabName = state.typeName;
    this.dialogNode = createStagedNode(state.typeName, {});
    this.dialogIsEdit = false;
    this.dialogSavedId = null;
    this.dialogFkColumn = state.fkColumn;
    this.dialogOpen = true;
  }

  /** Edits a pending (unsaved or failed) row. */
  openStagedEdit(state: TabState, node: StagedNode): void {
    this.dialogTabName = state.typeName;
    this.dialogNode = node;
    this.dialogIsEdit = true;
    this.dialogSavedId = node.savedId;
    this.dialogFkColumn = state.fkColumn;
    this.dialogOpen = true;
  }

  /** Edits a row SAVED on the server — updated directly when the pop-up closes. */
  openSavedEdit(state: TabState, row: DataRow): void {
    const id = this.rowId(row);
    // The server row comes in camelCase; without reducing it to the schema names it cannot be
    // safely given to the form or the payload (see the normalizeRow doc).
    const node = createStagedNode(state.typeName, normalizeRow(state.columns, row));
    node.savedId = id;
    this.dialogTabName = state.typeName;
    this.dialogNode = node;
    this.dialogIsEdit = true;
    this.dialogSavedId = id;
    this.dialogFkColumn = state.fkColumn;
    this.dialogOpen = true;
  }

  /**
   * The pop-up said "Tamam" (OK). If a saved row was edited it is `update`d right away;
   * if it is a pending row it is only written to memory — the tree does not reach the
   * server until "Kaydet" (Save) is pressed on the parent model.
   */
  onRecordDialogSaved(node: StagedNode): void {
    const state = this.tabStates.get(this.dialogTabName);
    if (!state) { this.closeRecordDialog(); return; }

    if (this.dialogSavedId !== null) {
      const payload: DataRow = {
        ...sanitizePayload(state.columns, node.values),
        [state.fkColumn]: this.recordId,
        ID: this.dialogSavedId
      };
      const savedId = this.dialogSavedId;
      this.publishedModel.update(state.typeName, payload).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          if (res.success) {
            node.error = null;
            node.dirty = false;
            this.saveNewDescendants(state, node, savedId);
          } else {
            // Update rejected — move the row to the pending list so the values are not lost.
            node.error = res.message;
            this.addStaged(state, node);
          }
        },
        error: err => {
          node.error = this.errMsg(err);
          this.addStaged(state, node);
        }
      });
      this.closeRecordDialog();
      return;
    }

    this.addStaged(state, node);
    this.closeRecordDialog();
  }

  /**
   * After a saved row is updated, writes the new grandchild records ADDED to it in the
   * pop-up. `toTreeDto` does NOT re-ADD the root when `existingId` is set, it only
   * attaches the children under the existing record. No request is sent if there are no grandchildren.
   */
  private saveNewDescendants(state: TabState, node: StagedNode, savedId: number): void {
    // The root itself was just `update`d; only the grandchildren remain here.
    node.dirty = false;
    const hasNewChildren = [...node.children.values()].some(list => list.some(n => n.savedId === null));
    const updates = dirtyNodes(node);

    if (!hasNewChildren && updates.length === 0) {
      this.loadTabRows(state);
      return;
    }

    const requests: Observable<TreeStep>[] = [];
    if (hasNewChildren) {
      const dto = toTreeDto(node, t => this.columnsOf(t), savedId);
      requests.push(
        this.publishedModel.addTree(dto).pipe(
          map(res => ({ kind: 'tree', ok: res.success, message: res.message, data: res.data } as TreeStep)),
          catchError(err => of({ kind: 'tree', ok: false, message: this.errMsg(err) } as TreeStep))
        )
      );
    }
    requests.push(...this.updateRequests(updates));

    forkJoin(requests).pipe(markDirty(this.cdr)).subscribe(steps => {
      for (const step of steps) {
        if (step.kind === 'update' && step.node && step.ok) {
          step.node.error = null;
          step.node.dirty = false;
        }
      }
      const failed = steps.find(s => !s.ok);
      if (failed) {
        // Could not be written — move the row to the pending list so the input is not lost.
        node.error = failed.message;
        this.addStaged(state, node);
      }
      this.loadTabRows(state);
    });
  }

  /** Adds or updates the node in the tab's pending list. */
  private addStaged(state: TabState, node: StagedNode): void {
    const idx = state.staged.findIndex(n => n.localId === node.localId);
    if (idx >= 0) state.staged = state.staged.map(n => (n.localId === node.localId ? node : n));
    else state.staged = [...state.staged, node];
  }

  closeRecordDialog(): void {
    this.dialogOpen = false;
    this.dialogNode = null;
    this.dialogTabName = '';
    this.dialogIsEdit = false;
    this.dialogSavedId = null;
    this.dialogFkColumn = null;
  }

  /**
   * Number of rows to be WRITTEN to the server when "Kaydet" (Save) is pressed — the button label
   * and whether `submitEdit` calls `saveTree` depend on this value.
   *
   * Counting only the ones to add is not enough: a saved but modified (dirty) row
   * will be written as well. Because it was not counted before, when that was the only pending row
   * "Kaydet" sent no request at all.
   */
  get totalStagedCount(): number {
    let total = 0;
    for (const [, state] of this.tabStates) {
      for (const node of state.staged) {
        for (const n of flattenNodes(node)) {
          if (n.savedId === null || n.dirty) total++;
        }
      }
    }
    return total;
  }

  /** Whether any tab has a row with a save error. */
  get hasStagedErrors(): boolean {
    for (const [, state] of this.tabStates) {
      for (const node of state.staged) {
        if (node.error || treeHasErrors(node)) return true;
      }
    }
    return false;
  }

  // ─── Bulk save of the pending tree ─────────────────────────────────────────

  /**
   * Sends the main record and the whole pending subtree in ONE request.
   *
   * The server writes them all in ONE transaction and returns each node's REAL ID
   * (EF identity) — the client guesses no IDs. Previously, after adding a record the
   * list was fetched and `max(ID)` taken; with concurrent users this could attach
   * the child records to a FOREIGN parent record.
   *
   * "All or nothing" semantics: if even one field is invalid no record is created
   * and all errors are returned at once; pending rows stay on screen.
   *
   * @param existingRootId If set, the root is NOT re-ADDED (adding child records to an existing record).
   */
  private saveTree(existingRootId: number | null): void {
    // getRawValue: read-only (disabled) auto fields must be sent too; `.value` drops them.
    const rootNode = createStagedNode(this.typeName, this.editForm?.getRawValue() ?? {});
    for (const [childTypeName, state] of this.tabStates) {
      if (state.staged.length > 0) rootNode.children.set(childTypeName, state.staged);
    }

    // The root is never `dirty` here (just created) — the parent form has already sent its own
    // `update` in `submitEdit`; the updates here are only for the subtree.
    const updates = dirtyNodes(rootNode);

    // The tree request is sent only if there really is something to ADD; otherwise
    // the server would skip all nodes because of `existingId`, making it a wasted request.
    const treeNeeded = existingRootId === null || hasInserts(rootNode);

    const requests: Observable<TreeStep>[] = [];
    if (treeNeeded) {
      const dto = toTreeDto(rootNode, t => this.columnsOf(t), existingRootId);
      requests.push(
        this.publishedModel.addTree(dto).pipe(
          map(res => ({ kind: 'tree', ok: res.success, message: res.message, data: res.data } as TreeStep)),
          catchError(err => {
            const body = (err as { error?: { data?: TreeSaveResult; message?: string } })?.error;
            return of({ kind: 'tree', ok: false, message: this.errMsg(err), data: body?.data } as TreeStep);
          })
        )
      );
    }
    requests.push(...this.updateRequests(updates));

    if (requests.length === 0) {
      this.editLoading = false;
      return;
    }

    forkJoin(requests).pipe(markDirty(this.cdr)).subscribe(steps => {
      this.editLoading = false;

      const tree = steps.find(s => s.kind === 'tree');
      // Without a tree step the list is reset so errors from the previous round are not carried over.
      this.childSaveErrors = tree
        ? applyTreeResult(rootNode, tree.data ?? { savedIds: {}, errors: {} })
        : [];

      const { errors } = applyUpdateResults(steps);
      this.childSaveErrors = [...this.childSaveErrors, ...errors];

      const allOk = steps.every(s => s.ok);
      this.editOk = allOk;
      // With a tree step, its message; otherwise write only on error — otherwise the parent
      // record's own "updated" message (set in submitEdit) must not be overwritten.
      if (tree) this.editMsg = tree.message;
      else if (!allOk) this.editMsg = errors[0] ?? this.editMsg;

      // The root's real ID came from the server → switch to in-place edit mode.
      if (tree?.ok) {
        const rootId = existingRootId ?? tree.data?.savedIds?.[String(rootNode.localId)];
        if (rootId && this.isNew) this.switchToEditMode(rootId);
      }

      if (allOk) this.editForm?.markAsPristine();
      this.afterSave(allOk && !this.isNew);

      // Written rows drop out of the pending list; the ones that failed STAY WITH THEIR ERROR —
      // they are never silently removed, so the user can fix them and retry.
      for (const [, state] of this.tabStates) {
        if (state.staged.length === 0) continue;
        const remaining = state.staged.filter(n => n.savedId === null || n.error);
        if (remaining.length === state.staged.length) continue;
        state.staged = remaining;
        this.lookupLabels.invalidate(state.typeName);
        this.loadTabRows(state);
      }
    });
  }

  /**
   * Produces `update()` requests for the saved and modified nodes.
   *
   * `addTree` CANNOT UPDATE an existing record — it skips nodes with `existingId` — so the
   * user's correction on a saved row reaches the server only from here.
   */
  private updateRequests(nodes: StagedNode[]): Observable<TreeStep>[] {
    return nodes.map(node => {
      const payload: DataRow = {
        ...sanitizePayload(this.columnsOf(node.typeName), node.values),
        ID: node.savedId
      };
      return this.publishedModel.update(node.typeName, payload).pipe(
        map(res => ({ kind: 'update', ok: res.success, message: res.message, node } as TreeStep)),
        catchError(err => of({ kind: 'update', ok: false, message: this.errMsg(err), node } as TreeStep))
      );
    });
  }
  // ─── Form-based workflow ────────────────────────────────────────────────────

  /** Workflows startable on a new record; silently empty if the module is not installed. */
  private loadStartable(): void {
    const typeName = this.typeName;
    this.instanceService.startable(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName === this.typeName) this.newStartable = res.success ? res.data ?? [] : [];
      },
      error: () => { this.newStartable = []; }
    });
  }

  /** The record's process state (lock, step buttons, startable workflows). */
  private loadWorkflowState(): void {
    const typeName = this.typeName;
    const id = this.recordId;
    if (!id) return;

    this.instanceService.recordState(typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId) return;
        this.wfState = res.success ? res.data : null;
        this.refreshLayoutInputs();
        this.applyWorkflowLock();
      },
      // Module not installed / no permission: workflows are optional, the record screen works normally.
      error: () => {
        this.wfState = null;
        this.refreshLayoutInputs();
        this.applyWorkflowLock();
      }
    });
  }

  /** Applies the server's lock decision to the form (locked columns disabled). */
  private applyWorkflowLock(): void {
    const form = this.editForm;
    if (!form) return;

    const locked = lockedColumns(this.parentColumns, this.wfState);
    for (const col of this.parentColumns) {
      const control = form.get(col.columnName);
      if (!control) continue;
      // Read-only auto fields always stay disabled regardless of the lock.
      if (locked.has(col.columnName) || this.autoValues?.isReadOnly(col.columnName)) {
        control.disable({ emitEvent: false });
      } else if (control.disabled) {
        control.enable({ emitEvent: false });
      }
    }
  }

  /** The "{Akış} Başlat" (Start {workflow}) buttons in the header — startable on a new record, server state on a saved one. */
  get startableWorkflows(): StartableWorkflow[] {
    return this.isNew ? this.newStartable : this.wfState?.startable ?? [];
  }

  /** The user's pending steps on this record — the buttons next to Save. */
  get myStepTasks(): MyRecordTask[] {
    return this.wfState?.myTasks ?? [];
  }

  /** The record is in a process and the user cannot bypass the lock (not admin). */
  get recordLockedForUser(): boolean {
    return !!this.wfState?.isLocked && !this.wfState.canBypass;
  }

  /** Whether Save in the header is visible — when locked, only for admin or an assignee with step columns. */
  get canSaveRecord(): boolean {
    if (!this.editForm) return false;
    if (this.isNew) return this.permission.can(this.typeName, 'create');
    if (this.wfState?.isLocked) return this.wfState.canBypass || this.wfState.editableColumns.length > 0;
    return this.permission.can(this.typeName, 'update');
  }

  /** Add/edit/delete in the sub-model tabs — on a locked record only for admin. */
  canChild(typeName: string, action: 'create' | 'update' | 'delete'): boolean {
    return this.permission.can(typeName, action) && !this.recordLockedForUser;
  }

  /** Whether the column is a record field of one of the user's pending steps (highlight + visibility). */
  isStepColumn(col: PublishedColumn): boolean {
    const name = col.columnName.toLowerCase();
    return this.myStepTasks.some(t => t.recordFields.some(f => f.column.toLowerCase() === name));
  }

  approveLabelOf(task: MyRecordTask): string {
    return task.approveLabel?.trim() || task.stepName;
  }

  rejectLabelOf(task: MyRecordTask): string {
    return task.rejectLabel?.trim() || this.languageService.t('task.detail.reject');
  }

  /** "{Akış} Başlat" (Start {workflow}): saves first if needed, then starts. */
  onStartWorkflow(code: string): void {
    if (this.wfBusy || this.editLoading) return;

    // A new record must be created first; a changed record must be saved first (the process
    // must see the record's LATEST state). A record owner without update permission
    // cannot save but can start — the server checks ownership separately.
    const mustSave = this.isNew
      || (this.canSaveRecord && (!!this.editForm?.dirty || this.totalStagedCount > 0));

    if (mustSave) {
      this.submitEdit(code);
    } else {
      this.startWorkflow(code);
    }
  }

  /** The save finished; a pending "{Akış} Başlat" (Start {workflow}) is started now if any. */
  private afterSave(ok: boolean): void {
    const code = this.pendingStart;
    this.pendingStart = null;

    if (ok && code && this.recordId > 0) {
      this.startWorkflow(code);            // the record is re-read afterwards anyway
      return;
    }
    if (ok && !this.wfState && this.recordId > 0) {
      // The new record was just created: now the saved record's state (startable
      // workflows) can be read.
      this.loadWorkflowState();
    }
    if (ok) this.reloadAfterAutoValues();
  }

  private startWorkflow(code: string): void {
    this.wfBusy = 'start:' + code;

    this.instanceService.start({ entityType: this.typeName, entityId: this.recordId, code })
      .pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.wfBusy = null;
          if (res.success) {
            this.notification.success(res.message || this.languageService.t('workflow.panel.startSuccess'));
            this.refreshAfterWorkflow();
          } else {
            // The record was saved, the process did not start — the button stays visible, it can be retried.
            this.notification.warn(this.languageService.t('workflow.record.savedButStartFailed', {
              message: res.message ?? ''
            }));
            this.loadWorkflowState();
          }
        },
        error: err => {
          this.wfBusy = null;
          this.notification.warn(this.languageService.t('workflow.record.savedButStartFailed', {
            message: this.errMsg(err)
          }));
          this.loadWorkflowState();
        }
      });
  }

  /** Save on a record in an approval process: only the step's columns, without advancing the step. */
  private saveStepFields(): void {
    const state = this.wfState;
    if (!this.editForm || !state) {
      this.editLoading = false;
      return;
    }

    const values = buildRecordValues(state.editableColumns, this.editForm.getRawValue(), this.parentColumns);
    // Computed fields that are not step columns are not sent; the server computes them itself.

    this.taskService.saveRecord({
      entityType: this.typeName,
      entityId: this.recordId,
      recordValuesJson: JSON.stringify(values)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.editLoading = false;
        this.pendingStart = null;
        this.editOk = res.success;
        this.editMsg = res.message;
        if (res.success) {
          this.record = { ...this.record, ...values };
          this.editForm?.markAsPristine();
          this.reloadAfterAutoValues();
        }
      },
      error: err => {
        this.editLoading = false;
        this.pendingStart = null;
        this.editOk = false;
        this.editMsg = this.errMsg(err);
      }
    });
  }

  /**
   * Step button. When advancing, the step's required record fields and the form's validity
   * are checked first; if there are no extra decision fields it is sent WITHOUT AN INTERMEDIATE DIALOG.
   * Rejection always opens a dialog (so a note can be written and the unsaved-changes warning shows).
   */
  onStepAction(task: MyRecordTask, decision: 'approve' | 'reject'): void {
    if (this.wfBusy || this.editLoading) return;

    if (decision === 'approve') {
      const raw = (this.editForm?.getRawValue() ?? {}) as DataRow;
      const missing = missingRequired(task.recordFields, raw, this.parentColumns);

      if (missing.length > 0) {
        for (const name of missing) {
          const control = this.editForm?.get(name);
          control?.setErrors({ ...(control.errors ?? {}), required: true });
          control?.markAsTouched();
        }
        const labels = missing.map(name => {
          const col = this.parentColumns.find(c => c.columnName === name);
          return col ? this.colLabel(col) : name;
        });
        this.editOk = false;
        this.editMsg = this.languageService.t('workflow.record.requiredForStep', { fields: labels.join(', ') });
        this.recordLayout?.revealFirstInvalid();
        return;
      }

      if (this.editForm?.invalid) {
        this.editForm.markAllAsTouched();
        this.recordLayout?.revealFirstInvalid();
        return;
      }

      if (!task.hasExtraFields) {
        this.completeStep(task, 'approve', { comment: null, formDataJson: null });
        return;
      }
    }

    this.actionDialog = { task, decision, error: null };
  }

  onActionConfirmed(result: TaskActionResult): void {
    if (this.actionDialog) this.completeStep(this.actionDialog.task, this.actionDialog.decision, result);
  }

  closeActionDialog(): void {
    if (!this.wfBusy) this.actionDialog = null;
  }

  /**
   * The record's newest process — the "Akışı görüntüle" (View workflow) button in the header. The list
   * is filtered on the server (IWorkflowAccessPolicy) and newest comes first; empty if the module
   * is not installed or the user cannot see it, and then the button does not appear.
   */
  private loadLatestInstance(): void {
    const typeName = this.typeName;
    const id = this.recordId;
    if (!id) return;

    this.instanceService.forEntity(typeName, id, true).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId) return;
        this.latestInstanceId = res.success ? res.data?.[0]?.id ?? null : null;
      },
      error: () => { this.latestInstanceId = null; }
    });
  }

  openWorkflowView(instanceId: number): void {
    this.viewInstanceId = instanceId;
  }

  closeWorkflowView(): void {
    this.viewInstanceId = null;
  }

  /** Dialog title/button — the step's relevant label. */
  get actionDialogLabel(): string {
    const dialog = this.actionDialog;
    if (!dialog) return '';
    return dialog.decision === 'approve' ? this.approveLabelOf(dialog.task) : this.rejectLabelOf(dialog.task);
  }

  /** Closes the task; when advancing, the step's record fields go in the SAME request (one transaction). */
  private completeStep(task: MyRecordTask, decision: 'approve' | 'reject', extra: TaskActionResult): void {
    this.wfBusy = decision + ':' + task.taskId;
    this.editMsg = null;

    // Rejection does not write to the record (neither does the server) — sending values would be misleading.
    const recordValuesJson = decision === 'approve' && task.recordFields.length > 0
      ? JSON.stringify(buildRecordValues(
          task.recordFields.map(f => f.column),
          (this.editForm?.getRawValue() ?? {}) as DataRow,
          this.parentColumns))
      : null;

    this.taskService.complete({
      taskId: task.taskId,
      decision,
      comment: extra.comment,
      formDataJson: extra.formDataJson,
      recordValuesJson
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.wfBusy = null;
        if (res.success) {
          this.actionDialog = null;
          this.notification.success(res.message || this.languageService.t('workflow.record.stepDone'));
          this.refreshAfterWorkflow();
        } else {
          this.showStepError(res.message ?? this.languageService.t('task.detail.submitFailed'));
        }
      },
      error: err => {
        this.wfBusy = null;
        this.showStepError(this.errMsg(err));
      }
    });
  }

  private showStepError(message: string): void {
    if (this.actionDialog) {
      this.actionDialog = { ...this.actionDialog, error: message };
    } else {
      this.editOk = false;
      this.editMsg = message;
    }
  }

  /**
   * After a start/step: the record (workflow and fields changed), the process state and the newest
   * process ("Akışı görüntüle" / View workflow) are re-read. The form is rebuilt from the record; the lock is applied per the new state.
   */
  private refreshAfterWorkflow(): void {
    const typeName = this.typeName;
    const id = this.recordId;

    this.loadWorkflowState();
    this.loadLatestInstance();

    this.publishedModel.get(typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId) return;
        if (res.success && res.data) {
          this.record = res.data as DataRow;
          this.openEditMode();
        }
      },
      error: () => { /* if the record cannot be read the current form stays; the state was refreshed anyway */ }
    });
  }

  /** A type's columns (for payload sanitization). */
  private columnsOf(typeName: string): PublishedColumn[] {
    return this.allModels.find(m => m.typeName === typeName)?.columns ?? [];
  }

  private errMsg(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    return e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.operationFailed');
  }

  /** Cell value of a pending row to show in the table. */
  stagedCell(node: StagedNode, columnName: string): string {
    const v = fieldValue(node.values, columnName);
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  /** Total number of records in a pending row's own subtree (for the badge). */
  stagedChildTotal(node: StagedNode): number {
    return treePendingCount(node);
  }
}
