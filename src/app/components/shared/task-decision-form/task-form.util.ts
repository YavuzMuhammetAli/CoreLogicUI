import { FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { RecordField, WorkflowForm, WorkflowFormField } from '../../../models/workflow.model';
import { inputTypeFor } from '../../model-data/model-data.util';

/** Çözülmüş görev şeması — dizi alanları ve allowReject her zaman dolu. */
export interface TaskSchema extends WorkflowForm {
  fields: WorkflowFormField[];
  recordFields: RecordField[];
  allowReject: boolean;
}

/**
 * Görev şeması yardımcıları — SAF. Görev detayındaki karar formu ve kayıt
 * ekranındaki adım eylem diyaloğu aynı şemayı aynı kurallarla yorumlar.
 *
 * Şema TANIMDAN değil GÖREVDEN (`formSchemaJson`) okunur: görev açıldığı andaki
 * formu gösterir, tanım o sırada yeni bir sürüme geçmiş olabilir.
 */

/**
 * Görevin şema kopyasını çözer. Bozuk/boş JSON'da boş şema döner — bozuk şema
 * formu kilitlememeli, yalnızca açıklama alanıyla devam edilir. Eski kopyalarda
 * `allowReject` yoktur: true sayılır (her onay adımının örtük bir red yolu vardı).
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

/** Serbest alanın başlangıç değeri — onay kutusu false, diğerleri boş. */
export function defaultValueFor(field: WorkflowFormField): unknown {
  return inputTypeFor(field.dataType) === 'checkbox' ? false : '';
}

/** Serbest alanlar + açıklama için form grubu. */
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

/** Formdan `{ comment, formDataJson }` — alan yoksa formDataJson null (sunucu boş şemada doğrulamaz). */
export function readTaskForm(
  form: FormGroup, fields: WorkflowFormField[]
): { comment: string | null; formDataJson: string | null } {
  const { comment, ...values } = form.getRawValue() as Record<string, unknown>;
  return {
    comment: (comment as string) || null,
    formDataJson: fields.length > 0 ? JSON.stringify(values) : null
  };
}
