import {
  Camera, GRID_MIN_SCREEN_STEP, GRID_STEP, IDENTITY_CAMERA, MAX_ZOOM, MIN_ZOOM, ViewportRect,
  boundsOf, clampZoom, fitToView, gridStyle, panBy, revealBox, screenToWorld, worldToScreen, zoomAt, zoomAtCenter
} from './workflow-canvas.camera';

/**
 * The camera is a set of pure functions, so no TestBed is needed
 * (same approach as workflow-graph.layout.spec.ts).
 */
const RECT: ViewportRect = { left: 100, top: 50, width: 800, height: 600 };

function camera(zoom: number, panX = 0, panY = 0): Camera {
  return { zoom, panX, panY };
}

describe('clampZoom', () => {
  it('clamps to the lower and upper limits', () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });

  it('leaves a value within the limits as is', () => {
    expect(clampZoom(1.4)).toBe(1.4);
  });

  it('returns 1 for NaN', () => {
    // If a division result leaked into the camera, the whole diagram would vanish.
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(MAX_ZOOM);
  });
});

describe('screenToWorld / worldToScreen', () => {
  it('a round trip gives the same point', () => {
    const cam = camera(1.7, -40, 22);

    const world = screenToWorld(300, 200, RECT, cam);
    const back = worldToScreen(world.x, world.y, RECT, cam);

    expect(back.x).toBeCloseTo(300, 6);
    expect(back.y).toBeCloseTo(200, 6);
  });

  it('with the identity camera only the viewport position is subtracted', () => {
    const world = screenToWorld(160, 90, RECT, IDENTITY_CAMERA);

    expect(world.x).toBe(60);
    expect(world.y).toBe(40);
  });

  it('panning offsets the screen coordinate', () => {
    const world = screenToWorld(160, 90, RECT, camera(1, 25, -15));

    expect(world.x).toBe(35);
    expect(world.y).toBe(55);
  });
});

