import { NavLayout, NavLink, NavPage } from './nav-layout.model';
import { placedNavModels } from './nav-layout.commands';
import type { IconName } from '../../components/shared/icon/icons.generated';

/**
 * Converts the published navigation document into the tree the sidebar draws — PURE.
 *
 * - A model link the user cannot see (or a deleted one) is dropped; permission is still checked on the server,
 *   this only keeps the menu clean.
 * - A folder left empty is not shown.
 * - With `appendUnplaced`, visible models not in the design are appended at the end in a "Diğer modeller" (Other models) folder —
 *   so a model published AFTER the design does not vanish from the menu.
 */

export interface NavModelInfo {
  readonly typeName: string;
  readonly label?: string | null;
  readonly icon?: string | null;
}

export interface NavResolveContext {
  /** Models the user can see in the menu (filtered by `PermissionService.canNavigate`), ordered. */
  readonly models: readonly NavModelInfo[];
  /** The page's default name (translated). */
  readonly pageLabel: (page: NavPage) => string;
  /** Name of the "Diğer modeller" (Other models) folder (translated). */
  readonly otherModelsLabel: string;
}

/** Link icon: from the model icon catalog (`app-model-icon`) or a fixed app icon (`app-icon`). */
export type NavIconRef =
  | { readonly kind: 'model'; readonly name: string | null }
  | { readonly kind: 'app'; readonly name: IconName };

export interface ResolvedNavLink {
  readonly kind: 'link';
  readonly id: string;
  readonly label: string;
  readonly icon: NavIconRef;
  /** In-app route; null for an external link. */
  readonly route: readonly (string | number)[] | null;
  /** Exact match for pages with child routes such as `/models` and `/dashboard`. */
  readonly exact: boolean;
  readonly href: string | null;
  /** The My Tasks badge is drawn on this link. */
  readonly isTasks: boolean;
}

export interface ResolvedNavFolder {
  readonly kind: 'folder';
  readonly id: string;
  readonly label: string;
  readonly icon: string | null;
  readonly collapsed: boolean;
  readonly children: readonly ResolvedNavLink[];
}

export type ResolvedNavNode = ResolvedNavFolder | ResolvedNavLink;

/** Id of the "Diğer modeller" (Other models) folder — outside the document id pattern, so it cannot collide. */
export const UNPLACED_FOLDER_ID = '$unplaced';

const PAGE_ROUTES: Record<NavPage, { route: string[]; icon: IconName; exact: boolean }> = {
  tasks: { route: ['/tasks'], icon: 'task_alt', exact: false },
  reports: { route: ['/reports'], icon: 'bar_chart', exact: true },
  dashboards: { route: ['/dashboard'], icon: 'dashboard', exact: true },
  profile: { route: ['/profile'], icon: 'person', exact: false }
};

export function resolveNav(doc: NavLayout, ctx: NavResolveContext): ResolvedNavNode[] {
  const models = new Map(ctx.models.map(m => [m.typeName, m]));
  const out: ResolvedNavNode[] = [];

  for (const node of doc.items) {
    if (node.kind !== 'folder') {
      const link = resolveLink(node, models, ctx);
      if (link) out.push(link);
      continue;
    }
    const children = node.children
      .map(child => resolveLink(child, models, ctx))
      .filter((link): link is ResolvedNavLink => link !== null);
    if (children.length === 0) continue;
    out.push({
      kind: 'folder', id: node.id, label: node.label, icon: node.icon ?? null,
      collapsed: !!node.collapsed, children
    });
  }

  if (doc.appendUnplaced) {
    const placed = placedNavModels(doc);
    const rest = ctx.models
      .filter(m => !placed.has(m.typeName))
      .map(m => modelLink(`$m-${m.typeName}`, m, null));
    if (rest.length > 0) {
      out.push({ kind: 'folder', id: UNPLACED_FOLDER_ID, label: ctx.otherModelsLabel, icon: null, collapsed: false, children: rest });
    }
  }
  return out;
}

function resolveLink(link: NavLink, models: ReadonlyMap<string, NavModelInfo>, ctx: NavResolveContext): ResolvedNavLink | null {
  switch (link.kind) {
    case 'model': {
      const model = models.get(link.typeName);
      return model ? modelLink(link.id, model, link.label || null) : null;
    }
    case 'dashboard':
      return internal(link.id, link.label, { kind: 'app', name: 'dashboard' }, ['/dashboard', link.dashboardId], true);
    case 'report':
      return internal(link.id, link.label, { kind: 'app', name: 'bar_chart' }, ['/reports', link.reportId], true);
    case 'page': {
      const page = PAGE_ROUTES[link.page];
      if (!page) return null;
      return {
        ...internal(link.id, link.label || ctx.pageLabel(link.page), { kind: 'app', name: page.icon }, page.route, page.exact),
        isTasks: link.page === 'tasks'
      };
    }
    case 'url':
      return {
        kind: 'link', id: link.id, label: link.label,
        icon: link.icon ? { kind: 'model', name: link.icon } : { kind: 'app', name: 'open_in_new' },
        route: null, exact: false, href: link.url, isTasks: false
      };
  }
}

function modelLink(id: string, model: NavModelInfo, label: string | null): ResolvedNavLink {
  return internal(id, label || model.label || model.typeName, { kind: 'model', name: model.icon ?? null },
    ['/models', model.typeName], false);
}

function internal(id: string, label: string, icon: NavIconRef, route: readonly (string | number)[], exact: boolean): ResolvedNavLink {
  return { kind: 'link', id, label, icon, route, exact, href: null, isTasks: false };
}
