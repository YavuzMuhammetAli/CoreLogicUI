import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('returns all pages when there are 7 or fewer', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns an empty array when there are no pages', () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });

  it('at the start: first 5 pages', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5]);
  });

  it('in the middle: current page centred, 5 pages', () => {
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
  });

  it('at the end: last 5 pages', () => {
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(19, 20)).toEqual([16, 17, 18, 19, 20]);
  });

  it('the window never exceeds 5 buttons (so it fits one row on phones)', () => {
    for (let total = 8; total <= 60; total++) {
      for (let p = 1; p <= total; p++) {
        expect(pageWindow(p, total).length).toBeLessThanOrEqual(5);
      }
    }
  });
});
