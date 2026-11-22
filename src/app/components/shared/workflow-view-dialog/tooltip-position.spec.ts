import { placeTooltip } from './tooltip-position';

const viewport = { width: 1000, height: 800 };
const tip = { width: 300, height: 120 };

describe('placeTooltip', () => {
  it('below the node, centred, when there is room', () => {
    const at = placeTooltip({ left: 400, top: 100, right: 600, bottom: 160, width: 200 }, tip, viewport);
    expect(at).toEqual({ top: 168, left: 350, side: 'below' });
  });

  it('above when there is no room below', () => {
    const at = placeTooltip({ left: 400, top: 700, right: 600, bottom: 760, width: 200 }, tip, viewport);
    expect(at).toEqual({ top: 572, left: 350, side: 'above' });
  });

  it('clamps horizontally to the screen for a node at the edge', () => {
    expect(placeTooltip({ left: 0, top: 100, right: 120, bottom: 160, width: 120 }, tip, viewport).left).toBe(8);
    expect(placeTooltip({ left: 900, top: 100, right: 1000, bottom: 160, width: 100 }, tip, viewport).left).toBe(692);
  });

  it('a long tooltip that fits on neither side opens on the larger side and stays on screen', () => {
    const tall = { width: 300, height: 700 };
    const at = placeTooltip({ left: 400, top: 200, right: 600, bottom: 260, width: 200 }, tall, viewport);
    expect(at.side).toBe('below');
    expect(at.top).toBe(92); // 800 - 700 - 8
  });
});
