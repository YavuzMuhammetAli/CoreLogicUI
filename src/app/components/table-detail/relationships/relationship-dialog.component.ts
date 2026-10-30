import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ModelAutocompleteComponent } from '../../shared/model-autocomplete/model-autocomplete.component';
import { HelpHintComponent } from '../../shared/help-hint/help-hint.component';
import {
  RelationshipDefinition,
  RelationshipType,
  RelationshipUpsert,
  RELATIONSHIP_TYPE_OPTIONS,
  requiresInverse
} from '../../../models/relationship.model';
import { IconComponent } from '../../shared/icon/icon.component';

/** C# tanımlayıcı deseni — property, FK ve ara tablo adları için ortak. */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * İlişki ekleme/düzenleme popup'ı.
 *
 * Yalnızca FORMU bilir: kaydetme, staging ve sunucu iletişimi üst component'in
 * (relationships-tab) işidir. Bu ayrım sayesinde form kuralları (ters property
 * zorunluluğu, SelfReference'ta hedefin otomatik dolması) tek yerde durur.
 */
@Component({
    selector: 'app-relationship-dialog',
    imports: [ReactiveFormsModule, TranslatePipe, ModelAutocompleteComponent, HelpHintComponent, IconComponent],
    templateUrl: './relationship-dialog.component.html',
    styleUrls: ['./relationships.shared.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationshipDialogComponent {
  private readonly fb = inject(FormBuilder);

  /** Autocomplete kaynağı — yalnızca yayınlanmış modeller. */
  @Input() publishedModelNames: string[] = [];

  /** Bu ekranda düzenlenen modelin adı (SelfReference'ta hedef olarak kullanılır). */
  @Input() currentModelName = '';

  /** Kaydetme sürüyor mu (üst component'ten gelir). */
  @Input() saving = false;

  /** Sunucudan dönen hata mesajı. */
  @Input() errorMessage: string | null = null;

  @Output() save = new EventEmitter<RelationshipUpsert>();
  @Output() cancelled = new EventEmitter<void>();

  /** İlişki tipi kılavuzunu üst component açar; seçili tip birlikte gider. */
  @Output() typeHelpRequested = new EventEmitter<RelationshipType>();

  open = false;

  /** null = yeni ilişki; dolu ise düzenlenen ilişkinin relationshipId'si. */
  editingRelationshipId: string | null = null;

  relationshipTypeOptions = RELATIONSHIP_TYPE_OPTIONS;
  draft: FormGroup = this.buildDraft();

  /** Yeni ilişki için formu sıfırlayıp açar. */
  openForCreate(nextOrder: number): void {
    this.editingRelationshipId = null;
    this.draft = this.buildDraft();
    this.draft.patchValue({ order: nextOrder });
    this.applyInverseValidators(this.draftType);
    this.open = true;
  }

  /** Mevcut ilişkiyi forma yükleyip açar. */
  openForEdit(relationship: RelationshipDefinition): void {
    this.editingRelationshipId = relationship.relationshipId;
    this.draft = this.buildDraft();
    this.draft.patchValue({
      targetModel:      relationship.targetModel,
      relationshipType: relationship.relationshipType,
      propertyName:     relationship.propertyName,
      inverseProperty:  relationship.inverseProperty ?? '',
      foreignKeyName:   relationship.foreignKeyName ?? '',
      joinTableName:    relationship.joinTableName ?? '',
      cascadeDelete:    relationship.cascadeDelete,
      required:         relationship.required,
      displayName:      relationship.displayName ?? '',
      order:            relationship.order
    });
    this.applyInverseValidators(this.draftType);
    this.open = true;
  }

  close(): void {
    this.open = false;
    this.editingRelationshipId = null;
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.onCancel();
  }

  onCancel(): void {
    this.close();
    this.cancelled.emit();
  }

  /**
   * Seçili ilişki tipi. Select'ten string gelebileceği için her zaman sayıya
   * çevrilir (aksi halde '4' === 4 karşılaştırmaları sessizce false döner).
   */
  /** Şablondan okunabilen seçili tip (kılavuz açarken gönderilir). */
  get selectedType(): RelationshipType {
    return this.draftType;
  }

  private get draftType(): RelationshipType {
    return Number(this.draft.get('relationshipType')!.value) as RelationshipType;
  }

  /** Seçili ilişki tipi ters property gerektiriyor mu (OneToMany / ManyToMany). */
  get draftRequiresInverse(): boolean {
    return requiresInverse(this.draftType);
  }

  /** Seçili tip ManyToMany mi — ara tablo alanı yalnızca o zaman gösterilir. */
  get draftIsManyToMany(): boolean {
    return this.draftType === RelationshipType.ManyToMany;
  }

  /**
   * İlişki tipi değiştiğinde:
   *  - değeri sayıya normalize eder,
   *  - ters property'nin zorunluluğunu YENİDEN kurar (tip geri değiştirildiğinde
   *    eski "required" hatası takılı kalmasın diye),
   *  - Self Reference'ta hedef modeli otomatik olarak modelin kendisi yapar.
   */
  onTypeChange(): void {
    const type = this.draftType;
    this.draft.get('relationshipType')!.setValue(type, { emitEvent: false });

    this.applyInverseValidators(type);

    if (type === RelationshipType.SelfReference && this.currentModelName) {
      this.draft.get('targetModel')!.setValue(this.currentModelName);
    }
  }

  onSubmit(): void {
    // Doğrulayıcılar tip değişiminde zaten güncelleniyor; popup hiç değiştirilmeden
    // açılıp kaydedilirse de doğru kuralın uygulandığından emin ol.
    this.applyInverseValidators(this.draftType);

    if (this.draft.invalid) {
      this.draft.markAllAsTouched();
      return;
    }

    const raw = this.draft.getRawValue();
    this.save.emit({
      targetModel:      (raw.targetModel as string).trim(),
      relationshipType: Number(raw.relationshipType) as RelationshipType,
      propertyName:     (raw.propertyName as string).trim(),
      inverseProperty:  emptyToNull(raw.inverseProperty),
      foreignKeyName:   emptyToNull(raw.foreignKeyName),
      joinTableName:    emptyToNull(raw.joinTableName),
      cascadeDelete:    !!raw.cascadeDelete,
      required:         !!raw.required,
      order:            Number(raw.order) || 0,
      displayName:      emptyToNull(raw.displayName)
    });
  }

  private buildDraft(): FormGroup {
    return this.fb.group({
      targetModel:      ['', Validators.required],
      relationshipType: [RelationshipType.ManyToOne, Validators.required],
      propertyName:     ['', [Validators.required, Validators.pattern(IDENTIFIER_PATTERN)]],
      inverseProperty:  ['', Validators.pattern(IDENTIFIER_PATTERN)],
      foreignKeyName:   ['', Validators.pattern(IDENTIFIER_PATTERN)],
      joinTableName:    ['', Validators.pattern(IDENTIFIER_PATTERN)],
      cascadeDelete:    [false],
      required:         [false],
      displayName:      [''],
      order:            [0]
    });
  }

  /** Ters property doğrulayıcılarını seçili tipe göre kurar. */
  private applyInverseValidators(type: RelationshipType): void {
    const inverse = this.draft.get('inverseProperty')!;
    const pattern = Validators.pattern(IDENTIFIER_PATTERN);

    inverse.setValidators(requiresInverse(type) ? [Validators.required, pattern] : [pattern]);
    inverse.updateValueAndValidity({ emitEvent: false });
  }
}

function emptyToNull(value: unknown): string | null {
  const text = (value as string | null | undefined)?.trim();
  return text ? text : null;
}
