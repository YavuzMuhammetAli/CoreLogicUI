import { NavLayout } from './nav-layout.model';
import { NavRowBox, navDropTarget } from './nav-layout.drop';

// n1 (page) · n2 folder [n3, n4] · n5 · n6 empty folder
const doc: NavLayout = {
  schemaVersion: 1,
  appendUnplaced: true,
  items: [
    { kind: 'page', id: 'n1', page: 'tasks' },
    { kind: 'folder', id: 'n2', label: 'A', children: [
      { kind: 'model', id: 'n3', typeName: 'X' },
      { kind: 'model', id: 'n4', typeName: 'Y' }
    ] },
    { kind: 'model', id: 'n5', typeName: 'Z' },
    { kind: 'folder', id: 'n6', label: 'B', children: [] }
  ]
};

// Each row is 20 px.
const rows: NavRowBox[] = [
  { id: 'n1', kind: 'link', top: 0, bottom: 20 },
  { id: 'n2', kind: 'folder', top: 20, bottom: 40 },
  { id: 'n3', kind: 'link', top: 40, bottom: 60 },
  { id: 'n4', kind: 'link', top: 60, bottom: 80 },
  { id: 'n2', kind: 'folderEnd', top: 80, bottom: 90 },
  { id: 'n5', kind: 'link', top: 90, bottom: 110 },
  { id: 'n6', kind: 'folder', top: 110, bottom: 130 },
  { id: 'n6', kind: 'folderEnd', top: 130, bottom: 140 }
];

describe('nav-layout.drop', () => {
  describe('link', () => {
    it('top half of a row drops before it, bottom half after it', () => {
      expect(navDropTarget(doc, rows, 3, false)?.target).toEqual({ folderId: null, index: 0 });
      expect(navDropTarget(doc, rows, 17, false)?.target).toEqual({ folderId: null, index: 1 });
      expect(navDropTarget(doc, rows, 65, false)).toEqual({ target: { folderId: 'n2', index: 1 }, lineY: 60, inset: true });
      expect(navDropTarget(doc, rows, 75, false)?.target).toEqual({ folderId: 'n2', index: 2 });
    });

    it('folder header: top half is before the folder, bottom half is the folder start', () => {
      expect(navDropTarget(doc, rows, 22, false)?.target).toEqual({ folderId: null, index: 1 });
      expect(navDropTarget(doc, rows, 38, false)).toEqual({ target: { folderId: 'n2', index: 0 }, lineY: 40, inset: true });
    });

    it('folder end area → end of the folder (including an empty folder)', () => {
      expect(navDropTarget(doc, rows, 85, false)?.target).toEqual({ folderId: 'n2', index: 2 });
      expect(navDropTarget(doc, rows, 135, false)?.target).toEqual({ folderId: 'n6', index: 0 });
    });

    it('below the bottom is the end of the root, above the top is before the first row', () => {
      expect(navDropTarget(doc, rows, 500, false)).toEqual({ target: { folderId: null, index: 4 }, lineY: 140, inset: false });
      expect(navDropTarget(doc, rows, -10, false)?.target).toEqual({ folderId: null, index: 0 });
    });
  });

  describe('folder', () => {
    it('only root positions; a folder and its children are one block', () => {
      // n2 block 20–90: middle 55
      expect(navDropTarget(doc, rows, 50, true)?.target).toEqual({ folderId: null, index: 1 });
      expect(navDropTarget(doc, rows, 70, true)?.target).toEqual({ folderId: null, index: 2 });
      expect(navDropTarget(doc, rows, 500, true)?.target).toEqual({ folderId: null, index: 4 });
    });
  });

  it('end of the root when there are no rows', () => {
    expect(navDropTarget(doc, [], 10, false)?.target).toEqual({ folderId: null, index: 4 });
  });
});
