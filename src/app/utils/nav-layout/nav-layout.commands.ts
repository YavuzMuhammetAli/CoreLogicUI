import { NavFolder, NavLayout, NavLink, NavNode } from './nav-layout.model';

/**
 * Navigasyon belgesi üzerinde SAF komutlar — tasarımcı her değişikliği bunlardan biriyle yapar,
 * böylece tek komut = tek geri al adımı. Geçersiz istek (bilinmeyen kimlik, klasörü klasöre
 * koymak) belgeyi AYNI referansla döndürür; geçmiş aynı referansı kaydetmez.
 */

/** Hedef konum: kök (`folderId: null`) ya da bir klasörün içi; `index` yoksa sona. */
export interface NavTarget {
  readonly folderId: string | null;
  readonly index?: number;
}

export interface NavLocation {
  readonly node: NavNode;
  /** Kökteyse null. */
  readonly folderId: string | null;
  readonly index: number;
}

export function findNavNode(doc: NavLayout, id: string): NavLocation | null {
  for (let i = 0; i < doc.items.length; i++) {
    const node = doc.items[i];
    if (node.id === id) return { node, folderId: null, index: i };
    if (node.kind === 'folder') {
      const j = node.children.findIndex(c => c.id === id);
      if (j >= 0) return { node: node.children[j], folderId: node.id, index: j };
    }
  }
  return null;
}

export function navIds(doc: NavLayout): Set<string> {
  const ids = new Set<string>();
  for (const node of doc.items) {
    ids.add(node.id);
    if (node.kind === 'folder') for (const child of node.children) ids.add(child.id);
  }
  return ids;
}

/** Tasarımda yer alan model adları. */
export function placedNavModels(doc: NavLayout): Set<string> {
  const names = new Set<string>();
  const visit = (link: NavLink) => { if (link.kind === 'model') names.add(link.typeName); };
  for (const node of doc.items) {
    if (node.kind === 'folder') node.children.forEach(visit);
    else visit(node);
  }
  return names;
}

/** `n1`, `n2`… — belgede kullanılmayan ilk kimlik. */
export function nextNavId(doc: NavLayout, prefix = 'n'): string {
  let max = 0;
  for (const id of navIds(doc)) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export function addNavNode(doc: NavLayout, node: NavNode, target: NavTarget): NavLayout {
  if (target.folderId !== null && node.kind === 'folder') return doc;
  return insert(doc, node, target);
}

export function removeNavNode(doc: NavLayout, id: string): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  return detach(doc, at);
}

/** Düğümü hedefe taşır. Klasör yalnız köke gider; hedef indeksi taşınmadan ÖNCEKİ diziye göredir. */
export function moveNavNode(doc: NavLayout, id: string, target: NavTarget): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  if (at.node.kind === 'folder' && target.folderId !== null) return doc;
  if (target.folderId !== null && target.folderId === id) return doc;
  if (target.folderId !== null && findNavNode(doc, target.folderId)?.node.kind !== 'folder') return doc;

  // Aynı kapta ileri taşırken kaldırma indeksleri bir kaydırır.
  let index = target.index;
  if (index !== undefined && at.folderId === target.folderId && index > at.index) index--;
  if (index !== undefined && at.folderId === target.folderId && index === at.index) return doc;

  return insert(detach(doc, at), at.node, { folderId: target.folderId, index });
}

/** Aynı kap içinde bir yukarı/aşağı (klavye: Alt+↑/↓). */
export function moveNavNodeBy(doc: NavLayout, id: string, delta: -1 | 1): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  const size = at.folderId === null ? doc.items.length : (folderOf(doc, at.folderId)?.children.length ?? 0);
  const to = at.index + delta;
  if (to < 0 || to >= size) return doc;
  return moveNavNode(doc, id, { folderId: at.folderId, index: delta > 0 ? to + 1 : to });
}

/** Bağlantıyı hemen üstündeki klasörün sonuna alır (klavye: Alt+→). */
export function indentNavNode(doc: NavLayout, id: string): NavLayout {
  const at = findNavNode(doc, id);
  if (!at || at.folderId !== null || at.node.kind === 'folder' || at.index === 0) return doc;
  const above = doc.items[at.index - 1];
  if (above.kind !== 'folder') return doc;
  return moveNavNode(doc, id, { folderId: above.id });
}

/** Bağlantıyı klasöründen çıkarıp klasörün hemen altına koyar (klavye: Alt+←). */
export function outdentNavNode(doc: NavLayout, id: string): NavLayout {
  const at = findNavNode(doc, id);
  if (!at || at.folderId === null) return doc;
  const folderIndex = doc.items.findIndex(n => n.id === at.folderId);
  return moveNavNode(doc, id, { folderId: null, index: folderIndex + 1 });
}

/** Düğümün alanlarını değiştirir (tür ve kimlik değişmez). */
export function updateNavNode(doc: NavLayout, id: string, patch: Partial<Omit<NavFolder, 'kind' | 'id' | 'children'>> | Partial<NavLink>): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  const next = { ...at.node, ...patch, kind: at.node.kind, id: at.node.id } as NavNode;
  return replace(doc, at, next);
}

export function setAppendUnplaced(doc: NavLayout, value: boolean): NavLayout {
  return doc.appendUnplaced === value ? doc : { ...doc, appendUnplaced: value };
}

// ─── İç yardımcılar ─────────────────────────────────────────────────────────

function folderOf(doc: NavLayout, folderId: string): NavFolder | null {
  const node = doc.items.find(n => n.id === folderId);
  return node?.kind === 'folder' ? node : null;
}

function insert(doc: NavLayout, node: NavNode, target: NavTarget): NavLayout {
  if (target.folderId === null) {
    const items = [...doc.items];
    items.splice(clamp(target.index, items.length), 0, node);
    return { ...doc, items };
  }
  const folder = folderOf(doc, target.folderId);
  if (!folder || node.kind === 'folder') return doc;
  const children = [...folder.children];
  children.splice(clamp(target.index, children.length), 0, node);
  return { ...doc, items: doc.items.map(n => (n === folder ? { ...folder, children } : n)) };
}

function detach(doc: NavLayout, at: NavLocation): NavLayout {
  if (at.folderId === null) return { ...doc, items: doc.items.filter((_, i) => i !== at.index) };
  return {
    ...doc,
    items: doc.items.map(n =>
      n.id === at.folderId && n.kind === 'folder'
        ? { ...n, children: n.children.filter((_, i) => i !== at.index) }
        : n)
  };
}

function replace(doc: NavLayout, at: NavLocation, next: NavNode): NavLayout {
  if (at.folderId === null) return { ...doc, items: doc.items.map((n, i) => (i === at.index ? next : n)) };
  return {
    ...doc,
    items: doc.items.map(n =>
      n.id === at.folderId && n.kind === 'folder'
        ? { ...n, children: n.children.map((c, i) => (i === at.index ? next as NavLink : c)) }
        : n)
  };
}

function clamp(index: number | undefined, length: number): number {
  if (index === undefined || index > length) return length;
  return Math.max(0, index);
}
