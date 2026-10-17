import { pageWindow } from './pagination';

describe('pageWindow', () => {
  it('7 ve daha az sayfada hepsini döndürür', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('sayfa yoksa boş dizi döner', () => {
    expect(pageWindow(1, 0)).toEqual([]);
  });

  it('başta: ilk 5 sayfa', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ortada: geçerli sayfa ortada, 5 sayfa', () => {
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
  });

  it('sonda: son 5 sayfa', () => {
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(19, 20)).toEqual([16, 17, 18, 19, 20]);
  });

  it('pencere hiçbir zaman 5 düğmeyi aşmaz (telefonda tek satıra sığsın)', () => {
    for (let total = 8; total <= 60; total++) {
      for (let p = 1; p <= total; p++) {
        expect(pageWindow(p, total).length).toBeLessThanOrEqual(5);
      }
    }
  });
});
