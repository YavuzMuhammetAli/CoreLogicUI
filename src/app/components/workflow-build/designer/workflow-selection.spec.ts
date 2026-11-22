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
  it('selectNodes dedupes keys case-insensitively and drops the edge', () => {
    const selection = selectNodes(['a', 'A', 'b']);

    expect(selection.nodes).toEqual(['a', 'b']);
    expect(selection.edge).toBeNull();
    expect(isNodeSelected(selection, 'B')).toBeTrue();
  });

  it('selecting an edge clears the node selection (so Delete knows what to delete)', () => {
    const selection = selectEdge({ from: 'a', port: 'approve' });
    expect(selection.nodes).toEqual([]);
    expect(selection.edge).toEqual({ from: 'a', port: 'approve' });
  });

  describe('clickNode', () => {
    it('a plain click selects only that node', () => {
      expect(clickNode(selectNodes(['a', 'b']), 'c', false).nodes).toEqual(['c']);
    });

    it('a plain click on an already selected node keeps the multi-selection (drag together)', () => {
      const selection = selectNodes(['a', 'b']);
      expect(clickNode(selection, 'b', false)).toBe(selection);
    });

    it('a modifier click adds or removes the node', () => {
      const added = clickNode(selectNodes(['a']), 'b', true);
      expect(added.nodes).toEqual(['a', 'b']);
      expect(clickNode(added, 'A', true).nodes).toEqual(['b']);
    });

    it('clicking a node while an edge is selected drops the edge', () => {
      const selection = clickNode(selectEdge({ from: 'a', port: 'reject' }), 'b', true);
      expect(selection.edge).toBeNull();
      expect(selection.nodes).toEqual(['b']);
    });
  });

  describe('pruneSelection', () => {
    it('drops nodes not in the document and an edge whose source was deleted', () => {
      const doc = docWith('a');

      expect(pruneSelection(selectNodes(['a', 'b']), doc).nodes).toEqual(['a']);
      expect(pruneSelection(selectEdge({ from: 'b', port: 'approve' }), doc).edge).toBeNull();
    });

    it('returns the same object when nothing changes', () => {
      const doc = docWith('a', 'b');
      const nodes = selectNodes(['A']);
      const edge = selectEdge({ from: 'b', port: 'approve' });

      expect(pruneSelection(nodes, doc)).toBe(nodes);
      expect(pruneSelection(edge, doc)).toBe(edge);
      expect(pruneSelection(EMPTY_SELECTION, doc)).toBe(EMPTY_SELECTION);
    });
  });
});
