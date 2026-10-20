import { PublishedColumn } from '../../services/published-model.service';
import { ListLayout } from './screen-layout.model';

/**
 * Liste kolonlarının çözümü — SAF.
 *
 * Yayınlanmış liste yerleşimi varsa sıra ve genişlik ondan gelir; yerleştirilen kolon
 * görünür sayılır (sonradan eklenen kolon kendiliğinden listeye girmez — "Kolonlar"
 * ayarıyla aynı davranış). Yerleşim yoksa eski görünürlük ayarı (`legacyVisible`, null =
 * hepsi) şema sırasıyla uygulanır. Şemada olmayan (silinmiş) kolonlar atlanır.
 */

export interface ResolvedListColumn {
  readonly column: PublishedColumn;
  /** Piksel genişlik; null = otomatik. */
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

/** Tablonun sabit düzende toplam genişliği (otomatik kolonlar varsayılan genişlikle sayılır). */
export function totalListWidth(resolved: readonly ResolvedListColumn[], autoWidth: number, extra: number): number {
  return resolved.reduce((sum, c) => sum + (c.width ?? autoWidth), extra);
}
