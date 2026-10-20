import { PublishedColumn } from '../../services/published-model.service';
import { DEFAULT_FIELD_SPAN, FieldWidget, FormLayout, FormItem, NoteTone } from './screen-layout.model';

/**
 * Yerleşim + modelin kolonları → çizilecek plan. SAF.
 *
 * Belgeyle şemanın arasındaki farklar burada kapanır:
 *  - Belgede olmayan ve gizlenmemiş kolonlar (tasarımdan SONRA eklenen alanlar) ilk sekmenin
 *    sonunda başlıksız bir bölüme eklenir — zorunlu yeni bir kolon kaybolup formu kilitlemesin.
 *  - Gizli ama görünmesi gereken kolonlar (zorunlu, iş akışı adımı) da oraya eklenir.
 *  - Belgedeki ama şemada olmayan kolonlar (silinmiş) çalışma anında atlanır.
 *  - Pop-up'ta FK ve ID gibi hiç çizilmeyecek kolonlar `excluded` ile düşer.
 *
 * Tasarım modunda boş bölüm/sekme korunur (bırakma hedefi), sona ekleme yapılmaz
 * (yerleştirilmemiş alanlar paletten görünür) ve bilinmeyen alanlar işaretli çizilir.
 */

export const APPENDED_SECTION_ID = '__appended';
export const APPENDED_TAB_ID = '__tab';

export interface PlanField {
  readonly kind: 'field';
  readonly id: string;
  readonly column: PublishedColumn;
  readonly span: number;
  readonly newRow: boolean;
  readonly widget: FieldWidget | null;
  readonly rows: number | null;
  /** Şemada olmayan kolon (yalnız tasarım modunda çizilir). */
  readonly unknown: boolean;
}

export interface PlanSpacer {
  readonly kind: 'spacer';
  readonly id: string;
  readonly span: number;
  readonly newRow: boolean;
}

export interface PlanDivider {
  readonly kind: 'divider';
  readonly id: string;
}

export interface PlanNote {
  readonly kind: 'note';
  readonly id: string;
  readonly text: string;
  readonly tone: NoteTone;
  readonly span: number;
  readonly newRow: boolean;
}

export type PlanItem = PlanField | PlanSpacer | PlanDivider | PlanNote;

export interface PlanSection {
  readonly id: string;
  readonly title: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly items: readonly PlanItem[];
  /** Otomatik eklenen kolonların başlıksız bölümü. */
  readonly appended: boolean;
}

export interface PlanTab {
  readonly id: string;
  readonly title: string;
  readonly sections: readonly PlanSection[];
}

export interface PlanLocation {
  readonly tabId: string;
  readonly sectionId: string;
}

export interface FormRenderPlan {
  readonly tabs: readonly PlanTab[];
  /** Sona eklenen kolonlar: tasarımda olmayanlar + gizli olup görünmesi gerekenler. */
  readonly appended: readonly string[];
  /** Tasarımda ne yerleştirilmiş ne gizlenmiş kolonlar (tasarımdan sonra eklenmiş) — "güncel değil" uyarısı. */
  readonly unplaced: readonly string[];
  /** Tasarımda olup şemada olmayan kolonlar. */
  readonly unknown: readonly string[];
  /** Kolon → bulunduğu sekme/bölüm (geçersiz alanı göstermek için). */
  readonly location: ReadonlyMap<string, PlanLocation>;
}

export interface ResolveOptions {
  /** Gizlense de görünmesi gereken kolonlar: zorunlu alanlar, iş akışı adımının alanları. */
  readonly forcedVisible?: ReadonlySet<string>;
  /** Hiç çizilmeyecek kolonlar (pop-up'ta FK, ID). */
  readonly excluded?: ReadonlySet<string>;
  /** Tasarım modu (yukarıdaki farklar). */
  readonly design?: boolean;
}

const NONE: ReadonlySet<string> = new Set();

