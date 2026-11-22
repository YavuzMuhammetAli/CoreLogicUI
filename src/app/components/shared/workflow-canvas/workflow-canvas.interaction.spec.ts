import { GRID_STEP } from './workflow-canvas.camera';
import {
  DRAG_THRESHOLD,
  centeredAt,
  clampToWindow,
  placeBelow,
  dragPositions,
  exceedsThreshold,
  normalizedRect,
  nudgeDelta,
  snapValue
} from './workflow-canvas.interaction';

describe('workflow-canvas.interaction', () => {
  it('movement below the threshold is a click', () => {
    expect(exceedsThreshold(2, 2)).toBeFalse();
    expect(exceedsThreshold(DRAG_THRESHOLD, 0)).toBeTrue();
    expect(exceedsThreshold(-3, -3)).toBeTrue();
  });

  describe('snapValue', () => {
    it('rounds to the nearest grid line; leaves it untouched when off', () => {
      expect(snapValue(29, true, 20)).toBe(20);
      expect(snapValue(31, true, 20)).toBe(40);
      expect(snapValue(31, false, 20)).toBe(31);
    });

    it('does not produce -0', () => {
      expect(Object.is(snapValue(-4, true, 20), 0)).toBeTrue();
    });
  });

  describe('dragPositions', () => {
    const origins = new Map([['a', { x: 100, y: 100 }], ['b', { x: 300, y: 140 }]]);

    it('the screen delta is divided by zoom and the same offset is applied to all', () => {
      const result = dragPositions(origins, 50, 20, 0.5, false);

      expect(result.get('a')).toEqual({ x: 200, y: 140 });
      expect(result.get('b')).toEqual({ x: 400, y: 180 });
    });

    it('snapping is applied to each node\'s own position', () => {
      const mixed = new Map([['hizali', { x: 100, y: 100 }], ['kayik', { x: 95, y: 133 }]]);
      const result = dragPositions(mixed, 7, 7, 1, true);

      // 107 → 100 and 102 → 100, 140 → 140: a node already on the grid stays put,
      // an offset one goes to its own nearest line.
      expect(result.get('hizali')).toEqual({ x: 100, y: 100 });
      expect(result.get('kayik')).toEqual({ x: 100, y: 140 });
      expect(result.get('kayik')!.x % GRID_STEP).toBe(0);
    });

    it('keeps negative positions — can be moved left of/above the drawing too', () => {
      expect(dragPositions(origins, -500, -500, 1, false).get('a')).toEqual({ x: -400, y: -400 });
    });

    it('an invalid zoom is treated as 1', () => {
      expect(dragPositions(origins, 10, 0, 0, false).get('a')).toEqual({ x: 110, y: 100 });
    });
  });

  it('arrow-key nudge: 1 px normally, a grid step with Shift', () => {
    expect(nudgeDelta('left', false)).toEqual({ x: -1, y: 0 });
    expect(nudgeDelta('down', true)).toEqual({ x: 0, y: GRID_STEP });
  });

  describe('clampToWindow', () => {
    const size = { width: 180, height: 150 };
    const windowSize = { width: 1000, height: 800 };

    it('opens to the bottom-right of the cursor if it fits', () => {
      expect(clampToWindow({ x: 100, y: 100 }, size, windowSize)).toEqual({ x: 100, y: 100 });
    });

    it('flips above/left of the cursor at the bottom/right edge', () => {
      expect(clampToWindow({ x: 950, y: 760 }, size, windowSize)).toEqual({ x: 770, y: 610 });
    });

    it('leans against the edge if it fits in neither direction', () => {
      expect(clampToWindow({ x: 100, y: 100 }, size, { width: 200, height: 200 }))
        .toEqual({ x: 12, y: 42 });
      expect(clampToWindow({ x: 100, y: 100 }, { width: 400, height: 400 }, { width: 200, height: 200 }))
        .toEqual({ x: 8, y: 8 });
    });
  });

  describe('new node placement', () => {
    const size = { width: 168, height: 60 };
    const source = { x: 100, y: 100, width: 168, height: 60 };

    it('is placed below the source, aligned with the connected port', () => {
      // Port in the middle (84): node centre 184 → left edge 100; y = 160 + 80 = 240.
      expect(placeBelow(source, 84, size, [source])).toEqual({ x: 100, y: 240 });
    });

    it('finds free space by shifting right when the spot is taken', () => {
      const sibling = { x: 100, y: 240, width: 168, height: 60 };
      const placed = placeBelow(source, 84, size, [source, sibling]);

      expect(placed.y).toBe(240);
      expect(placed.x).toBeGreaterThanOrEqual(sibling.x + sibling.width + 16);
      expect(placed.x % 20).toBe(0);
    });

    it('centres on the drop point; can be dropped left of/above zero too', () => {
      // 300 − 84 = 216 → 220; 200 − 30 = 170 → 180 (a half step rounds up).
      expect(centeredAt({ x: 300, y: 200 }, size)).toEqual({ x: 220, y: 180 });
      // 10 − 84 = −74 → −80; 10 − 30 = −20 → −20.
      expect(centeredAt({ x: 10, y: 10 }, size)).toEqual({ x: -80, y: -20 });
    });

    it('the free space search works from a negative start too', () => {
      expect(placeBelow({ x: -300, y: -200, width: 168, height: 60 }, 84, size, []))
        .toEqual({ x: -300, y: -60 });
    });
  });

  it('the lasso rectangle is direction-independent', () => {
    expect(normalizedRect({ x: 50, y: 10 }, { x: 10, y: 40 })).toEqual({ x: 10, y: 10, width: 40, height: 30 });
  });
});
