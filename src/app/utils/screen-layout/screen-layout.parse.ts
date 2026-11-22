import {
  FieldItem, FormItem, FormLayout, FormSection, FormTab, ListColumn, ListLayout, ScreenLayout
} from './screen-layout.model';
import { isStructural, validateLayoutText } from './screen-layout.validate';

/**
 * Converts the layout text from the server into a typed document; null if it is unreadable, the schema
 * version is unrecognized or there is a structural error — the caller falls back to the default view.
 * Unknown fields are dropped (only recognized properties are carried over).
 */
export function parseFormLayout(json: string | null | undefined): FormLayout | null {
  if (!json) return null;
  if (validateLayoutText(json, 'form', null, 'draft').some(i => isStructural(i.code))) return null;
  return normalizeFormLayout(JSON.parse(json) as FormLayout);
}

export function parseListLayout(json: string | null | undefined): ListLayout | null {
  if (!json) return null;
  if (validateLayoutText(json, 'list', null, 'draft').some(i => isStructural(i.code))) return null;
  return normalizeListLayout(JSON.parse(json) as ListLayout);
}

/**
 * Serializes the document with a fixed key order, omitting defaults — the same as the server's
 * normalized form. The designer answers "are there unsaved changes" by comparing
 * this text; a changed key order does not make it look dirty.
 */
export function serializeLayout(layout: ScreenLayout): string {
  return JSON.stringify('tabs' in layout ? normalizeFormLayout(layout) : normalizeListLayout(layout));
}

export function normalizeFormLayout(layout: FormLayout): FormLayout {
  return {
    schemaVersion: 1,
    tabs: layout.tabs.map(normalizeTab),
    hiddenColumns: [...new Set(layout.hiddenColumns ?? [])]
  };
}

export function normalizeListLayout(layout: ListLayout): ListLayout {
  const seen = new Set<string>();
  const columns: ListColumn[] = [];
  for (const entry of layout.columns) {
    if (seen.has(entry.column)) continue;
    seen.add(entry.column);
    columns.push(entry.width != null ? { column: entry.column, width: entry.width } : { column: entry.column });
  }
  return { schemaVersion: 1, columns };
}

function normalizeTab(tab: FormTab): FormTab {
  return { id: tab.id, title: tab.title ?? '', sections: tab.sections.map(normalizeSection) };
}

function normalizeSection(section: FormSection): FormSection {
  // Key order is insertion order: id, title?, collapsible?, collapsed?, items — same as the server.
  const head: { id: string; title?: string; collapsible?: boolean; collapsed?: boolean } = { id: section.id };
  if (section.title) head.title = section.title;
  if (section.collapsible) {
    head.collapsible = true;
    if (section.collapsed) head.collapsed = true;
  }
  return { ...head, items: section.items.map(normalizeItem) };
}

function normalizeItem(item: FormItem): FormItem {
  switch (item.kind) {
    case 'field': {
      const out: { -readonly [K in keyof FieldItem]: FieldItem[K] } = {
        kind: 'field', id: item.id, column: item.column, span: item.span
      };
      if (item.newRow) out.newRow = true;
      if (item.widget) out.widget = item.widget;
      if (item.widget === 'multiline' && item.rows != null) out.rows = item.rows;
      return out;
    }
    case 'spacer':
      return item.newRow
        ? { kind: 'spacer', id: item.id, span: item.span, newRow: true }
        : { kind: 'spacer', id: item.id, span: item.span };
    case 'divider':
      return { kind: 'divider', id: item.id };
    case 'note':
      return item.newRow
        ? { kind: 'note', id: item.id, text: item.text ?? '', tone: item.tone, span: item.span, newRow: true }
        : { kind: 'note', id: item.id, text: item.text ?? '', tone: item.tone, span: item.span };
  }
}
