import {
  BRANCH_LINE_HEIGHT, NODE_HEIGHT, NODE_WIDTH,
  cubicPointAt, distanceToEdge, edgeGeometry, nodeSize, portPositions, selfLoopGeometry
} from './workflow-edge.geometry';
import { WorkflowStep } from '../../../models/workflow.model';

/** Geometri saf olduğu için TestBed yok. */
const SOURCE = { x: 100, y: 100, width: NODE_WIDTH, height: NODE_HEIGHT };
const TARGET = { x: 400, y: 300, width: NODE_WIDTH, height: NODE_HEIGHT };

function approvalStep(key: string): WorkflowStep {
  return { key, type: 'approval', name: key, assignment: { mode: 'role', roleId: 1 } };
}

function parallelStep(key: string, branchCount: number): WorkflowStep {
  return {
    key,
    type: 'parallel',
    name: key,
    mode: 'all',
    branches: Array.from({ length: branchCount }, (_, i) => ({
      key: `dal${i}`,
      name: `Dal ${i}`,
      assignment: { mode: 'role' as const, roleId: 1 }
    }))
  };
}

describe('edgeGeometry', () => {
  it('kaynağın alt-ortasından çıkar, hedefin üst-ortasında biter', () => {
    const geometry = edgeGeometry(SOURCE, TARGET);

    expect(geometry.p0).toEqual({ x: 100 + NODE_WIDTH / 2, y: 100 + NODE_HEIGHT });
    expect(geometry.p3).toEqual({ x: 400 + NODE_WIDTH / 2, y: 300 });
  });

  it('kübik eğri yolu üretir', () => {
    expect(edgeGeometry(SOURCE, TARGET).path).toMatch(/^M .+ C .+,.+,.+$/);
  });

  it('sınırlar uç noktaları kapsar', () => {
    const geometry = edgeGeometry(SOURCE, TARGET);

    expect(geometry.minX).toBe(Math.min(geometry.p0.x, geometry.p3.x));
    expect(geometry.maxX).toBe(Math.max(geometry.p0.x, geometry.p3.x));
    expect(geometry.minY).toBe(Math.min(geometry.p0.y, geometry.p3.y));
    expect(geometry.maxY).toBe(Math.max(geometry.p0.y, geometry.p3.y));
  });

  it('etiket iki uç arasında ortalanır', () => {
    const geometry = edgeGeometry(SOURCE, TARGET);

    expect(geometry.labelX).toBeCloseTo((geometry.p0.x + geometry.p3.x) / 2, 6);
  });

  it('geri dönen (yukarı akan) kenarda da uçları doğru bağlar', () => {
    // Rework döngüsü: hedef kaynağın ÜSTÜNDE.
    const geometry = edgeGeometry(TARGET, SOURCE);

    expect(geometry.p0.y).toBe(300 + NODE_HEIGHT);
    expect(geometry.p3.y).toBe(100);
  });

  it('orthogonal biçimde dik köşeli yol üretir', () => {
    const geometry = edgeGeometry(SOURCE, TARGET, 'orthogonal');

    expect(geometry.path).toContain(' V ');
    expect(geometry.path).toContain(' H ');
    expect(geometry.style).toBe('orthogonal');
  });

  it('iki biçim de aynı dört kontrol noktasını taşır', () => {
    const bezier = edgeGeometry(SOURCE, TARGET, 'bezier');
    const orthogonal = edgeGeometry(SOURCE, TARGET, 'orthogonal');

    expect(orthogonal.p0).toEqual(bezier.p0);
    expect(orthogonal.p1).toEqual(bezier.p1);
    expect(orthogonal.p2).toEqual(bezier.p2);
    expect(orthogonal.p3).toEqual(bezier.p3);
  });
});

describe('selfLoopGeometry', () => {
  it('düğümün sağından çıkıp sağından girer', () => {
    const geometry = selfLoopGeometry(SOURCE);

    expect(geometry.p0.x).toBe(SOURCE.x + SOURCE.width);
    expect(geometry.p3.x).toBe(SOURCE.x + SOURCE.width);
    expect(geometry.maxX).toBeGreaterThan(SOURCE.x + SOURCE.width);
  });
});

describe('nodeSize', () => {
  it('tekil adım sabit yükseklikte', () => {
    expect(nodeSize(approvalStep('onay'))).toEqual({ width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  it('paralel adım dal sayısıyla uzar', () => {
    expect(nodeSize(parallelStep('p', 3)).height).toBe(NODE_HEIGHT + 3 * BRANCH_LINE_HEIGHT);
  });

  it('dalı tanımlanmamış paralel adım tekil yükseklikte kalır', () => {
    const step: WorkflowStep = { key: 'p', type: 'parallel', name: 'p', mode: 'all' };

    expect(nodeSize(step).height).toBe(NODE_HEIGHT);
  });
});

describe('portPositions', () => {
  it('iki portu eşit aralıklı yerleştirir', () => {
    expect(portPositions(2, 168)).toEqual([56, 112]);
  });

  it('simetriktir — ilk ve son portun kenarlara uzaklığı eşit', () => {
    const width = 168;
    const positions = portPositions(4, width);

    expect(positions[0]).toBeCloseTo(width - positions[positions.length - 1], 6);
  });

  it('artan sırada döner', () => {
    const positions = portPositions(5, 200);

    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it('port yoksa boş liste döner', () => {
    expect(portPositions(0, 168)).toEqual([]);
    expect(portPositions(-1, 168)).toEqual([]);
  });
});

describe('cubicPointAt', () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 50 };
  const p2 = { x: 100, y: 50 };
  const p3 = { x: 100, y: 100 };

  it('t=0 ve t=1 uçlara oturur', () => {
    expect(cubicPointAt(p0, p1, p2, p3, 0)).toEqual(p0);
    expect(cubicPointAt(p0, p1, p2, p3, 1)).toEqual(p3);
  });

  it('t=0.5 simetrik eğride ortaya düşer', () => {
    const mid = cubicPointAt(p0, p1, p2, p3, 0.5);

    expect(mid.x).toBeCloseTo(50, 6);
    expect(mid.y).toBeCloseTo(50, 6);
  });
});

describe('distanceToEdge', () => {
  const geometry = edgeGeometry(SOURCE, TARGET);

  it('yolun üzerindeki nokta için sıfıra yakın', () => {
    const onPath = cubicPointAt(geometry.p0, geometry.p1, geometry.p2, geometry.p3, 0.5);

    expect(distanceToEdge(geometry, onPath)).toBeLessThan(1);
  });

  it('uzaktaki nokta için büyük değer döner', () => {
    expect(distanceToEdge(geometry, { x: 2000, y: 2000 })).toBeGreaterThan(100);
  });

  it('uç noktaya yakınlık da isabet sayılır', () => {
    expect(distanceToEdge(geometry, { x: geometry.p0.x + 2, y: geometry.p0.y })).toBeLessThan(3);
  });

  it('orthogonal yolda kırık çizgi parçalarını ölçer', () => {
    const ortho = edgeGeometry(SOURCE, TARGET, 'orthogonal');
    // İlk dikey parçanın ortası tam yolun üzerinde.
    const onSegment = { x: ortho.p0.x, y: (ortho.p0.y + ortho.p1.y) / 2 };

    expect(distanceToEdge(ortho, onSegment)).toBeLessThan(0.001);
  });
});
