import { LAYOUT_LIMITS, ListColumn, ListLayout } from '../../../utils/screen-layout/screen-layout.model';

/**
 * Liste yerleşimi komutları — SAF. Değişiklik yoksa aynı referans döner.
 * Listede olan kolon görünür; çıkarılan kolon gizlidir.
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

/** Kolonu verilen sıraya taşır (sıra, kolon çıkarıldıktan sonraki diziye göredir). */
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

/** Genişlik (px, 60–800 aralığına sıkıştırılır); null → otomatik. */
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

/** Şemada olmayan kolonu listeden çıkarır. */
export function removeListColumn(doc: ListLayout, column: string): ListLayout {
  return hideListColumn(doc, column);
}
