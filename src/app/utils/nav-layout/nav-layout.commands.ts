import { NavFolder, NavLayout, NavLink, NavNode } from './nav-layout.model';

/**
 * PURE commands on the navigation document — the designer makes every change with one of these,
 * so one command = one undo step. An invalid request (unknown id, putting a folder into a
 * folder) returns the document with the SAME reference; history does not record the same reference.
 */

/** Target position: the root (`folderId: null`) or inside a folder; at the end if there is no `index`. */
export interface NavTarget {
  readonly folderId: string | null;
  readonly index?: number;
}

export interface NavLocation {
  readonly node: NavNode;
  /** Null if at the root. */
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

/** Names of the models placed in the design. */
export function placedNavModels(doc: NavLayout): Set<string> {
  const names = new Set<string>();
  const visit = (link: NavLink) => { if (link.kind === 'model') names.add(link.typeName); };
  for (const node of doc.items) {
    if (node.kind === 'folder') node.children.forEach(visit);
    else visit(node);
  }
  return names;
}

/** `n1`, `n2`… — the first id not used in the document. */
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

/** Moves the node to the target. A folder can only go to the root; the target index refers to the array BEFORE the move. */
export function moveNavNode(doc: NavLayout, id: string, target: NavTarget): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  if (at.node.kind === 'folder' && target.folderId !== null) return doc;
  if (target.folderId !== null && target.folderId === id) return doc;
  if (target.folderId !== null && findNavNode(doc, target.folderId)?.node.kind !== 'folder') return doc;

  // When moving forward within the same container, the removal shifts indices by one.
  let index = target.index;
  if (index !== undefined && at.folderId === target.folderId && index > at.index) index--;
  if (index !== undefined && at.folderId === target.folderId && index === at.index) return doc;

  return insert(detach(doc, at), at.node, { folderId: target.folderId, index });
}

/** One up/down within the same container (keyboard: Alt+↑/↓). */
export function moveNavNodeBy(doc: NavLayout, id: string, delta: -1 | 1): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  const size = at.folderId === null ? doc.items.length : (folderOf(doc, at.folderId)?.children.length ?? 0);
  const to = at.index + delta;
  if (to < 0 || to >= size) return doc;
  return moveNavNode(doc, id, { folderId: at.folderId, index: delta > 0 ? to + 1 : to });
}

/** Moves the link to the end of the folder directly above it (keyboard: Alt+→). */
export function indentNavNode(doc: NavLayout, id: string): NavLayout {
  const at = findNavNode(doc, id);
  if (!at || at.folderId !== null || at.node.kind === 'folder' || at.index === 0) return doc;
  const above = doc.items[at.index - 1];
  if (above.kind !== 'folder') return doc;
  return moveNavNode(doc, id, { folderId: above.id });
}

/** Takes the link out of its folder and puts it right below the folder (keyboard: Alt+←). */
export function outdentNavNode(doc: NavLayout, id: string): NavLayout {
  const at = findNavNode(doc, id);
  if (!at || at.folderId === null) return doc;
  const folderIndex = doc.items.findIndex(n => n.id === at.folderId);
  return moveNavNode(doc, id, { folderId: null, index: folderIndex + 1 });
}

/** Changes the node's fields (kind and id do not change). */
export function updateNavNode(doc: NavLayout, id: string, patch: Partial<Omit<NavFolder, 'kind' | 'id' | 'children'>> | Partial<NavLink>): NavLayout {
  const at = findNavNode(doc, id);
  if (!at) return doc;
  const next = { ...at.node, ...patch, kind: at.node.kind, id: at.node.id } as NavNode;
  return replace(doc, at, next);
}

export function setAppendUnplaced(doc: NavLayout, value: boolean): NavLayout {
  return doc.appendUnplaced === value ? doc : { ...doc, appendUnplaced: value };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

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
