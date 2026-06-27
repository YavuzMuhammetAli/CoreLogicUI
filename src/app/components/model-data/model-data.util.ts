/**
 * model-data.util.ts
 * Model veri ekranı için ortak yardımcı saf fonksiyonlar.
 * Hem ModelDataComponent hem de ModelChildrenComponent tarafından yeniden kullanılır.
 */

import { PublishedColumn } from '../../services/published-model.service';

type DataRow = Record<string, unknown>;

/** Veri tipine göre HTML input tipi */
export function inputTypeFor(dataType: string): string {
  switch (dataType) {
    case 'int':
    case 'float':
    case 'decimal': return 'number';
    case 'datetime': return 'date';
    case 'boolean': return 'checkbox';
    case 'image':
    case 'file':    return 'file';
    default: return 'text';
  }
}

/**
 * Form değerini backend JSON deserializasyonu için temizler.
 * string olmayan kolonlarda boş değer ('' / null / undefined) → null
 * (backend Nullable<DateTime>/<bool>/<int> null kabul eder, '' edemez).
 * boolean kolonlar gerçek boolean'a normalize edilir.
 */
export function sanitizePayload(columns: PublishedColumn[], formValue: DataRow): DataRow {
  const typeByName = new Map(columns.map(c => [c.columnName, c.dataType]));
  const out: DataRow = { ...formValue };
  for (const [key, val] of Object.entries(out)) {
    const dataType = typeByName.get(key);
    if (!dataType) continue;                 // ID gibi meta alanlar dokunulmaz
    if (dataType === 'boolean') {
      out[key] = val === '' || val == null ? null : Boolean(val);
      continue;
    }
    if (dataType !== 'string' && (val === '' || val == null)) {
      out[key] = null;                       // datetime / int / float / decimal
    }
  }
  return out;
}

/**
 * Base64 string'inin ilk birkaç baytına bakarak MIME tipini tahmin eder.
 * Tanınamayan format için null döner.
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
 * base64 magic byte'larından dosya uzantısını tahmin eder.
 * Oturum kapandıktan sonra yüklenen dosyalar için fallback.
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

/** Değer bir resim base64'ü ise true döner */
export function isImage(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  return mimeFromBase64(value) !== null;
}

/** base64 resmi için <img src> değeri üretir */
export function imageSrc(b64: string): string {
  const mime = mimeFromBase64(b64) ?? 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

/**
 * Değerin yüklenen dosyaya ait base64 binary içerik olup olmadığını kontrol eder.
 * Gerçek binary data: uzundur (≥64 karakter), 4'ün katı uzunluktadır ve
 * base64 karakter setinden oluşur.  Normal metin string'lerini yanlışlıkla
 * "dosya" olarak işaretlemekten kaçınmak için bu eşikler zorunludur.
 */
export function isBase64Value(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 64 || value.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Satırdan kolon adına (casing-bağımsız) karşılık gelen ham değeri döndürür.
 * Backend kolon meta adını PascalCase (örn. "UnitPrice") döndürürken, satır verisi
 * ASP.NET Core'un varsayılan System.Text.Json politikasıyla camelCase ("unitPrice")
 * serileştirilir. Bu fonksiyon casing'den bağımsız eşleştirme yaparak ikisini birleştirir.
 */
export function fieldValue(row: DataRow, key: string): unknown {
  if (key in row) return row[key];               // birebir eşleşme (hızlı yol)
  const lower = key.toLowerCase();
  for (const k of Object.keys(row)) {
    if (k.toLowerCase() === lower) return row[k]; // camelCase dahil casing-bağımsız
  }
  return undefined;
}

/** Satırdan hücre değerini string olarak döndürür */
export function cellValue(row: DataRow, key: string): string {
  const v = fieldValue(row, key);
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓' : '✗';
  return String(v);
}

/** Satırdan belirli bir anahtara ait değeri string olarak döndürür (büyük/küçük toleranslı) */
export function rowVal(row: DataRow, key: string): string {
  const v = fieldValue(row, key);
  return typeof v === 'string' ? v : '';
}

/** Dosyayı orijinal adıyla (veya magic-byte tahminli adla) indirir */
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
