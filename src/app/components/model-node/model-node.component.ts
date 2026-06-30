import { Component, Input, OnInit, forwardRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormArray,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { PublishedTableService } from '../../services/published-table.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Maksimum model ağacı derinliği (kök = 1). */
export const MAX_DEPTH = 4;

/**
 * ModelNodeComponent — tek bir model düğümünü temsil eder.
 * Kendi içinde alt modeller (subModels FormArray) tutabilir;
 * `<app-model-node>` kendini özyinelemeli olarak render eder (max 4 derinlik).
 *
 * FormGroup yapısı:
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
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    forwardRef(() => ModelNodeComponent)
  ],
  templateUrl: './model-node.component.html',
  styleUrls: ['./model-node.component.scss']
})
export class ModelNodeComponent implements OnInit {
  private readonly languageService = inject(LanguageService);

  /** Dışarıdan gelen FormGroup: entityName + columns + subModels. */
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

  constructor(private fb: FormBuilder, private publishedTableService: PublishedTableService) {}

  ngOnInit(): void {}

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
    this.publishedTableService.getSchema(targetTable).subscribe({
      next: res => {
        this.lookupColumnsLoading.delete(targetTable);
        if (res.success && res.data) {
          this.lookupColumnsByTable[targetTable] = res.data.columns.map(c => c.name);
        }
      },
      error: () => this.lookupColumnsLoading.delete(targetTable)
    });
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
    this.columns.push(this.buildColumnGroup());
  }

  removeColumn(index: number): void {
    this.columns.removeAt(index);
  }

  getColumnGroup(index: number): FormGroup {
    return this.columns.at(index) as FormGroup;
  }

  /** Boş bir kolon FormGroup'u oluşturur. */
  static buildColumnGroupStatic(fb: FormBuilder): FormGroup {
    return fb.group({
      columnName:          ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      dataType:            ['string'],
      isNullable:          [true],
      // UI metadata: kullanıcı dostu gösterim — opsiyonel
      label:               [''],
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

  /** Boş bir model düğümü FormGroup'u oluşturur (entityName + columns + subModels). */
  static buildModelGroupStatic(fb: FormBuilder, initialEntityName = 'YeniModel'): FormGroup {
    const group = fb.group({
      entityName: [
        initialEntityName,
        [Validators.required, Validators.pattern(/^[A-Z][A-Za-z0-9]*$/)]
      ],
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
    return ModelNodeComponent.buildModelGroupStatic(this.fb, 'AltModel');
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
