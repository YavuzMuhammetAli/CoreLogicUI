import { NavLayout } from './nav-layout.model';
import { NavTarget, findNavNode } from './nav-layout.commands';

/**
 * Where a node dragged in the navigation designer will be dropped — PURE (no DOM; row boxes
 * come from the caller). The dragged node (and its children, if a folder) are NOT included in the rows.
 *
 * - Link: top half of a row → before it, bottom half → after it (same container). Top half of a
 *   folder header → before the folder (root), bottom half → start of the folder. The drop area at
 *   the folder end → end of the folder (the only way to drop into an empty folder).
 * - Folder: root positions only; a folder + its children count as one block.
 */

export interface NavRowBox {
  /** Node id; for `folderEnd`, the folder's id. */
  readonly id: string;
  readonly kind: 'folder' | 'link' | 'folderEnd';
  readonly top: number;
  readonly bottom: number;
}

export interface NavDrop {
  readonly target: NavTarget;
  /** Vertical position of the drop line (same coordinates as the row boxes). */
  readonly lineY: number;
  /** Whether the line is inside a folder (drawn indented). */
  readonly inset: boolean;
}

export function navDropTarget(
  doc: NavLayout,
  rows: readonly NavRowBox[],
  y: number,
  draggingFolder: boolean
): NavDrop | null {
  if (rows.length === 0) return { target: { folderId: null, index: doc.items.length }, lineY: y, inset: false };
  return draggingFolder ? folderDrop(doc, rows, y) : linkDrop(doc, rows, y);
}

function linkDrop(doc: NavLayout, rows: readonly NavRowBox[], y: number): NavDrop | null {
  const last = rows[rows.length - 1];
  if (y >= last.bottom) return { target: { folderId: null, index: doc.items.length }, lineY: last.bottom, inset: false };
  const row = rows.find(r => y < r.bottom) ?? last;
  const upper = y < (row.top + row.bottom) / 2;

  if (row.kind === 'folderEnd') {
    const folder = doc.items.find(n => n.id === row.id);
    if (folder?.kind !== 'folder') return null;
    return { target: { folderId: folder.id, index: folder.children.length }, lineY: row.top, inset: true };
  }

  const at = findNavNode(doc, row.id);
  if (!at) return null;
  if (row.kind === 'folder') {
    return upper
      ? { target: { folderId: null, index: at.index }, lineY: row.top, inset: false }
      : { target: { folderId: row.id, index: 0 }, lineY: row.bottom, inset: true };
  }
  return {
    target: { folderId: at.folderId, index: upper ? at.index : at.index + 1 },
    lineY: upper ? row.top : row.bottom,
    inset: at.folderId !== null
  };
}

function folderDrop(doc: NavLayout, rows: readonly NavRowBox[], y: number): NavDrop {
  // Root blocks: a folder header + the rows below it form one block.
  const blocks: { id: string; top: number; bottom: number }[] = [];
  for (const row of rows) {
    const rootId = rootOf(doc, row);
    const current = blocks[blocks.length - 1];
    if (current && current.id === rootId) current.bottom = row.bottom;
    else blocks.push({ id: rootId, top: row.top, bottom: row.bottom });
  }
  for (const block of blocks) {
    if (y < (block.top + block.bottom) / 2) {
      const index = doc.items.findIndex(n => n.id === block.id);
      return { target: { folderId: null, index }, lineY: block.top, inset: false };
    }
  }
  return { target: { folderId: null, index: doc.items.length }, lineY: blocks[blocks.length - 1].bottom, inset: false };
}

function rootOf(doc: NavLayout, row: NavRowBox): string {
  if (row.kind !== 'link') return row.id;
  return findNavNode(doc, row.id)?.folderId ?? row.id;
}
