import {
  BRANCH_LINE_HEIGHT, FORWARD_MIN_GAP, NODE_HEIGHT, NODE_WIDTH,
  backEdgeGeometry, cubicPointAt, distanceToEdge, edgeGeometry, isForward, nodeSize,
  portPositions, routeEdges, routeOrthogonal, roundedPolyline, selfLoopGeometry, simplifyPolyline
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

  it('etiket iki uç arasında ama KAYNAĞA yakın durur', () => {
    const geometry = edgeGeometry(SOURCE, TARGET);
    const midY = (geometry.p0.y + geometry.p3.y) / 2;

    expect(geometry.labelY).toBeGreaterThan(geometry.p0.y);
    expect(geometry.labelY).toBeLessThan(midY);
    expect(geometry.labelX).toBeGreaterThanOrEqual(geometry.p0.x);
    expect(geometry.labelX).toBeLessThan((geometry.p0.x + geometry.p3.x) / 2);
  });

  it('sourceOffsetX verilince çıkış o porttan olur', () => {
    const geometry = edgeGeometry(SOURCE, TARGET, 'bezier', 56);

    expect(geometry.p0).toEqual({ x: 100 + 56, y: 100 + NODE_HEIGHT });
    expect(geometry.p3).toEqual({ x: 400 + NODE_WIDTH / 2, y: 300 });
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

describe('isForward', () => {
  it('hedef kaynağın yeterince altındaysa ileri', () => {
    expect(isForward(SOURCE, TARGET)).toBeTrue();
  });

  it('hedef üstte ya da aynı hizadaysa geri', () => {
    expect(isForward(TARGET, SOURCE)).toBeFalse();
    expect(isForward(SOURCE, { ...TARGET, y: SOURCE.y })).toBeFalse();
  });

  it('kaynağın altına yapışık hedef (boşluk < FORWARD_MIN_GAP) geri sayılır', () => {
    const touching = { ...TARGET, y: SOURCE.y + SOURCE.height + FORWARD_MIN_GAP - 1 };

    expect(isForward(SOURCE, touching)).toBeFalse();
  });
});

describe('backEdgeGeometry', () => {
  it('kaynağın sağından çıkar, hedefe sağından girer', () => {
    const geometry = backEdgeGeometry(TARGET, SOURCE, 700);

    expect(geometry.p0).toEqual({ x: TARGET.x + TARGET.width, y: TARGET.y + TARGET.height / 2 });
    expect(geometry.p3).toEqual({ x: SOURCE.x + SOURCE.width, y: SOURCE.y + SOURCE.height / 2 });
  });

  it('eğrinin tepesi clearX hizasına ulaşır', () => {
    const geometry = backEdgeGeometry(TARGET, SOURCE, 700);
    const samples = Array.from({ length: 41 }, (_, i) =>
      cubicPointAt(geometry.p0, geometry.p1, geometry.p2, geometry.p3, i / 40).x);

    expect(Math.max(...samples)).toBeGreaterThanOrEqual(699);
    expect(geometry.maxX).toBeGreaterThanOrEqual(700);
  });
});

describe('routeEdges', () => {
  const top = { x: 0, y: 0, width: NODE_WIDTH, height: NODE_HEIGHT };
  const middle = { x: 0, y: 200, width: NODE_WIDTH, height: NODE_HEIGHT };
  const wide = { x: 300, y: 200, width: NODE_WIDTH, height: NODE_HEIGHT };
  const bottom = { x: 0, y: 400, width: NODE_WIDTH, height: NODE_HEIGHT };

  it('ileri kenarı porttan çıkarır', () => {
    const [geometry] = routeEdges([{ source: top, target: middle, sourceOffsetX: 112 }], [top, middle]);

    expect(geometry.p0.x).toBe(112);
    expect(geometry.p3.y).toBe(middle.y);
  });

  it('geri kenarı yolundaki en sağ kutunun da sağından dolaştırır', () => {
    const [geometry] = routeEdges([{ source: bottom, target: top }], [top, middle, wide, bottom]);

    expect(geometry.maxX).toBeGreaterThan(wide.x + wide.width);
  });

  it('dikeyde örtüşen iki geri dönüş farklı şeritlere düşer, kısa olan içte', () => {
    const [long, short] = routeEdges(
      [{ source: bottom, target: top }, { source: middle, target: top }],
      [top, middle, bottom]);

    expect(long.maxX).toBeGreaterThan(short.maxX);
  });

  it('sonucu girdiyle aynı sırada döner', () => {
    const result = routeEdges(
      [{ source: bottom, target: top }, { source: top, target: middle }],
      [top, middle, bottom]);

    expect(result[0].p3.x).toBe(top.x + top.width);
    expect(result[1].p3).toEqual({ x: middle.x + middle.width / 2, y: middle.y });
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

describe('roundedPolyline', () => {
  it('köşeleri ikinci derece eğriyle yuvarlatır', () => {
    const d = roundedPolyline([{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 100, y: 40 }], 8);
    expect(d).toBe('M 0 0 L 0 32 Q 0 40 8 40 L 100 40');
  });

  it('yarıçap kısa parçanın yarısını aşmaz', () => {
    const d = roundedPolyline([{ x: 0, y: 0 }, { x: 0, y: 6 }, { x: 100, y: 6 }], 8);
    expect(d).toBe('M 0 0 L 0 3 Q 0 6 3 6 L 100 6');
  });

  it('hizalı uçlar tek düz çizgidir', () => {
    expect(roundedPolyline([{ x: 5, y: 0 }, { x: 5, y: 40 }, { x: 5, y: 80 }])).toBe('M 5 0 L 5 80');
  });

  it('tekrarlanan ve aynı doğrudaki ara noktalar atılır', () => {
    expect(simplifyPolyline([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 5, y: 20 }]))
      .toEqual([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 5, y: 20 }]);
  });
});

describe('routeOrthogonal', () => {
  const box = (x: number, y: number) => ({ x, y, width: NODE_WIDTH, height: NODE_HEIGHT });

  it('ileri kenar porttan iner, kanalda yatay gider, hedefin üst-ortasına girer', () => {
    const source = box(0, 0);
    const target = box(300, 140);

    const [edge] = routeOrthogonal([{ source, target, sourceOffsetX: 56 }], [source, target]);

    expect(edge.points).toEqual([
      { x: 56, y: 60 }, { x: 56, y: 100 }, { x: 384, y: 100 }, { x: 384, y: 140 }
    ]);
    expect(edge.style).toBe('orthogonal');
    expect(edge.path.startsWith('M 56 60')).toBeTrue();
  });

  it('hizalı ileri kenar tek dikey çizgidir', () => {
    const source = box(0, 0);
    const target = box(0, 140);

    const [edge] = routeOrthogonal([{ source, target }], [source, target]);

    expect(edge.points).toEqual([{ x: 84, y: 60 }, { x: 84, y: 140 }]);
  });

  it('katman atlayan kenar aradaki kutuyu kesecekse hedefin üstündeki kanala geçer', () => {
    const source = box(0, 0);
    const middle = box(260, 140);          // hedefin tam üstünde, ara katmanda
    const target = box(260, 280);

    const [edge] = routeOrthogonal([{ source, target }], [source, middle, target]);
    const [, , corner] = edge.points!;

    // Yatay parça hedefin hemen üstündeki boşlukta: ara kutunun altında.
    expect(corner.y).toBeGreaterThan(middle.y + middle.height);
    expect(corner.y).toBeLessThan(target.y);
  });

  it('geri dönüş sağdan dolaşır; iç içe döngüler ayrı şeritte', () => {
    const a = box(0, 0);
    const b = box(0, 140);
    const c = box(0, 280);

    const [short, long] = routeOrthogonal(
      [{ source: b, target: a }, { source: c, target: a }], [a, b, c]);

    expect(short.maxX).toBeGreaterThan(NODE_WIDTH);
    expect(long.maxX).toBeGreaterThan(short.maxX);
    expect(short.points![0]).toEqual({ x: NODE_WIDTH, y: 170 });
  });

  it('isabet testi kırık çizgiyi kullanır', () => {
    const source = box(0, 0);
    const target = box(300, 140);
    const [edge] = routeOrthogonal([{ source, target, sourceOffsetX: 56 }], [source, target]);

    // Yatay parçanın üzerindeki nokta: eğri örneklemesiyle değil kırık çizgiyle ölçülür.
    expect(distanceToEdge(edge, { x: 200, y: 100 })).toBeCloseTo(0, 6);
    expect(distanceToEdge(edge, { x: 200, y: 110 })).toBeCloseTo(10, 6);
  });
});
