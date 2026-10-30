/**
 * Kayıt listesinin arama, sıralama ve filtre seçimi — saf çekirdek.
 * Sunucu eşi: backend `Business/Concrete/Dynamic/DynamicListQuery` (alanlar orada doğrulanır).
 */

/** `GET /PublishedModel/getall` için liste seçimi. */
export interface ListQueryParams {
  search?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  filters?: ListFilter[];
}

export interface ListFilter {
  field: string;
  operator: 'eq' | 'contains' | 'ge' | 'le' | 'lt';
  value: string;
}

export type SortDirection = 'asc' | 'desc';

export interface ListSort {
  column: string;
  direction: SortDirection;
}

/** Filtre panelinde kolonun denetimi; `none`: filtrelenmez. */
export type FilterKind = 'text' | 'enum' | 'number' | 'date' | 'datetime' | 'boolean' | 'none';

/** Bir kolonun girilen filtresi: `value` tek değerli türlerde, `from`/`to` aralıklarda. */
export interface ColumnFilter {
  value?: string;
  from?: string;
  to?: string;
}

export type ColumnFilters = Partial<Record<string, ColumnFilter>>;

const NUMBER_TYPES = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

export function filterKindOf(dataType: string): FilterKind {
  if (NUMBER_TYPES.has(dataType)) return 'number';
  switch (dataType) {
    case 'string':
    case 'text':     return 'text';
    case 'enum':     return 'enum';
    case 'dateonly': return 'date';
    case 'datetime': return 'datetime';
    case 'boolean':  return 'boolean';
    // Lookup kimlik tutar: sıralama/filtre etikete değil numaraya bakar, kullanıcıyı yanıltır.
    default:         return 'none';
  }
}

export function isSortable(dataType: string): boolean {
  // Uzun metne göre sıralamak anlamsız ve indekssiz nvarchar(max) üzerinde pahalı.
  if (dataType === 'text') return false;
  return filterKindOf(dataType) !== 'none' || dataType === 'timeonly';
}

export function hasFilterValue(filter: ColumnFilter | undefined): boolean {
  return !!(filter?.value || filter?.from || filter?.to);
}

export function activeFilterCount(filters: ColumnFilters): number {
  return Object.values(filters).filter(hasFilterValue).length;
}

/** Bir gün sonrası (`YYYY-MM-DD`). Saat dilimi kaymasın diye UTC üzerinden. */
function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Girilen filtreleri sunucu biçimine çevirir; boşları atar. */
export function toListFilters(
  columns: readonly { columnName: string; dataType: string }[], filters: ColumnFilters
): ListFilter[] {
  const result: ListFilter[] = [];

  for (const column of columns) {
    const filter = filters[column.columnName];
    if (!filter || !hasFilterValue(filter)) continue;

    const field = column.columnName;
    const add = (operator: ListFilter['operator'], value: string) => result.push({ field, operator, value });

    switch (filterKindOf(column.dataType)) {
      case 'text':
        if (filter.value) add('contains', filter.value);
        break;
      case 'enum':
      case 'boolean':
        if (filter.value) add('eq', filter.value);
        break;
      case 'number':
      case 'date':
        if (filter.from) add('ge', filter.from);
        if (filter.to) add('le', filter.to);
        break;
      case 'datetime':
        // Kutu gün seçer: bitiş günü sonuna kadar dahil olmalı, 00:00'da kesilmemeli.
        if (filter.from) add('ge', filter.from);
        if (filter.to) add('lt', nextDay(filter.to));
        break;
    }
  }
  return result;
}

/** Başlığa tıklama döngüsü: artan → azalan → sıralama yok. */
export function nextSort(current: ListSort | null, column: string): ListSort | null {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}

/** Tablo başlığının `aria-sort` değeri. */
export function ariaSortOf(current: ListSort | null, column: string): 'ascending' | 'descending' | 'none' {
  if (current?.column !== column) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}