export function resolveFormLayout(
  layout: FormLayout,
  columns: readonly PublishedColumn[],
  options: ResolveOptions = {}
): FormRenderPlan {
  const forced = options.forcedVisible ?? NONE;
  const excluded = options.excluded ?? NONE;
  const design = !!options.design;

  const byName = new Map(columns.map(c => [c.columnName, c]));
  const placed = new Set<string>();
  const unknown: string[] = [];
  const location = new Map<string, PlanLocation>();

  const tabs: PlanTab[] = [];
  for (const tab of layout.tabs) {
    const sections: PlanSection[] = [];
    for (const section of tab.sections) {
      const items: PlanItem[] = [];
      for (const item of section.items) {
        const planned = planItem(item, byName, excluded, design, unknown);
        if (!planned) continue;
        if (planned.kind === 'field' && !planned.unknown) {
          placed.add(planned.column.columnName);
          location.set(planned.column.columnName, { tabId: tab.id, sectionId: section.id });
        }
        items.push(planned);
      }
      if (items.length === 0 && !design) continue;
      sections.push({
        id: section.id,
        title: section.title ?? '',
        collapsible: !!section.collapsible,
        collapsed: !!section.collapsible && !!section.collapsed,
        items,
        appended: false
      });
    }
    if (sections.length === 0 && !design) continue;
    tabs.push({ id: tab.id, title: tab.title, sections });
  }

  const appended: string[] = [];
  const unplaced: string[] = [];
  if (!design) {
    const hidden = new Set(layout.hiddenColumns);
    for (const column of columns) {
      const name = column.columnName;
      if (placed.has(name) || excluded.has(name)) continue;
      if (!hidden.has(name)) unplaced.push(name);
      else if (!forced.has(name)) continue;
      appended.push(name);
    }
    if (appended.length > 0) appendSection(tabs, appended, byName, location);
  }

  return { tabs, appended, unplaced, unknown, location };
}

function planItem(
  item: FormItem,
  byName: ReadonlyMap<string, PublishedColumn>,
  excluded: ReadonlySet<string>,
  design: boolean,
  unknown: string[]
): PlanItem | null {
  switch (item.kind) {
    case 'field': {
      if (excluded.has(item.column)) return null;
      const column = byName.get(item.column);
      if (!column) {
        unknown.push(item.column);
        if (!design) return null;
      }
      return {
        kind: 'field',
        id: item.id,
        column: column ?? { columnName: item.column, dataType: 'string', isNullable: true },
        span: item.span,
        newRow: !!item.newRow,
        widget: item.widget ?? null,
        rows: item.widget === 'multiline' ? item.rows ?? null : null,
        unknown: !column
      };
    }
    case 'spacer':
      return { kind: 'spacer', id: item.id, span: item.span, newRow: !!item.newRow };
    case 'divider':
      return { kind: 'divider', id: item.id };
    case 'note':
      return { kind: 'note', id: item.id, text: item.text, tone: item.tone, span: item.span, newRow: !!item.newRow };
  }
}

/** Sona eklenen kolonlar ilk sekmenin sonunda başlıksız bölümde — açılışta görünsünler. */
function appendSection(
  tabs: PlanTab[],
  names: readonly string[],
  byName: ReadonlyMap<string, PublishedColumn>,
  location: Map<string, PlanLocation>
): void {
  const items: PlanField[] = names.map(name => ({
    kind: 'field',
    id: `${APPENDED_SECTION_ID}-${name}`,
    column: byName.get(name)!,
    span: DEFAULT_FIELD_SPAN,
    newRow: false,
    widget: null,
    rows: null,
    unknown: false
  }));
  const section: PlanSection = {
    id: APPENDED_SECTION_ID, title: '', collapsible: false, collapsed: false, items, appended: true
  };

  const first = tabs[0];
  const tab: PlanTab = first
    ? { ...first, sections: [...first.sections, section] }
    : { id: APPENDED_TAB_ID, title: '', sections: [section] };
  if (first) tabs[0] = tab;
  else tabs.push(tab);

  for (const name of names) location.set(name, { tabId: tab.id, sectionId: APPENDED_SECTION_ID });
}

/** Planda çizilen alan kolonları, çizim sırasıyla. */
export function planColumns(plan: FormRenderPlan): string[] {
  const out: string[] = [];
  for (const tab of plan.tabs) {
    for (const section of tab.sections) {
      for (const item of section.items) {
        if (item.kind === 'field' && !item.unknown) out.push(item.column.columnName);
      }
    }
  }
  return out;
}
