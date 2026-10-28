import { NavFolder, NavLayout, NavLink, NavNode } from './nav-layout.model';
import { isNavStructural, validateNavLayoutText } from './nav-layout.validate';

/**
 * Sunucudan gelen navigasyon metnini tipli belgeye çevirir; okunamıyor ya da yapısal hata
 * varsa null — kenar çubuğu otomatik menüye düşer. Bilinmeyen alanlar atılır.
 */
export function parseNavLayout(json: string | null | undefined): NavLayout | null {
  if (!json) return null;
  if (validateNavLayoutText(json, null, 'draft').some(i => isNavStructural(i.code))) return null;
  return normalizeNavLayout(JSON.parse(json) as NavLayout);
}

/**
 * Belgeyi sunucunun normalize ettiği biçimle aynı metne çevirir (sabit anahtar sırası, boş
 * isteğe bağlı alanlar atlanır). Tasarımcı "kaydedilmemiş değişiklik var mı" sorusunu bununla cevaplar.
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
  // Anahtar sırası sunucuyla aynı: kind, id, label, icon?, collapsed?, children.
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
