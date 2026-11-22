import { fieldValue } from '../model-data/model-data.util';

/** Dynamic table row — column name → value. */
export type DataRow = Record<string, unknown>;

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';

/** All inputs that determine the rows to display. */
export interface DisplayRowsInput {
  rows: DataRow[];
  searchTerm: string;
  sortCol: string;
  sortDir: SortDirection;
  /** Column names scanned by search (visible columns). */
  searchableColumns: string[];
  /** Language used for sorting — letter order differs between TR/EN. */
  locale: string;
}

/**
 * Snapshot of the inputs whose change requires recomputing a result.
 * Cache validity is decided by reference/value comparison.
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
 * Applies the search filter + sorting. PURE function: does not mutate the input,
 * does not depend on the component or Angular, testable without TestBed.
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
      // Locale is NOT fixed to 'tr': the app switches between TR/EN and
      // letter ordering depends on the language (e.g. i/ı, ç, ş in TR).
      const cmp = !isNaN(an) && !isNaN(bn)
        ? an - bn
        : String(av).localeCompare(String(bv), input.locale, { numeric: true });
      return input.sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return rows;
}

/**
 * Cached wrapper of <see cref="computeDisplayRows"/>.
 *
 * The template @for and the selection helpers request the result several times
 * per change detection turn; copying+filtering+sorting on every call and returning a NEW
 * array identity would make @for re-diff from scratch on every turn.
 *
 * The LANGUAGE is part of the cache key as well. Without it, sorting froze on a
 * TR→EN switch: since the rows, search and sort fields had not changed, the old
 * (Turkish-sorted) result kept being returned.
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
