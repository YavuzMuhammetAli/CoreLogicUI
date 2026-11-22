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

/** C# identifier pattern — shared for property, FK and join table names. */
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Relationship add/edit popup.
 *
 * Knows only the FORM: saving, staging and server communication are the job of the parent
 * component (relationships-tab). Thanks to this split the form rules (inverse property
 * requiredness, auto-filling the target for SelfReference) live in one place.
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

  /** Autocomplete source — only published models. */
  @Input() publishedModelNames: string[] = [];

  /** Name of the model edited on this screen (used as the target for SelfReference). */
  @Input() currentModelName = '';

  /** Whether saving is in progress (comes from the parent component). */
  @Input() saving = false;

  /** Error message returned from the server. */
  @Input() errorMessage: string | null = null;

  @Output() save = new EventEmitter<RelationshipUpsert>();
  @Output() cancelled = new EventEmitter<void>();

  /** The parent component opens the relationship type guide; the selected type goes along. */
  @Output() typeHelpRequested = new EventEmitter<RelationshipType>();

  open = false;

  /** null = new relationship; if set, the relationshipId of the edited relationship. */
  editingRelationshipId: string | null = null;

  relationshipTypeOptions = RELATIONSHIP_TYPE_OPTIONS;
  draft: FormGroup = this.buildDraft();

  /** Resets and opens the form for a new relationship. */
  openForCreate(nextOrder: number): void {
    this.editingRelationshipId = null;
    this.draft = this.buildDraft();
    this.draft.patchValue({ order: nextOrder });
    this.applyInverseValidators(this.draftType);
    this.open = true;
  }

  /** Loads an existing relationship into the form and opens it. */
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
   * The selected relationship type. Since a string may come from the select it is always
   * converted to a number (otherwise '4' === 4 comparisons silently return false).
   */
  /** The selected type readable from the template (sent when opening the guide). */
  get selectedType(): RelationshipType {
    return this.draftType;
  }

  private get draftType(): RelationshipType {
    return Number(this.draft.get('relationshipType')!.value) as RelationshipType;
  }

  /** Whether the selected relationship type requires an inverse property (OneToMany / ManyToMany). */
  get draftRequiresInverse(): boolean {
    return requiresInverse(this.draftType);
  }

  /** Whether the selected type is ManyToMany — the join table field is shown only then. */
  get draftIsManyToMany(): boolean {
    return this.draftType === RelationshipType.ManyToMany;
  }

  /**
   * When the relationship type changes:
   *  - normalizes the value to a number,
   *  - REBUILDS the inverse property's requiredness (so an old "required" error does not
   *    stick when the type is changed back),
   *  - for Self Reference, automatically sets the target model to the model itself.
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
    // Validators are already updated on type change; also make sure the right rule is applied
    // when the popup is opened and saved without any change.
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

  /** Builds the inverse property validators according to the selected type. */
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
