import vectors from './screen-layout.vectors.json';
import { LayoutColumnFact, LayoutIssue, LayoutValidationMode, ScreenViewType } from './screen-layout.model';
import { hasErrors, severityOf, validateLayout, validateLayoutText } from './screen-layout.validate';

interface VectorCase {
  name: string;
  viewType: ScreenViewType;
  mode: LayoutValidationMode;
  layout?: unknown;
  raw?: string;
  /** Yalnız bu vakanın kolonları: ortak liste her vakada "yerleştirilmemiş" bilgisi üretir. */
  extraFacts?: LayoutColumnFact[];
  expected: { code: string; severity: string; targetId?: string; column?: string }[];
}

const facts = vectors.facts as LayoutColumnFact[];
const cases = vectors.cases as unknown as VectorCase[];

const key = (i: { code: string; severity: string; targetId?: string; column?: string }) =>
  `${i.code}|${i.severity}|${i.targetId ?? ''}|${i.column ?? ''}`;

describe('screen-layout.validate', () => {
  describe('sunucuyla ortak vektörler', () => {
    for (const c of cases) {
      it(c.name, () => {
        // Sunucu ham metni görür; aynı yoldan geçilir (12.0 → 12 dönüşümü dahil).
        const text = c.raw ?? JSON.stringify(c.layout);
        const columns = [...facts, ...(c.extraFacts ?? [])];
        const actual = validateLayoutText(text, c.viewType, columns, c.mode).map(key).sort();
        expect(actual).toEqual(c.expected.map(key).sort());
      });
    }
  });

  it('boyut sınırı UTF-8 bayt üzerinden — Türkçe harf iki bayttır', () => {
    const text = JSON.stringify({ schemaVersion: 1, columns: [], pad: 'ş'.repeat(40_000) });
    expect(text.length).toBeLessThan(65_536);
    expect(validateLayoutText(text, 'list', facts, 'draft').map(i => i.code)).toEqual(['tooLarge']);
  });

  it('kolon bilgisi yoksa kolon kuralları atlanır', () => {
    const issues = validateLayout({ schemaVersion: 1, columns: [{ column: 'Herhangi' }] }, 'list', null, 'publish');
    expect(issues).toEqual([]);
  });

  it('boş metin okunamaz sayılır', () => {
    expect(validateLayoutText('  ', 'form', facts, 'draft').map(i => i.code)).toEqual(['unreadable']);
  });

  it('önem derecesi kipten gelir', () => {
    expect(severityOf('spanRange', 'draft')).toBe('error');
    expect(severityOf('requiredHidden', 'draft')).toBe('warning');
    expect(severityOf('requiredHidden', 'publish')).toBe('error');
    expect(severityOf('unplacedColumn', 'publish')).toBe('warning');
  });

  it('hasErrors yalnız hata derecesine bakar', () => {
    const warning: LayoutIssue = { code: 'emptySection', severity: 'warning' };
    expect(hasErrors([warning])).toBeFalse();
    expect(hasErrors([warning, { code: 'noTabs', severity: 'error' }])).toBeTrue();
  });
});
