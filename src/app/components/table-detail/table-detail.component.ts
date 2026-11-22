import '../../i18n/lazy/datatype-help'; // the help.* dictionary is loaded with this chunk
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, ViewChild, inject, OnDestroy, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ReactiveFormsModule, AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { from, concatMap, switchMap, throwError, of, catchError } from 'rxjs';
import {
  AddMemberRequest, PublishedTableService, PublishedColumnSchema, PublishedTableRow, PublishedTableSchema
} from '../../services/published-table.service';
import { RecordMetadataService } from '../../services/record-metadata.service';
import {
  AUTO_VALUE_TRIGGERS, AutoValueColumn, AutoValueTrigger, RuleIssue, buildAutoValuePlan
} from '../../utils/auto-value/auto-value';
import { parseExpression, usesSequence } from '../../utils/auto-value/expression';
import { PublishedModelService } from '../../services/published-model.service';
import { ModelNodeComponent, MAX_DEPTH } from '../model-node/model-node.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HelpHintComponent } from '../shared/help-hint/help-hint.component';
import { DatatypeHelpComponent } from '../shared/datatype-help/datatype-help.component';
import { HelpTopicId } from '../shared/datatype-help/datatype-help.data';
import { RegexPreset } from '../shared/datatype-help/regex-presets';
import { RelationshipType } from '../../models/relationship.model';
import { RelationshipsTabComponent } from './relationships/relationships-tab.component';
import { markDirty } from '../../utils/change-detection';
import {
  FILE_TYPE_GROUPS, FileTypeGroup, MIN_FILE_LIMIT_MB, fileLimitMbValidator, formatFileSize, isFileType, joinFileGroups,
  kbToMb, maxFileKbFor, maxFileMbFor, parseFileGroups
} from '../../utils/file-size';
import {
  MetadataColumn, NUMERIC_COLUMN_TYPES, autoValueKey, isTextColumn, metadataKey, normalizeColumnRules, requiredChangeAllowed,
  schemaMetadataKey, toMemberMetadataUpdate
} from '../../utils/column-rules';
import {
  IDENTIFIER_MAX_LENGTH, IdentifierContext, IdentifierKind, LABEL_MAX_LENGTH, LabelNameSync,
  identifierErrorMessage, identifierValidator, revalidateIdentifiers, sanitizeIdentifierInputEvent
} from '../../utils/identifier';
import { IconComponent } from '../shared/icon/icon.component';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';
import { ModelIconPickerComponent } from '../shared/model-icon/model-icon-picker.component';
import { NotificationService } from '../../services/notification.service';

/** Tabs on the screen. */
type TabId = 'columns' | 'subModels' | 'relationships';

/** /Published/getAll row — to build the model tree (parent/depth). */
type TableRow = PublishedTableRow;

/** Diff baseline of a saved column in edit mode. */
interface ColumnDisplayMeta {
  /** Saved type — locked; if it changed anyway the save stops (it is not silently dropped). */
  dataType: string;
  /**
   * Label, description, requiredness and rules — if changed, written in a single request via
   * updateMemberMetadata. Previously only label/description were written; requiredness and rules were silently dropped.
   */
  metadataKey: string;
  /** Auto-value rule (trigger|formula|read-only) — written via setMemberAutoValue if changed. */
  autoValueKey: string;
  /** Saved enum values and requiredness — for the warnings in the popup. */
  enumValues: string;
  isRequired: boolean;
}

/** Diff baseline of the (saved) column in the form. */
function columnMetaOf(c: MetadataColumn & { enumValues?: string | null }): ColumnDisplayMeta {
  return {
    dataType: c.dataType,
    metadataKey: metadataKey(c),
    autoValueKey: autoValueKey(c),
    enumValues: c.enumValues ?? '',
    isRequired: !c.isNullable
  };
}

/** Flattened node data used in the save flow */
interface TreeNode {
  entityName: string;
  /** User-friendly model name (PublishedTable.Label). */
  label: string | null;
  parentName: string | null;
  columns: {
    columnName: string;
    dataType: string;
    isNullable: boolean;
    minLength?: number | null;
    maxLength?: number | null;
    min?: number | null;
    max?: number | null;
    regex?: string;
    regexMessage?: string;
    enumValues?: string;
    lookupTargetTable?: string;
    lookupDisplayColumn?: string;
    label?: string;
    description?: string;
    autoValueTrigger?: string;
    autoValueExpression?: string;
    isReadOnly?: boolean;
  }[];
}

type TreeColumn = TreeNode['columns'][number];

/** Converts a designer column value into the input of the auto-value planner. */
function toAutoValueColumn(c: {
  columnName: string; dataType: string;
  autoValueTrigger?: string | null; autoValueExpression?: string | null; isReadOnly?: boolean | null;
}): AutoValueColumn {
  return {
    name: c.columnName,
    dataType: c.dataType,
    autoValueTrigger: c.autoValueTrigger,
    autoValueExpression: c.autoValueExpression,
    isReadOnly: c.isReadOnly
  };
}

/** Placeholder name used in the planner while a draft column has no name yet. */
const DRAFT_COLUMN = '__draft__';

/** "Tarih + sıra no" (Date + sequence no) template — e.g. 25092026-001; the counter resets every day. */
const SEQUENCE_TEMPLATE = "TODAY('ddMMyyyy') & '-' & SEQ(3, TODAY('ddMMyyyy'))";

/**
 * TableDetailComponent — create/edit screen of a table (model).
 * `/build/new` (new) and `/build/:typeName` (edit) use this component
 * (see the same "new fixed segment, data.mode" pattern as model-detail/role-detail).
 *
 * Columns are shown in the same style as the sub-model tab view in model-detail
 * ("Sütunlar" (Columns) panel + data table); adding/editing is done via a popup
 * (modal) and changes are kept only in memory (FormArray) —
 * nothing goes to the backend until "Kaydet" (Save) at the top right is pressed.
 *
 * Real nested sub-models (subModels) are not surfaced on this screen; the data
 * flow (flattenTree/saveNode$) is kept for backward compatibility.
 */
