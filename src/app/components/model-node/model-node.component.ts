import { Component, Input, OnInit, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormArray,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';

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
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    forwardRef(() => ModelNodeComponent)
  ],
  templateUrl: './model-node.component.html',
  styleUrls: ['./model-node.component.scss']
})
export class ModelNodeComponent implements OnInit {
  /** Dışarıdan gelen FormGroup: entityName + columns + subModels. */
  @Input({ required: true }) group!: FormGroup;

  /** Kök = 1, max = 4. 4'te "Alt Model Oluştur" butonu gizlenir. */
  @Input() depth: number = 1;

  /** Kök değilse (depth > 1) "Alt Modeli Kaldır" butonu gösterilir. */
  @Input() canRemove: boolean = false;

  /** Alt model kaldırma olayını parent'a ilet */
  @Input() onRemoveSelf?: () => void;

  readonly MAX_DEPTH = MAX_DEPTH;

  dataTypes = ['string', 'int', 'float', 'decimal', 'datetime', 'boolean', 'image', 'file'];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {}

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
      columnName:   ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      dataType:     ['string'],
      isNullable:   [true],
      minLength:    [null],
      maxLength:    [null],
      min:          [null],
      max:          [null],
      regex:        [''],
      regexMessage: [''],
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
    const etiketler = ['', 'Kök Model', 'Alt Model', '2. Alt Model', '3. Alt Model'];
    return etiketler[depth] ?? `${depth}. Seviye`;
  }

  /**
   * Belirtilen index'teki alt modeli kaldırmak için bağlı fonksiyon döner.
   * Template'te [onRemoveSelf]="removeSubModelFn($index)" ile kullanılır.
   */
  removeSubModelFn(index: number): () => void {
    return () => this.removeSubModel(index);
  }
}
