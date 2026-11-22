import '../../i18n/lazy/datatype-help'; // the help.* dictionary loads with this chunk
import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, forwardRef, Input, inject,
  OnChanges, OnDestroy, SimpleChanges, signal
} from '@angular/core';

import {
  AbstractControl,
  ReactiveFormsModule,
  FormArray,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { PublishedTableService } from '../../services/published-table.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HelpHintComponent } from '../shared/help-hint/help-hint.component';
import { DatatypeHelpComponent } from '../shared/datatype-help/datatype-help.component';
import { HelpTopicId } from '../shared/datatype-help/datatype-help.data';
import { RegexPreset } from '../shared/datatype-help/regex-presets';
import { markDirty } from '../../utils/change-detection';
import { Subscription } from 'rxjs';
import {
  IdentifierContext, IdentifierKind, LABEL_MAX_LENGTH, IDENTIFIER_MAX_LENGTH, LabelNameSync,
  identifierErrorMessage, identifierValidator, sanitizeIdentifierInputEvent
} from '../../utils/identifier';
import { MIN_FILE_LIMIT_MB, fileLimitMbValidator, isFileType, maxFileMbFor } from '../../utils/file-size';
import { isTextColumn } from '../../utils/column-rules';
import { IconComponent } from '../shared/icon/icon.component';

/** Maximum model tree depth (root = 1). */
export const MAX_DEPTH = 4;

/**
 * ModelNodeComponent — represents a single model node.
 * It can hold sub-models (subModels FormArray) inside it;
 * `<app-model-node>` renders itself recursively (max depth 4).
 *
 * FormGroup structure:
 *   label        : string  (user-friendly name — entityName is generated from it)
 *   entityName   : string
 *   columns      : FormArray  (columnName, dataType, isNullable, ...)
 *   subModels    : FormArray  (each element has this same FormGroup structure)
 */
@Component({
    selector: 'app-model-node',
    // Self-import via forwardRef — Angular's solution for recursive components
    imports: [
    ReactiveFormsModule,
    TranslatePipe,
    HelpHintComponent,
    DatatypeHelpComponent,
    forwardRef(() => ModelNodeComponent),
    IconComponent
],
    templateUrl: './model-node.component.html',
    styleUrls: ['./model-node.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelNodeComponent implements OnChanges, OnDestroy {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  /** FormGroup from the outside: label + entityName + columns + subModels. */
  @Input({ required: true }) group!: FormGroup;

  /** Root = 1, max = 4. At 4 the "Create Sub-model" button is hidden. */
  @Input() depth: number = 1;

  /** If not the root (depth > 1) the "Remove Sub-model" button is shown. */
  @Input() canRemove: boolean = false;

  /** Forward the sub-model removal event to the parent */
  @Input() onRemoveSelf?: () => void;

  /** Target model options for the lookup column type (provided by form-build). */
  @Input() availableTables: string[] = [];

  readonly MAX_DEPTH = MAX_DEPTH;
  readonly IDENTIFIER_MAX_LENGTH = IDENTIFIER_MAX_LENGTH;
  readonly LABEL_MAX_LENGTH = LABEL_MAX_LENGTH;

  // ─── Label → name sync ──────────────────────────────────────────────────────

  /** Name control → sync. One for the model name and one for each column name. */
  private readonly syncs = new Map<AbstractControl, LabelNameSync>();
  /** When column values change, sibling name collisions are recomputed. */
  private columnsSub?: Subscription;

  readonly identifierErrorMessage = identifierErrorMessage;
  readonly isFileType = isFileType;
  readonly isTextColumn = isTextColumn;
  readonly maxFileMbFor = maxFileMbFor;
  readonly MIN_FILE_LIMIT_MB = MIN_FILE_LIMIT_MB;

  /** Dropdown options — value is the key sent to the backend, label is the name shown to the user. */
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

  /** Types for which numeric rule fields (Min/Max) are shown. */
  private readonly numericTypes = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

  /** lookupTargetTable → column names of the target table (for choosing the display column, lazy-loaded). */
  lookupColumnsByTable: Partial<Record<string, string[]>> = {};
  /** lookupTargetTable → whether loading (to avoid repeat requests for the same target). */
  private lookupColumnsLoading = new Set<string>();

  // ─── Data type guide ────────────────────────────────────────────────────────

  /**
   * Guide dialog. Since this component is recursive, each node renders its own
   * dialog instance; since the dialog only opens on click,
   * more than one cannot be open at the same time.
   */
  helpOpen = signal(false);
  helpTopic = signal<HelpTopicId>('string');

  /** Index of the column that opened the guide — so the pattern picked with "Kullan" (Use) is written to the right row. */
  private helpColumnIndex = -1;

  constructor(private fb: FormBuilder, private publishedTableService: PublishedTableService) {}

  /**
   * Since the sub-model list is rendered with `track $index`, when a node is deleted
   * the same component instance may receive another group — the syncs are rebuilt per group.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['group']) this.bindSyncs();
  }

  ngOnDestroy(): void {
    this.unbindSyncs();
  }

  private bindSyncs(): void {
    this.unbindSyncs();

    // The model name must not collide with registered tables either, besides the other models in the tree.
    this.entityNameCtrl.setValidators([
      Validators.required,
      identifierValidator('model', () => ({ taken: this.availableTables }))
    ]);
    this.entityNameCtrl.updateValueAndValidity({ emitEvent: false });
    this.syncs.set(this.entityNameCtrl, new LabelNameSync(
      this.group.get('label')!, this.entityNameCtrl, 'model', () => ({ taken: this.availableTables })));

    this.columns.controls.forEach(c => this.bindColumnSync(c as FormGroup));

    this.columnsSub = this.columns.valueChanges.subscribe(() =>
      this.columns.controls.forEach(c => c.get('columnName')!.updateValueAndValidity({ emitEvent: false })));
  }

  private bindColumnSync(col: FormGroup): void {
    const nameCtrl = col.get('columnName')!;
    this.syncs.set(nameCtrl, new LabelNameSync(col.get('label')!, nameCtrl, 'column'));
  }

  private unbindSyncs(): void {
    this.syncs.forEach(s => s.unsubscribe());
    this.syncs.clear();
    this.columnsSub?.unsubscribe();
  }

  /** While typing in the name field, Turkish characters/spaces are cleaned immediately. */
  onNameInput(event: Event, control: AbstractControl, kind: IdentifierKind): void {
    sanitizeIdentifierInputEvent(event, control, kind);
  }

  /** "↺ Etiketten üret" (Generate from label) — regenerates a manually changed name from the label. */
  regenerateName(control: AbstractControl): void {
    this.syncs.get(control)?.regenerate();
  }

  /** Whether a column's numeric Min/Max rule fields are shown. */
  isNumericType(dataType: string): boolean {
    return this.numericTypes.has(dataType);
  }

  /**
   * When the user picks a lookup target table for a column, reads the target table's schema to fill
   * the "display column" dropdown (once per target, cached).
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

  // ─── Guide dialog ───────────────────────────────────────────────────────────

  /** The "i" next to a column's "Veri Tipi" (Data Type) — opens the guide for the selected type. */
  openTypeHelp(index: number): void {
    this.helpColumnIndex = index;
    this.helpTopic.set(this.getColumnGroup(index).get('dataType')!.value || 'string');
    this.helpOpen.set(true);
  }

  /** Guide for the sub-model concept (the "i" in the node header). */
  openSubModelHelp(): void {
    this.helpColumnIndex = -1;
    this.helpTopic.set('subModels');
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  /**
   * When "Kullan" (Use) is pressed on a ready-made regex pattern in the guide, writes the pattern
   * to the column that opened the guide. The error message is filled only if empty.
   */
  onHelpPattern(preset: RegexPreset): void {
    if (this.helpColumnIndex < 0 || this.helpColumnIndex >= this.columns.length) {
      this.closeHelp();
      return;
    }
    const group = this.getColumnGroup(this.helpColumnIndex);
    group.get('regex')!.setValue(preset.pattern);
    const messageCtrl = group.get('regexMessage')!;
    if (!messageCtrl.value?.trim()) {
      messageCtrl.setValue(this.languageService.t(`help.regex.presetMsg.${preset.key}`));
    }
    this.closeHelp();
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  get entityNameCtrl() {
    return this.group.get('entityName')!;
  }

  get columns(): FormArray {
    return this.group.get('columns') as FormArray;
  }

  get subModels(): FormArray {
    return this.group.get('subModels') as FormArray;
  }

  // ─── Column management ──────────────────────────────────────────────────────

  addColumn(): void {
    const col = this.buildColumnGroup();
    this.columns.push(col);
    this.bindColumnSync(col);
  }

  removeColumn(index: number): void {
    const nameCtrl = this.getColumnGroup(index).get('columnName')!;
    this.syncs.get(nameCtrl)?.unsubscribe();
    this.syncs.delete(nameCtrl);
    this.columns.removeAt(index);
  }

  getColumnGroup(index: number): FormGroup {
    return this.columns.at(index) as FormGroup;
  }

  /**
   * Creates an empty column FormGroup.
   *
   * The name validator finds its context (sibling columns, model name, parent model) from the form tree
   * itself. For a draft not attached to the tree (e.g. the column popup) the context is given
   * from outside via `extra`.
   */
  static buildColumnGroupStatic(fb: FormBuilder, extra?: () => IdentifierContext): FormGroup {
    return fb.group({
      columnName:          ['', [Validators.required, identifierValidator('column', extra)]],
      dataType:            ['string'],
      isNullable:          [true],
      // UI metadata: user-friendly display — the name is generated from it, required
      label:               ['', [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)]],
      description:         [''],
      minLength:           [null],
      maxLength:           [null],
      min:                 [null],
      max:                 [null],
      regex:               [''],
      regexMessage:        [''],
      // Enum: allowed values (in 'A|B|C' form). Lookup: target model + column to display.
      enumValues:          [''],
      lookupTargetTable:   [''],
      lookupDisplayColumn: [''],
      // image/file: size limit (MB) — form only; converted to maxLength (KB) on save
      // (utils/column-rules.ts#normalizeColumnRules).
      maxFileSizeMb:       [null, fileLimitMbValidator],
      // Auto-value rule (utils/auto-value): '' = no rule
      autoValueTrigger:    [''],
      autoValueExpression: [''],
      isReadOnly:          [false],
    });
  }

  private buildColumnGroup(): FormGroup {
    return ModelNodeComponent.buildColumnGroupStatic(this.fb);
  }

  // ─── Sub-model management ───────────────────────────────────────────────────

  /** Create a new sub-model node and add it to the subModels array. */
  addSubModel(): void {
    if (this.depth >= MAX_DEPTH) return;
    this.subModels.push(this.buildModelGroup());
  }

  /** Remove the sub-model at the given index. */
  removeSubModel(index: number): void {
    this.subModels.removeAt(index);
  }

  getSubModelGroup(index: number): FormGroup {
    return this.subModels.at(index) as FormGroup;
  }

  /**
   * Creates an empty model node FormGroup (label + entityName + columns + subModels).
   * The name starts empty; it is generated as the user types the label.
   */
  static buildModelGroupStatic(fb: FormBuilder): FormGroup {
    const group = fb.group({
      label:      ['', [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)]],
      entityName: ['', [Validators.required, identifierValidator('model')]],
      columns:   fb.array([]),
      subModels: fb.array([]),
    });
    // Add one empty column initially
    (group.get('columns') as FormArray).push(
      ModelNodeComponent.buildColumnGroupStatic(fb)
    );
    return group;
  }

  private buildModelGroup(): FormGroup {
    return ModelNodeComponent.buildModelGroupStatic(this.fb);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  depthLabel(depth: number): string {
    const keys = ['', 'model.node.depthRoot', 'model.node.depthChild', 'model.node.depthGrandchild', 'model.node.depthGreatGrandchild'];
    const key = keys[depth];
    return key ? this.languageService.t(key) : this.languageService.t('model.node.depthLevel', { depth });
  }

  /**
   * Returns a bound function to remove the sub-model at the given index.
   * Used in the template as [onRemoveSelf]="removeSubModelFn($index)".
   */
  removeSubModelFn(index: number): () => void {
    return () => this.removeSubModel(index);
  }
}