@Component({
    selector: 'app-table-detail',
    imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    ModelNodeComponent,
    HelpHintComponent,
    DatatypeHelpComponent,
    RelationshipsTabComponent,
    IconComponent,
    ModelIconComponent,
    ModelIconPickerComponent
],
    templateUrl: './table-detail.component.html',
    styleUrls: ['./table-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableDetailComponent implements OnDestroy {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(NotificationService);

  /**
   * Model icon (PublishedTable.Icon, migration 025). Does not touch the schema: on an unsaved model it is
   * written with addTable, on a saved model via setTableIcon as soon as it is picked; Publish also asks for it.
   */
  modelIcon: string | null = null;
  /** Icon on the server — written only if changed. */
  private originalIcon: string | null = null;
  /** Mode of the open icon picker; null = closed. */
  iconPickerMode: 'publish' | 'select' | null = null;
  iconSaving = false;

  /** Root model FormGroup — entityName + columns + subModels */
  rootGroup: FormGroup;

  // Feedback messages
  submitMessage: string | null = null;
  submitSuccess: boolean | null = null;

  // Per-step loading flags
  isSaving = false;
  isPublishing = false;

  /**
   * Save state — mandatory business rule:
   *   "An unsaved model cannot be published."
   *   Any form edit resets this flag.
   */
  isSaved = false;
  savedRootName: string | null = null;

  /** Whether this is new (route data: { mode: 'new' }) or editing an existing model. */
  isNew = false;
  editTypeName: string | null = null;
  isLoadingSchema = false;
  loadError: string | null = null;

  /** For the diff in edit mode: column names in the loaded schema */
  private originalColumnNames = new Set<string>();

  /** For the diff in edit mode: the saved model label and the columns' label/description. */
  private originalLabel: string | null = null;
  private originalColumnMeta = new Map<string, ColumnDisplayMeta>();

  /**
   * If this model is a sub-model, the parent model's name — since the `{Parent}Id` FK column is
   * generated by the system, no column can be created with that name. null for a root model and in create mode.
   */
  private ownParentName: string | null = null;

  // ─── Label → name sync ──────────────────────────────────────────────────────

  readonly IDENTIFIER_MAX_LENGTH = IDENTIFIER_MAX_LENGTH;
  readonly LABEL_MAX_LENGTH = LABEL_MAX_LENGTH;
  readonly identifierErrorMessage = identifierErrorMessage;
  readonly isFileType = isFileType;
  readonly FILE_TYPE_GROUPS = FILE_TYPE_GROUPS;
  readonly isTextColumn = isTextColumn;
  readonly maxFileMbFor = maxFileMbFor;
  readonly MIN_FILE_LIMIT_MB = MIN_FILE_LIMIT_MB;

  /** Model label → table name. Refreshed whenever rootGroup is rebuilt. */
  private rootNameSync?: LabelNameSync;
  /** Label → field name in the column popup. Released when the popup closes. */
  private draftNameSync?: LabelNameSync;

  /** To update the address bar without reloading the page (create → edit transition). */
  private readonly location = inject(Location);

  private formChangeSub?: Subscription;
  private paramSub?: Subscription;

  /** Target model options for the lookup column type (all saved tables — draft + published). */
  availableTables: string[] = [];

  // ─── Sub-models tab ─────────────────────────────────────────────────────────

  /** Raw /Published/getAll rows — the sub-model tree, table ID and depth are derived from here. */
  private allTables: TableRow[] = [];

  /** SAVED sub-models of this model. Each one is edited from its own /build/:typeName screen. */
  subModelRows: TableRow[] = [];

  /** Depth of this model in the tree (root = 1). Assumed root if not saved. */
  ownTableDepth = 1;
  /** lookupTargetTable → the target table's column names (for the display column choice, lazy-loaded). */
  lookupColumnsByTable: Partial<Record<string, string[]>> = {};
  private lookupColumnsLoading = new Set<string>();

  // ─── Column popup ───────────────────────────────────────────────────────────

  columnModalOpen = false;
  /** null = a new column is being added; a number means the column at that index is being edited. */
  editingColumnIndex: number | null = null;
  columnDraft: FormGroup;

  /** Dropdown options — value is the key sent to the backend, label the name shown to the user. */
  primitiveTypes: { value: string; label: string }[] = [
    { value: 'string',   label: 'String' },
    { value: 'text',     label: 'Text' },
    { value: 'int',      label: 'Int' },
    { value: 'long',     label: 'Long' },
    { value: 'short',    label: 'Short' },
    { value: 'byte',     label: 'Byte' },
    { value: 'decimal',  label: 'Decimal' },
    { value: 'double',   label: 'Double' },
    { value: 'float',    label: 'Float' },
    { value: 'boolean',  label: 'Bool' },
    { value: 'datetime', label: 'DateTime' },
    { value: 'timeonly', label: 'TimeOnly' },
    { value: 'dateonly', label: 'DateOnly' },
    { value: 'guid',     label: 'Guid' }
  ];

  referenceTypes: { value: string; label: string }[] = [
    { value: 'lookup', label: 'Lookup' },
    { value: 'enum',   label: 'Enum' },
    { value: 'image',  label: 'Image' },
    { value: 'file',   label: 'File' }
  ];

  /** Types for which the numeric rule fields (Min/Max) are shown. */
  private readonly numericTypes = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

  // ─── Data type / rule guide ─────────────────────────────────────────────────

  /**
   * Guide dialog — opened by the "Veri Tipi" (Data type) button in the column popup, the
   * "İlişki Tipi" (Relationship type) button in the relationship popup and the "i" buttons in the tab toolbars.
   * Opens ON TOP of the other popups; it has its own ESC/backdrop handling.
   */
  helpOpen = signal(false);
  helpTopic = signal<HelpTopicId>('string');

  // ─── G1: Relationships tab ──────────────────────────────────────────────────
  //
  // The whole lifecycle of relationships lives in RelationshipsTabComponent. Here
  // only the context passed to the tab and the summary state needed for the
  // badge in the tab bar are kept.

  private readonly publishedModelService = inject(PublishedModelService);
  /** So that open record forms do not keep using the old rule after a rule is saved. */
  private readonly recordMetadata = inject(RecordMetadataService);

  @ViewChild(RelationshipsTabComponent) private relationshipsTab?: RelationshipsTabComponent;

  /** Active tab — "Sütunlar" (Columns), "Alt Modeller" (Sub-models) or "İlişkiler" (Relationships). */
  activeTab = signal<TabId>('columns');

  /**
   * The source model's PublishedTable.ID value. It is the route parameter of the
   * relationship endpoints. In new model mode it is null until the first save completes.
   */
  relationshipTableId: number | null = null;

  /** Autocomplete source — only PUBLISHED models (drafts excluded). */
  publishedModelNames: string[] = [];

  /** Tab badge: relationship count and graph validity (comes from the tab). */
  relationshipCount = 0;
  relationshipsValid = true;

  constructor(
    private fb: FormBuilder,
    private publishedTableService: PublishedTableService,
    private router: Router,
    private route: ActivatedRoute,
    private languageService: LanguageService
  ) {
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    this.columnDraft = this.buildColumnDraft();

    if (this.isNew) {
      // Create mode — name and label start empty; the name is generated as the label is typed
      this.rootGroup = this.buildRootGroup('', '');
      this.trackFormChanges();
    } else {
      // Edit mode — start with an empty placeholder, replaced once the schema loads
      this.editTypeName = this.route.snapshot.paramMap.get('typeName');
      this.rootGroup = this.buildRootGroup(this.editTypeName ?? '', '');
      this.trackFormChanges();
      if (this.editTypeName) {
        this.loadForEdit(this.editTypeName);
      }
    }

    // Single request: lookup targets + sub-model tree + relationship table ID.
    this.loadTables();
    this.loadPublishedModelNames();

    // On a /build/:typeName → /build/:typeName transition (clicking a sub-model row)
    // Angular does not recreate the component; the parameter stream is listened to.
    this.paramSub = this.route.paramMap.pipe(markDirty(this.cdr)).subscribe(params => {
      const typeName = params.get('typeName');
      if (!typeName || typeName === this.editTypeName) return;
      this.reinitForEdit(typeName);
    });
  }

  ngOnDestroy(): void {
    this.formChangeSub?.unsubscribe();
    this.paramSub?.unsubscribe();
    this.rootNameSync?.unsubscribe();
    this.draftNameSync?.unsubscribe();
  }

  // ─── Form setup ─────────────────────────────────────────────────────────────

  /**
   * The root model FormGroup. Create, edit and switching to a sub-model all go through
   * the same factory — the validators live in one place.
   *
   * The model name must not clash with existing tables; in edit mode the name is locked
   * (disabled) so it is not validated — the check is only meaningful on create.
   */
  private buildRootGroup(entityName: string, label: string, columns: FormGroup[] = []): FormGroup {
    return this.fb.group({
      label:      [label, [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)]],
      entityName: [entityName, [
        Validators.required,
        identifierValidator('model', () => ({ taken: this.isNew ? this.availableTables : [] }))
      ]],
      columns:    this.fb.array(columns),
      subModels:  this.fb.array([])
    });
  }

  /** Draft of the column popup — not attached to the tree, so the context is supplied from outside. */
  private buildColumnDraft(): FormGroup {
    return ModelNodeComponent.buildColumnGroupStatic(this.fb, () => this.columnDraftContext());
  }

  /** What the popup's column must not clash with: other columns, the model name, the parent FK column. */
  private columnDraftContext(): IdentifierContext {
    // The draft is built in the constructor before rootGroup and the validator runs immediately.
    if (!this.rootGroup) return {};
    return {
      taken: this.columns.controls
        .filter((_, i) => i !== this.editingColumnIndex)
        .map(c => c.get('columnName')!.value),
      modelName: this.entityNameCtrl.value,
      parentName: this.ownParentName
    };
  }

  /** Turkish characters/spaces are stripped instantly while typing in the name field. */
  onNameInput(event: Event, control: AbstractControl, kind: IdentifierKind): void {
    sanitizeIdentifierInputEvent(event, control, kind);
  }

  /** The "↺ Etiketten üret" (Generate from label) action for the table name. */
  regenerateEntityName(): void {
    this.rootNameSync?.regenerate();
  }

  /** The "↺ Etiketten üret" (Generate from label) action in the column popup. */
  regenerateColumnName(): void {
    this.draftNameSync?.regenerate();
  }

  /** Whether the column edited in the popup is saved in the database (if so its name is locked). */
  get isEditingPersistedColumn(): boolean {
    return this.columnDraft.get('columnName')!.disabled;
  }

  /** Whether the edited model is published (a compiled class + SQL table exist). */
  get isModelPublished(): boolean {
    return !!this.editTypeName && this.publishedModelNames.includes(this.editTypeName);
  }

  /** Saved metadata of the saved column in the popup (null for a new column). */
  private get draftOriginalMeta(): ColumnDisplayMeta | null {
    if (!this.isEditingPersistedColumn) return null;
    return this.originalColumnMeta.get(this.columnDraft.getRawValue().columnName) ?? null;
  }

  /** Whether the required checkbox is locked because it is a value type on a published model. */
  get draftRequiredLocked(): boolean {
    return this.isEditingPersistedColumn && this.columnDraft.get('isNullable')!.disabled;
  }

  /** An optional field is being made required on a published model — empty old records get stuck when edited. */
  get draftRequiredTightened(): boolean {
    const original = this.draftOriginalMeta;
    return !!original && this.isModelPublished && !original.isRequired && !this.columnDraft.getRawValue().isNullable;
  }

  /** An enum value is being removed — records carrying that value become invalid on their next edit. */
  get draftEnumShrinks(): boolean {
    const original = this.draftOriginalMeta;
    if (!original || original.dataType !== 'enum') return false;
    const next = new Set(String(this.columnDraft.getRawValue().enumValues ?? '').split('|').map(s => s.trim()).filter(Boolean));
    return original.enumValues.split('|').map(s => s.trim()).filter(Boolean).some(v => !next.has(v));
  }

  /** Screen design only makes sense for a published model: record screens draw the compiled type. */
  get screenDesignTypeName(): string | null {
    const name = this.editTypeName;
    return name && this.publishedModelNames.includes(name) ? name : null;
  }

  /** Name shown in the header: the saved label, otherwise the table name. */
  get displayModelName(): string {
    return (this.originalLabel ?? '').trim() || this.editTypeName || '';
  }

  // ─── G1: Tab management ─────────────────────────────────────────────────────

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  // ─── Sub-models tab ─────────────────────────────────────────────────────────

  /** Sub-model FormGroups added in this session (not yet saved). */
  get subModels(): FormArray {
    return this.rootGroup.get('subModels') as FormArray;
  }

  getSubModelGroup(index: number): FormGroup {
    return this.subModels.at(index) as FormGroup;
  }

  /**
   * Adds a new sub-model draft. Saving is done together with the root model via the
   * "Kaydet" (Save) button (flattenTree → saveNode$ → addTable(parentTableName)).
   */
  addSubModel(): void {
    if (!this.canAddSubModel) return;
    this.subModels.push(ModelNodeComponent.buildModelGroupStatic(this.fb));
  }

  removeSubModel(index: number): void {
    this.subModels.removeAt(index);
  }

  /** Bound in the template as [onRemoveSelf]="removeSubModelFn($index)". */
  removeSubModelFn(index: number): () => void {
    return () => this.removeSubModel(index);
  }

  /**
   * Whether a sub-model can be added: the model tree has at most MAX_DEPTH levels
   * (backend PublishedTableManager.Add rejects a record with Depth > 4).
   */
  get canAddSubModel(): boolean {
    return this.ownTableDepth < MAX_DEPTH;
  }

  /** Tab badge: saved + unsaved sub-model count. */
  get subModelCount(): number {
    return this.subModelRows.length + this.subModels.length;
  }

  /** Opens a saved sub-model in its own edit screen. */
  openSubModel(typeName: string): void {
    this.router.navigate(['/build', typeName]);
  }

  /**
   * When only the parameter changes on the same route (sub-model to sub-model transition)
   * Angular does NOT RECREATE the component — it reuses the route. Since screen setup
   * is done in the constructor from the snapshot, it is refreshed manually here.
   */
  private reinitForEdit(typeName: string): void {
    this.isNew        = false;
    this.editTypeName = typeName;

    // Reset the save/publish state — the new model's own state applies.
    this.isSaved             = false;
    this.savedRootName       = null;
    this.submitMessage       = null;
    this.submitSuccess       = null;
    this.loadError           = null;
    // The relationship state lives in the tab itself; nulling the ID and emptying the tab
    // is enough — once the new table ID is resolved the tab loads its list itself.
    this.relationshipTableId = null;
    this.relationshipCount   = 0;
    this.relationshipsValid  = true;
    this.relationshipsTab?.reset();
    this.subModelRows        = [];
    this.originalColumnNames = new Set<string>();
    this.originalColumnMeta  = new Map<string, ColumnDisplayMeta>();
    this.originalLabel       = null;
    this.modelIcon           = null;
    this.originalIcon        = null;
    this.iconPickerMode      = null;
    this.ownParentName       = null;
    this.activeTab.set('columns');

    this.rootGroup = this.buildRootGroup(typeName, '');
    this.trackFormChanges();

    this.loadForEdit(typeName);
    this.loadTables();
  }

  // ─── G1: Relationship data loading ──────────────────────────────────────────

  /** Loads only the published model names for the autocomplete. */
  private loadPublishedModelNames(): void {
    this.publishedModelService.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.publishedModelNames = res.success ? (res.data ?? []).map(m => m.typeName) : [];
      },
      error: () => { this.publishedModelNames = []; }
    });
  }

  /**
   * Reads all saved tables in ONE request and feeds three things at once:
   *   1. availableTables  → target list of lookup columns
   *   2. subModelRows / ownTableDepth → the "Alt Modeller" (Sub-models) tab
   *   3. relationshipTableId → the route parameter of the relationship endpoints
   *
   * If the model is not saved yet (create mode) 2 and 3 stay empty; it is called again
   * after the first save.
   */
  private loadTables(): void {
    this.publishedTableService.getAllTables().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.allTables = res.success ? (res.data ?? []) : [];
        this.availableTables = this.allTables.map(t => t.tableName);
        this.refreshOwnTableContext();
      },
      error: () => {
        this.allTables = [];
        this.availableTables = [];
        this.subModelRows = [];
      }
    });
  }

  /**
   * Finds this model's row in the loaded table list; derives its sub-models,
   * depth and relationship table ID.
   */
  private refreshOwnTableContext(): void {
    const typeName = this.editTypeName;
    if (!typeName) {
      this.subModelRows = [];
      this.ownTableDepth = 1;
      return;
    }

    const own = this.allTables.find(
      t => t.tableName.toLowerCase() === typeName.toLowerCase());

    if (!own) {
      this.subModelRows = [];
      this.ownTableDepth = 1;
      return;
    }

    this.ownTableDepth = own.depth || 1;
    this.subModelRows = this.allTables
      .filter(t => t.parentTableId === own.id)
      .sort((a, b) => a.tableName.localeCompare(b.tableName, 'tr'));

    // The relationship table ID goes down to the tab as an Input; the tab loads its own data.
    this.relationshipTableId = own.id;
  }

  /**
   * Relationships are persisted immediately; if there are NO pending changes in the column form
   * the model is considered publishable. If there are column edits the user must still
   * press "Kaydet" (Save) — so unsaved columns are not published.
   */
  markRelationshipsPersisted(): void {
    if (this.isNew || this.rootGroup.dirty) return;

    this.isSaved = true;
    this.savedRootName = this.editTypeName;
  }
  // ─── Accessors ──────────────────────────────────────────────────────────────

  /** Name of the model edited on this screen — passed to the relationships tab. */
  get currentModelName(): string {
    return this.isNew
      ? (this.entityNameCtrl.value as string)
      : (this.editTypeName ?? '');
  }

  /** Summary coming from the relationships tab — feeds the badge in the tab bar. */
  onRelationshipStatus(status: { count: number; isValid: boolean }): void {
    this.relationshipCount = status.count;
    this.relationshipsValid = status.isValid;
    markDirty(this.cdr);
  }

  get entityNameCtrl() {
    return this.rootGroup.get('entityName')!;
  }

  get columns(): FormArray {
    return this.rootGroup.get('columns') as FormArray;
  }

  getColumnGroup(index: number): FormGroup {
    return this.columns.at(index) as FormGroup;
  }

  /** Whether a column's numeric Min/Max rule fields are shown. */
  isNumericType(dataType: string): boolean {
    return this.numericTypes.has(dataType);
  }

  /** Returns the label to show to the user for a type value. */
  typeLabel(value: string): string {
    return [...this.primitiveTypes, ...this.referenceTypes].find(t => t.value === value)?.label ?? value;
  }

  /** Whether an allowed type is selected on a file column (the selection lives in the draft's `enumValues` field). */
  isFileGroupSelected(group: FileTypeGroup): boolean {
    return parseFileGroups(this.columnDraft.get('enumValues')!.value).includes(group);
  }

  toggleFileGroup(group: FileTypeGroup, checked: boolean): void {
    const control = this.columnDraft.get('enumValues')!;
    const others = parseFileGroups(control.value).filter(g => g !== group);
    control.setValue(joinFileGroups(checked ? [...others, group] : others));
    control.markAsDirty();
  }

  /** Short rule summary for a column row (shown in the table view). */
  ruleSummary(col: AbstractControl): string {
    // Only rules belonging to the column's type are shown (the form may still hold an old type's value).
    const v = normalizeColumnRules((col as FormGroup).getRawValue());
    const parts: string[] = [];

    if (isFileType(v.dataType)) {
      // Even without a limit the platform ceiling applies — the user should see it.
      const limitKb = v.maxLength ?? maxFileKbFor(v.dataType);
      parts.push(this.languageService.t(
        v.maxLength != null ? 'table.detail.ruleMaxFileSize' : 'table.detail.ruleMaxFileSizeDefault',
        { value: formatFileSize(limitKb * 1024, this.languageService.lang()) }));
      if (v.dataType === 'file') {
        parts.push(...parseFileGroups(v.enumValues).map(g => this.languageService.t('table.detail.fileType.' + g)));
      }
      return parts.join(', ');
    }

    if (v.minLength != null) parts.push(this.languageService.t('table.detail.ruleMinLength', { value: v.minLength }));
    if (v.maxLength != null) parts.push(this.languageService.t('table.detail.ruleMaxLength', { value: v.maxLength }));
    if (NUMERIC_COLUMN_TYPES.has(v.dataType)) {
      if (v.min != null)     parts.push(this.languageService.t('table.detail.ruleMin', { value: v.min }));
      if (v.max != null)     parts.push(this.languageService.t('table.detail.ruleMax', { value: v.max }));
    }
    if (v.regex)             parts.push('regex');
    if (v.enumValues)        parts.push(v.enumValues);
    if (v.lookupTargetTable) parts.push(`→ ${v.lookupTargetTable}`);
    if (v.autoValueTrigger) {
      parts.push(this.languageService.t('table.detail.ruleAutoValue', {
        trigger: this.languageService.t('table.detail.autoValue.trigger.' + v.autoValueTrigger)
      }));
    }
    return parts.join(', ') || this.languageService.t('table.detail.ruleNone');
  }

  /**
   * When the user picks a lookup target table in the popup, reads the target table's schema
   * to fill the "display column" dropdown (once per target, cached).
   */
  onLookupTargetChange(targetTable: string): void {
    if (!targetTable || this.lookupColumnsByTable[targetTable] || this.lookupColumnsLoading.has(targetTable)) {
      return;
    }
    this.lookupColumnsLoading.add(targetTable);
    this.publishedTableService.getSchema(targetTable).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.lookupColumnsLoading.delete(targetTable);
        if (res.success && res.data) {
          this.lookupColumnsByTable[targetTable] = res.data.columns.map(c => c.name);
        }
      },
      error: () => this.lookupColumnsLoading.delete(targetTable)
    });
  }

  /** Any form change invalidates the save state — called again whenever rootGroup changes. */
  private trackFormChanges(): void {
    // The label → table name sync is also bound to the new rootGroup.
    this.rootNameSync?.unsubscribe();
    this.rootNameSync = new LabelNameSync(
      this.rootGroup.get('label')!, this.entityNameCtrl, 'model',
      () => ({ taken: this.isNew ? this.availableTables : [] }));

    this.formChangeSub?.unsubscribe();
    this.formChangeSub = this.rootGroup.valueChanges.pipe(markDirty(this.cdr)).subscribe(() => {
      if (this.isSaved) {
        this.isSaved = false;
        this.savedRootName = null;
      }
    });
  }

  // ─── Edit mode: load the existing schema ──────────────────────────────────

  /**
   * Reads the existing table schema and fills the form. Only its own columns are
   * loaded — sub-models are not shown/edited on this screen (each sub-model is
   * edited from its own /build/:typeName page). Adding new sub-models on this screen
   * is still possible (same as the normal create flow, kept in the data flow).
   */
  private loadForEdit(typeName: string): void {
    this.isLoadingSchema = true;
    this.loadError = null;

    this.publishedTableService.getSchema(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.isLoadingSchema = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('table.detail.schemaReadFailed', { name: typeName });
          return;
        }

        const schema = res.data;
        this.originalColumnNames = new Set(schema.columns.map(c => c.name));
        this.originalColumnMeta = new Map(schema.columns.map(c => [
          c.name, {
            dataType: c.dataType,
            metadataKey: schemaMetadataKey(c),
            autoValueKey: autoValueKey(c),
            enumValues: c.enumValues ?? '',
            isRequired: c.isRequired
          } satisfies ColumnDisplayMeta
        ]));
        this.ownParentName = schema.parentTableName ?? null;
        // On old models without a label, the label is prefilled with the table name (required field);
        // since the diff baseline is the same value, it is not written unless the user changes it.
        this.originalLabel = schema.label?.trim() || schema.tableName;
        this.modelIcon = this.originalIcon = schema.icon?.trim() || null;
        this.rootGroup = this.buildGroupFromSchema(schema, this.originalLabel);
        this.rootGroup.get('entityName')?.disable();
        this.trackFormChanges();
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isLoadingSchema = false;
        this.loadError = err?.error?.message ?? err?.message ?? this.languageService.t('table.detail.schemaServerError');
      }
    });
  }

  /** Builds the root node FormGroup from the loaded schema (filled with existing columns, no sub-models). */
  private buildGroupFromSchema(schema: PublishedTableSchema, label: string): FormGroup {
    return this.buildRootGroup(
      schema.tableName,
      label,
      schema.columns.map(c => this.buildColumnGroupFromSchema(c)));
  }

  /**
   * Builds a FormGroup from a loaded column record (same as model-node's column FormGroup structure).
   *
   * The saved column's name is already in the database — it is not revalidated against new naming rules
   * (if an old name did not satisfy a rule, the model could never be saved). Its name
   * cannot be changed; it opens locked in the popup.
   */
  private buildColumnGroupFromSchema(col: PublishedColumnSchema): FormGroup {
    return this.fb.group({
      columnName:          [col.name, Validators.required],
      dataType:            [col.dataType],
      isNullable:          [!col.isRequired],
      minLength:           [col.minLength ?? null],
      maxLength:           [col.maxLength ?? null],
      min:                 [col.min ?? null],
      max:                 [col.max ?? null],
      regex:               [col.regex ?? ''],
      regexMessage:        [col.regexMessage ?? ''],
      enumValues:          [col.enumValues ?? ''],
      lookupTargetTable:   [col.lookupTargetTable ?? ''],
      lookupDisplayColumn: [col.lookupDisplayColumn ?? ''],
      label:               [col.label ?? ''],
      description:         [col.description ?? ''],
      // image/file: the stored KB limit arrives in the form as MB (normalizeColumnRules converts it back).
      maxFileSizeMb:       [
        isFileType(col.dataType) ? kbToMb(col.maxLength) : null,
        fileLimitMbValidator
      ],
      autoValueTrigger:    [col.autoValueTrigger ?? ''],
      autoValueExpression: [col.autoValueExpression ?? ''],
      isReadOnly:          [!!col.isReadOnly]
    });
  }

  // ─── Column popup ───────────────────────────────────────────────────────────

  openAddColumnModal(): void {
    this.editingColumnIndex = null;
    this.columnDraft = this.buildColumnDraft();
    this.bindDraftNameSync();
    this.columnModalOpen = true;
  }

  openEditColumnModal(index: number): void {
    this.editingColumnIndex = index;
    this.columnDraft = this.buildColumnDraft();
    const source = this.getColumnGroup(index).getRawValue();
    this.columnDraft.patchValue(source);

    // The label is now required — on an old column without a label, the name is prefilled.
    if (!source.label?.trim()) {
      this.columnDraft.get('label')!.setValue(source.columnName);
    }

    // A saved column's name is locked: the onSaveEdit diff works by name; renaming
    // would mean "deactivate the old one + add a new one" and the data would stay in the old column.
    // The type and lookup target are locked too: changing them changes the compiled class and the table
    // (only metadata is edited). For value types, requiredness is locked on a published model.
    if (this.originalColumnNames.has(source.columnName)) {
      this.columnDraft.get('columnName')!.disable();
      this.columnDraft.get('dataType')!.disable();
      this.columnDraft.get('lookupTargetTable')!.disable();
      if (!requiredChangeAllowed(source.dataType, this.isModelPublished)) {
        this.columnDraft.get('isNullable')!.disable();
      }
    }

    const targetTable = this.columnDraft.get('lookupTargetTable')?.value;
    if (targetTable) {
      this.onLookupTargetChange(targetTable);
    }
    this.bindDraftNameSync();
    this.columnModalOpen = true;
  }

  private bindDraftNameSync(): void {
    this.draftNameSync?.unsubscribe();
    this.draftNameSync = new LabelNameSync(
      this.columnDraft.get('label')!, this.columnDraft.get('columnName')!, 'column',
      () => this.columnDraftContext());
  }

  /** Validates the popup's column; if valid, adds/updates it and closes the popup. */
  saveColumnModal(): void {
    // The clash check depends on the siblings; they may have changed while the popup was open.
    this.columnDraft.get('columnName')!.updateValueAndValidity();
    this.columnDraft.get('maxFileSizeMb')!.updateValueAndValidity();
    if (this.columnDraft.invalid || this.draftAutoValueError) {
      this.columnDraft.markAllAsTouched();
      return;
    }

    // Rules are filtered by type (so an old type's rule does not remain after a type change).
    const value = normalizeColumnRules(this.columnDraft.getRawValue());
    if (this.editingColumnIndex === null) {
      const group = ModelNodeComponent.buildColumnGroupStatic(this.fb);
      group.patchValue(value);
      this.columns.push(group);
    } else {
      this.getColumnGroup(this.editingColumnIndex).patchValue(value);
    }

    this.closeColumnModal();
  }

  closeColumnModal(): void {
    this.draftNameSync?.unsubscribe();
    this.draftNameSync = undefined;
    this.columnModalOpen = false;
    this.editingColumnIndex = null;
  }

  onColumnModalBackdropClick(): void {
    this.closeColumnModal();
  }

  // ─── Column popup: auto value ───────────────────────────────────────────────

  readonly autoValueTriggers = AUTO_VALUE_TRIGGERS;

  /** Functions usable in the formula — clicking inserts "NAME()". */
  readonly autoValueFunctions = ['IF', 'ROUND', 'CONCAT', 'COALESCE', 'TODAY', 'NOW', 'ADD_DAYS', 'FORMAT_DATE', 'SEQ'];

  /** Other columns that can be referenced in the formula (file columns excluded). */
  get autoValueFieldOptions(): { name: string; label: string }[] {
    return (this.columns.getRawValue() as TreeColumn[])
      .filter((c, i) => i !== this.editingColumnIndex && c.columnName?.trim() && !isFileType(c.dataType))
      .map(c => ({ name: c.columnName, label: c.label?.trim() || c.columnName }));
  }

  /**
   * Formula issue of the draft column (null if none). Planned together with the table's
   * other rules — that is the only way a cycle becomes visible.
   */
  get draftAutoValueError(): string | null {
    const draft = this.columnDraft.getRawValue() as TreeColumn;
    if (!draft.autoValueTrigger) return null;

    const name = draft.columnName?.trim() || DRAFT_COLUMN;
    const others = (this.columns.getRawValue() as TreeColumn[])
      .filter((c, i) => i !== this.editingColumnIndex && c.columnName?.trim());
    const plan = buildAutoValuePlan([...others, { ...draft, columnName: name }].map(toAutoValueColumn));
    const issue = plan.issues.find(i => i.column === name);
    return issue ? this.autoValueIssueText(issue) : null;
  }

  /** The `save` trigger and SEQ() make read-only mandatory (see normalizeColumnRules). */
  get draftReadOnlyForced(): boolean {
    const trigger = this.columnDraft.get('autoValueTrigger')!.value;
    if (trigger === 'save') return true;
    const expression: string = this.columnDraft.get('autoValueExpression')!.value ?? '';
    try {
      return !!expression.trim() && usesSequence(parseExpression(expression));
    } catch {
      return false;
    }
  }

  /** Inserts a snippet at the caret; for functions the caret is placed inside the parentheses. */
  insertAutoValueToken(input: HTMLTextAreaElement, token: string, caretBack = 0): void {
    const ctrl = this.columnDraft.get('autoValueExpression')!;
    const value: string = ctrl.value ?? '';
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    ctrl.setValue(value.slice(0, start) + token + value.slice(end));
    ctrl.markAsTouched();
    const caret = start + token.length - caretBack;
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  /** "Tarih + sıra no" (Date + sequence no) template: date + daily counter on a new record, e.g. 25092026-001. */
  applySequenceTemplate(): void {
    this.columnDraft.patchValue({
      autoValueTrigger: 'create',
      autoValueExpression: SEQUENCE_TEMPLATE,
      isReadOnly: true
    });
  }

  /** Converts a planner issue into readable text. */
  autoValueIssueText(issue: RuleIssue): string {
    const t = (key: string, params?: Record<string, string | number>) =>
      this.languageService.t('table.detail.autoValue.' + key, params);
    switch (issue.code) {
      case 'parse':
        return t('err.parse', {
          reason: t('parse.' + issue.detail, { arg: issue.arg }),
          pos: issue.pos >= 0 ? issue.pos + 1 : 1
        });
      case 'unknownField':
      case 'sequenceRef':
        return t('err.' + issue.code, { field: issue.detail });
      case 'cycle':
        return t('err.cycle', { path: issue.detail.split(DRAFT_COLUMN).join(t('thisColumn')) });
      default:
        return t('err.' + issue.code);
    }
  }

  // ─── Guide dialog ───────────────────────────────────────────────────────────

  /** The "i" next to "Veri Tipi" (Data type) in the column popup — opens the guide for the selected type. */
  openTypeHelp(): void {
    this.openHelp(this.columnDraft.get('dataType')!.value || 'string');
  }

  /**
   * The "i" next to "İlişki Tipi" (Relationship type) in the relationship popup — opens the guide
   * for the selected relationship type.
   *
   * RelationshipType is a NUMERIC enum and the `<select>` value arrives as a string
   * ('1'..'5'); the topic key, however, is built from the type NAME ('rel:OneToOne').
   * So it is converted to the name via the enum's reverse mapping.
   */
  openRelationshipTypeHelp(type: RelationshipType): void {
    const name = RelationshipType[type];
    this.openHelp(name ? `rel:${name}` : 'relationships');
  }

  /** "Nasıl çalışır?" (How does it work?) in the tab toolbars — opens the concept guide. */
  openHelp(topic: HelpTopicId): void {
    this.helpTopic.set(topic);
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  /**
   * When "Kullan" (Use) is pressed on a ready-made regex pattern in the guide, writes the pattern
   * into the column draft. The error message is filled only if empty — the user's own
   * message is not overwritten.
   */
  onHelpPattern(preset: RegexPreset): void {
    this.columnDraft.get('regex')!.setValue(preset.pattern);
    const messageCtrl = this.columnDraft.get('regexMessage')!;
    if (!messageCtrl.value?.trim()) {
      messageCtrl.setValue(this.languageService.t(`help.regex.presetMsg.${preset.key}`));
    }
    this.closeHelp();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // The guide dialog calls stopPropagation in its own ESC handler; still,
    // defensively, we also prevent the popups below from closing here.
    if (this.helpOpen()) return;

    // Close starting from the topmost dialog. Relationship dialogs live inside
    // the tab; if there is something to close the tab returns true.
    if (this.relationshipsTab?.handleEscape()) return;

    if (this.columnModalOpen) {
      this.closeColumnModal();
    }
  }

  removeColumn(index: number): void {
    this.columns.removeAt(index);
  }

  // ─── Helper: flatten the tree with BFS ────────────────────────────────────

  /**
   * Converts the FormGroup tree into a flat TreeNode list in parent-first order.
   * Includes only valid columns (columnName filled).
   */
  private flattenTree(group: FormGroup, parentName: string | null): TreeNode[] {
    const result: TreeNode[] = [];
    const entityName: string = group.get('entityName')?.value ?? '';
    const label: string | null = group.get('label')?.value?.trim() || null;
    const columnsArr = group.get('columns') as FormArray;
    const subModelsArr = group.get('subModels') as FormArray;

    // Rules are filtered by type; for image/file the MB input is converted to maxLength (KB).
    const cols = (columnsArr?.value ?? [])
      .filter((c: any) => c.columnName?.trim())
      .map((c: any) => normalizeColumnRules(c));

    result.push({ entityName, label, parentName, columns: cols });

    // Add sub-models in BFS order (parent always first)
    for (let i = 0; i < (subModelsArr?.length ?? 0); i++) {
      const subGroup = subModelsArr.at(i) as FormGroup;
      result.push(...this.flattenTree(subGroup, entityName));
    }

    return result;
  }

  // ─── Helper: save a new node (dup check → addTable → addMembers) ──

  /** Saves a single NEW node: performs the dup check, calls addTable + addMember for each column. */
  private saveNode$(node: TreeNode): Observable<unknown> {
    return this.publishedTableService.getSchema(node.entityName).pipe(
      catchError((err: { status?: number }) => {
        if (err?.status === 400 || err?.status === 404) {
          return of({ success: false as const, message: 'bulunamadı', data: null as any });
        }
        return throwError(() => new Error(this.languageService.t('table.detail.checkServerError')));
      }),
      switchMap(checkRes => {
        if (checkRes.success) {
          return throwError(() => new Error(
            this.languageService.t('table.detail.duplicateModelName', { name: node.entityName })
          ));
        }
        // addTable — parentTableName is sent for a sub-model
        return this.publishedTableService.addTable({
          tableName:       node.entityName,
          label:           node.label,
          // The icon is picked only on the root model (the button in the header).
          icon:            node.parentName ? null : this.modelIcon,
          description:     `${node.entityName} dinamik modeli`,
          version:         1,
          parentTableName: node.parentName ?? undefined
        });
      }),
      switchMap(res =>
        res.success
          ? of(res)
          : throwError(() => new Error(res.message ?? this.languageService.t('table.detail.tableMetaSaveFailed')))
      ),
      // addMember for each column
      switchMap(() =>
        from(node.columns).pipe(
          concatMap(col =>
            this.publishedTableService.addMember(this.memberRequest(node.entityName, col)).pipe(
              switchMap(r =>
                r.success
                  ? of(r)
                  : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.memberSaveFailed', { name: col.columnName })))
              )
            )
          ),
          concatMap(() => of(null))
        )
      )
    );
  }

  /**
   * Revalidates the names in the whole tree before saving (sibling clashes do not refresh
   * by themselves in the others when one name changes). If invalid, makes the errors visible
   * and tells the user where they are — an invalid name never reaches the backend.
   */
  private ensureFormValid(): boolean {
    revalidateIdentifiers(this.rootGroup);
    if (this.rootGroup.valid) return this.ensureAutoValuesValid();

    this.rootGroup.markAllAsTouched();
    this.submitSuccess = false;
    this.submitMessage = this.languageService.t('table.detail.formInvalid');
    // If the error is in an unsaved sub-model draft, make that tab visible.
    if (this.subModels.invalid && this.rootGroup.get('label')!.valid && this.entityNameCtrl.valid) {
      this.activeTab.set('subModels');
    }
    return false;
  }

  /**
   * Checks the columns' auto-value rules together (a cycle is only visible when looking at the
   * whole table). The server performs the same check; catching it here protects the user from
   * a half-finished save — shown together with the first faulty column name.
   */
  private ensureAutoValuesValid(): boolean {
    const plan = buildAutoValuePlan(
      (this.columns.getRawValue() as TreeColumn[])
        .filter(c => c.columnName?.trim())
        .map(c => toAutoValueColumn(normalizeColumnRules(c))));
    const issue = plan.issues[0];
    if (!issue) return true;

    this.submitSuccess = false;
    this.submitMessage = this.languageService.t('table.detail.autoValue.saveBlocked', {
      name: issue.column,
      reason: this.autoValueIssueText(issue)
    });
    return false;
  }

  /** Converts a column into an addMember request (shared by the create and edit flows). */
  private memberRequest(typeName: string, col: TreeColumn): AddMemberRequest {
    return {
      typeName,
      memberName: col.columnName,
      memberType: col.dataType,
      isRequired: !col.isNullable,
      minLength: col.minLength ?? null,
      maxLength: col.maxLength ?? null,
      min: col.min ?? null,
      max: col.max ?? null,
      regex: col.regex || null,
      regexMessage: col.regexMessage || null,
      enumValues: col.enumValues || null,
      lookupTargetTable: col.lookupTargetTable || null,
      lookupDisplayColumn: col.lookupDisplayColumn || null,
      label: col.label || null,
      description: col.description || null,
      autoValueTrigger: (col.autoValueTrigger || null) as AutoValueTrigger | null,
      autoValueExpression: col.autoValueExpression || null,
      isReadOnly: !!col.isReadOnly
    };
  }

  // ─── STEP 1: SAVE (create mode) ───────────────────────────────────────────

  /**
   * Saves the whole model tree (root + sub-models) in parent-first order.
   * Each node: addTable + addMember for each column.
   * After success isSaved = true and the Publish button becomes active.
   */
  onSave(): void {
    if (this.isSaving || this.isPublishing || !this.ensureFormValid()) return;

    const nodes = this.flattenTree(this.rootGroup, null);
    if (nodes.length === 0) return;

    if (nodes[0].columns.length === 0) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.atLeastOneColumn');
      return;
    }

    const rootName = nodes[0].entityName;

    this.isSaving = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    // For each node in order: dup check → addTable → addMembers
    from(nodes).pipe(
      concatMap(node => this.saveNode$(node))
    ).pipe(markDirty(this.cdr)).subscribe({
      next: () => {},
      error: (err: Error) => {
        this.isSaving = false;
        this.isSaved = false;
        this.savedRootName = null;
        this.submitSuccess = false;
        this.submitMessage = err.message ?? this.languageService.t('table.detail.saveServerError');
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;

        // G1: The model is now saved — relationships pending in memory are sent to the server.
        this.relationshipsTab?.flush(rootName);

        const nodeCount = nodes.length;
        this.submitMessage = nodeCount > 1
          ? this.languageService.t('table.detail.modelsSavedMulti', { count: nodeCount, names: nodes.map(n => n.entityName).join(', ') })
          : this.languageService.t('table.detail.modelSaved');

        // The model now exists in the database — the screen switches to edit mode.
        this.enterEditModeAfterCreate(rootName, nodes[0]);
      }
    });
  }

  /**
   * Switches the screen to edit mode after the first successful save in create mode.
   *
   * Without this transition a second "Kaydet" (Save) would run the create flow again and
   * saveNode$'s dup check would fail with "a model with this name already exists" —
   * whereas the user is inside the same model and wants to update it.
   *
   * The page is not reloaded: form state, relationships tab and the isSaved flag are kept
   * (the flag must be kept so the "Yayınla" (Publish) button stays active — that is why all form
   * mutations use emitEvent:false, otherwise trackFormChanges would reset it).
   */
  private enterEditModeAfterCreate(rootName: string, savedRoot: TreeNode): void {
    this.isNew = false;
    this.editTypeName = rootName;

    // Edit mode rule: the root model name cannot be changed (same as loadForEdit).
    this.rootGroup.get('entityName')?.disable({ emitEvent: false });

    // Diff baseline: the columns and labels created on the server with this save.
    this.originalColumnNames = new Set(savedRoot.columns.map(c => c.columnName));
    this.originalColumnMeta = new Map(savedRoot.columns.map(c => [
      c.columnName, columnMetaOf(c)
    ]));
    this.originalLabel = savedRoot.label;
    // addTable wrote the icon along with it (on a tenant without 025 the server skips it; the icon stays default).
    this.originalIcon = this.modelIcon;

    // Saved sub-models are no longer drafts; they are dropped from the form and
    // move to the saved list in the "Alt Modeller" (Sub-models) tab (loadTables).
    this.subModels.clear({ emitEvent: false });

    // The address bar follows the real state: on page refresh the edit screen opens.
    this.location.replaceState(`/build/${rootName}`);

    // The saved sub-model list, table ID and lookup targets are refreshed.
    this.loadTables();
  }

  // ─── STEP 1: SAVE (edit mode) ─────────────────────────────────────────────

  /**
   * Save in edit mode: compares the root model's columns with the original schema
   * (diff) — new column names are sent with addMember, missing column names with
   * removeMember (soft-delete, the SQL column is not DROPped).
   * Entirely new sub-models added in this session are saved with the normal create flow
   * (addTable + addMember). The (root) model name cannot be changed in this mode.
   */
  onSaveEdit(): void {
    if (this.isSaving || this.isPublishing || !this.editTypeName || !this.ensureFormValid()) return;

    const rootName = this.editTypeName;
    const nodes = this.flattenTree(this.rootGroup, null);
    const rootNode = nodes[0];
    const newChildNodes = nodes.slice(1); // new sub-models added in this session

    if (rootNode.columns.length === 0) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.atLeastOneColumn');
      return;
    }

    const currentColumnNames = new Set(rootNode.columns.map(c => c.columnName));
    const addedColumns = rootNode.columns.filter(c => !this.originalColumnNames.has(c.columnName));
    const removedColumnNames = [...this.originalColumnNames].filter(name => !currentColumnNames.has(name));

    // A saved column's type is locked; if it changed anyway (an old draft, manual tampering)
    // the change is not silently dropped — the save stops before it even starts.
    const typeChanged = rootNode.columns.find(c => {
      const original = this.originalColumnMeta.get(c.columnName);
      return !!original && original.dataType !== c.dataType;
    });
    if (typeChanged) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.typeChangeBlocked', { name: typeChanged.columnName });
      return;
    }

    const ops: Array<() => Observable<unknown>> = [];

    // 1. Deactivate removed columns (soft-delete — the SQL column is not DROPped)
    removedColumnNames.forEach(name => ops.push(() =>
      this.publishedTableService.removeMember(rootName, name).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnDeactivateFailed', { name }))))
      )
    ));

    // 2. Save the newly added columns
    addedColumns.forEach(col => ops.push(() =>
      this.publishedTableService.addMember(this.memberRequest(rootName, col)).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnAddFailed', { name: col.columnName }))))
      )
    ));

    // 3. If the model label changed, write only the label
    const newLabel = rootNode.label ?? '';
    if (newLabel !== (this.originalLabel ?? '')) {
      ops.push(() => this.publishedTableService.setTableLabel(rootName, newLabel).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.labelUpdateFailed'))))
      ));
    }

    // 4. Metadata of saved columns: label, description, requiredness, rules and file size
    //    limit — in a single request (name/type locked; the schema does not change, no publish needed).
    const metadataChanged = rootNode.columns.filter(c => {
      const original = this.originalColumnMeta.get(c.columnName);
      return !!original && metadataKey(c) !== original.metadataKey;
    });
    metadataChanged.forEach(col => ops.push(() =>
      this.publishedTableService.updateMemberMetadata(toMemberMetadataUpdate(rootName, col)).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnMetadataUpdateFailed', { name: col.columnName }))))
      )
    ));

    // 5b. If the auto-value rule of saved columns changed, write it (the schema does not change, no publish needed)
    const autoValueChanged = rootNode.columns.filter(c => {
      const original = this.originalColumnMeta.get(c.columnName);
      return !!original && autoValueKey(c) !== original.autoValueKey;
    });
    autoValueChanged.forEach(col => ops.push(() =>
      this.publishedTableService.setMemberAutoValue({
        typeName: rootName,
        memberName: col.columnName,
        trigger: (col.autoValueTrigger || null) as AutoValueTrigger | null,
        expression: col.autoValueExpression || null,
        isReadOnly: !!col.isReadOnly
      }).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.autoValue.updateFailed', { name: col.columnName }))))
      )
    ));

    // 6. Entirely new sub-models added in this session — normal create flow
    newChildNodes.forEach(node => ops.push(() => this.saveNode$(node)));

    this.isSaving = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    if (ops.length === 0) {
      this.isSaving = false;
      this.isSaved = true;
      this.savedRootName = rootName;
      this.submitSuccess = true;
      this.submitMessage = this.languageService.t('table.detail.noChanges');
      return;
    }

    from(ops).pipe(
      concatMap(op => op())
    ).pipe(markDirty(this.cdr)).subscribe({
      next: () => {},
      error: (err: Error) => {
        this.isSaving = false;
        this.isSaved = false;
        this.savedRootName = null;
        this.submitSuccess = false;
        this.submitMessage = err.message ?? this.languageService.t('table.detail.saveServerError');
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;
        this.submitMessage = this.languageService.t('table.detail.changesSaved');

        // Refresh the diff baseline: columns added after this save are now "existing"
        // and sub-models created in this session are no longer "new". Without refreshing,
        // a second "Kaydet" (Save) would try to add the same columns/sub-models again.
        this.originalColumnNames = new Set(rootNode.columns.map(c => c.columnName));
        this.originalColumnMeta = new Map(rootNode.columns.map(c => [
          c.columnName, columnMetaOf(c)
        ]));
        this.originalLabel = rootNode.label;
        this.subModels.clear({ emitEvent: false });
        this.recordMetadata.invalidate(rootName);

        // Let the new sub-models move to the saved list (and become possible lookup targets).
        if (newChildNodes.length > 0)
          this.loadTables();
      }
    });
  }

  // ─── STEP 2: PUBLISH ──────────────────────────────────────────────────────

  /**
   * Publish: first the model icon is picked (the saved icon comes preselected, picking is optional);
   * once confirmed {@link onIconConfirmed} → {@link publish}.
   */
  onPublish(): void {
    if (!this.isSaved || !this.savedRootName) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.saveModelFirst');
      return;
    }

    if (this.isPublishing || this.isSaving) return;
    this.iconPickerMode = 'publish';
  }

  /** The icon button in the header — changes it without republishing. */
  openIconPicker(): void {
    if (!this.isPublishing && !this.isSaving) this.iconPickerMode = 'select';
  }

  /** Picker confirmation. In publish mode the icon (if changed) is written and publishing starts. */
  onIconConfirmed(icon: string | null): void {
    const mode = this.iconPickerMode;
    const typeName = this.editTypeName ?? this.savedRootName;

    if (mode === 'publish') {
      this.iconPickerMode = null;
      this.modelIcon = icon;
      this.publish(typeName && icon !== this.originalIcon ? typeName : null);
      return;
    }

    // Not yet saved model: the icon goes along with addTable.
    if (!typeName) {
      this.modelIcon = icon;
      this.iconPickerMode = null;
      return;
    }
    if (icon === this.originalIcon) {
      this.iconPickerMode = null;
      return;
    }

    this.iconSaving = true;
    this.publishedTableService.setTableIcon(typeName, icon).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.iconSaving = false;
        this.iconPickerMode = null;
        if (res.success) {
          this.modelIcon = this.originalIcon = icon;
        } else {
          this.submitSuccess = false;
          this.submitMessage = this.languageService.t('model.icon.saveFailed', { message: res.message ?? '' });
        }
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.iconSaving = false;
        this.iconPickerMode = null;
        this.submitSuccess = false;
        this.submitMessage = this.languageService.t('model.icon.saveFailed', {
          message: err?.error?.message ?? err?.message ?? ''
        });
      }
    });
  }

  /**
   * Has the backend publish the saved tree.
   * The backend fetches the whole tree from the root name via BFS, compiles it parent-first and creates the SQL tables.
   *
   * If `iconFor` is set, that model's icon is written first. The icon is optional: if it cannot be written (e.g. tenant
   * migration 025 missing) a warning is shown, and publishing still happens.
   */
  private publish(iconFor: string | null): void {
    if (!this.savedRootName) return;
    const rootName = this.savedRootName;
    const icon = this.modelIcon;

    this.isPublishing = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    const writeIcon$ = iconFor
      ? this.publishedTableService.setTableIcon(iconFor, icon).pipe(
          catchError((err: { error?: { message?: string }; message?: string }) =>
            of({ success: false, message: err?.error?.message ?? err?.message ?? '' })),
          switchMap(res => {
            if (res.success) this.originalIcon = icon;
            else this.notifications.warn(this.languageService.t('model.icon.saveFailed', { message: res.message ?? '' }));
            return of(null);
          }))
      : of(null);

    writeIcon$.pipe(
      concatMap(() => this.publishedTableService.publish(rootName)),
      markDirty(this.cdr)
    ).subscribe({
      next: res => {
        this.isPublishing = false;
        if (res.success) {
          this.submitSuccess = true;
          this.submitMessage = res.message ?? this.languageService.t('table.detail.publishSuccess');
          this.router.navigate(['/models']);
        } else {
          this.submitSuccess = false;
          this.submitMessage = res.message ?? this.languageService.t('table.detail.publishFailed');
        }
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isPublishing = false;
        this.submitSuccess = false;
        this.submitMessage = err?.error?.message ?? err?.message ?? this.languageService.t('table.detail.publishServerError');
      }
    });
  }
}
