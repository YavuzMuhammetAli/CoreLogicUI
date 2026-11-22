/**
 * Search, sort and filter selection for the record list — pure core.
 * Server counterpart: backend `Business/Concrete/Dynamic/DynamicListQuery` (fields are validated there).
 */

/** List selection for `GET /PublishedModel/getall`. */
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

/** The column's control in the filter panel; `none`: not filterable. */
export type FilterKind = 'text' | 'enum' | 'number' | 'date' | 'datetime' | 'boolean' | 'none';

/** A column's entered filter: `value` for single-value kinds, `from`/`to` for ranges. */
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
    // A lookup holds an id: sorting/filtering would look at the number, not the label, misleading the user.
    default:         return 'none';
  }
}

export function isSortable(dataType: string): boolean {
  // Sorting by long text is meaningless and expensive on an unindexed nvarchar(max).
  if (dataType === 'text') return false;
  return filterKindOf(dataType) !== 'none' || dataType === 'timeonly';
}

export function hasFilterValue(filter: ColumnFilter | undefined): boolean {
  return !!(filter?.value || filter?.from || filter?.to);
}

export function activeFilterCount(filters: ColumnFilters): number {
  return Object.values(filters).filter(hasFilterValue).length;
}

/** The next day (`YYYY-MM-DD`). Computed in UTC so the time zone does not shift it. */
function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Converts entered filters to the server format; drops empty ones. */
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
        // The input picks a day: the end day must be included until its end, not cut at 00:00.
        if (filter.from) add('ge', filter.from);
        if (filter.to) add('lt', nextDay(filter.to));
        break;
    }
  }
  return result;
}

/** Header click cycle: ascending → descending → no sort. */
export function nextSort(current: ListSort | null, column: string): ListSort | null {
  if (current?.column !== column) return { column, direction: 'asc' };
  return current.direction === 'asc' ? { column, direction: 'desc' } : null;
}

/** The `aria-sort` value of the table header. */
export function ariaSortOf(current: ListSort | null, column: string): 'ascending' | 'descending' | 'none' {
  if (current?.column !== column) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}
