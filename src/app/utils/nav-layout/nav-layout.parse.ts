import { NavFolder, NavLayout, NavLink, NavNode } from './nav-layout.model';
import { isNavStructural, validateNavLayoutText } from './nav-layout.validate';

/**
 * Converts the navigation text from the server into a typed document; null if it is unreadable or has
 * a structural error — the sidebar falls back to the automatic menu. Unknown fields are dropped.
 */
export function parseNavLayout(json: string | null | undefined): NavLayout | null {
  if (!json) return null;
  if (validateNavLayoutText(json, null, 'draft').some(i => isNavStructural(i.code))) return null;
  return normalizeNavLayout(JSON.parse(json) as NavLayout);
}

/**
 * Serializes the document to the same text the server normalizes to (fixed key order, empty
 * optional fields omitted). The designer uses this to answer "are there unsaved changes".
 */
export function serializeNavLayout(layout: NavLayout): string {
  return JSON.stringify(normalizeNavLayout(layout));
}

export function normalizeNavLayout(layout: NavLayout): NavLayout {
  return {
    schemaVersion: 1,
    appendUnplaced: layout.appendUnplaced ?? true,
    items: layout.items.map(normalizeNode)
  };
}

function normalizeNode(node: NavNode): NavNode {
  if (node.kind !== 'folder') return normalizeLink(node);
  // Key order matches the server: kind, id, label, icon?, collapsed?, children.
  const head: { kind: 'folder'; id: string; label: string; icon?: string; collapsed?: boolean } = {
    kind: 'folder', id: node.id, label: node.label ?? ''
  };
  if (node.icon) head.icon = node.icon;
  if (node.collapsed) head.collapsed = true;
  return { ...head, children: node.children.map(normalizeLink) } satisfies NavFolder;
}

function normalizeLink(link: NavLink): NavLink {
  switch (link.kind) {
    case 'model':
      return link.label
        ? { kind: 'model', id: link.id, typeName: link.typeName, label: link.label }
        : { kind: 'model', id: link.id, typeName: link.typeName };
    case 'dashboard':
      return { kind: 'dashboard', id: link.id, dashboardId: link.dashboardId, label: link.label ?? '' };
    case 'report':
      return { kind: 'report', id: link.id, reportId: link.reportId, label: link.label ?? '' };
    case 'page':
      return link.label
        ? { kind: 'page', id: link.id, page: link.page, label: link.label }
        : { kind: 'page', id: link.id, page: link.page };
    case 'url':
      return link.icon
        ? { kind: 'url', id: link.id, url: link.url ?? '', label: link.label ?? '', icon: link.icon }
        : { kind: 'url', id: link.id, url: link.url ?? '', label: link.label ?? '' };
  }
}
