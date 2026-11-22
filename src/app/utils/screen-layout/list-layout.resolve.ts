import { PublishedColumn } from '../../services/published-model.service';
import { ListLayout } from './screen-layout.model';

/**
 * Resolution of list columns — PURE.
 *
 * If a published list layout exists, order and width come from it; a placed column
 * counts as visible (a column added later does not join the list by itself — same behaviour as the
 * "Kolonlar" (Columns) setting). Without a layout, the legacy visibility setting (`legacyVisible`, null =
 * all) is applied in schema order. Columns not in the schema (deleted) are skipped.
 */

export interface ResolvedListColumn {
  readonly column: PublishedColumn;
  /** Width in pixels; null = automatic. */
  readonly width: number | null;
}

export function resolveListColumns(
  layout: ListLayout | null,
  columns: readonly PublishedColumn[],
  legacyVisible: readonly string[] | null
): ResolvedListColumn[] {
  if (layout) {
    const byName = new Map(columns.map(c => [c.columnName, c]));
    const out: ResolvedListColumn[] = [];
    const seen = new Set<string>();
    for (const entry of layout.columns) {
      const column = byName.get(entry.column);
      if (!column || seen.has(entry.column)) continue;
      seen.add(entry.column);
      out.push({ column, width: entry.width ?? null });
    }
    return out;
  }

  const visible = legacyVisible ? new Set(legacyVisible) : null;
  return columns
    .filter(c => !visible || visible.has(c.columnName))
    .map(column => ({ column, width: null }));
}

/** Total width of the table in fixed layout (auto columns count with the default width). */
export function totalListWidth(resolved: readonly ResolvedListColumn[], autoWidth: number, extra: number): number {
  return resolved.reduce((sum, c) => sum + (c.width ?? autoWidth), extra);
}
