import { ValidationErrors } from '@angular/forms';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { Lang } from '../../services/language.service';
import { formatFileSize } from '../file-size';

/** Translation function — same signature as `LanguageService.t` (a fake is supplied in specs). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Turns a record field's validation error into readable text; null if there is no error.
 *
 * The record form (model-detail) and the sub-record pop-up used to produce this text separately, with
 * identical code. Precedence follows the order validators are attached (see `validatorsFor`):
 * required → pattern → length → range → file size. For a `pattern` error the "Regex Mesajı" (regex message)
 * written in the schema builder is preferred — it is the most meaningful explanation for the user.
 */
export function fieldErrorText(
  errors: ValidationErrors | null,
  label: string,
  rule: PublishedColumnSchema | undefined,
  t: Translate,
  lang: Lang
): string | null {
  if (!errors) return null;

  if (errors['required']) return t('model.detail.fieldRequired', { label });
  if (errors['pattern']) return rule?.regexMessage?.trim() || t('model.detail.fieldPattern', { label });
  if (errors['minlength']) return t('model.detail.fieldMinLength', { label, min: rule?.minLength ?? 0 });
  if (errors['maxlength']) return t('model.detail.fieldMaxLength', { label, max: rule?.maxLength ?? 0 });
  if (errors['min']) return t('model.detail.fieldMin', { label, min: rule?.min ?? 0 });
  if (errors['max']) return t('model.detail.fieldMax', { label, max: rule?.max ?? 0 });
  if (errors['maxFileSize']) {
    const err = errors['maxFileSize'] as { limitKb: number; actualBytes: number };
    return t('model.detail.fieldMaxFileSize', {
      label,
      actual: formatFileSize(err.actualBytes, lang),
      limit: formatFileSize(err.limitKb * 1024, lang)
    });
  }
  return null;
}
