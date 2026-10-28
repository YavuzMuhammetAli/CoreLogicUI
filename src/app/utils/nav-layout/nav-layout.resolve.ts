import { NavLayout, NavLink, NavPage } from './nav-layout.model';
import { placedNavModels } from './nav-layout.commands';
import type { IconName } from '../../components/shared/icon/icons.generated';

/**
 * Yayındaki navigasyon belgesini kenar çubuğunun çizeceği ağaca çevirir — SAF.
 *
 * - Kullanıcının göremediği (ya da silinmiş) model bağlantısı atılır; izin sunucuda yine denetlenir,
 *   bu yalnız menüyü temiz tutar.
 * - Boş kalan klasör gösterilmez.
 * - `appendUnplaced` ise tasarımda olmayan görünür modeller sona "Diğer modeller" klasöründe eklenir —
 *   tasarımdan SONRA yayınlanan model menüden kaybolmasın.
 */

export interface NavModelInfo {
  readonly typeName: string;
  readonly label?: string | null;
  readonly icon?: string | null;
}

export interface NavResolveContext {
  /** Kullanıcının menüde görebildiği modeller (`PermissionService.canNavigate` süzülmüş), sıralı. */
  readonly models: readonly NavModelInfo[];
  /** Sayfanın varsayılan adı (çeviri). */
  readonly pageLabel: (page: NavPage) => string;
  /** "Diğer modeller" klasörünün adı (çeviri). */
  readonly otherModelsLabel: string;
}

/** Bağlantı ikonu: model ikon kataloğu (`app-model-icon`) ya da sabit uygulama ikonu (`app-icon`). */
export type NavIconRef =
  | { readonly kind: 'model'; readonly name: string | null }
  | { readonly kind: 'app'; readonly name: IconName };

export interface ResolvedNavLink {
  readonly kind: 'link';
  readonly id: string;
  readonly label: string;
  readonly icon: NavIconRef;
  /** Uygulama içi rota; dış bağlantıda null. */
  readonly route: readonly (string | number)[] | null;
  /** `/models` ve `/dashboard` gibi alt rotası olan sayfalarda tam eşleşme. */
  readonly exact: boolean;
  readonly href: string | null;
  /** Görevlerim rozeti bu bağlantıya çizilir. */
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

/** "Diğer modeller" klasörünün kimliği — belge kimlik kalıbının dışında, çakışmaz. */
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
