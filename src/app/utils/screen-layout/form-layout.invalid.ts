import { FormRenderPlan, PlanLocation } from './form-layout.resolve';

/**
 * Finding an invalid field in a hidden place — PURE.
 *
 * In a tabbed/collapsible form, when Save is pressed the invalid field may sit in an inactive tab or a
 * collapsed section; the user thinks nothing happened. These functions return the first invalid field
 * in the plan's render order and the error count per tab; the component switches to that tab,
 * expands the section and focuses the field.
 */

export interface InvalidLocation extends PlanLocation {
  readonly column: string;
}

/** The first invalid field in render order; null if none. */
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

/** Tab id → number of invalid fields in that tab (only tabs with errors). */
export function invalidCountByTab(plan: FormRenderPlan, invalid: ReadonlySet<string>): Map<string, number> {
  const counts = new Map<string, number>();
  if (invalid.size === 0) return counts;
  for (const column of invalid) {
    const where = plan.location.get(column);
    if (where) counts.set(where.tabId, (counts.get(where.tabId) ?? 0) + 1);
  }
  return counts;
}

/** Tabs containing at least one of the given columns, in plan order. */
export function tabsWithColumns(plan: FormRenderPlan, columns: ReadonlySet<string>): string[] {
  if (columns.size === 0) return [];
  const tabIds = new Set<string>();
  for (const column of columns) {
    const where = plan.location.get(column);
    if (where) tabIds.add(where.tabId);
  }
  return plan.tabs.map(t => t.id).filter(id => tabIds.has(id));
}

/** Sections containing the given columns. */
export function sectionsWithColumns(plan: FormRenderPlan, columns: ReadonlySet<string>): Set<string> {
  const out = new Set<string>();
  for (const column of columns) {
    const where = plan.location.get(column);
    if (where) out.add(where.sectionId);
  }
  return out;
}
