import { FormRenderPlan, PlanLocation } from './form-layout.resolve';

/**
 * Görünmeyen yerdeki geçersiz alanı bulma — SAF.
 *
 * Sekmeli/katlanır formda Kaydet'e basıldığında hatalı alan pasif bir sekmede ya da kapalı
 * bir bölümde kalabilir; kullanıcı hiçbir şey olmadı sanır. Bu fonksiyonlar planın çizim
 * sırasında ilk hatalı alanı ve sekme başına hata sayısını verir; bileşen o sekmeye geçer,
 * bölümü açar ve alana odaklanır.
 */

export interface InvalidLocation extends PlanLocation {
  readonly column: string;
}

/** Çizim sırasındaki ilk geçersiz alan; yoksa null. */
export function firstInvalidLocation(plan: FormRenderPlan, invalid: ReadonlySet<string>): InvalidLocation | null {
  if (invalid.size === 0) return null;
  for (const tab of plan.tabs) {
    for (const section of tab.sections) {
      for (const item of section.items) {
        if (item.kind === 'field' && !item.unknown && invalid.has(item.column.columnName)) {
          return { tabId: tab.id, sectionId: section.id, column: item.column.columnName };
        }
      }
    }
  }
  return null;
}

/** Sekme kimliği → o sekmedeki geçersiz alan sayısı (yalnız hatalı sekmeler). */
export function invalidCountByTab(plan: FormRenderPlan, invalid: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>();
  if (invalid.size === 0) return counts;
  for (const column of invalid) {
    const where = plan.location.get(column);
    if (where) counts.set(where.tabId, (counts.get(where.tabId) ?? 0) + 1);
  }
  return counts;
}

/** Verilen kolonlardan en az birini içeren sekmeler, plan sırasıyla. */
export function tabsWithColumns(plan: FormRenderPlan, columns: ReadonlySet<string>): string[] {
  if (columns.size === 0) return [];
  const tabIds = new Set<string>();
  for (const column of columns) {
    const where = plan.location.get(column);
    if (where) tabIds.add(where.tabId);
  }
  return plan.tabs.map(t => t.id).filter(id => tabIds.has(id));
}

/** Verilen kolonları içeren bölümler. */
export function sectionsWithColumns(plan: FormRenderPlan, columns: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const column of columns) {
    const where = plan.location.get(column);
    if (where) out.add(where.sectionId);
  }
  return out;
}
