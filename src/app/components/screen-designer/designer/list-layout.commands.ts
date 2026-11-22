import { LAYOUT_LIMITS, ListColumn, ListLayout } from '../../../utils/screen-layout/screen-layout.model';

/**
 * List layout commands — PURE. If nothing changes, the same reference is returned.
 * A column in the list is visible; a removed column is hidden.
 */

export function showColumn(doc: ListLayout, column: string, index = doc.columns.length): ListLayout {
  if (doc.columns.some(c => c.column === column)) return moveColumn(doc, column, index);
  const columns = [...doc.columns];
  columns.splice(Math.max(0, Math.min(index, columns.length)), 0, { column });
  return { ...doc, columns };
}

export function hideListColumn(doc: ListLayout, column: string): ListLayout {
  return doc.columns.some(c => c.column === column)
    ? { ...doc, columns: doc.columns.filter(c => c.column !== column) }
    : doc;
}

/** Moves the column to the given index (the index refers to the array after the column is removed). */
export function moveColumn(doc: ListLayout, column: string, index: number): ListLayout {
  const from = doc.columns.findIndex(c => c.column === column);
  if (from < 0) return doc;
  const to = Math.max(0, Math.min(index, doc.columns.length - 1));
  if (to === from) return doc;
  const columns = [...doc.columns];
  const [entry] = columns.splice(from, 1);
  columns.splice(to, 0, entry);
  return { ...doc, columns };
}

export function moveColumnBy(doc: ListLayout, column: string, delta: -1 | 1): ListLayout {
  const from = doc.columns.findIndex(c => c.column === column);
  return from < 0 ? doc : moveColumn(doc, column, from + delta);
}

/** Width (px, clamped to the 60–800 range); null → automatic. */
export function setColumnWidth(doc: ListLayout, column: string, width: number | null): ListLayout {
  const index = doc.columns.findIndex(c => c.column === column);
  if (index < 0) return doc;
  const value = width == null
    ? undefined
    : Math.min(LAYOUT_LIMITS.maxWidth, Math.max(LAYOUT_LIMITS.minWidth, Math.round(width)));
  if (doc.columns[index].width === value) return doc;
  const columns = [...doc.columns];
  const entry: ListColumn = value === undefined ? { column } : { column, width: value };
  columns[index] = entry;
  return { ...doc, columns };
}

/** Removes a column not in the schema from the list. */
export function removeListColumn(doc: ListLayout, column: string): ListLayout {
  return hideListColumn(doc, column);
}
