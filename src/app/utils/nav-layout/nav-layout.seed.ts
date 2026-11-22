import { NavLayout, NavNode } from './nav-layout.model';

export interface NavSeedInput {
  /** Published models, in menu order. */
  readonly models: readonly { readonly typeName: string }[];
  /** Dashboards the admin marked "show in menu". */
  readonly navDashboards: readonly { readonly id: number; readonly name: string }[];
}

/**
 * Initial draft of a new navigation design — the non-admin user's CURRENT menu:
 * My Tasks, models, Reports, Dashboard and dashboards published to the menu. The admin starts by
 * splitting it into folders; nothing is lost.
 */
export function seedNavLayout(input: NavSeedInput): NavLayout {
  let n = 0;
  const id = () => `n${++n}`;
  const items: NavNode[] = [
    { kind: 'page', id: id(), page: 'tasks' },
    ...input.models.map(m => ({ kind: 'model' as const, id: id(), typeName: m.typeName })),
    { kind: 'page', id: id(), page: 'reports' },
    { kind: 'page', id: id(), page: 'dashboards' },
    ...input.navDashboards.map(d => ({ kind: 'dashboard' as const, id: id(), dashboardId: d.id, label: d.name.slice(0, 60) }))
  ];
  return { schemaVersion: 1, appendUnplaced: true, items };
}
