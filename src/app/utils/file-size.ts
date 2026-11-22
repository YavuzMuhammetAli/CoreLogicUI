import { ValidatorFn } from '@angular/forms';
import { Lang } from '../services/language.service';
import { formatNumber } from './locale-format';

/**
 * Size limit for `image` / `file` columns.
 *
 * For these types the schema's `maxLength` is not characters but **the file size limit (KB)**. Since the column
 * is always `varbinary(max)` in DDL, the value is only read during validation (no migration).
 * Backend counterpart: `Core/Constants/FileLimits.cs` — the cap must be the same on both sides.
 *
 * The user enters the limit in MB (decimals allowed: 0.5 MB); it is converted to KB when stored.
 */

/** Types compiled as byte[], for which a size limit is meaningful. */
const FILE_TYPES = new Set(['image', 'file']);

export function isFileType(dataType: string | null | undefined): boolean {
  return FILE_TYPES.has(dataType ?? '');
}

/**
 * Allowed type groups of a file column. Stored in the schema's `enumValues` as `pdf|office`;
 * unrestricted if empty. The server checks the content from its bytes (backend `Core/Utilities/Files/FileSignature`);
 * the `accept` here is only a convenience in the file picker.
 */
export const FILE_TYPE_GROUPS = ['pdf', 'image', 'office', 'text'] as const;
export type FileTypeGroup = (typeof FILE_TYPE_GROUPS)[number];

/** What the server accepts as images. An explicit `accept` list makes iOS convert HEIC to JPEG. */
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,image/bmp';

const GROUP_ACCEPT: Record<FileTypeGroup, string> = {
  pdf: '.pdf,application/pdf',
  image: IMAGE_ACCEPT,
  office: '.doc,.docx,.xls,.xlsx,.ppt,.pptx',
  text: '.txt,.csv,.tsv,.json,.xml,.md,.log,text/plain,text/csv'
};

export function parseFileGroups(value: string | null | undefined): FileTypeGroup[] {
  const selected = new Set((value ?? '').split('|').map(s => s.trim()));
  return FILE_TYPE_GROUPS.filter(group => selected.has(group));
}

/** Groups are stored in a fixed order in the schema: so the saved value matches the form key. */
export function joinFileGroups(groups: readonly FileTypeGroup[]): string {
  return FILE_TYPE_GROUPS.filter(group => groups.includes(group)).join('|');
}

/** The file picker's `accept` value; null if unrestricted. */
export function fileAccept(dataType: string, enumValues: string | null | undefined): string | null {
  if (dataType === 'image') return IMAGE_ACCEPT;
  const groups = parseFileGroups(enumValues);
  return groups.length ? groups.map(group => GROUP_ACCEPT[group]).join(',') : null;
}

/** Image cap: 50 MB. */
export const IMAGE_MAX_FILE_KB = 50 * 1024;

/**
 * File cap: 100 MB. The file travels as base64 in the JSON body (33% overhead) and is held in memory
 * in one piece in both the browser and the server; this is the safe upper bound with the current
 * transport. Anything larger needs chunked (streaming) upload + off-row storage.
 */
export const FILE_MAX_FILE_KB = 100 * 1024;

/** Lower bound of the MB input on the schema screen (~10 KB). */
export const MIN_FILE_LIMIT_MB = 0.01;

/** The type's cap (KB): image 50 MB, file 100 MB. Also applied to columns without a limit. */
export function maxFileKbFor(dataType: string | null | undefined): number {
  return dataType === 'image' ? IMAGE_MAX_FILE_KB : FILE_MAX_FILE_KB;
}

/** The type's cap (MB) — upper bound of the input on the schema screen. */
export function maxFileMbFor(dataType: string | null | undefined): number {
  return maxFileKbFor(dataType) / 1024;
}

/** The smaller of the column limit and the type cap (KB); the cap if there is no limit. */
export function effectiveFileLimitKb(dataType: string | null | undefined, maxLengthKb: number | null | undefined): number {
  const cap = maxFileKbFor(dataType);
  return maxLengthKb != null && maxLengthKb > 0 ? Math.min(maxLengthKb, cap) : cap;
}

/**
 * Validator for the "Maks. Dosya Boyutu (MB)" (max file size) input on the schema screen. Since the upper bound
 * depends on the column's type it is read from the sibling `dataType` control; when the type changes the caller
 * re-validates with `updateValueAndValidity()`.
 */
export const fileLimitMbValidator: ValidatorFn = control => {
  const value = control.value;
  if (value === null || value === undefined || value === '') return null;
  // When created the control is not attached to a group yet; no decision without knowing the type.
  // It is re-validated when the value or type changes (the select's change, popup save).
  if (!control.parent) return null;
  // Hidden field: if the column is not a file type the value is not saved (normalizeColumnRules), so don't block.
  const dataType = control.parent.get('dataType')?.value;
  if (!isFileType(dataType)) return null;
  const mb = Number(value);
  const max = maxFileMbFor(dataType);
  if (!Number.isFinite(mb) || mb < MIN_FILE_LIMIT_MB) return { fileLimitRange: { min: MIN_FILE_LIMIT_MB, max } };
  if (mb > max) return { fileLimitRange: { min: MIN_FILE_LIMIT_MB, max } };
  return null;
};

/** MB entered by the user → stored KB (integer, at least 1). Empty → null. */
export function mbToKb(mb: number | string | null | undefined): number | null {
  if (mb === null || mb === undefined || mb === '') return null;
  const value = Number(mb);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.max(1, Math.round(value * 1024));
}

/** Stored KB → MB shown in the form (at most 2 decimals). Empty → null. */
export function kbToMb(kb: number | null | undefined): number | null {
  if (kb == null || kb <= 0) return null;
  return Math.round((kb / 1024) * 100) / 100;
}

/** Decoded byte length of base64 text (the file's actual size). */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/** Readable size: 512 KB, 1.5 MB (per the active language). */
export function formatFileSize(bytes: number, lang: Lang): string {
  const kb = bytes / 1024;
  if (kb < 1024) return `${formatNumber(Math.max(1, Math.round(kb)), lang)} KB`;
  return `${formatNumber(Math.round((kb / 1024) * 10) / 10, lang)} MB`;
}

/** i18n key + placeholders for the error text (the component adds its own label). */
export interface FileSizeError {
  key: 'model.detail.fieldMaxFileSize';
  params: { actual: string; limit: string };
}

/**
 * Does the selected file exceed the limit? Called BEFORE the file is read — so a large file need not be
 * converted to base64 and loaded into memory. An error if it exceeds, otherwise null.
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
 * `{ maxFileSize: { limitKb, actualBytes } }` if the form value (base64) exceeds the limit.
 * A defence layer behind the check at selection time: even if the value arrives another way
 * (old data loaded from the record), the form cannot be saved with a file over the limit.
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
