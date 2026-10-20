import { ValidationErrors } from '@angular/forms';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { Lang } from '../../services/language.service';
import { formatFileSize } from '../file-size';

/** Çeviri fonksiyonu — `LanguageService.t` ile aynı imza (spec'te sahtesi verilir). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Bir kayıt alanının doğrulama hatasını okunur metne çevirir; hata yoksa null.
 *
 * Kayıt formu (model-detail) ve alt kayıt pop-up'ı bu metni eskiden ayrı ayrı, birebir
 * aynı kodla üretiyordu. Öncelik validator'ların bağlanma sırasıdır (bkz. `validatorsFor`):
 * zorunluluk → desen → uzunluk → aralık → dosya boyutu. `pattern` hatasında şema
 * builder'da yazılan "Regex Mesajı" tercih edilir — kullanıcıya en anlamlı açıklama odur.
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
