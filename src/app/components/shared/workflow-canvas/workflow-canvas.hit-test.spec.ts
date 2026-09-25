import {
  CanvasEdge, CanvasNode, DEFAULT_NODE_X, DEFAULT_NODE_Y,
  edgeAt, nodeAt, nodesInRect, resolveNodePositions
} from './workflow-canvas.hit-test';
import { edgeGeometry, NODE_HEIGHT, NODE_WIDTH, BRANCH_LINE_HEIGHT } from '../workflow-graph/workflow-edge.geometry';
import { WorkflowGraph, WorkflowStep } from '../../../models/workflow.model';

/** Saf fonksiyonlar — TestBed yok. */
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
  return { key, label: key, x, y, width, height, isStart: false, isParallel: false, branchLabels: [] };
}

describe('resolveNodePositions', () => {
  it('grafik yoksa boş liste döner', () => {
    expect(resolveNodePositions(null, [], {})).toEqual([]);
  });

  it('canlı sürükleme konumu her şeyi ezer', () => {
    const nodes = resolveNodePositions(
      graph([step('a', { x: 200, y: 300 })]),
      [{ key: 'a', x: 500, y: 600 }],
      { a: { x: 11, y: 22 } });

    expect(nodes[0].x).toBe(11);
    expect(nodes[0].y).toBe(22);
  });

  it('canlı konum yoksa tanımdaki x/y kullanılır', () => {
    const nodes = resolveNodePositions(
      graph([step('a', { x: 200, y: 300 })]),
      [{ key: 'a', x: 500, y: 600 }],
      {});

    expect(nodes[0].x).toBe(200);
    expect(nodes[0].y).toBe(300);
  });

  it('tanımda konum yoksa otomatik yerleşime düşer', () => {
    const nodes = resolveNodePositions(graph([step('a')]), [{ key: 'a', x: 500, y: 600 }], {});

    expect(nodes[0].x).toBe(500);
    expect(nodes[0].y).toBe(600);
  });

  it('hiçbiri yoksa varsayılan konuma düşer', () => {
    const nodes = resolveNodePositions(graph([step('a')]), [], {});

    expect(nodes[0].x).toBe(DEFAULT_NODE_X);
    expect(nodes[0].y).toBe(DEFAULT_NODE_Y);
  });

  it('otomatik yerleşim eşleşmesi büyük/küçük harf duyarsız', () => {
    const nodes = resolveNodePositions(graph([step('Onay')]), [{ key: 'onay', x: 77, y: 88 }], {});

    expect(nodes[0].x).toBe(77);
  });

  it('otomatik konumlu düğüm elle konumlanmış düğümün üstüne düşmez', () => {
    // 'a' elle 24,24'e konmuş; 'b'nin otomatik konumu tam oraya düşüyor.
    const nodes = resolveNodePositions(
      graph([step('a', { x: 24, y: 24 }), step('b')]),
      [{ key: 'a', x: 300, y: 24 }, { key: 'b', x: 24, y: 24 }],
      {});

    const [a, b] = nodes;
    expect(a.x).toBe(24);
    expect(a.y).toBe(24);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
  });

  it('elle konumlanmış düğümler birbirine binse bile yerinden oynatılmaz', () => {
    const nodes = resolveNodePositions(
      graph([step('a', { x: 50, y: 50 }), step('b', { x: 60, y: 60 })]), [], {});

    expect(nodes[1].x).toBe(60);
    expect(nodes[1].y).toBe(60);
  });

  it('sıfır konumu varsayılana düşmez', () => {
    // `?? ` kullanıldığı için 0 geçerli bir konumdur; `||` olsaydı sıfır
    // yutulur ve düğüm 24,24'e kaçardı.
    const nodes = resolveNodePositions(graph([step('a', { x: 0, y: 0 })]), [], {});

    expect(nodes[0].x).toBe(0);
    expect(nodes[0].y).toBe(0);
  });

  it('başlangıç adımını büyük/küçük harf duyarsız işaretler', () => {
    const nodes = resolveNodePositions(graph([step('Onay')], 'onay'), [], {});

    expect(nodes[0].isStart).toBeTrue();
  });

  it('paralel adımın dal etiketlerini ve yüksekliğini üretir', () => {
    const parallel = step('p', {
      type: 'parallel',
      mode: 'all',
      branches: [
        { key: 'finans', name: 'Finans', assignment: { mode: 'role', roleId: 1 } },
        { key: 'satinalma', name: '', assignment: { mode: 'role', roleId: 2 } }
      ]
    });

    const nodes = resolveNodePositions(graph([parallel]), [], {});

    // Adı boş dal anahtarına düşer.
    expect(nodes[0].branchLabels).toEqual(['Finans', 'satinalma']);
    expect(nodes[0].height).toBe(NODE_HEIGHT + 2 * BRANCH_LINE_HEIGHT);
    expect(nodes[0].isParallel).toBeTrue();
  });

  it('adı boş adımda anahtarı etiket yapar', () => {
    const nodes = resolveNodePositions(graph([step('a', { name: '' })]), [], {});

    expect(nodes[0].label).toBe('a');
  });
});

