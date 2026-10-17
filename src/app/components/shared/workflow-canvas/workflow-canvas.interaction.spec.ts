import { GRID_STEP } from './workflow-canvas.camera';
import {
  DRAG_THRESHOLD,
  clampToWindow,
  dragPositions,
  exceedsThreshold,
  normalizedRect,
  nudgeDelta,
  snapValue
} from './workflow-canvas.interaction';

describe('workflow-canvas.interaction', () => {
  it('eşiğin altındaki kıpırdama tıklamadır', () => {
    expect(exceedsThreshold(2, 2)).toBeFalse();
    expect(exceedsThreshold(DRAG_THRESHOLD, 0)).toBeTrue();
    expect(exceedsThreshold(-3, -3)).toBeTrue();
  });

  describe('snapValue', () => {
    it('en yakın ızgara çizgisine yuvarlar; kapalıyken dokunmaz', () => {
      expect(snapValue(29, true, 20)).toBe(20);
      expect(snapValue(31, true, 20)).toBe(40);
      expect(snapValue(31, false, 20)).toBe(31);
    });

    it('-0 üretmez', () => {
      expect(Object.is(snapValue(-4, true, 20), 0)).toBeTrue();
    });
  });

  describe('dragPositions', () => {
    const origins = new Map([['a', { x: 100, y: 100 }], ['b', { x: 300, y: 140 }]]);

    it('ekran farkı yakınlaştırmaya bölünür ve hepsine aynı kayma uygulanır', () => {
      const result = dragPositions(origins, 50, 20, 0.5, false);

      expect(result.get('a')).toEqual({ x: 200, y: 140 });
      expect(result.get('b')).toEqual({ x: 400, y: 180 });
    });

    it('yapıştırma her düğümün kendi konumuna uygulanır', () => {
      const mixed = new Map([['hizali', { x: 100, y: 100 }], ['kayik', { x: 95, y: 133 }]]);
      const result = dragPositions(mixed, 7, 7, 1, true);

      // 107 → 100 ve 102 → 100, 140 → 140: ızgaraya oturmuş düğüm yerinde kalır,
      // kayık olan kendi en yakın çizgisine gider.
      expect(result.get('hizali')).toEqual({ x: 100, y: 100 });
      expect(result.get('kayik')).toEqual({ x: 100, y: 140 });
      expect(result.get('kayik')!.x % GRID_STEP).toBe(0);
    });

    it('negatif konuma izin vermez', () => {
      expect(dragPositions(origins, -500, -500, 1, false).get('a')).toEqual({ x: 0, y: 0 });
    });

    it('geçersiz yakınlaştırmada 1 kabul edilir', () => {
      expect(dragPositions(origins, 10, 0, 0, false).get('a')).toEqual({ x: 110, y: 100 });
    });
  });

  it('ok tuşu itmesi: normalde 1 px, Shift ile ızgara adımı', () => {
    expect(nudgeDelta('left', false)).toEqual({ x: -1, y: 0 });
    expect(nudgeDelta('down', true)).toEqual({ x: 0, y: GRID_STEP });
  });

  describe('clampToWindow', () => {
    const size = { width: 180, height: 150 };
    const windowSize = { width: 1000, height: 800 };

    it('sığıyorsa imlecin sağ-altında açılır', () => {
      expect(clampToWindow({ x: 100, y: 100 }, size, windowSize)).toEqual({ x: 100, y: 100 });
    });

    it('alt/sağ kenarda imlecin üstüne/soluna döner', () => {
      expect(clampToWindow({ x: 950, y: 760 }, size, windowSize)).toEqual({ x: 770, y: 610 });
    });

    it('iki yöne de sığmazsa kenara yaslanır', () => {
      expect(clampToWindow({ x: 100, y: 100 }, size, { width: 200, height: 200 }))
        .toEqual({ x: 12, y: 42 });
      expect(clampToWindow({ x: 100, y: 100 }, { width: 400, height: 400 }, { width: 200, height: 200 }))
        .toEqual({ x: 8, y: 8 });
    });
  });

  it('lasso dikdörtgeni yönden bağımsızdır', () => {
    expect(normalizedRect({ x: 50, y: 10 }, { x: 10, y: 40 })).toEqual({ x: 10, y: 10, width: 40, height: 30 });
  });
});
