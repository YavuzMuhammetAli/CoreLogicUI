import { NavLayout } from './nav-layout.model';
import {
  addNavNode, findNavNode, indentNavNode, moveNavNode, moveNavNodeBy, nextNavId, outdentNavNode,
  placedNavModels, removeNavNode, setAppendUnplaced, updateNavNode
} from './nav-layout.commands';

const doc: NavLayout = {
  schemaVersion: 1,
  appendUnplaced: true,
  items: [
    { kind: 'page', id: 'n1', page: 'tasks' },
    {
      kind: 'folder', id: 'n2', label: 'Personel', children: [
        { kind: 'model', id: 'n3', typeName: 'Personel' },
        { kind: 'model', id: 'n4', typeName: 'Izin' }
      ]
    },
    { kind: 'model', id: 'n5', typeName: 'Arac' },
    { kind: 'folder', id: 'n6', label: 'Boş', children: [] }
  ]
};

const ids = (d: NavLayout) => d.items.map(n => (n.kind === 'folder' ? `${n.id}[${n.children.map(c => c.id).join(',')}]` : n.id)).join(' ');

describe('nav-layout.commands', () => {
  it('finds a node (root and inside a folder)', () => {
    expect(findNavNode(doc, 'n4')).toEqual(jasmine.objectContaining({ folderId: 'n2', index: 1 }));
    expect(findNavNode(doc, 'n5')).toEqual(jasmine.objectContaining({ folderId: null, index: 2 }));
    expect(findNavNode(doc, 'yok')).toBeNull();
  });

  it('next id and placed models', () => {
    expect(nextNavId(doc)).toBe('n7');
    expect([...placedNavModels(doc)].sort()).toEqual(['Arac', 'Izin', 'Personel']);
  });

  it('adds: to root, to a folder; a folder cannot go into a folder', () => {
    const link = { kind: 'page' as const, id: 'n7', page: 'reports' as const };
    expect(ids(addNavNode(doc, link, { folderId: null, index: 1 }))).toBe('n1 n7 n2[n3,n4] n5 n6[]');
    expect(ids(addNavNode(doc, link, { folderId: 'n6' }))).toBe('n1 n2[n3,n4] n5 n6[n7]');
    const folder = { kind: 'folder' as const, id: 'n7', label: 'X', children: [] };
    expect(addNavNode(doc, folder, { folderId: 'n2' })).toBe(doc);
  });

  it('removes', () => {
    expect(ids(removeNavNode(doc, 'n3'))).toBe('n1 n2[n4] n5 n6[]');
    expect(ids(removeNavNode(doc, 'n2'))).toBe('n1 n5 n6[]');
    expect(removeNavNode(doc, 'yok')).toBe(doc);
  });

  it('moves: into a folder, out of a folder, forward within the same container', () => {
    expect(ids(moveNavNode(doc, 'n5', { folderId: 'n2', index: 0 }))).toBe('n1 n2[n5,n3,n4] n6[]');
    expect(ids(moveNavNode(doc, 'n3', { folderId: null, index: 0 }))).toBe('n3 n1 n2[n4] n5 n6[]');
    // Target index is relative to the array before the move: n1 before n5 (index 2)
    expect(ids(moveNavNode(doc, 'n1', { folderId: null, index: 2 }))).toBe('n2[n3,n4] n1 n5 n6[]');
    expect(moveNavNode(doc, 'n1', { folderId: null, index: 1 })).toBe(doc);
  });

  it('a folder moves only at root and cannot go into itself', () => {
    expect(moveNavNode(doc, 'n2', { folderId: 'n6' })).toBe(doc);
    expect(moveNavNode(doc, 'n5', { folderId: 'n1' })).toBe(doc);
    expect(ids(moveNavNode(doc, 'n6', { folderId: null, index: 0 }))).toBe('n6[] n1 n2[n3,n4] n5');
  });

  it('one up/down, unchanged at the edge', () => {
    expect(ids(moveNavNodeBy(doc, 'n3', 1))).toBe('n1 n2[n4,n3] n5 n6[]');
    expect(ids(moveNavNodeBy(doc, 'n5', -1))).toBe('n1 n5 n2[n3,n4] n6[]');
    expect(moveNavNodeBy(doc, 'n1', -1)).toBe(doc);
    expect(moveNavNodeBy(doc, 'n4', 1)).toBe(doc);
  });

  it('indent: into the folder above; outdent: below the folder', () => {
    expect(ids(indentNavNode(doc, 'n5'))).toBe('n1 n2[n3,n4,n5] n6[]');
    expect(indentNavNode(doc, 'n1')).toBe(doc);
    expect(indentNavNode(doc, 'n6')).toBe(doc);
    expect(ids(outdentNavNode(doc, 'n3'))).toBe('n1 n2[n4] n3 n5 n6[]');
    expect(outdentNavNode(doc, 'n5')).toBe(doc);
  });

  it('updates (kind/id preserved) and toggles the flag', () => {
    const next = updateNavNode(doc, 'n2', { label: 'İK', collapsed: true });
    expect(findNavNode(next, 'n2')?.node).toEqual(jasmine.objectContaining({ kind: 'folder', id: 'n2', label: 'İK', collapsed: true }));
    expect(setAppendUnplaced(doc, true)).toBe(doc);
    expect(setAppendUnplaced(doc, false).appendUnplaced).toBeFalse();
  });
});
