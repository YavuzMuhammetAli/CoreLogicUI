import {
  DEFAULT_FIELD_SPAN, FieldItem, FieldWidget, FormItem, FormLayout, FormSection, FormTab, GRID_COLUMNS,
  LAYOUT_LIMITS, NoteTone
} from '../../../utils/screen-layout/screen-layout.model';
import { collectIds, nextId } from '../../../utils/screen-layout/screen-layout.seed';

/**
 * Form layout commands — PURE.
 *
 * Each command returns a new document; IF NOTHING CHANGED IT RETURNS THE SAME REFERENCE
 * (so the history does not record an empty undo step — see utils/design-history).
 *
 * Ids are deterministic (`nextId`): t = tab, s = section, f = field, x = spacer,
 * d = divider, n = note.
 */

export type ElementKind = 'spacer' | 'divider' | 'note';

/** Drop target: section + index within that section (in the array AFTER the item is removed). */
export interface DropTarget {
  readonly sectionId: string;
  readonly index: number;
}

export interface ItemLocation {
  readonly tabIndex: number;
  readonly sectionIndex: number;
  readonly index: number;
  readonly tab: FormTab;
  readonly section: FormSection;
  readonly item: FormItem;
}

const ELEMENT_PREFIX: Record<ElementKind, string> = { spacer: 'x', divider: 'd', note: 'n' };

// ─── Lookup ─────────────────────────────────────────────────────────────────

export function findItem(doc: FormLayout, itemId: string): ItemLocation | null {
  for (let t = 0; t < doc.tabs.length; t++) {
    const tab = doc.tabs[t];
    for (let s = 0; s < tab.sections.length; s++) {
      const section = tab.sections[s];
      const index = section.items.findIndex(i => i.id === itemId);
      if (index >= 0) return { tabIndex: t, sectionIndex: s, index, tab, section, item: section.items[index] };
    }
  }
  return null;
}

export function findSection(doc: FormLayout, sectionId: string): { tabIndex: number; sectionIndex: number; tab: FormTab; section: FormSection } | null {
  for (let t = 0; t < doc.tabs.length; t++) {
    const s = doc.tabs[t].sections.findIndex(x => x.id === sectionId);
    if (s >= 0) return { tabIndex: t, sectionIndex: s, tab: doc.tabs[t], section: doc.tabs[t].sections[s] };
  }
  return null;
}

/** The item the field is placed in (null if none). */
export function findField(doc: FormLayout, column: string): ItemLocation | null {
  for (const tab of doc.tabs) {
    for (const section of tab.sections) {
      const item = section.items.find(i => i.kind === 'field' && i.column === column);
      if (item) return findItem(doc, item.id);
    }
  }
  return null;
}

/** Columns placed in the document. */
export function placedColumns(doc: FormLayout): Set<string> {
  const out = new Set<string>();
  for (const tab of doc.tabs) for (const section of tab.sections) {
    for (const item of section.items) if (item.kind === 'field') out.add(item.column);
  }
  return out;
}

export function itemCount(doc: FormLayout): number {
  return doc.tabs.reduce((n, t) => n + t.sections.reduce((m, s) => m + s.items.length, 0), 0);
}

// ─── Immutable update helpers ───────────────────────────────────────────────

function mapSections(doc: FormLayout, fn: (section: FormSection) => FormSection): FormLayout {
  let changed = false;
  const tabs = doc.tabs.map(tab => {
    let tabChanged = false;
    const sections = tab.sections.map(section => {
      const next = fn(section);
      if (next !== section) tabChanged = true;
      return next;
    });
    if (!tabChanged) return tab;
    changed = true;
    return { ...tab, sections };
  });
  return changed ? { ...doc, tabs } : doc;
}

function mapItem(doc: FormLayout, itemId: string, fn: (item: FormItem) => FormItem): FormLayout {
  return mapSections(doc, section => {
    const index = section.items.findIndex(i => i.id === itemId);
    if (index < 0) return section;
    const next = fn(section.items[index]);
    if (next === section.items[index]) return section;
    const items = [...section.items];
    items[index] = next;
    return { ...section, items };
  });
}

function withoutItem(doc: FormLayout, itemId: string): FormLayout {
  return mapSections(doc, section =>
    section.items.some(i => i.id === itemId) ? { ...section, items: section.items.filter(i => i.id !== itemId) } : section);
}

function insertAt(doc: FormLayout, target: DropTarget, item: FormItem): FormLayout {
  return mapSections(doc, section => {
    if (section.id !== target.sectionId) return section;
    const index = Math.max(0, Math.min(target.index, section.items.length));
    const items = [...section.items];
    items.splice(index, 0, item);
    return { ...section, items };
  });
}

function withoutHidden(doc: FormLayout, column: string): FormLayout {
  return doc.hiddenColumns.includes(column)
    ? { ...doc, hiddenColumns: doc.hiddenColumns.filter(c => c !== column) }
    : doc;
}

const clampSpan = (span: number) => Math.min(GRID_COLUMNS, Math.max(1, Math.round(span)));

