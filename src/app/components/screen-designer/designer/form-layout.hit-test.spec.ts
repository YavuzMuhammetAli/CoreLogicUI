import {
  colPitch, dropIndex, exceedsDragThreshold, headerDropIndex, nearestRect, spanFromDrag, widthFromDrag
} from './form-layout.hit-test';

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, right: left + width, bottom: top + height });

// İki satır: [A(0-300) B(300-600)] y 0-50, [C(0-600)] y 60-160
const items = [rect(0, 0, 300, 50), rect(300, 0, 300, 50), rect(0, 60, 600, 100)];

describe('form-layout.hit-test', () => {
  describe('dropIndex', () => {
    it('satırın içinde: imlecin solunda kalan ilk öğenin önü', () => {
      expect(dropIndex(items, { x: 100, y: 20 })).toBe(0);
      expect(dropIndex(items, { x: 200, y: 20 })).toBe(1);
      expect(dropIndex(items, { x: 500, y: 20 })).toBe(2);
    });

    it('satırların arasındaki boşluk bir sonraki satırın başıdır', () => {
      expect(dropIndex(items, { x: 500, y: 55 })).toBe(2);
    });

    it('son satırın altı bölümün sonu; boş bölüm 0', () => {
      expect(dropIndex(items, { x: 10, y: 400 })).toBe(3);
      expect(dropIndex([], { x: 10, y: 10 })).toBe(0);
    });

    it('farklı yükseklikteki öğeler aynı satır sayılır (üst kenar toleransı)', () => {
      const uneven = [rect(0, 0, 300, 40), rect(300, 3, 300, 120)];
      // A'nın altındaki boşluk da A'nın satırıdır: sağ yarısı → A'dan sonra.
      expect(dropIndex(uneven, { x: 200, y: 100 })).toBe(1);
    });
  });

  it('nearestRect: içindeki ya da dikeyde en yakın', () => {
    const sections = [rect(0, 0, 600, 100), rect(0, 150, 600, 100)];
    expect(nearestRect(sections, { x: 10, y: 200 })).toBe(1);
    expect(nearestRect(sections, { x: 10, y: 120 })).toBe(0);
    expect(nearestRect([], { x: 0, y: 0 })).toBe(-1);
  });

  it('genişlik sürükleme: aralıklı adım, 1–12', () => {
    const pitch = colPitch(1180, 20);   // (1180 + 20) / 12 = 100
    expect(pitch).toBe(100);
    expect(spanFromDrag(6, 140, pitch)).toBe(7);
    expect(spanFromDrag(6, -149, pitch)).toBe(5);
    expect(spanFromDrag(2, -900, pitch)).toBe(1);
    expect(spanFromDrag(11, 900, pitch)).toBe(12);
  });

  it('liste başlığı bırakma sırası ve genişliği', () => {
    const headers = [rect(0, 0, 100, 30), rect(100, 0, 200, 30)];
    expect(headerDropIndex(headers, 20)).toBe(0);
    expect(headerDropIndex(headers, 150)).toBe(1);
    expect(headerDropIndex(headers, 250)).toBe(2);
    expect(widthFromDrag(160, 700, 60, 800)).toBe(800);
    expect(widthFromDrag(160, -150, 60, 800)).toBe(60);
  });

  it('kısa hareket tıklamadır', () => {
    expect(exceedsDragThreshold(2, 3)).toBeFalse();
    expect(exceedsDragThreshold(3, 3)).toBeTrue();
  });
});
