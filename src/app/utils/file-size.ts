import { ValidatorFn } from '@angular/forms';
import { Lang } from '../services/language.service';
import { formatNumber } from './locale-format';

/**
 * `image` / `file` kolonlarının boyut sınırı.
 *
 * Bu tiplerde şemadaki `maxLength` karakter değil, **dosya boyutu sınırıdır (KB)**. Kolon
 * DDL'de hep `varbinary(max)` olduğu için değer yalnızca doğrulamada okunur (migrasyon yok).
 * Backend eşi: `Core/Constants/FileLimits.cs` — tavan iki tarafta aynı olmalı.
 *
 * Kullanıcı sınırı MB olarak girer (ondalıklı: 0,5 MB); saklarken KB'ye çevrilir.
 */

/** byte[] olarak derlenen, boyut sınırı anlamlı tipler. */
const FILE_TYPES = new Set(['image', 'file']);

export function isFileType(dataType: string | null | undefined): boolean {
  return FILE_TYPES.has(dataType ?? '');
}

/** Resim tavanı: 50 MB. */
export const IMAGE_MAX_FILE_KB = 50 * 1024;

/**
 * Dosya tavanı: 100 MB. Dosya JSON gövdesinde base64 olarak gider (%33 şişer) ve hem
 * tarayıcıda hem sunucuda tek parça bellekte tutulur; mevcut taşıma yöntemiyle güvenli
 * üst sınır budur. Daha büyüğü için parçalı (streaming) yükleme + satır dışı depolama gerekir.
 */
export const FILE_MAX_FILE_KB = 100 * 1024;

/** Şema ekranındaki MB girişinin alt sınırı (~10 KB). */
export const MIN_FILE_LIMIT_MB = 0.01;

/** Tipin tavanı (KB): image 50 MB, file 100 MB. Sınır verilmemiş kolonlarda da bu uygulanır. */
export function maxFileKbFor(dataType: string | null | undefined): number {
  return dataType === 'image' ? IMAGE_MAX_FILE_KB : FILE_MAX_FILE_KB;
}

/** Tipin tavanı (MB) — şema ekranındaki girişin üst sınırı. */
export function maxFileMbFor(dataType: string | null | undefined): number {
  return maxFileKbFor(dataType) / 1024;
}

/** Kolon sınırı ile tipin tavanından küçük olanı (KB); sınır yoksa tavan. */
export function effectiveFileLimitKb(dataType: string | null | undefined, maxLengthKb: number | null | undefined): number {
  const cap = maxFileKbFor(dataType);
  return maxLengthKb != null && maxLengthKb > 0 ? Math.min(maxLengthKb, cap) : cap;
}

/**
 * Şema ekranındaki "Maks. Dosya Boyutu (MB)" girişinin doğrulayıcısı. Üst sınır sütunun
 * tipine bağlı olduğu için kardeş `dataType` kontrolünden okunur; tip değişince çağıran
 * `updateValueAndValidity()` ile yeniden doğrulatır.
 */
export const fileLimitMbValidator: ValidatorFn = control => {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  // Kontrol oluşturulurken henüz gruba bağlı değildir; tip bilinmeden karar verilmez.
  // Değer ya da tip değişince (select'in change'i, popup kaydı) yeniden doğrulanır.
  if (!control.parent) return null;
  // Gizli alan: sütun dosya tipinde değilse değer kaydedilmez (normalizeColumnRules), engellemez.
  const dataType = control.parent.get('dataType')?.value;
  if (!isFileType(dataType)) return null;
  const mb = Number(value);
  const max = maxFileMbFor(dataType);
  if (!Number.isFinite(mb) || mb < MIN_FILE_LIMIT_MB) return { fileLimitRange: { min: MIN_FILE_LIMIT_MB, max } };
  if (mb > max) return { fileLimitRange: { min: MIN_FILE_LIMIT_MB, max } };
  return null;
};

/** Kullanıcının girdiği MB → saklanan KB (tam sayı, en az 1). Boş → null. */
export function mbToKb(mb: number | string | null | undefined): number | null {
  if (mb === null || mb === undefined || mb === '') return null;
  const value = Number(mb);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.round(value * 1024));
}

/** Saklanan KB → forma gösterilecek MB (en fazla 2 ondalık). Boş → null. */
export function kbToMb(kb: number | null | undefined): number | null {
  if (kb == null || kb <= 0) return null;
  return Math.round((kb / 1024) * 100) / 100;
}

/** Base64 metnin çözülmüş bayt uzunluğu (dosyanın gerçek boyutu). */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Okunur boyut: 512 KB, 1,5 MB (aktif dile göre). */
export function formatFileSize(bytes: number, lang: Lang): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${formatNumber(Math.max(1, Math.round(kb)), lang)} KB`;
  return `${formatNumber(Math.round((kb / 1024) * 10) / 10, lang)} MB`;
}

/** Hata metni için i18n anahtarı + yer tutucular (bileşen kendi etiketini ekler). */
export interface FileSizeError {
  key: 'model.detail.fieldMaxFileSize';
  params: { actual: string; limit: string };
}

/**
 * Seçilen dosya sınırı aşıyor mu? Dosya OKUNMADAN önce çağrılır — büyük bir dosyayı
 * base64'e çevirip belleğe almaya gerek kalmaz. Aşıyorsa hata, değilse null.
 */
export function fileSizeError(
  file: File,
  dataType: string | null | undefined,
  maxLengthKb: number | null | undefined,
  lang: Lang
): FileSizeError | null {
  const limitKb = effectiveFileLimitKb(dataType, maxLengthKb);
  if (file.size <= limitKb * 1024) return null;
  return {
    key: 'model.detail.fieldMaxFileSize',
    params: { actual: formatFileSize(file.size, lang), limit: formatFileSize(limitKb * 1024, lang) }
  };
}

/**
 * Form değeri (base64) sınırı aşıyorsa `{ maxFileSize: { limitKb, actualBytes } }`.
 * Seçim anındaki engellemenin arkasındaki savunma katmanı: değer başka bir yoldan
 * (kayıttan yüklenen eski veri) gelse de form sınırı aşan dosyayla kaydedilemez.
 */
export function maxFileSizeValidator(
  dataType: string | null | undefined,
  maxLengthKb: number | null | undefined
): ValidatorFn {
  const limitKb = effectiveFileLimitKb(dataType, maxLengthKb);
  return control => {
    const value = control.value;
    if (typeof value !== 'string' || !value) return null;
    const actualBytes = base64ByteLength(value);
    return actualBytes > limitKb * 1024 ? { maxFileSize: { limitKb, actualBytes } } : null;
  };
}