// ─── Items ──────────────────────────────────────────────────────────────────

/**
 * Places the column at the target. If already placed it MOVES it there (the same field never appears twice);
 * if hidden it is removed from the hidden list.
 */
export function placeField(doc: FormLayout, column: string, target: DropTarget, span = DEFAULT_FIELD_SPAN): FormLayout {
  if (!findSection(doc, target.sectionId)) return doc;
  const existing = findField(doc, column);
  if (existing) return moveItem(doc, existing.item.id, target);
  const item: FieldItem = { kind: 'field', id: nextId(collectIds(doc), 'f'), column, span: clampSpan(span) };
  return insertAt(withoutHidden(doc, column), target, item);
}

export function insertElement(doc: FormLayout, kind: ElementKind, target: DropTarget): FormLayout {
  if (!findSection(doc, target.sectionId)) return doc;
  const id = nextId(collectIds(doc), ELEMENT_PREFIX[kind]);
  const item: FormItem = kind === 'divider'
    ? { kind, id }
    : kind === 'spacer'
      ? { kind, id, span: DEFAULT_FIELD_SPAN }
      : { kind, id, text: '', tone: 'info', span: GRID_COLUMNS };
  return insertAt(doc, target, item);
}

/**
 * Moves the item to the target. The target index refers to the array after the item is removed; in the same
 * section, dropping right before/after itself changes nothing (same reference).
 */
export function moveItem(doc: FormLayout, itemId: string, target: DropTarget): FormLayout {
  const from = findItem(doc, itemId);
  const to = findSection(doc, target.sectionId);
  if (!from || !to) return doc;
  const index = Math.max(0, Math.min(target.index, to.section.items.length - (from.section.id === to.section.id ? 1 : 0)));
  if (from.section.id === to.section.id && from.index === index) return doc;
  return insertAt(withoutItem(doc, itemId), { sectionId: target.sectionId, index }, from.item);
}

/**
 * Keyboard move by one step (Alt+↑/↓). At the start/end of a section it moves into the previous/next
 * section (within the same tab).
 */
export function moveItemBy(doc: FormLayout, itemId: string, delta: -1 | 1): FormLayout {
  const from = findItem(doc, itemId);
  if (!from) return doc;
  const next = from.index + delta;
  if (next >= 0 && next < from.section.items.length) {
    return moveItem(doc, itemId, { sectionId: from.section.id, index: next });
  }
  const neighbour = from.tab.sections[from.sectionIndex + delta];
  if (!neighbour) return doc;
  return moveItem(doc, itemId, { sectionId: neighbour.id, index: delta < 0 ? neighbour.items.length : 0 });
}

export function setSpan(doc: FormLayout, itemId: string, span: number): FormLayout {
  const value = clampSpan(span);
  return mapItem(doc, itemId, item => item.kind === 'divider' || item.span === value ? item : { ...item, span: value });
}

export interface ItemPatch {
  readonly newRow?: boolean;
  readonly widget?: FieldWidget | null;
  readonly rows?: number | null;
  readonly text?: string;
  readonly tone?: NoteTone;
}

/** Changes the item's properties; fields not applicable to its type are ignored. Defaults are not written to the document. */
export function patchItem(doc: FormLayout, itemId: string, patch: ItemPatch): FormLayout {
  return mapItem(doc, itemId, item => {
    if (item.kind === 'divider') return item;
    const next: Record<string, unknown> = { ...item };

    if (patch.newRow !== undefined) {
      if (patch.newRow) next['newRow'] = true;
      else delete next['newRow'];
    }
    if (item.kind === 'field') {
      if (patch.widget !== undefined) {
        if (patch.widget) next['widget'] = patch.widget;
        else delete next['widget'];
        if (next['widget'] !== 'multiline') delete next['rows'];
      }
      if (patch.rows !== undefined) {
        if (patch.rows == null || next['widget'] !== 'multiline') delete next['rows'];
        else next['rows'] = Math.min(LAYOUT_LIMITS.maxRows, Math.max(LAYOUT_LIMITS.minRows, Math.round(patch.rows)));
      }
    }
    if (item.kind === 'note') {
      if (patch.text !== undefined) next['text'] = patch.text;
      if (patch.tone !== undefined) next['tone'] = patch.tone;
    }
    return sameShallow(next, item) ? item : next as unknown as FormItem;
  });
}

function sameShallow(a: Record<string, unknown>, b: object): boolean {
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(a);
  return aKeys.length === Object.keys(bRecord).length && aKeys.every(k => a[k] === bRecord[k]);
}

/** Removes the item — a field goes back to unplaced (it is not hidden). */
export function removeItem(doc: FormLayout, itemId: string): FormLayout {
  return findItem(doc, itemId) ? withoutItem(doc, itemId) : doc;
}

/** Hides the column from the form: if placed, its item is removed and it enters the hidden list. */
export function hideColumn(doc: FormLayout, column: string): FormLayout {
  const placed = findField(doc, column);
  const base = placed ? withoutItem(doc, placed.item.id) : doc;
  return base.hiddenColumns.includes(column) ? base : { ...base, hiddenColumns: [...base.hiddenColumns, column] };
}

