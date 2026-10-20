import { PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { mustStayVisible } from '../record-field/column-required';
import {
  DEFAULT_FIELD_SPAN, FormLayout, FormItem, LAYOUT_SCHEMA_VERSION, LayoutColumnFact, ListLayout
} from './screen-layout.model';

/**
 * İlk taslak ve yardımcılar — SAF.
 *
 * Tasarımcı bir model için ilk kez açıldığında bugünkü görünümden başlar: "Kolonlar"
 * ayarında görünen alanlar tek sekme/tek bölümde iki kolonlu yerleşir, gizlenenler
 * gizli listesine girer (zorunlu alan hiçbir zaman gizlenmez). Liste için görünen
 * kolonlar şema sırasıyla, otomatik genişlikte.
 */

export function layoutFacts(
  columns: readonly PublishedColumn[],
  rules: ReadonlyMap<string, PublishedColumnSchema>
): LayoutColumnFact[] {
  return columns.map(c => ({
    name: c.columnName,
    dataType: c.dataType,
    mustStayVisible: mustStayVisible(c, rules.get(c.columnName))
  }));
}

export function seedFormLayout(
  columns: readonly PublishedColumn[],
  rules: ReadonlyMap<string, PublishedColumnSchema>,
  legacyVisible: readonly string[] | null
): FormLayout {
  const visible = legacyVisible ? new Set(legacyVisible) : null;
  const items: FormItem[] = [];
  const hiddenColumns: string[] = [];

  let n = 0;
  for (const column of columns) {
    const name = column.columnName;
    if (!visible || visible.has(name) || mustStayVisible(column, rules.get(name))) {
      items.push({ kind: 'field', id: `f${++n}`, column: name, span: DEFAULT_FIELD_SPAN });
    } else {
      hiddenColumns.push(name);
    }
  }

  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    tabs: [{ id: 't1', title: '', sections: [{ id: 's1', items }] }],
    hiddenColumns
  };
}

export function seedListLayout(
  columns: readonly PublishedColumn[],
  legacyVisible: readonly string[] | null
): ListLayout {
  const visible = legacyVisible ? new Set(legacyVisible) : null;
  return {
    schemaVersion: LAYOUT_SCHEMA_VERSION,
    columns: columns.filter(c => !visible || visible.has(c.columnName)).map(c => ({ column: c.columnName }))
  };
}

/** Belgedeki tüm kimlikler (sekme, bölüm, öğe). */
export function collectIds(layout: FormLayout): Set<string> {
  const ids = new Set<string>();
  for (const tab of layout.tabs) {
    ids.add(tab.id);
    for (const section of tab.sections) {
      ids.add(section.id);
      for (const item of section.items) ids.add(item.id);
    }
  }
  return ids;
}

/**
 * Kullanılmayan yeni kimlik: önek + sayı (t3, s7, f12 …). Deterministik — aynı belgeye
 * aynı kimliği verir; geri al / yinele ve spec'ler rastgeleliğe takılmaz.
 */
export function nextId(used: ReadonlySet<string>, prefix: string): string {
  let max = 0;
  for (const id of used) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}
