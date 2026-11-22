/**
 * model-data.util.ts
 * Shared pure helper functions for the model data screen.
 * Reused by ModelDataComponent, model-detail and the shared form/dialog components.
 */

import { PublishedColumn } from '../../services/published-model.service';
import { isFileRef } from '../../utils/record-file';

type DataRow = Record<string, unknown>;

/** HTML input type by data type */
export function inputTypeFor(dataType: string): string {
  switch (dataType) {
    case 'int':
    case 'long':
    case 'short':
    case 'byte':
    case 'float':
    case 'double':
    case 'decimal':  return 'number';
    case 'datetime': return 'datetime-local';
    case 'dateonly': return 'date';
    case 'timeonly': return 'time';
    case 'boolean':  return 'checkbox';
    case 'guid':     return 'text';
    // enum/lookup are handled by a custom <select> render (see the relevant components);
    // this function is used only for columns that produce a plain <input> type.
    case 'image':
    case 'file':     return 'file';
    default: return 'text';
  }
}

/**
 * `step` attribute for date/time inputs. `datetime-local` and `time` boxes
 * work with a 60 s step by default and do not show the seconds field at all; a value with
 * seconds then looks incomplete to the user. `step="1"` enables the seconds field,
 * so the value produced by `toInputValue` can be shown and read back as is.
 * Returns null for other types so the attribute is not rendered at all.
 */
export function stepFor(dataType: string): string | null {
  return dataType === 'datetime' || dataType === 'timeonly' ? '1' : null;
}

/**
 * Reduces the server's ISO date/time value to the format the relevant HTML input accepts.
 * The browser sanitizes the value written to `datetime-local` / `date` / `time` boxes:
 * any format it does not accept, such as fractional seconds ("…T07:27:04.72") or a 'Z' suffix,
 * SILENTLY becomes an empty string. The field looks empty, the user thinks it is empty, taps the
 * calendar box, the browser writes the current time and the record's real date is overwritten.
 *
 * The value is not parsed with `new Date(...)` — the server sends a value without a time zone
 * (Kind=Unspecified); parsing would introduce a local time shift and corrupt the date again.
 * Instead it is trimmed at string boundaries:
 *   datetime → 'YYYY-MM-DDTHH:mm:ss'   dateonly → 'YYYY-MM-DD'   timeonly → 'HH:mm:ss'
 *
 * For non-date/time columns the value is returned as is (including null).
 */
export function toInputValue(dataType: string, raw: unknown): unknown {
  if (dataType !== 'datetime' && dataType !== 'dateonly' && dataType !== 'timeonly') {
    return raw;
  }
  if (typeof raw !== 'string' || raw === '') return '';

  if (dataType === 'timeonly') {
    const t = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
    return t ? `${t[1]}:${t[2]}:${t[3] ?? '00'}` : '';
  }

  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
  if (!m) return '';
  if (dataType === 'dateonly') return m[1];
  return `${m[1]}T${m[2] ?? '00'}:${m[3] ?? '00'}:${m[4] ?? '00'}`;
}

/**
 * Cleans the form value for backend JSON deserialization.
 * Empty value ('' / null / undefined) → null (the backend accepts null for Nullable<DateTime>/<bool>/<int>,
 * not ''). Boolean columns are normalised to real booleans.
 *
 * STRING columns are included too: the backend's `ValidateDynamicEntity` skips all rule
 * checks for null values (`if (value == null) continue;`) but treats an empty string as a normal
 * value — so if an optional field left empty were sent as '', the
 * regex/minLength rule would run on '' and the record would be rejected needlessly.
 * Behaviour for required fields is unchanged: the backend checks with `IsNullOrWhiteSpace`.
 *
 * An unchanged file (the `FileRef` sent by the server) is REMOVED from the payload: the server does not touch
 * a file column whose key is absent. The file itself is not on the client; there is no content to send back.
 */
export function sanitizePayload(columns: PublishedColumn[], formValue: DataRow): DataRow {
  const typeByName = new Map(columns.map(c => [c.columnName, c.dataType]));
  const out: DataRow = { ...formValue };
  for (const [key, val] of Object.entries(out)) {
    if (isFileRef(val)) {
      delete out[key];
      continue;
    }
    const dataType = typeByName.get(key);
    if (!dataType) continue;                 // meta fields such as ID are left untouched
    if (dataType === 'boolean') {
      out[key] = val === '' || val == null ? null : Boolean(val);
      continue;
    }
    if (val === '' || val == null) {
      out[key] = null;                       // string / datetime / int / float / decimal
    }
  }
  return out;
}