/** Unhides — the column goes back to unplaced (it is placed from the palette). */
export function unhideColumn(doc: FormLayout, column: string): FormLayout {
  return withoutHidden(doc, column);
}

/** Removes every trace of a column not in the schema (deleted). */
export function removeColumnEverywhere(doc: FormLayout, column: string): FormLayout {
  let next = doc;
  for (let placed = findField(next, column); placed; placed = findField(next, column)) {
    next = withoutItem(next, placed.item.id);
  }
  return withoutHidden(next, column);
}

// ─── Sections ───────────────────────────────────────────────────────────────

export function addSection(doc: FormLayout, tabId: string, title = ''): FormLayout {
  const tabIndex = doc.tabs.findIndex(t => t.id === tabId);
  if (tabIndex < 0) return doc;
  const section: FormSection = title
    ? { id: nextId(collectIds(doc), 's'), title, items: [] }
    : { id: nextId(collectIds(doc), 's'), items: [] };
  const tabs = [...doc.tabs];
  tabs[tabIndex] = { ...tabs[tabIndex], sections: [...tabs[tabIndex].sections, section] };
  return { ...doc, tabs };
}

export interface SectionPatch {
  readonly title?: string;
  readonly collapsible?: boolean;
  readonly collapsed?: boolean;
}

export function patchSection(doc: FormLayout, sectionId: string, patch: SectionPatch): FormLayout {
  return mapSections(doc, section => {
    if (section.id !== sectionId) return section;
    const next: { -readonly [K in keyof FormSection]: FormSection[K] } = { ...section };
    if (patch.title !== undefined) {
      if (patch.title) next.title = patch.title;
      else delete next.title;
    }
    if (patch.collapsible !== undefined) {
      if (patch.collapsible) next.collapsible = true;
      else {
        delete next.collapsible;
        delete next.collapsed;
      }
    }
    if (patch.collapsed !== undefined && next.collapsible) {
      if (patch.collapsed) next.collapsed = true;
      else delete next.collapsed;
    }
    const same = next.title === section.title && next.collapsible === section.collapsible && next.collapsed === section.collapsed;
    return same ? section : next;
  });
}

/** Removes the section; its fields go back to unplaced. */
export function removeSection(doc: FormLayout, sectionId: string): FormLayout {
  const where = findSection(doc, sectionId);
  if (!where) return doc;
  const tabs = [...doc.tabs];
  tabs[where.tabIndex] = { ...where.tab, sections: where.tab.sections.filter(s => s.id !== sectionId) };
  return { ...doc, tabs };
}

export function moveSectionBy(doc: FormLayout, sectionId: string, delta: -1 | 1): FormLayout {
  const where = findSection(doc, sectionId);
  if (!where) return doc;
  const next = where.sectionIndex + delta;
  if (next < 0 || next >= where.tab.sections.length) return doc;
  const sections = [...where.tab.sections];
  [sections[where.sectionIndex], sections[next]] = [sections[next], sections[where.sectionIndex]];
  const tabs = [...doc.tabs];
  tabs[where.tabIndex] = { ...where.tab, sections };
  return { ...doc, tabs };
}

// ─── Tabs ───────────────────────────────────────────────────────────────────

/** A new tab (with one empty section) is appended at the end. */
export function addTab(doc: FormLayout, title: string): FormLayout {
  const ids = collectIds(doc);
  const tabId = nextId(ids, 't');
  ids.add(tabId);
  const tab: FormTab = { id: tabId, title, sections: [{ id: nextId(ids, 's'), items: [] }] };
  return { ...doc, tabs: [...doc.tabs, tab] };
}

export function renameTab(doc: FormLayout, tabId: string, title: string): FormLayout {
  const index = doc.tabs.findIndex(t => t.id === tabId);
  if (index < 0 || doc.tabs[index].title === title) return doc;
  const tabs = [...doc.tabs];
  tabs[index] = { ...tabs[index], title };
  return { ...doc, tabs };
}

/** Removes the tab (the last tab cannot be removed); its fields go back to unplaced. */
export function removeTab(doc: FormLayout, tabId: string): FormLayout {
  if (doc.tabs.length <= 1 || !doc.tabs.some(t => t.id === tabId)) return doc;
  return { ...doc, tabs: doc.tabs.filter(t => t.id !== tabId) };
}

export function moveTabBy(doc: FormLayout, tabId: string, delta: -1 | 1): FormLayout {
  const index = doc.tabs.findIndex(t => t.id === tabId);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= doc.tabs.length) return doc;
  const tabs = [...doc.tabs];
  [tabs[index], tabs[next]] = [tabs[next], tabs[index]];
  return { ...doc, tabs };
}

/** End of the tab's last section — items dropped on the tab header / added by clicking go here. */
export function endOfTab(doc: FormLayout, tabId: string): DropTarget | null {
  const tab = doc.tabs.find(t => t.id === tabId);
  const section = tab?.sections[tab.sections.length - 1];
  return section ? { sectionId: section.id, index: section.items.length } : null;
}
