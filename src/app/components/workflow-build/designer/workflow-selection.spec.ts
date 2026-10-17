import { WorkflowStep } from '../../../models/workflow.model';
import { WorkflowDesignDoc, emptyDoc } from './workflow-design.doc';
import {
  EMPTY_SELECTION,
  clickNode,
  isNodeSelected,
  pruneSelection,
  selectEdge,
  selectNodes
} from './workflow-selection';

function approval(key: string): WorkflowStep {
  return { key, type: 'approval', name: key, assignment: { mode: 'role', roleId: 1 } };
}

function docWith(...keys: string[]): WorkflowDesignDoc {
  const doc = emptyDoc();
  return { ...doc, graph: { ...doc.graph, startStep: keys[0] ?? '', steps: keys.map(approval) } };
}

describe('workflow-selection', () => {
  it('selectNodes anahtarları büyük/küçük harf duyarsız tekilleştirir ve kenarı bırakır', () => {
    const selection = selectNodes(['a', 'A', 'b']);

    expect(selection.nodes).toEqual(['a', 'b']);
    expect(selection.edge).toBeNull();
    expect(isNodeSelected(selection, 'B')).toBeTrue();
  });

  it('kenar seçimi düğüm seçimini temizler (Delete neyi sileceğini bilsin)', () => {
    const selection = selectEdge({ from: 'a', port: 'approve' });
    expect(selection.nodes).toEqual([]);
    expect(selection.edge).toEqual({ from: 'a', port: 'approve' });
  });

  describe('clickNode', () => {
    it('ek tuşsuz tıklama yalnız o düğümü seçer', () => {
      expect(clickNode(selectNodes(['a', 'b']), 'c', false).nodes).toEqual(['c']);
    });

    it('zaten seçili düğüme ek tuşsuz tıklamak çoklu seçimi korur (birlikte sürükleme)', () => {
      const selection = selectNodes(['a', 'b']);
      expect(clickNode(selection, 'b', false)).toBe(selection);
    });

    it('ek tuşla tıklama düğümü ekler ya da çıkarır', () => {
      const added = clickNode(selectNodes(['a']), 'b', true);
      expect(added.nodes).toEqual(['a', 'b']);
      expect(clickNode(added, 'A', true).nodes).toEqual(['b']);
    });

    it('kenar seçiliyken düğüme tıklamak kenarı bırakır', () => {
      const selection = clickNode(selectEdge({ from: 'a', port: 'reject' }), 'b', true);
      expect(selection.edge).toBeNull();
      expect(selection.nodes).toEqual(['b']);
    });
  });

  describe('pruneSelection', () => {
    it('belgede olmayan düğümleri ve kaynağı silinmiş kenarı atar', () => {
      const doc = docWith('a');

      expect(pruneSelection(selectNodes(['a', 'b']), doc).nodes).toEqual(['a']);
      expect(pruneSelection(selectEdge({ from: 'b', port: 'approve' }), doc).edge).toBeNull();
    });

    it('değişiklik yoksa aynı nesneyi döner', () => {
      const doc = docWith('a', 'b');
      const nodes = selectNodes(['A']);
      const edge = selectEdge({ from: 'b', port: 'approve' });

      expect(pruneSelection(nodes, doc)).toBe(nodes);
      expect(pruneSelection(edge, doc)).toBe(edge);
      expect(pruneSelection(EMPTY_SELECTION, doc)).toBe(EMPTY_SELECTION);
    });
  });
});
