import { effectiveSpan, itemSpan, visibleAtTier, widthTier } from './form-layout.responsive';

describe('form-layout.responsive', () => {
  it('kademe kabın genişliğinden seçilir', () => {
    expect(widthTier(1200)).toBe('wide');
    expect(widthTier(720)).toBe('wide');
    expect(widthTier(719)).toBe('medium');
    expect(widthTier(480)).toBe('medium');
    expect(widthTier(479)).toBe('narrow');
    expect(widthTier(0)).toBe('narrow');
  });

  it('geniş kapta tasarlanan genişlik, sınırlar içinde', () => {
    expect(effectiveSpan(4, 'wide')).toBe(4);
    expect(effectiveSpan(0, 'wide')).toBe(1);
    expect(effectiveSpan(15, 'wide')).toBe(12);
  });

  it('orta kapta yarım ya da tam satır; dar kapta hep tam satır', () => {
    for (let span = 1; span <= 6; span++) expect(effectiveSpan(span, 'medium')).toBe(6);
    for (let span = 7; span <= 12; span++) expect(effectiveSpan(span, 'medium')).toBe(12);
    for (let span = 1; span <= 12; span++) expect(effectiveSpan(span, 'narrow')).toBe(12);
  });

  it('boşluk dar kapta çizilmez, ayırıcı hep tam satır', () => {
    expect(visibleAtTier({ kind: 'spacer', id: 'x', span: 4, newRow: false }, 'narrow')).toBeFalse();
    expect(visibleAtTier({ kind: 'spacer', id: 'x', span: 4, newRow: false }, 'medium')).toBeTrue();
    expect(itemSpan({ kind: 'divider', id: 'd' }, 'wide')).toBe(12);
  });
});
