import {
  CanvasEdge, CanvasNode, DEFAULT_NODE_X, DEFAULT_NODE_Y,
  edgeAt, nodeAt, nodesInRect, portsOf, resolveNodePositions
} from './workflow-canvas.hit-test';
import { edgeGeometry, NODE_HEIGHT, NODE_WIDTH, BRANCH_LINE_HEIGHT } from '../workflow-graph/workflow-edge.geometry';
import { WorkflowGraph, WorkflowStep } from '../../../models/workflow.model';

/** Pure functions — no TestBed. */
function step(key: string, extra: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    key,
    type: 'approval',
    name: `${key} adımı`,
    assignment: { mode: 'role', roleId: 1 },
    ...extra
  };
}

function graph(steps: WorkflowStep[], startStep = steps[0]?.key ?? ''): WorkflowGraph {
  return { startStep, steps, entityStatusMap: {} };
}

function node(key: string, x: number, y: number, width = NODE_WIDTH, height = NODE_HEIGHT): CanvasNode {
  return { key, label: key, x, y, width, height, isStart: false, isParallel: false, branchLabels: [], ports: [], pinned: true };
}

describe('resolveNodePositions', () => {
  it('returns an empty list when there is no graph', () => {
    expect(resolveNodePositions(null, [], {})).toEqual([]);
  });

  it('the live drag position overrides everything', () => {
    const nodes = resolveNodePositions(
      graph([step('a', { x: 200, y: 300 })]),
      [{ key: 'a', x: 500, y: 600 }],
      { a: { x: 11, y: 22 } });

    expect(nodes[0].x).toBe(11);
    expect(nodes[0].y).toBe(22);
  });

  it('uses the definition\'s x/y when there is no live position', () => {
    const nodes = resolveNodePositions(
      graph([step('a', { x: 200, y: 300 })]),
      [{ key: 'a', x: 500, y: 600 }],
      {});

    expect(nodes[0].x).toBe(200);
    expect(nodes[0].y).toBe(300);
  });

  it('falls back to auto layout when the definition has no position', () => {
    const nodes = resolveNodePositions(graph([step('a')]), [{ key: 'a', x: 500, y: 600 }], {});

    expect(nodes[0].x).toBe(500);
    expect(nodes[0].y).toBe(600);
  });

  it('falls back to the default position when none is available', () => {
    const nodes = resolveNodePositions(graph([step('a')]), [], {});

    expect(nodes[0].x).toBe(DEFAULT_NODE_X);
    expect(nodes[0].y).toBe(DEFAULT_NODE_Y);
  });

  it('auto layout matching is case-insensitive', () => {
    const nodes = resolveNodePositions(graph([step('Onay')]), [{ key: 'onay', x: 77, y: 88 }], {});

    expect(nodes[0].x).toBe(77);
  });

  it('an auto-positioned node does not land on a manually positioned node', () => {
    // 'a' was placed manually at 24,24; 'b''s auto position falls exactly there.
    const nodes = resolveNodePositions(
      graph([step('a', { x: 24, y: 24 }), step('b')]),
      [{ key: 'a', x: 300, y: 24 }, { key: 'b', x: 24, y: 24 }],
      {});

    const [a, b] = nodes;
    expect(a.x).toBe(24);
    expect(a.y).toBe(24);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
  });

  it('manually positioned nodes are not moved even if they overlap each other', () => {
    const nodes = resolveNodePositions(
      graph([step('a', { x: 50, y: 50 }), step('b', { x: 60, y: 60 })]), [], {});

    expect(nodes[1].x).toBe(60);
    expect(nodes[1].y).toBe(60);
  });

  it('a zero position does not fall back to the default', () => {
    // Since `?? ` is used, 0 is a valid position; with `||` zero would be
    // swallowed and the node would jump to 24,24.
    const nodes = resolveNodePositions(graph([step('a', { x: 0, y: 0 })]), [], {});

    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });

  it('marks the start step case-insensitively', () => {
    const nodes = resolveNodePositions(graph([step('Onay')], 'onay'), [], {});

    expect(nodes[0].isStart).toBeTrue();
  });

  it('produces the branch labels and height of a parallel step', () => {
    const parallel = step('p', {
      type: 'parallel',
      mode: 'all',
      branches: [
        { key: 'finans', name: 'Finans', assignment: { mode: 'role', roleId: 1 } },
        { key: 'satinalma', name: '', assignment: { mode: 'role', roleId: 2 } }
      ]
    });

    const nodes = resolveNodePositions(graph([parallel]), [], {});

    // A branch with an empty name falls back to its key.
    expect(nodes[0].branchLabels).toEqual(['Finans', 'satinalma']);
    expect(nodes[0].height).toBe(NODE_HEIGHT + 2 * BRANCH_LINE_HEIGHT);
    expect(nodes[0].isParallel).toBeTrue();
  });

  it('uses the key as the label for a step with an empty name', () => {
    const nodes = resolveNodePositions(graph([step('a', { name: '' })]), [], {});

    expect(nodes[0].label).toBe('a');
  });
});

