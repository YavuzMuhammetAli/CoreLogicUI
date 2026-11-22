import {
  ChangeDetectionStrategy, Component, OnChanges, SimpleChanges, inject, input, output, signal
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkflowTaskService } from '../../../services/workflow-task.service';
import { WorkflowFormField, WorkflowTask } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { inputTypeFor, stepFor, parseEnumValues } from '../../model-data/model-data.util';
import { TaskSchema, buildTaskForm, parseTaskSchema, readTaskForm } from './task-form.util';
import { IconComponent } from '../icon/icon.component';

/**
 * Task decision form — step form + comment + Approve/Reject.
 *
 * The task detail (`/tasks/:id`) and the record detail (`/models/:type/:id`) use the same
 * form; the decision logic lives in one place.
 *
 * The decision is sent WITHOUT AN INTERMEDIATE CONFIRMATION DIALOG: the user has already filled
 * the form and chosen the button; a second "are you sure" step only added a click.
 *
 * The dynamic form was NOT REWRITTEN: since the step schema shares the `dataType` vocabulary
 * with model columns (CoreLogicTypeMap), the `inputTypeFor`, `stepFor` and
 * `parseEnumValues` helpers are used as is.
 *
 * The form schema is read from the TASK, not the DEFINITION — it shows the form as it was when the task
 * was opened; the definition may have moved to a new version since.
 */
@Component({
    selector: 'app-task-decision-form',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IconComponent],
    templateUrl: './task-decision-form.component.html',
    styleUrl: './task-decision-form.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDecisionFormComponent implements OnChanges {
  readonly task = input.required<WorkflowTask>();
  /** Panel title; "Onay formu" (Approval form) if not given. */
  readonly heading = input<string | null>(null);

  /** The decision was accepted by the server — with the server message. */
  readonly completed = output<string>();

  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(WorkflowTaskService);
  private readonly languageService = inject(LanguageService);

  // Pure helpers are bound as fields so the template can call them
  // (same pattern as record-form-dialog).
  readonly inputTypeFor = inputTypeFor;
  readonly stepFor = stepFor;
  readonly parseEnumValues = parseEnumValues;

  fields: WorkflowFormField[] = [];
  schema: TaskSchema = parseTaskSchema(null);
  form: FormGroup = this.fb.group({ comment: [''] });

  /** The decision being submitted — to show a spinner on the pressed button. */
  readonly saving = signal<'approve' | 'reject' | null>(null);
  readonly submitError = signal<string | null>(null);

  get isClosed(): boolean {
    return this.task().status !== 'Pending';
  }

  /**
   * If the step requires RECORD fields, approval is given from the record screen: the fields are
   * filled there, in the form itself, and written in the same transaction as the approval. Approving
   * here would mean leaving required fields empty and getting an error from the server.
   */
  get approveOnRecord(): boolean {
    return this.schema.recordFields.length > 0;
  }

  /** The admin "Atla" (Skip) action reads its reason from this field. */
  get commentValue(): string | null {
    return (this.form.get('comment')?.value as string) || null;
  }

  /**
   * The form must be built BEFORE the first render (formControlNames throw if they
   * can't find their control) — hence ngOnChanges, not effect.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['task']) {
      this.schema = parseTaskSchema(this.task().formSchemaJson);
      this.fields = this.schema.fields;
      this.buildForm();
      this.submitError.set(null);
    }
  }

  private buildForm(): void {
    this.form = buildTaskForm(this.fb, this.fields);

    if (this.isClosed) {
      // On a closed task the form is read-only: the past decision is visible but can't be changed.
      this.patchExistingValues();
      this.form.disable();
    }
  }

  private patchExistingValues(): void {
    const task = this.task();
    if (!task.formDataJson) {
      this.form.patchValue({ comment: task.comment ?? '' }, { emitEvent: false });
      return;
    }

    try {
      const values = JSON.parse(task.formDataJson) as Record<string, unknown>;
      this.form.patchValue({ ...values, comment: task.comment ?? '' }, { emitEvent: false });
    } catch {
      this.form.patchValue({ comment: task.comment ?? '' }, { emitEvent: false });
    }
  }

  fieldLabel(field: WorkflowFormField): string {
    return field.label?.trim() || field.name;
  }

  decide(decision: 'approve' | 'reject'): void {
    if (this.saving()) return;

    // Form validation is required on approve; NOT on reject — forcing required fields
    // to be filled in order to reject a request would make no sense.
    if (decision === 'approve' && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(decision);
    this.submitError.set(null);

    const { comment, formDataJson } = readTaskForm(this.form, this.fields);

    this.taskService.complete({
      taskId: this.task().id,
      decision,
      comment,
      formDataJson
    }).subscribe({
      next: res => {
        this.saving.set(null);
        if (res.success) {
          this.completed.emit(res.message ?? '');
        } else {
          this.submitError.set(res.message ?? this.languageService.t('task.detail.submitFailed'));
        }
      },
      error: err => {
        this.saving.set(null);
        this.submitError.set(err?.error?.message ?? this.languageService.t('task.detail.serverError'));
      }
    });
  }

  errorFor(field: WorkflowFormField): string | null {
    const control = this.form.get(field.name);
    if (!control || !control.touched || control.valid) return null;

    if (control.hasError('required')) {
      return this.languageService.t('common.required');
    }
    if (control.hasError('maxlength')) {
      return this.languageService.t('task.detail.tooLong', { max: String(field.maxLength ?? '') });
    }
    return null;
  }
}