/**
 * Guesses the MIME type by looking at the first few bytes of a base64 string.
 * Returns null for an unrecognised format.
 */
export function mimeFromBase64(b64: string): string | null {
  if (!b64) return null;
  const p = b64.substring(0, 8);
  if (p.startsWith('/9j/'))   return 'image/jpeg';
  if (p.startsWith('iVBOR'))  return 'image/png';
  if (p.startsWith('R0lGOD')) return 'image/gif';
  if (p.startsWith('UklGR'))  return 'image/webp';
  if (p.startsWith('Qk'))     return 'image/bmp';
  return null;
}

/**
 * Guesses the file extension from base64 magic bytes.
 * Fallback for files uploaded after the session was closed.
 */
export function extFromBase64(b64: string): string {
  const p = b64.substring(0, 8);
  if (p.startsWith('/9j/'))    return '.jpg';
  if (p.startsWith('iVBOR'))   return '.png';
  if (p.startsWith('R0lGO'))   return '.gif';
  if (p.startsWith('UklGR'))   return '.webp';
  if (p.startsWith('JVBE'))    return '.pdf';
  if (p.startsWith('0M8R'))    return '.xls';
  if (p.startsWith('UEsD'))    return '.xlsx';
  if (p.startsWith('JVBEr'))   return '.pdf';
  return '.bin';
}

/** Converts an enum column's allowed values from '|'-separated text to an array. */
export function parseEnumValues(enumValues: string | null | undefined): string[] {
  if (!enumValues) return [];
  return enumValues.split('|').map(v => v.trim()).filter(v => v.length > 0);
}

/** Returns true if the value is an image base64 */
export function isImage(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  return mimeFromBase64(value) !== null;
}

/** Produces the <img src> value for a base64 image */
export function imageSrc(b64: string): string {
  const mime = mimeFromBase64(b64) ?? 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

/**
 * Checks whether the value is base64 binary content belonging to an uploaded file.
 * Real binary data: is long (≥64 characters), has a length that is a multiple of 4 and
 * consists of the base64 character set. These thresholds are required to avoid
 * accidentally flagging normal text strings as "files".
 */
export function isBase64Value(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 64 || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Returns the raw value for a column name from the row (casing-independent).
 * The backend returns column meta names in PascalCase (e.g. "UnitPrice"), while row data
 * is serialised in camelCase ("unitPrice") by ASP.NET Core's default System.Text.Json policy.
 * This function reconciles the two with casing-independent matching.
 */
export function fieldValue(row: DataRow, key: string): unknown {
  if (key in row) return row[key];               // exact match (fast path)

  // Slow path: a casing-independent index of the row is built ONCE and attached to the row.
  // Previously Object.keys(row) + N toLowerCase() calls ran on every call; since the template
  // called it 3 times per cell and the components were not OnPush, the cost
  // was O(columns²) on every change detection cycle.
  let index = (row as RowWithIndex)[LOWER_KEY_INDEX];
  if (!index) {
    index = new Map<string, string>();
    for (const k of Object.keys(row)) index.set(k.toLowerCase(), k);
    Object.defineProperty(row, LOWER_KEY_INDEX, {
      value: index,
      enumerable: false,   // does not leak into JSON.stringify or {...row} spreading
      writable: true,
      configurable: true
    });
  }

  const actualKey = index.get(key.toLowerCase());
  return actualKey === undefined ? undefined : row[actualKey];
}

/** Casing-independent key index that fieldValue builds per row (non-enumerable). */
const LOWER_KEY_INDEX = Symbol('lowerKeyIndex');
type RowWithIndex = DataRow & { [LOWER_KEY_INDEX]?: Map<string, string> };

/** Returns the cell value from the row as a string */
export function cellValue(row: DataRow, key: string): string {
  const v = fieldValue(row, key);
  if (v === null || v === undefined) return '—';
  if (isFileRef(v)) return '📎';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return String(v);
}

/** Returns the value for a given key from the row as a string (case-tolerant) */
export function rowVal(row: DataRow, key: string): string {
  const v = fieldValue(row, key);
  return typeof v === 'string' ? v : '';
}

/** Downloads the file with its original name (or a name guessed from magic bytes) */
export function downloadFile(b64: string, colName: string, fileNames: Record<string, string> = {}): void {
  const fileName = fileNames[colName] ?? `${colName}${extFromBase64(b64)}`;
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
