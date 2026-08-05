import { fieldValue } from '../model-data/model-data.util';

/** Dinamik tablo satırı — kolon adı → değer. */
export type DataRow = Record<string, unknown>;

/** Sıralama yönü. */
export type SortDirection = 'asc' | 'desc';

/** Görüntülenecek satırları belirleyen girdilerin tamamı. */
export interface DisplayRowsInput {
  rows: DataRow[];
  searchTerm: string;
  sortCol: string;
  sortDir: SortDirection;
  /** Aramada taranacak kolon adları (görünür kolonlar). */
  searchableColumns: string[];
  /** Sıralamada kullanılacak dil — TR/EN arasında harf sırası değişir. */
  locale: string;
}

/**
 * Bir sonucun yeniden hesaplanmasını gerektiren girdilerin anlık görüntüsü.
 * Referans/değer karşılaştırmasıyla önbellek geçerliliği belirlenir.
 */
export interface DisplayRowsCache {
  rows: DataRow[];
  searchTerm: string;
  sortCol: string;
  sortDir: SortDirection;
  locale: string;
  result: DataRow[];
}

/**
 * Arama filtresi + sıralama uygular. SAF fonksiyondur: girdiyi değiştirmez,
 * component'e ve Angular'a bağımlı değildir, TestBed olmadan test edilebilir.
 */
export function computeDisplayRows(input: DisplayRowsInput): DataRow[] {
  let rows = [...input.rows];

  const term = input.searchTerm.trim().toLowerCase();
  if (term) {
    rows = rows.filter(row =>
      input.searchableColumns.some(name => {
        const v = fieldValue(row, name);
        return v != null && String(v).toLowerCase().includes(term);
      }) ||
      String(fieldValue(row, 'ID') ?? '').includes(term)
    );
  }

  if (input.sortCol) {
    const col = input.sortCol;
    rows.sort((a, b) => {
      const av = fieldValue(a, col) ?? '';
      const bv = fieldValue(b, col) ?? '';
      const an = Number(av), bn = Number(bv);
      // Locale sabit 'tr' DEĞİL: uygulama TR/EN arasında geçiş yapıyor ve
      // harf sıralaması dile göre değişir (ör. TR'de i/ı, ç, ş).
      const cmp = !isNaN(an) && !isNaN(bn)
        ? an - bn
        : String(av).localeCompare(String(bv), input.locale, { numeric: true });
      return input.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return rows;
}

/**
 * <see cref="computeDisplayRows"/>'un önbellekli sarmalayıcısı.
 *
 * Şablon @for'u ve seçim yardımcıları sonucu change detection turu başına
 * birden çok kez ister; her çağrıda kopyala+filtrele+sırala yapmak ve YENİ
 * dizi kimliği döndürmek @for'u her turda baştan diff'letirdi.
 *
 * Önbellek anahtarına DİL de girer. Girmediğinde TR→EN geçişinde sıralama
 * donuyordu: satırlar, arama ve sıralama alanları değişmediği için eski
 * (Türkçe sıralanmış) sonuç dönmeye devam ediyordu.
 */
export function selectDisplayRows(
  input: DisplayRowsInput,
  cache: DisplayRowsCache | undefined
): DisplayRowsCache {
  if (cache
      && cache.rows === input.rows
      && cache.searchTerm === input.searchTerm
      && cache.sortCol === input.sortCol
      && cache.sortDir === input.sortDir
      && cache.locale === input.locale) {
    return cache;
  }

  return {
    rows: input.rows,
    searchTerm: input.searchTerm,
    sortCol: input.sortCol,
    sortDir: input.sortDir,
    locale: input.locale,
    result: computeDisplayRows(input)
  };
}