describe('nodeAt', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 200)];

  it('düğümün içindeki noktayı bulur', () => {
    expect(nodeAt(nodes, { x: 350, y: 220 })?.key).toBe('b');
  });

  it('düğümlerin dışında null döner', () => {
    expect(nodeAt(nodes, { x: 2000, y: 2000 })).toBeNull();
  });

  it('kenar noktaları da isabet sayılır', () => {
    expect(nodeAt(nodes, { x: 0, y: 0 })?.key).toBe('a');
    expect(nodeAt(nodes, { x: NODE_WIDTH, y: NODE_HEIGHT })?.key).toBe('a');
  });

  it('örtüşmede SONRA çizilen düğüm kazanır', () => {
    // DOM'da sonraki düğüm üstte çizilir; kullanıcı onu tıkladığını sanır.
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
    geometry: edgeGeometry(source, target)
  };

  // Kaynak ve hedef aynı sütunda olduğu için yol dümdüz aşağı iniyor.
  const onPath = { x: 100 + NODE_WIDTH / 2, y: 300 };

  it('yolun üzerindeki noktada kenarı bulur', () => {
    expect(edgeAt([edge], onPath, 1)?.key).toBe(edge.key);
  });

  it('toleransın dışındaki noktada null döner', () => {
    expect(edgeAt([edge], { x: onPath.x + 60, y: onPath.y }, 1)).toBeNull();
  });

  it('tolerans ekran koordinatında ölçülür — uzaklaşınca dünyada genişler', () => {
    const point = { x: onPath.x + 20, y: onPath.y };

    // zoom=1'de 20 birim tolerans (8) dışında; zoom=0.25'te 8/0.25 = 32 içinde.
    expect(edgeAt([edge], point, 1)).toBeNull();
    expect(edgeAt([edge], point, 0.25)?.key).toBe(edge.key);
  });

  it('birden çok aday varsa en yakını seçer', () => {
    const farTarget = node('c', 600, 400);
    const farEdge: CanvasEdge = {
      ...edge,
      key: 'a->c:reject',
      to: 'c',
      port: 'reject',
      isRejection: true,
      geometry: edgeGeometry(source, farTarget)
    };

    expect(edgeAt([farEdge, edge], onPath, 1)?.key).toBe(edge.key);
  });

  it('kenar yoksa null döner', () => {
    expect(edgeAt([], onPath, 1)).toBeNull();
  });
});

describe('nodesInRect', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 200), node('c', 900, 800)];

  it('kısmen örtüşen düğümü de kapsar', () => {
    const selected = nodesInRect(nodes, { x: -50, y: -50 }, { x: 20, y: 20 });

    expect(selected.map(n => n.key)).toEqual(['a']);
  });

  it('ters köşelerle verilen dikdörtgen de çalışır', () => {
    const selected = nodesInRect(nodes, { x: 20, y: 20 }, { x: -50, y: -50 });

    expect(selected.map(n => n.key)).toEqual(['a']);
  });

  it('birden çok düğümü birlikte seçer', () => {
    const selected = nodesInRect(nodes, { x: -10, y: -10 }, { x: 500, y: 400 });

    expect(selected.map(n => n.key)).toEqual(['a', 'b']);
  });

  it('hiçbirine değmeyen çerçeve boş döner', () => {
    expect(nodesInRect(nodes, { x: 5000, y: 5000 }, { x: 5100, y: 5100 })).toEqual([]);
  });
});