describe('nodeAt', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 200)];

  it('finds a point inside the node', () => {
    expect(nodeAt(nodes, { x: 350, y: 220 })?.key).toBe('b');
  });

  it('returns null outside the nodes', () => {
    expect(nodeAt(nodes, { x: 2000, y: 2000 })).toBeNull();
  });

  it('edge points also count as hits', () => {
    expect(nodeAt(nodes, { x: 0, y: 0 })?.key).toBe('a');
    expect(nodeAt(nodes, { x: NODE_WIDTH, y: NODE_HEIGHT })?.key).toBe('a');
  });

  it('on overlap the node drawn LATER wins', () => {
    // The later node is drawn on top in the DOM; the user thinks they clicked it.
    const overlapping = [node('alt', 0, 0), node('ust', 10, 10)];

    expect(nodeAt(overlapping, { x: 20, y: 20 })?.key).toBe('ust');
  });
});

describe('edgeAt', () => {
  const source = node('a', 100, 100);
  const target = node('b', 100, 400);
  const edge: CanvasEdge = {
    key: 'a->b:approve',
    label: 'onay',
    isRejection: false,
    from: 'a',
    to: 'b',
    port: 'approve',
    exitPort: 'approve',
    geometry: edgeGeometry(source, target)
  };

  // Since source and target are in the same column, the path goes straight down.
  const onPath = { x: 100 + NODE_WIDTH / 2, y: 300 };

  it('finds the edge at a point on the path', () => {
    expect(edgeAt([edge], onPath, 1)?.key).toBe(edge.key);
  });

  it('returns null at a point outside the tolerance', () => {
    expect(edgeAt([edge], { x: onPath.x + 60, y: onPath.y }, 1)).toBeNull();
  });

  it('tolerance is measured in screen coordinates — it widens in the world when zoomed out', () => {
    const point = { x: onPath.x + 20, y: onPath.y };

    // At zoom=1, 20 units is outside the tolerance (8); at zoom=0.25 it is inside 8/0.25 = 32.
    expect(edgeAt([edge], point, 1)).toBeNull();
    expect(edgeAt([edge], point, 0.25)?.key).toBe(edge.key);
  });

  it('picks the nearest when there are several candidates', () => {
    const farTarget = node('c', 600, 400);
    const farEdge: CanvasEdge = {
      ...edge,
      key: 'a->c:reject',
      to: 'c',
      port: 'reject',
      exitPort: 'reject',
      isRejection: true,
      geometry: edgeGeometry(source, farTarget)
    };

    expect(edgeAt([farEdge, edge], onPath, 1)?.key).toBe(edge.key);
  });

  it('returns null when there are no edges', () => {
    expect(edgeAt([], onPath, 1)).toBeNull();
  });
});

describe('nodesInRect', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 200), node('c', 900, 800)];

  it('includes a partially overlapping node', () => {
    const selected = nodesInRect(nodes, { x: -50, y: -50 }, { x: 20, y: 20 });

    expect(selected.map(n => n.key)).toEqual(['a']);
  });

  it('works with a rectangle given by reversed corners', () => {
    const selected = nodesInRect(nodes, { x: 20, y: 20 }, { x: -50, y: -50 });

    expect(selected.map(n => n.key)).toEqual(['a']);
  });

  it('selects several nodes together', () => {
    const selected = nodesInRect(nodes, { x: -10, y: -10 }, { x: 500, y: 400 });

    expect(selected.map(n => n.key)).toEqual(['a', 'b']);
  });

  it('a frame touching no node returns empty', () => {
    expect(nodesInRect(nodes, { x: 5000, y: 5000 }, { x: 5100, y: 5100 })).toEqual([]);
  });
});

describe('portsOf', () => {
  it('on an approval step the approve and reject ports are laid out symmetrically', () => {
    const ports = portsOf(step('a', { onApprove: 'b', onReject: null }), 168);

    expect(ports.map(p => [p.port, p.kind, p.target])).toEqual([
      ['approve', 'approve', 'b'],
      ['reject', 'reject', null]
    ]);
    expect(ports.map(p => p.offset)).toEqual([56, 112]);
  });

  it('on a step with reject disabled no reject port is drawn and the approve port is centred', () => {
    // A connection drawn from a disabled port silently vanished on save.
    const ports = portsOf(step('a', { form: { fields: [], allowReject: false } }), 168);

    expect(ports.map(p => p.port)).toEqual(['approve']);
    expect(ports[0].offset).toBe(84);
  });

  it('complete and any-reject ports on a parallel step', () => {
    const parallel: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
      onComplete: 'son', onAnyReject: null
    };

    expect(portsOf(parallel, 168).map(p => [p.port, p.target])).toEqual([
      ['complete', 'son'],
      ['anyReject', null]
    ]);
  });

  it('a resolved node carries its ports', () => {
    const [a] = resolveNodePositions(graph([step('a', { onApprove: 'b' }), step('b')]), [], {});
    expect(a.ports.length).toBe(2);
  });
});
