import { layoutWorkflow, EMPTY_VIEW_BOX, NODE_HEIGHT, ROW_GAP, PADDING, COLUMN_GAP } from './workflow-graph.layout';
import { WorkflowGraph, WorkflowStep, WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED } from '../../../models/workflow.model';

/**
 * The layout is a pure function, so no TestBed is needed
 * (same approach as entity-graph.layout.spec.ts).
 */
function step(key: string, onApprove?: string, onReject?: string): WorkflowStep {
  return {
    key,
    type: 'approval',
    name: `${key} adımı`,
    assignment: { mode: 'role', roleId: 1 },
    onApprove: onApprove ?? null,
    onReject: onReject ?? null
  };
}

function graph(steps: WorkflowStep[], startStep = steps[0]?.key ?? ''): WorkflowGraph {
  return { startStep, steps, entityStatusMap: {} };
}

describe('layoutWorkflow', () => {
  it('returns an empty layout for an empty/null graph', () => {
    expect(layoutWorkflow(null).nodes).toEqual([]);
    expect(layoutWorkflow(null).viewBox).toBe(EMPTY_VIEW_BOX);
    expect(layoutWorkflow(graph([])).nodes).toEqual([]);
  });

  it('places sequential steps in consecutive layers', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'b'),
      step('b', 'c'),
      step('c')
    ]));

    const a = layout.nodes.find(n => n.key === 'a')!;
    const b = layout.nodes.find(n => n.key === 'b')!;
    const c = layout.nodes.find(n => n.key === 'c')!;

    expect(a.layer).toBe(0);
    expect(b.layer).toBe(1);
    expect(c.layer).toBe(2);
    // Top to bottom: each layer one row lower.
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
  });

  it('marks the start step', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')], 'a'));

    expect(layout.nodes.find(n => n.key === 'a')!.isStart).toBeTrue();
    expect(layout.nodes.find(n => n.key === 'b')!.isStart).toBeFalse();
  });

  it('the layer calculation uses the LONGEST path', () => {
    // a → b → c and also a → c (short path). c must be drawn at the layer where it is
    // reached latest so arrows always flow downward.
    const layout = layoutWorkflow(graph([
      step('a', 'b', 'c'),
      step('b', 'c'),
      step('c')
    ]));

    expect(layout.nodes.find(n => n.key === 'c')!.layer).toBe(2);
  });

  it('does not loop forever on a returning (rework) cycle', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'b'),
      step('b', 'c', 'a'),   // reject → back to the start
      step('c')
    ]));

    expect(layout.nodes.length).toBeGreaterThan(0);
    expect(layout.nodes.find(n => n.key === 'a')).toBeTruthy();
  });

  it('also draws an unreachable step', () => {
    // The validator counts it as an error; the diagram must make the error VISIBLE.
    const layout = layoutWorkflow(graph([step('a'), step('kopuk')], 'a'));

    expect(layout.nodes.find(n => n.key === 'kopuk')).toBeTruthy();
  });

  it('draws only the terminals in use', () => {
    // A single step with empty targets → both completed and rejected fall back to the default.
    const both = layoutWorkflow(graph([step('a')]));
    expect(both.nodes.some(n => n.key === WORKFLOW_TERMINAL_COMPLETED)).toBeTrue();
    expect(both.nodes.some(n => n.key === WORKFLOW_TERMINAL_REJECTED)).toBeTrue();
  });

  it('terminal nodes are marked', () => {
    const layout = layoutWorkflow(graph([step('a')]));

    const completed = layout.nodes.find(n => n.key === WORKFLOW_TERMINAL_COMPLETED)!;
    const rejected = layout.nodes.find(n => n.key === WORKFLOW_TERMINAL_REJECTED)!;

    expect(completed.isTerminal).toBeTrue();
    expect(completed.isRejection).toBeFalse();
    expect(rejected.isRejection).toBeTrue();
  });

  it('produces an approve and a reject edge for each step', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')]));

    const fromA = layout.edges.filter(e => e.key.startsWith('a->'));
    expect(fromA.length).toBe(2);
    expect(fromA.some(e => !e.isRejection)).toBeTrue();
    expect(fromA.some(e => e.isRejection)).toBeTrue();
  });

  it('silently skips an edge whose target is not drawn', () => {
    // The 'yok' step does not exist in the definition — the edge is dropped, no crash.
    const layout = layoutWorkflow(graph([step('a', 'yok')]));

    expect(layout.edges.every(e => !e.key.includes('->yok'))).toBeTrue();
  });

  it('viewBox covers all nodes', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')]));
    const [x, y, width, height] = layout.viewBox.split(' ').map(Number);

    const maxNodeBottom = Math.max(...layout.nodes.map(n => n.y + n.height));
    const maxNodeRight = Math.max(...layout.nodes.map(n => n.x + n.width));

    expect(y + height).toBeGreaterThanOrEqual(maxNodeBottom);
    expect(x + width).toBeGreaterThanOrEqual(maxNodeRight);
  });

  it('the first layer and the leftmost box start PADDING inside', () => {
    const layout = layoutWorkflow(graph([step('a')]));
    const a = layout.nodes.find(n => n.key === 'a')!;

    expect(a.y).toBe(PADDING);
    expect(Math.min(...layout.nodes.map(n => n.x))).toBe(PADDING);
  });

  it('no two boxes in the same layer overlap, COLUMN_GAP stays between them', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'b', 'c'),
      step('b', 'd', 'e'),
      step('c', 'd', 'e'),
      step('d'),
      step('e')
    ]));

    for (const layer of new Set(layout.nodes.map(n => n.layer))) {
      const row = layout.nodes.filter(n => n.layer === layer).sort((p, q) => p.x - q.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x - (row[i - 1].x + row[i - 1].width)).toBeGreaterThanOrEqual(COLUMN_GAP - 0.001);
      }
    }
  });

  it('the row below a parallel box starts ROW_GAP BELOW it', () => {
    // The parallel box grows per branch; with a fixed row height
    // the row below would overlap it.
    const parallel: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'all',
      branches: [1, 2, 3, 4, 5].map(i => ({ key: `d${i}`, name: `Dal ${i}` })),
      onComplete: 'son'
    };

    const layout = layoutWorkflow(graph([parallel, step('son')], 'p'));
    const p = layout.nodes.find(n => n.key === 'p')!;
    const last = layout.nodes.find(n => n.key === 'son')!;

    expect(last.y).toBe(p.y + p.height + ROW_GAP);
  });

  it('when approve/reject branch into two separate steps the approve target is left, the reject target right', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'onayla', 'duzelt'),
      step('onayla'),
      step('duzelt')
    ]));

    const approveNode = layout.nodes.find(n => n.key === 'onayla')!;
    const fixNode = layout.nodes.find(n => n.key === 'duzelt')!;
    const a = layout.nodes.find(n => n.key === 'a')!;

    expect(approveNode.x).toBeLessThan(fixNode.x);
    // The parent stays in the middle of the two children.
    expect(a.x + a.width / 2).toBeCloseTo(
      (approveNode.x + approveNode.width / 2 + fixNode.x + fixNode.width / 2) / 2, 6);
  });

  it('an approval chain whose reject goes to the terminal stays a vertical spine', () => {
    // Almost every step's reject goes to the terminal; if this counted as branching
    // the chain would shift half a column left on every layer.
    const layout = layoutWorkflow(graph([
      step('a', 'b'),
      step('b', 'c'),
      step('c')
    ]));

    const xs = ['a', 'b', 'c'].map(key => layout.nodes.find(n => n.key === key)!.x);
    expect(new Set(xs).size).toBe(1);
  });

  it('among terminals completed is on the left, rejected on the right', () => {
    const layout = layoutWorkflow(graph([step('a')]));

    const completed = layout.nodes.find(n => n.key === WORKFLOW_TERMINAL_COMPLETED)!;
    const rejected = layout.nodes.find(n => n.key === WORKFLOW_TERMINAL_REJECTED)!;

    expect(completed.x).toBeLessThan(rejected.x);
  });

  it('a reject edge back to the start goes around the right of all boxes', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'b'),
      step('b', 'c', 'a'),   // reject → back to the start
      step('c')
    ]));

    const back = layout.edges.find(e => e.key === 'b->a:reject')!;
    const rightmost = Math.max(...layout.nodes
      .filter(n => n.key === 'a' || n.key === 'b')
      .map(n => n.x + n.width));

    expect(back.maxX).toBeGreaterThan(rightmost);
  });

  it('the approve and reject edges do not leave from the same point', () => {
    const layout = layoutWorkflow(graph([step('a', 'b', 'c'), step('b'), step('c')]));
    const approve = layout.edges.find(e => e.key === 'a->b:approve')!;
    const reject = layout.edges.find(e => e.key === 'a->c:reject')!;

    expect(approve.path.split(' C ')[0]).not.toBe(reject.path.split(' C ')[0]);
  });

  it('the vertical gap between layers is constant', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')]));
    const a = layout.nodes.find(n => n.key === 'a')!;
    const b = layout.nodes.find(n => n.key === 'b')!;

    expect(b.y - a.y).toBe(NODE_HEIGHT + ROW_GAP);
  });

  it('a parallel step\'s branches are listed in a SINGLE box', () => {
    // Branches are NOT separate nodes: since they open at the same time and join at the same step,
    // showing them in a single box does not spread the diagram horizontally.
    const parallel: WorkflowStep = {
      key: 'onaylar',
      type: 'parallel',
      name: 'Paralel Onay',
      mode: 'all',
      branches: [
        { key: 'finans', name: 'Finans' },
        { key: 'hukuk', name: 'Hukuk' }
      ],
      onComplete: 'final'
    };

    const layout = layoutWorkflow(graph([step('a', 'onaylar'), parallel, step('final')], 'a'));
    const node = layout.nodes.find(n => n.key === 'onaylar')!;

    expect(node.isParallel).toBeTrue();
    expect(node.branchLabels).toEqual(['Finans', 'Hukuk']);
    expect(layout.nodes.filter(n => n.key === 'finans').length).toBe(0);
  });

  it('a parallel box grows with the branch count', () => {
    const one: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }]
    };
    const three: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }, { key: 'c1', name: 'C' }]
    };

    const h2 = layoutWorkflow(graph([one], 'p')).nodes.find(n => n.key === 'p')!.height;
    const h3 = layoutWorkflow(graph([three], 'p')).nodes.find(n => n.key === 'p')!.height;

    expect(h3).toBeGreaterThan(h2);
  });

  it('a parallel step uses the onComplete/onAnyReject fields', () => {
    // A single step reads onApprove/onReject, a parallel step onComplete/onAnyReject;
    // if mixed up the edges would never be drawn.
    const parallel: WorkflowStep = {
      key: 'onaylar', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }],
      onComplete: 'final',
      onAnyReject: 'duzeltme'
    };

    const layout = layoutWorkflow(
      graph([parallel, step('final'), step('duzeltme')], 'onaylar'));

    expect(layout.edges.some(e => e.key.startsWith('onaylar->final'))).toBeTrue();
    expect(layout.edges.some(e => e.key.startsWith('onaylar->duzeltme'))).toBeTrue();
  });

  it('the join rule badge is shown', () => {
    const any: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'any',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }]
    };

    expect(layoutWorkflow(graph([any], 'p')).nodes.find(n => n.key === 'p')!.joinLabel)
      .toBe('any');
  });

  it('a manually moved position DOES NOT AFFECT the auto layout', () => {
    // The diagram (read-only preview) always uses the auto layout; the canvas
    // prefers step.x/y if present. Keeping the two separate is deliberate:
    // the preview should not be affected by nodes the user scattered on the canvas.
    const moved: WorkflowStep = { ...step('a'), x: 999, y: 999 };
    const layout = layoutWorkflow(graph([moved], 'a'));
    const reference = layoutWorkflow(graph([step('a')], 'a'));

    expect(layout.nodes.find(n => n.key === 'a')!.x).toBe(reference.nodes.find(n => n.key === 'a')!.x);
    expect(layout.nodes.find(n => n.key === 'a')!.y).toBe(PADDING);
  });

  it('step keys match case-insensitively', () => {
    const layout = layoutWorkflow(graph([step('Yonetici', 'FINANS'), step('finans')], 'yonetici'));

    expect(layout.nodes.find(n => n.key === 'Yonetici')!.isStart).toBeTrue();
    expect(layout.nodes.find(n => n.key === 'finans')!.layer).toBe(1);
  });
});