describe('zoomAt', () => {
  it('keeps the world point under the cursor fixed', () => {
    const cam = camera(1, 30, -10);
    const anchorX = 420;
    const anchorY = 310;

    const before = screenToWorld(anchorX, anchorY, RECT, cam);
    const next = zoomAt(cam, 1.15, anchorX, anchorY, RECT);
    const after = screenToWorld(anchorX, anchorY, RECT, next);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('keeps the anchor fixed when zooming out too', () => {
    const cam = camera(2, -120, 44);

    const before = screenToWorld(250, 180, RECT, cam);
    const after = screenToWorld(250, 180, RECT, zoomAt(cam, 1 / 1.15, 250, 180, RECT));

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('does not zoom further at the upper limit and does not disturb the pan', () => {
    const cam = camera(MAX_ZOOM, 17, -3);

    const next = zoomAt(cam, 1.5, 400, 300, RECT);

    expect(next.zoom).toBe(MAX_ZOOM);
    expect(next.panX).toBeCloseTo(17, 6);
    expect(next.panY).toBeCloseTo(-3, 6);
  });

  it('is clamped at the lower limit', () => {
    expect(zoomAt(camera(MIN_ZOOM), 0.1, 400, 300, RECT).zoom).toBe(MIN_ZOOM);
  });

  it('zoomAtCenter anchors on the viewport centre', () => {
    const cam = camera(1);
    const centerX = RECT.left + RECT.width / 2;
    const centerY = RECT.top + RECT.height / 2;

    const before = screenToWorld(centerX, centerY, RECT, cam);
    const after = screenToWorld(centerX, centerY, RECT, zoomAtCenter(cam, 1.15, RECT));

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe('panBy', () => {
  it('pans without changing the zoom', () => {
    const next = panBy(camera(1.6, 10, 20), -30, 45);

    expect(next).toEqual({ zoom: 1.6, panX: -20, panY: 65 });
  });
});

describe('fitToView', () => {
  const viewport = { width: 800, height: 600 };

  it('brings the bounds inside the viewport', () => {
    const bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 1000 };

    const cam = fitToView(bounds, viewport, 32);

    expect((bounds.maxX - bounds.minX) * cam.zoom).toBeLessThanOrEqual(viewport.width - 64 + 0.001);
    expect((bounds.maxY - bounds.minY) * cam.zoom).toBeLessThanOrEqual(viewport.height - 64 + 0.001);
  });

  it('centres the content', () => {
    const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 };

    const cam = fitToView(bounds, viewport, 32);
    const centerX = ((bounds.minX + bounds.maxX) / 2) * cam.zoom + cam.panX;
    const centerY = ((bounds.minY + bounds.maxY) / 2) * cam.zoom + cam.panY;

    expect(centerX).toBeCloseTo(viewport.width / 2, 6);
    expect(centerY).toBeCloseTo(viewport.height / 2, 6);
  });

  it('centres bounds with a negative origin too', () => {
    const bounds = { minX: -300, minY: -120, maxX: 100, maxY: 80 };

    const cam = fitToView(bounds, viewport, 32);
    const centerX = ((bounds.minX + bounds.maxX) / 2) * cam.zoom + cam.panX;

    expect(centerX).toBeCloseTo(viewport.width / 2, 6);
  });

  it('does not exceed maxZoom — does not enlarge a single node to fill the screen', () => {
    const cam = fitToView({ minX: 0, minY: 0, maxX: 40, maxY: 20 }, viewport, 32);

    expect(cam.zoom).toBe(1);
  });

  it('is clamped at the lower limit for a very large diagram', () => {
    const cam = fitToView({ minX: 0, minY: 0, maxX: 100000, maxY: 100000 }, viewport, 32);

    expect(cam.zoom).toBe(MIN_ZOOM);
  });

  it('does not move the camera for zero-size bounds', () => {
    expect(fitToView({ minX: 10, minY: 10, maxX: 10, maxY: 10 }, viewport)).toEqual(IDENTITY_CAMERA);
  });

  it('a viewport not yet laid out does not move the camera', () => {
    const bounds = { minX: 0, minY: 0, maxX: 400, maxY: 200 };

    expect(fitToView(bounds, { width: 0, height: 0 })).toEqual(IDENTITY_CAMERA);
  });
});

describe('fitToView — align: start', () => {
  const viewport = { width: 800, height: 600 };

  it('does not centre a small diagram; aligns it to the top-left corner inset by the padding', () => {
    const bounds = { minX: 300, minY: 200, maxX: 500, maxY: 300 };
    const cam = fitToView(bounds, viewport, 32, 1, 'start');

    expect(cam.zoom).toBe(1);
    expect(bounds.minX * cam.zoom + cam.panX).toBeCloseTo(32, 6);
    expect(bounds.minY * cam.zoom + cam.panY).toBeCloseTo(32, 6);
  });

  it('shrinks a large diagram, starts at the top-left and the bottom-right stays inside the viewport', () => {
    // Sized so it doesn't hit the MIN_ZOOM clamp (required zoom ≈ 0.49).
    const bounds = { minX: -100, minY: 50, maxX: 1400, maxY: 1050 };
    const cam = fitToView(bounds, viewport, 32, 1, 'start');

    expect(cam.zoom).toBeLessThan(1);
    expect(bounds.minX * cam.zoom + cam.panX).toBeCloseTo(32, 6);
    expect(bounds.minY * cam.zoom + cam.panY).toBeCloseTo(32, 6);
    expect(bounds.maxX * cam.zoom + cam.panX).toBeLessThanOrEqual(viewport.width - 32 + 0.001);
    expect(bounds.maxY * cam.zoom + cam.panY).toBeLessThanOrEqual(viewport.height - 32 + 0.001);
  });
});

describe('gridStyle', () => {
  it('base spacing at zoom 1, shifted by pan', () => {
    const grid = gridStyle(camera(1, 45, 7));

    expect(grid.step).toBe(GRID_STEP);
    expect(grid.offsetX).toBe(5);
    expect(grid.offsetY).toBe(7);
  });

  it('scales with zoom', () => {
    expect(gridStyle(camera(2)).step).toBe(GRID_STEP * 2);
  });

  it('doubles the spacing when zoomed far out, so it does not turn into noise', () => {
    const step = gridStyle(camera(MIN_ZOOM)).step;

    expect(step).toBeGreaterThanOrEqual(GRID_MIN_SCREEN_STEP);
    expect(step % (GRID_STEP * MIN_ZOOM)).toBe(0);
  });

  it('with a negative pan the offset stays within [0, spacing)', () => {
    const grid = gridStyle(camera(1, -45, -1));

    expect(grid.offsetX).toBe(15);
    expect(grid.offsetY).toBe(19);
  });

  it('a broken zoom does not cause an infinite loop', () => {
    expect(gridStyle(camera(0)).step).toBe(GRID_STEP);
  });
});

describe('boundsOf', () => {
  it('returns null for an empty list', () => {
    expect(boundsOf([])).toBeNull();
  });

  it('covers all boxes', () => {
    const bounds = boundsOf([
      { x: 10, y: 20, width: 100, height: 50 },
      { x: 200, y: 5, width: 60, height: 200 }
    ]);

    expect(bounds).toEqual({ minX: 10, minY: 5, maxX: 260, maxY: 205 });
  });

  describe('revealBox', () => {
    const view = { width: 800, height: 600 };
    const camera: Camera = { zoom: 1, panX: 0, panY: 0 };

    it('for a visible box the camera stays the same object', () => {
      expect(revealBox(camera, { x: 100, y: 100, width: 168, height: 60 }, view)).toBe(camera);
    });

    it('for a box overflowing on the right, pans left only as much as needed', () => {
      const next = revealBox(camera, { x: 700, y: 100, width: 168, height: 60 }, view);
      // right edge 868 → must be 800 − 24 = 776: 92 px.
      expect(next).toEqual({ zoom: 1, panX: -92, panY: 0 });
    });

    it('brings a box overflowing left/top in with the margin; zoom is taken into account', () => {
      const zoomed: Camera = { zoom: 0.5, panX: -200, panY: 0 };
      // x=100 → on screen 50 − 200 = −150 → to 24: +174.
      expect(revealBox(zoomed, { x: 100, y: -100, width: 168, height: 60 }, view))
        .toEqual({ zoom: 0.5, panX: -26, panY: 74 });
    });
  });
});
