import { PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { mustStayVisible } from '../record-field/column-required';
import {
  DEFAULT_FIELD_SPAN, FormLayout, FormItem, LAYOUT_SCHEMA_VERSION, LayoutColumnFact, ListLayout
} from './screen-layout.model';

/**
 * Initial draft and helpers — PURE.
 *
 * When the designer is opened for a model for the first time it starts from the current view: fields
 * visible in the "Kolonlar" (Columns) setting are placed in two columns in a single tab/section, hidden ones
 * go to the hidden list (a required field is never hidden). For the list, the visible
 * columns in schema order, at automatic width.
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

/** All ids in the document (tab, section, item). */
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
 * A new unused id: prefix + number (t3, s7, f12 …). Deterministic — gives the same id for the
 * same document; undo / redo and specs do not trip over randomness.
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