describe('layoutWorkflow — cycle', () => {
  function stepOf(key: string, onApprove?: string, onReject?: string): WorkflowStep {
    return {
      key, type: 'approval', name: key, assignment: { mode: 'role', roleId: 1 },
      onApprove: onApprove ?? null, onReject: onReject ?? null
    };
  }

  it('in a flow that rejects back to the start, the start stays at the top and the chain descends in order', () => {
    // REGRESSION: the old BFS re-queued the node in a cycle; with the c→a reject
    // c landed above b, and in an a→b→c→d flow the start fell to the bottom row.
    const layout = layoutWorkflow({
      startStep: 'a', entityStatusMap: {},
      steps: [stepOf('a', 'b'), stepOf('b', 'c'), stepOf('c', 'd', 'a'), stepOf('d')]
    });

    const layer = (key: string) => layout.nodes.find(n => n.key === key)!.layer;
    expect([layer('a'), layer('b'), layer('c'), layer('d')]).toEqual([0, 1, 2, 3]);
  });

  it('a back edge to the start does not take part in layering', () => {
    const layout = layoutWorkflow({
      startStep: 'a', entityStatusMap: {},
      steps: [stepOf('a', 'b'), stepOf('b', 'c', 'a'), stepOf('c')]
    });

    const layer = (key: string) => layout.nodes.find(n => n.key === key)!.layer;
    expect([layer('a'), layer('b'), layer('c')]).toEqual([0, 1, 2]);
  });
});
