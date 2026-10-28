import { NavLayout, NavNode } from './nav-layout.model';

export interface NavSeedInput {
  /** Yayınlanmış modeller, menüdeki sırayla. */
  readonly models: readonly { readonly typeName: string }[];
  /** Admin'in "menüde göster" dediği dashboard'lar. */
  readonly navDashboards: readonly { readonly id: number; readonly name: string }[];
}

/**
 * Yeni navigasyon tasarımının ilk taslağı — admin olmayan kullanıcının BUGÜNKÜ menüsü:
 * Görevlerim, modeller, Raporlar, Dashboard ve menüye yayınlanmış dashboard'lar. Admin bunu
 * klasörlere ayırarak başlar; hiçbir şey kaybolmaz.
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
