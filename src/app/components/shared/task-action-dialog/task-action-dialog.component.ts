import {
  ChangeDetectionStrategy, Component, HostListener, OnChanges, SimpleChanges, inject, input, output
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { WorkflowFormField } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { inputTypeFor, parseEnumValues, stepFor } from '../../model-data/model-data.util';
import { buildTaskForm, parseTaskSchema, readTaskForm } from '../task-decision-form/task-form.util';

/** Decision data collected by the dialog — record fields don't go here (they're in the form itself). */
export interface TaskActionResult {
  comment: string | null;
  formDataJson: string | null;
}

/**
 * Dialog for the step button on the record screen: the step's EXTRA decision fields + comment.
 *
 * Record fields are NOT filled here but in the record's own form; this dialog
 * only collects decision data that isn't written to the record. The caller does the submit
 * (so it can put the record values into the same request) — the dialog only shows
 * the state via `busy`/`error`.
 *
 * On approve, if there are no extra fields the dialog never opens (no intermediate confirmation principle);
 * on reject it always opens so a comment can be written.
 */
@Component({
    selector: 'app-task-action-dialog',
    imports: [ReactiveFormsModule, TranslatePipe],
    templateUrl: './task-action-dialog.component.html',
    styleUrl: './task-action-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskActionDialogComponent implements OnChanges {
  readonly open = input(false);
  readonly decision = input<'approve' | 'reject'>('approve');
  /** Button text and title — come from the step label. */
  readonly actionLabel = input('');
  readonly schemaJson = input<string | null | undefined>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  /** The form has unsaved changes and this action won't write them. */
  readonly discardsChanges = input(false);

  readonly confirmed = output<TaskActionResult>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly languageService = inject(LanguageService);

  readonly inputTypeFor = inputTypeFor;
  readonly stepFor = stepFor;
  readonly parseEnumValues = parseEnumValues;

  fields: WorkflowFormField[] = [];
  form: FormGroup = this.fb.group({ comment: [''] });

  /** The form must be built BEFORE the first render — ngOnChanges, not effect. */
  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open();
    if (opened || changes['schemaJson']) {
      this.fields = parseTaskSchema(this.schemaJson()).fields;
      this.form = buildTaskForm(this.fb, this.fields);
    }
  }

  get isReject(): boolean {
    return this.decision() === 'reject';
  }

  submit(): void {
    if (this.busy()) return;

    // Extra fields are validated on approve; NOT on reject — forcing the user to fill the
    // approval form in order to reject makes no sense (the server doesn't require it on reject either).
    if (!this.isReject && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.confirmed.emit(readTaskForm(this.form, this.fields));
  }

  cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.cancel();
  }

  fieldLabel(field: WorkflowFormField): string {
    return field.label?.trim() || field.name;
  }

  errorFor(field: WorkflowFormField): string | null {
    const control = this.form.get(field.name);
    if (!control || !control.touched || control.valid) return null;
    if (control.hasError('required')) return this.languageService.t('common.required');
    if (control.hasError('maxlength')) {
      return this.languageService.t('task.detail.tooLong', { max: String(field.maxLength ?? '') });
    }
    return null;
  }
}
