/**
 * model-data.util.ts
 * Model veri ekranı için ortak yardımcı saf fonksiyonlar.
 * ModelDataComponent, model-detail ve ortak form/diyalog bileşenleri tarafından yeniden kullanılır.
 */

import { PublishedColumn } from '../../services/published-model.service';
import { isFileRef } from '../../utils/record-file';

type DataRow = Record<string, unknown>;

/** Veri tipine göre HTML input tipi */
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
    // enum/lookup özel <select> render'ı ile ele alınır (bkz. ilgili component'ler);
    // bu fonksiyon yalnızca düz <input> tipi üreten kolonlar için kullanılır.
    case 'image':
    case 'file':     return 'file';
    default: return 'text';
  }
}

/**
 * Tarih/saat input'ları için `step` niteliği. `datetime-local` ve `time` kutuları
 * varsayılan olarak 60 sn adımla çalışır ve saniye alanını hiç göstermez; saniyeli
 * bir değer bu durumda kullanıcıya eksik görünür. `step="1"` saniye alanını açar,
 * böylece `toInputValue`'nun ürettiği değer olduğu gibi gösterilip geri alınabilir.
 * Diğer tiplerde niteliğin hiç basılmaması için null döner.
 */
export function stepFor(dataType: string): string | null {
  return dataType === 'datetime' || dataType === 'timeonly' ? '1' : null;
}

/**
 * Sunucudan gelen ISO tarih/saat değerini ilgili HTML input'unun kabul ettiği biçime
 * indirger. Tarayıcı `datetime-local` / `date` / `time` kutularına yazılan değeri
 * sanitize eder: kesirli saniye ("…T07:27:04.72") veya 'Z' eki gibi kabul etmediği
 * her biçim SESSİZCE boş string'e düşer. Alan boş görünür, kullanıcı boş sanıp takvim
 * kutucuğuna dokununca tarayıcı o anki zamanı yazar ve kayıttaki gerçek tarih ezilir.
 *
 * Değer `new Date(...)` ile ayrıştırılmaz — sunucu saat dilimi taşımayan (Kind=Unspecified)
 * bir değer gönderiyor; ayrıştırmak yerel saat kaydırması yaratıp tarihi yine bozar.
 * Bunun yerine string sınırlarından kırpılır:
 *   datetime → 'YYYY-MM-DDTHH:mm:ss'   dateonly → 'YYYY-MM-DD'   timeonly → 'HH:mm:ss'
 *
 * Tarih/saat olmayan kolonlarda değer olduğu gibi (null dahil) geri döner.
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
 * Form değerini backend JSON deserializasyonu için temizler.
 * Boş değer ('' / null / undefined) → null (backend Nullable<DateTime>/<bool>/<int>
 * null kabul eder, '' edemez). boolean kolonlar gerçek boolean'a normalize edilir.
 *
 * STRING kolonlar da dahildir: backend `ValidateDynamicEntity` null değerlerde tüm
 * kural kontrollerini atlar (`if (value == null) continue;`) ama boş string'i normal
 * bir değer sayar — yani boş bırakılan opsiyonel bir alan '' olarak gönderilirse
 * regex/minLength kuralı '' üzerinde çalışır ve kayıt gereksiz yere reddedilir.
 * Zorunlu alanlarda davranış değişmez: backend `IsNullOrWhiteSpace` ile bakar.
 *
 * Değişmeyen dosya (sunucunun gönderdiği `FileRef`) payload'dan ÇIKARILIR: sunucu anahtarı
 * olmayan dosya kolonuna dokunmaz. Dosyanın kendisi istemcide yok; geri gönderilecek içerik de yok.
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
    if (!dataType) continue;                 // ID gibi meta alanlar dokunulmaz
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

/** Enum kolonu için izinli değerleri '|' ayraçlı metinden diziye çevirir. */
export function parseEnumValues(enumValues: string | null | undefined): string[] {
  if (!enumValues) return [];
  return enumValues.split('|').map(v => v.trim()).filter(v => v.length > 0);
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

  // Yavaş yol: satırın casing-bağımsız indeksi BİR KEZ kurulup satıra iliştirilir.
  // Eskiden her çağrıda Object.keys(row) + N adet toLowerCase() çalışıyordu; şablon
  // bunu hücre başına 3 kez çağırdığı ve component'ler OnPush olmadığı için maliyet
  // her change detection turunda O(kolon²) idi.
  let index = (row as RowWithIndex)[LOWER_KEY_INDEX];
  if (!index) {
    index = new Map<string, string>();
    for (const k of Object.keys(row)) index.set(k.toLowerCase(), k);
    Object.defineProperty(row, LOWER_KEY_INDEX, {
      value: index,
      enumerable: false,   // JSON.stringify ve {...row} yayılımına sızmaz
      writable: true,
      configurable: true
    });
  }

  const actualKey = index.get(key.toLowerCase());
  return actualKey === undefined ? undefined : row[actualKey];
}

/** fieldValue'nun satır başına kurduğu casing-bağımsız anahtar indeksi (enumerable değil). */
const LOWER_KEY_INDEX = Symbol('lowerKeyIndex');
type RowWithIndex = DataRow & { [LOWER_KEY_INDEX]?: Map<string, string> };

/** Satırdan hücre değerini string olarak döndürür */
export function cellValue(row: DataRow, key: string): string {
  const v = fieldValue(row, key);
  if (v === null || v === undefined) return '—';
  if (isFileRef(v)) return '📎';
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
