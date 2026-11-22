import {
  ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, input, output, signal
} from '@angular/core';

import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  ASSIGNMENT_MODE_OPTIONS,
  JOIN_MODE_OPTIONS,
  TIMEOUT_POLICY_OPTIONS,
  WorkflowStep
} from '../../../models/workflow.model';
import { Role } from '../../../models/role';
import { AppUser } from '../../../models/appUser';
import { PublishedColumn } from '../../../services/published-model.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { newBranchGroup, newFieldGroup, newRecordFieldGroup, newStepGroup } from '../workflow-step.form';
import { stepFromFormValue } from '../designer/workflow-step.mapper';
import { sameKey } from '../../../utils/workflow/workflow-exits';
import { LanguageService } from '../../../services/language.service';
import { ConditionEditorComponent, StepTarget } from '../editors/condition-editor.component';
import { EndDraft, EndEditorComponent } from '../editors/end-editor.component';
import { ActionEditorComponent } from '../editors/action-editor.component';
import { NotifyEditorComponent } from '../editors/notify-editor.component';
import { TimerEditorComponent } from '../editors/timer-editor.component';
import { keyProblem } from '../designer/inspector-form';
import { IconComponent } from '../../shared/icon/icon.component';

/** Form field type options — a narrow subset of the same dictionary as model column types. */
const FORM_FIELD_TYPES = ['string', 'int', 'decimal', 'boolean', 'datetime', 'dateonly', 'enum'] as const;

/** Result written to the design document when the pop-up is saved. */
export interface StepDialogResult {
  step: WorkflowStep;
  statusLabel: string;
  /** Original key of the edited step; empty for a new step. If the key changed, connections are moved. */
  originalKey: string;
}

/**
 * Add/edit pop-up of a single flow step.
 *
 * Takes the step as an OBJECT and builds its own form; the step in the design document
 * is not touched until saved — Cancel does not have to undo anything.
 * On save the form value is merged onto the original step with `stepFromFormValue`
 * (fields without a counterpart in the form are preserved).
 */
