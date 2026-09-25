import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, forwardRef, Input, inject,
  OnChanges, OnDestroy, SimpleChanges, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
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

/** Maksimum model ağacı derinliği (kök = 1). */
export const MAX_DEPTH = 4;

/**
 * ModelNodeComponent — tek bir model düğümünü temsil eder.
 * Kendi içinde alt modeller (subModels FormArray) tutabilir;
 * `<app-model-node>` kendini özyinelemeli olarak render eder (max 4 derinlik).
 *
 * FormGroup yapısı:
 *   label        : string  (kullanıcı dostu ad — entityName bundan üretilir)
 *   entityName   : string
 *   columns      : FormArray  (columnName, dataType, isNullable, ...)
 *   subModels    : FormArray  (her eleman yine bu FormGroup yapısında)
 */
@Component({
  selector: 'app-model-node',
  standalone: true,
  // forwardRef ile kendi kendine import — Angular recursive component çözümü
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslatePipe,
    HelpHintComponent,
    DatatypeHelpComponent,
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    forwardRef(() => ModelNodeComponent)
  ],
  templateUrl: './model-node.component.html',
  styleUrls: ['./model-node.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelNodeComponent implements OnChanges, OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  /** Dışarıdan gelen FormGroup: label + entityName + columns + subModels. */
  @Input({ required: true }) group!: FormGroup;

  /** Kök = 1, max = 4. 4'te "Alt Model Oluştur" butonu gizlenir. */
  @Input() depth: number = 1;

  /** Kök değilse (depth > 1) "Alt Modeli Kaldır" butonu gösterilir. */
  @Input() canRemove: boolean = false;

  /** Alt model kaldırma olayını parent'a ilet */
  @Input() onRemoveSelf?: () => void;

  /** Lookup kolon tipi için hedef model seçenekleri (form-build tarafından sağlanır). */
  @Input() availableTables: string[] = [];

  readonly MAX_DEPTH = MAX_DEPTH;
  readonly IDENTIFIER_MAX_LENGTH = IDENTIFIER_MAX_LENGTH;
  readonly LABEL_MAX_LENGTH = LABEL_MAX_LENGTH;

  // ─── Etiket → ad senkronu ───────────────────────────────────────────────────

  /** Ad kontrolü → senkron. Model adı ve her kolon adı için bir tane. */
  private readonly syncs = new Map<AbstractControl, LabelNameSync>();
  /** Kolon değerleri değişince kardeş adların çakışma durumu yeniden hesaplanır. */
  private columnsSub?: Subscription;

  readonly identifierErrorMessage = identifierErrorMessage;
  readonly isFileType = isFileType;
  readonly maxFileMbFor = maxFileMbFor;
  readonly MIN_FILE_LIMIT_MB = MIN_FILE_LIMIT_MB;

  /** Dropdown seçenekleri — value backend'e gönderilen anahtar, label kullanıcıya gösterilen ad. */
  primitiveTypes: { value: string; label: string }[] = [
    { value: 'string',   label: 'String' },
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

  /** Sayısal kural alanlarının (Min/Max) gösterileceği tipler. */
  private readonly numericTypes = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

  /** lookupTargetTable → hedef tablonun kolon adları (display kolonu seçimi için, lazy yüklenir). */
  lookupColumnsByTable: Partial<Record<string, string[]>> = {};
  /** lookupTargetTable → yükleniyor mu (aynı hedef için tekrar istek atmamak için). */
  private lookupColumnsLoading = new Set<string>();

  // ─── Veri tipi kılavuzu ─────────────────────────────────────────────────────

  /**
   * Kılavuz diyaloğu. Bu component özyinelemeli olduğu için her düğüm kendi
   * diyalog örneğini render eder; diyalog yalnızca tıklamayla açıldığından
   * aynı anda birden fazlası açık olamaz.
   */
  helpOpen = signal(false);
  helpTopic = signal<HelpTopicId>('string');

  /** Kılavuzu açan kolonun index'i — "Kullan" ile seçilen desen doğru satıra yazılsın. */
  private helpColumnIndex = -1;

  constructor(private fb: FormBuilder, private publishedTableService: PublishedTableService) {}

  /**
   * Alt model listesi `track $index` ile render edildiği için bir düğüm silinince
   * aynı component örneğine başka bir group gelebilir — senkronlar group'a göre yeniden kurulur.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['group']) this.bindSyncs();
  }

  ngOnDestroy(): void {
    this.unbindSyncs();
  }

  private bindSyncs(): void {
    this.unbindSyncs();

    // Model adı, ağaçtaki diğer modellerin yanında kayıtlı tablolarla da çakışmamalı.
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

  /** Ad alanına yazılırken Türkçe karakter/boşluk anında temizlenir. */
  onNameInput(event: Event, control: AbstractControl, kind: IdentifierKind): void {
    sanitizeIdentifierInputEvent(event, control, kind);
  }

  /** "↺ Etiketten üret" — elle değiştirilmiş adı etiketten yeniden üretir. */
  regenerateName(control: AbstractControl): void {
    this.syncs.get(control)?.regenerate();
  }

  /** Bir kolonun sayısal Min/Max kural alanlarının gösterilip gösterilmeyeceği. */
  isNumericType(dataType: string): boolean {
    return this.numericTypes.has(dataType);
  }

  /**
   * Kullanıcı bir kolon için lookup hedef tablosunu seçtiğinde, "display kolonu" dropdown'unu
   * doldurmak için hedef tablonun şemasını okur (her hedef için bir kez, cache'lenir).
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

  // ─── Kılavuz diyaloğu ───────────────────────────────────────────────────────

  /** Bir kolonun "Veri Tipi" yanındaki "i" — seçili tipin kılavuzunu açar. */
  openTypeHelp(index: number): void {
    this.helpColumnIndex = index;
    this.helpTopic.set(this.getColumnGroup(index).get('dataType')!.value || 'string');
    this.helpOpen.set(true);
  }

  /** Alt model kavramı kılavuzu (düğüm başlığındaki "i"). */
  openSubModelHelp(): void {
    this.helpColumnIndex = -1;
    this.helpTopic.set('subModels');
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  /**
   * Kılavuzdaki hazır regex deseninde "Kullan"a basıldığında deseni kılavuzu
   * açan kolona yazar. Hata mesajı yalnızca boşsa doldurulur.
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

  // ─── Accessor'lar ────────────────────────────────────────────────────────────

  get entityNameCtrl() {
    return this.group.get('entityName')!;
  }

  get columns(): FormArray {
    return this.group.get('columns') as FormArray;
  }

  get subModels(): FormArray {
    return this.group.get('subModels') as FormArray;
  }

  // ─── Sütun yönetimi ─────────────────────────────────────────────────────────

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
   * Boş bir kolon FormGroup'u oluşturur.
   *
   * Ad doğrulayıcısı bağlamını (kardeş kolonlar, model adı, üst model) form ağacından
   * kendisi bulur. Ağaca bağlı olmayan bir taslak için (ör. sütun popup'ı) `extra`
   * ile bağlam dışarıdan verilir.
   */
  static buildColumnGroupStatic(fb: FormBuilder, extra?: () => IdentifierContext): FormGroup {
    return fb.group({
      columnName:          ['', [Validators.required, identifierValidator('column', extra)]],
      dataType:            ['string'],
      isNullable:          [true],
      // UI metadata: kullanıcı dostu gösterim — ad bundan üretilir, zorunlu
      label:               ['', [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)]],
      description:         [''],
      minLength:           [null],
      maxLength:           [null],
      min:                 [null],
      max:                 [null],
      regex:               [''],
      regexMessage:        [''],
      // Enum: izinli değerler ('A|B|C' biçiminde). Lookup: hedef model + gösterilecek kolon.
      enumValues:          [''],
      lookupTargetTable:   [''],
      lookupDisplayColumn: [''],
      // image/file: boyut sınırı (MB) — yalnız formda; kaydederken maxLength'e (KB) çevrilir
      // (utils/column-rules.ts#normalizeColumnRules).
      maxFileSizeMb:       [null, fileLimitMbValidator],
      // Otomatik değer kuralı (utils/auto-value): '' = kural yok
      autoValueTrigger:    [''],
      autoValueExpression: [''],
      isReadOnly:          [false],
    });
  }

  private buildColumnGroup(): FormGroup {
    return ModelNodeComponent.buildColumnGroupStatic(this.fb);
  }

  // ─── Alt model yönetimi ─────────────────────────────────────────────────────

  /** Yeni bir alt model düğümü oluşturup subModels dizisine ekle. */
  addSubModel(): void {
    if (this.depth >= MAX_DEPTH) return;
    this.subModels.push(this.buildModelGroup());
  }

  /** Belirtilen indexteki alt modeli kaldır. */
  removeSubModel(index: number): void {
    this.subModels.removeAt(index);
  }

  getSubModelGroup(index: number): FormGroup {
    return this.subModels.at(index) as FormGroup;
  }

  /**
   * Boş bir model düğümü FormGroup'u oluşturur (label + entityName + columns + subModels).
   * Ad boş başlar; kullanıcı etiketi yazdıkça üretilir.
   */
  static buildModelGroupStatic(fb: FormBuilder): FormGroup {
    const group = fb.group({
      label:      ['', [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)]],
      entityName: ['', [Validators.required, identifierValidator('model')]],
      columns:   fb.array([]),
      subModels: fb.array([]),
    });
    // Başlangıçta bir boş kolon ekle
    (group.get('columns') as FormArray).push(
      ModelNodeComponent.buildColumnGroupStatic(fb)
    );
    return group;
  }

  private buildModelGroup(): FormGroup {
    return ModelNodeComponent.buildModelGroupStatic(this.fb);
  }

  // ─── Yardımcılar ────────────────────────────────────────────────────────────

  derinlikEtiketi(depth: number): string {
    const keys = ['', 'model.node.depthRoot', 'model.node.depthChild', 'model.node.depthGrandchild', 'model.node.depthGreatGrandchild'];
    const key = keys[depth];
    return key ? this.languageService.t(key) : this.languageService.t('model.node.depthLevel', { depth });
  }

  /**
   * Belirtilen index'teki alt modeli kaldırmak için bağlı fonksiyon döner.
   * Template'te [onRemoveSelf]="removeSubModelFn($index)" ile kullanılır.
   */
  removeSubModelFn(index: number): () => void {
    return () => this.removeSubModel(index);
  }
}
