import { FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { RecordField, WorkflowForm, WorkflowFormField } from '../../../models/workflow.model';
import { inputTypeFor } from '../../model-data/model-data.util';

/** Parsed task schema — array fields and allowReject are always set. */
export interface TaskSchema extends WorkflowForm {
  fields: WorkflowFormField[];
  recordFields: RecordField[];
  allowReject: boolean;
}

/**
 * Task schema helpers — PURE. The decision form on the task detail and the step action
 * dialog on the record screen interpret the same schema with the same rules.
 *
 * The schema is read from the TASK (`formSchemaJson`), not the DEFINITION: it shows the form as it
 * was when the task was opened; the definition may have moved to a new version since.
 */

/**
 * Parses the task's schema copy. Returns an empty schema for broken/empty JSON — a broken schema
 * must not lock the form; it continues with just the comment field. Older copies have no
 * `allowReject`: it counts as true (every approval step had an implicit reject path).
 */
export function parseTaskSchema(json: string | null | undefined): TaskSchema {
  const empty: TaskSchema = { fields: [], recordFields: [], allowReject: true };
  if (!json?.trim()) return empty;
  try {
    const parsed = JSON.parse(json) as Partial<WorkflowForm>;
    return {
      ...parsed,
      fields: parsed.fields ?? [],
      recordFields: parsed.recordFields ?? [],
      allowReject: parsed.allowReject !== false
    };
  } catch {
    return empty;
  }
}

/** Initial value of a free field — false for a checkbox, empty for the others. */
export function defaultValueFor(field: WorkflowFormField): unknown {
  return inputTypeFor(field.dataType) === 'checkbox' ? false : '';
}

/** Form group for the free fields + comment. */
export function buildTaskForm(fb: FormBuilder, fields: WorkflowFormField[]): FormGroup {
  const controls: Record<string, unknown> = { comment: [''] };

  for (const field of fields) {
    const validators: ValidatorFn[] = field.isRequired ? [Validators.required] : [];
    if (field.maxLength && field.maxLength > 0) {
      validators.push(Validators.maxLength(field.maxLength));
    }
    controls[field.name] = [defaultValueFor(field), validators];
  }

  return fb.group(controls);
}

/** `{ comment, formDataJson }` from the form — formDataJson is null if there are no fields (the server doesn't validate an empty schema). */
export function readTaskForm(
  form: FormGroup, fields: WorkflowFormField[]
): { comment: string | null; formDataJson: string | null } {
  const { comment, ...values } = form.getRawValue() as Record<string, unknown>;
  return {
    comment: (comment as string) || null,
    formDataJson: fields.length > 0 ? JSON.stringify(values) : null
  };
}