@Component({
    selector: 'app-workflow-step-dialog',
    imports: [
    ReactiveFormsModule,
    TranslatePipe,
    ConditionEditorComponent,
    EndEditorComponent,
    ActionEditorComponent,
    NotifyEditorComponent,
    TimerEditorComponent,
    IconComponent
],
    templateUrl: './workflow-step-dialog.component.html',
    styleUrl: './workflow-step-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowStepDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly languageService = inject(LanguageService);

  /** Step to edit; null for a new step. */
  readonly step = input<WorkflowStep | null>(null);
  /** The step's status label (`entityStatusMap` entry). */
  readonly statusLabel = input('');
  /** Key suggested for a new step. */
  readonly newKey = input('');
  readonly readonly = input(false);
  readonly roles = input<Role[]>([]);
  readonly users = input<AppUser[]>([]);
  /** All step keys (its own is excluded) — transition target list and uniqueness check. */
  readonly stepKeys = input<string[]>([]);
  /** Columns of the model the flow is bound to — record field picker. Empty if no model is selected. */
  readonly columns = input<PublishedColumn[]>([]);
  /** Step names (and types) — so the target picker shows "Name (key)"; notification picks human steps. */
  readonly steps = input<Array<{ key: string; name: string; type?: string }>>([]);

  readonly saved = output<StepDialogResult>();
  readonly cancelled = output<void>();

  readonly isNew = computed(() => this.step() === null);
  readonly originalKey = computed(() => this.step()?.key ?? '');

  /**
   * Condition, End, Field update and Notification open with their own editor
   * (the approval/parallel reactive form does not fit them); the editor emits a copy
   * of the step, Save writes it to the document.
   */
  readonly special = computed(() => {
    const type = this.step()?.type;
    return type === 'condition' || type === 'end' || type === 'action' || type === 'notify' || type === 'timer';
  });
  readonly specialDraft = signal<WorkflowStep | null>(null);
  readonly specialLabel = signal('');
  readonly specialError = signal<string | null>(null);

  /** Condition targets: other steps, "Name (key)". */
  readonly targets = computed<StepTarget[]>(() => {
    const names = new Map(this.steps().map(s => [s.key.toLowerCase(), s.name]));
    return this.stepKeys()
      .filter(key => !sameKey(key, this.originalKey()))
      .map(key => {
        const name = names.get(key.toLowerCase());
        return { key, label: name ? `${name} (${key})` : key };
      });
  });

  /** The notification's "step assignees" choice: steps that open tasks (approval, task, parallel). */
  readonly humanSteps = computed<StepTarget[]>(() =>
    this.steps()
      .filter(s => s.type === 'approval' || s.type === 'parallel')
      .map(s => ({ key: s.key, label: `${s.name} (${s.key})` })));

  readonly assignmentModeOptions = ASSIGNMENT_MODE_OPTIONS;
  readonly timeoutPolicyOptions = TIMEOUT_POLICY_OPTIONS;
  readonly joinModeOptions = JOIN_MODE_OPTIONS;
  readonly fieldTypes = FORM_FIELD_TYPES;

  form!: FormGroup;

  /** Save was attempted with an invalid form — opens the warning in the bottom bar. */
  showErrors = false;
  /** The key is used by another step. */
  duplicateKey = false;

  /** Form value at open time — pressing Save without changing anything should not change the document. */
  private initialValue = '';

  ngOnInit(): void {
    const step = this.step();
    if (step && this.special()) {
      this.specialDraft.set(structuredClone(step));
      this.specialLabel.set(this.statusLabel());
    }
    this.form = newStepGroup(this.fb, step?.key ?? this.newKey(), step ?? undefined, this.statusLabel());
    this.initialValue = JSON.stringify(this.form.getRawValue());
    if (this.readonly()) this.form.disable({ emitEvent: false });
  }

  get fields(): FormArray {
    return this.form.get('fields') as FormArray;
  }

  get recordFields(): FormArray {
    return this.form.get('recordFields') as FormArray;
  }

  get allowReject(): boolean {
    return this.form.get('allowReject')?.value !== false;
  }

  get branches(): FormArray {
    return this.form.get('branches') as FormArray;
  }

  get isParallel(): boolean {
    return this.form.get('type')?.value === 'parallel';
  }

  /**
   * Transition targets: other steps. Its own key (both the original and the currently
   * typed one) is removed — a step cannot connect to itself.
   */
  get targetKeys(): string[] {
    const ownKeys = [this.originalKey(), String(this.form.get('key')?.value ?? '')];
    return this.stepKeys().filter(key => !ownKeys.some(own => sameKey(own, key)));
  }

  // ── Branches ────────────────────────────────────────────────────────────────

  addBranch(): void {
    this.branches.push(newBranchGroup(this.fb, { key: `branch${this.branches.length + 1}`, name: '' }));
  }

  removeBranch(index: number): void {
    this.branches.removeAt(index);
  }

  /** Switching to parallel prepares two empty branches (at least two branches are required). */
  onTypeChange(): void {
    if (!this.isParallel) return;
    while (this.branches.length < 2) this.addBranch();
  }

  // ── Form fields ─────────────────────────────────────────────────────────

  addField(): void {
    this.fields.push(newFieldGroup(this.fb));
  }

  removeField(index: number): void {
    this.fields.removeAt(index);
  }

  // ── Record fields ────────────────────────────────────────────────────────

  addRecordField(): void {
    this.recordFields.push(newRecordFieldGroup(this.fb));
  }

  removeRecordField(index: number): void {
    this.recordFields.removeAt(index);
  }

  /**
   * Columns to show in the row's picker: those selected in other rows are
   * hidden (the same column cannot be selected twice), the row's own value stays.
   */
  columnsFor(index: number): PublishedColumn[] {
    const taken = new Set(
      this.recordFields.controls
        .filter((_, i) => i !== index)
        .map(c => String(c.value.column ?? '').toLowerCase()));

    return this.columns().filter(c => !taken.has(c.columnName.toLowerCase()));
  }

  /** Text in the column picker: "Label (ColumnName)" or just the column name. */
  columnLabel(column: PublishedColumn): string {
    return column.label && column.label !== column.columnName
      ? `${column.label} (${column.columnName})`
      : column.columnName;
  }

  // ── Closing ───────────────────────────────────────────────────────────────

  onSpecialStep(step: WorkflowStep): void {
    this.specialDraft.set(step);
    this.specialError.set(null);
  }

  onEndDraft(draft: EndDraft): void {
    this.specialDraft.set(draft.step);
    this.specialLabel.set(draft.statusLabel);
    this.specialError.set(null);
  }

  /** Saving steps with a custom editor: the key rule is the same as the panel's; with no change the document does not change. */
  private saveSpecial(): void {
    const draft = this.specialDraft();
    const original = this.step();
    if (!draft || !original) return;

    const problem = keyProblem(draft.key, this.stepKeys(), this.originalKey());
    if (problem) {
      this.specialError.set(this.languageService.t(`workflow.inspector.key.${problem}`));
      return;
    }

    if (JSON.stringify(draft) === JSON.stringify(original) && this.specialLabel() === this.statusLabel()) {
      this.cancelled.emit();
      return;
    }

    this.saved.emit({ step: draft, statusLabel: this.specialLabel(), originalKey: this.originalKey() });
  }

  save(): void {
    if (this.readonly()) {
      this.cancelled.emit();
      return;
    }

    if (this.special()) {
      this.saveSpecial();
      return;
    }

    // The key must be unique in the flow: if two steps carry the same key it becomes
    // unclear which one connections go to, and the validator rejects publishing.
    const key = String(this.form.get('key')?.value ?? '');
    this.duplicateKey = this.stepKeys().some(existing =>
      sameKey(existing, key) && !sameKey(existing, this.originalKey()));

    if (this.form.invalid || this.duplicateKey) {
      this.form.markAllAsTouched();
      this.showErrors = true;
      return;
    }

    // If an existing step was saved without any change it is not written to the document: since the mapper
    // normalises the step (empty form → explicit fields) the document would look "changed"
    // and the user would get a pointless "unsaved changes" warning.
    // (pristine is not enough: adding and removing a branch/field does not mark the control "dirty".)
    if (!this.isNew() && JSON.stringify(this.form.getRawValue()) === this.initialValue) {
      this.cancelled.emit();
      return;
    }

    const { step, statusLabel } = stepFromFormValue(this.form.getRawValue(), this.step());
    this.saved.emit({ step, statusLabel, originalKey: this.originalKey() });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancel();
  }

  /** Should the field show an error (touched + invalid). */
  invalid(path: string): boolean {
    const control = this.form.get(path);
    return !!control && control.invalid && control.touched;
  }
}
