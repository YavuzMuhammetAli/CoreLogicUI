import { environment } from '../../environments/environment';

/**
 * Dosya/resim kolonunun sunucudaki gösterimi — İÇERİK DEĞİL (backend `DynamicRowShaper`).
 *
 * Liste, kayıt ve alt liste yanıtları eskiden dosyanın kendisini base64 olarak taşıyordu
 * (20 satırlık sayfada 5 MB'lık bir fotoğraf kolonu ≈ 130 MB JSON) ve şablonlar her kontrol
 * turunda ondan `data:` adresi üretiyordu. Artık satırda boyut + kısa ömürlü imzalı bağlantı
 * var: resim görünür olunca bağlantıdan iner, indirme doğrudan bağlantıya gider (belleğe alınmaz).
 *
 * Kaydetmede değişmeyen dosya gönderilmez (`sanitizePayload` anahtarı çıkarır); sunucu anahtarı
 * olmayan dosya kolonuna dokunmaz. Yeni dosya hâlâ base64 metin olarak gider, silme `null`.
 */
export interface FileRef {
  $file: true;
  /** Şemadaki kolon tipi: içerik okunmadığı için resim baytlarından tanınamaz. */
  kind: 'image' | 'file';
  size: number;
  /** Sunucuya göreli adres (`PublishedModel/file?token=…`). */
  url: string;
}

export function isFileRef(value: unknown): value is FileRef {
  return typeof value === 'object' && value !== null && (value as { $file?: unknown }).$file === true;
}

/** Değer bir dosya gösterimiyse onu, değilse null döner — şablonlarda `@if (...; as file)` için. */
export function asFileRef(value: unknown): FileRef | null {
  return isFileRef(value) ? value : null;
}

/** Bağlantının tam adresi: sunucu göreli yol verir, API kökü ortama göre eklenir. */
export function fileRefUrl(ref: FileRef): string {
  return `${environment.apiBaseUrl}/${ref.url}`;
}
