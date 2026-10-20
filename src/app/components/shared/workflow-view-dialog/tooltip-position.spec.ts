import { placeTooltip } from './tooltip-position';

const viewport = { width: 1000, height: 800 };
const tip = { width: 300, height: 120 };

describe('placeTooltip', () => {
  it('yer varsa düğümün altına, ortalı', () => {
    const at = placeTooltip({ left: 400, top: 100, right: 600, bottom: 160, width: 200 }, tip, viewport);
    expect(at).toEqual({ top: 168, left: 350, side: 'below' });
  });

  it('altta yer yoksa üstüne', () => {
    const at = placeTooltip({ left: 400, top: 700, right: 600, bottom: 760, width: 200 }, tip, viewport);
    expect(at).toEqual({ top: 572, left: 350, side: 'above' });
  });

  it('kenardaki düğümde yatayda ekrana kenetlenir', () => {
    expect(placeTooltip({ left: 0, top: 100, right: 120, bottom: 160, width: 120 }, tip, viewport).left).toBe(8);
    expect(placeTooltip({ left: 900, top: 100, right: 1000, bottom: 160, width: 100 }, tip, viewport).left).toBe(692);
  });

  it('iki yana da sığmayan uzun ipucu geniş tarafa açılır ve ekranda kalır', () => {
    const tall = { width: 300, height: 700 };
    const at = placeTooltip({ left: 400, top: 200, right: 600, bottom: 260, width: 200 }, tall, viewport);
    expect(at.side).toBe('below');
    expect(at.top).toBe(92); // 800 - 700 - 8
  });
});
