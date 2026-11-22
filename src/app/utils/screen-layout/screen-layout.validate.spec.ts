import vectors from './screen-layout.vectors.json';
import { LayoutColumnFact, LayoutIssue, LayoutValidationMode, ScreenViewType } from './screen-layout.model';
import { hasErrors, severityOf, validateLayout, validateLayoutText } from './screen-layout.validate';

interface VectorCase {
  name: string;
  viewType: ScreenViewType;
  mode: LayoutValidationMode;
  layout?: unknown;
  raw?: string;
  /** Columns for this case only: the shared list would produce an "unplaced" info in every case. */
  extraFacts?: LayoutColumnFact[];
  expected: { code: string; severity: string; targetId?: string; column?: string }[];
}

const facts = vectors.facts as LayoutColumnFact[];
const cases = vectors.cases as unknown as VectorCase[];

const key = (i: { code: string; severity: string; targetId?: string; column?: string }) =>
  `${i.code}|${i.severity}|${i.targetId ?? ''}|${i.column ?? ''}`;

describe('screen-layout.validate', () => {
  describe('vectors shared with the server', () => {
    for (const c of cases) {
      it(c.name, () => {
        // The server sees the raw text; go through the same path (including the 12.0 → 12 conversion).
        const text = c.raw ?? JSON.stringify(c.layout);
        const columns = [...facts, ...(c.extraFacts ?? [])];
        const actual = validateLayoutText(text, c.viewType, columns, c.mode).map(key).sort();
        expect(actual).toEqual(c.expected.map(key).sort());
      });
    }
  });

  it('size limit is in UTF-8 bytes — a Turkish letter is two bytes', () => {
    const text = JSON.stringify({ schemaVersion: 1, columns: [], pad: 'ş'.repeat(40_000) });
    expect(text.length).toBeLessThan(65_536);
    expect(validateLayoutText(text, 'list', facts, 'draft').map(i => i.code)).toEqual(['tooLarge']);
  });

  it('skips column rules when there are no column facts', () => {
    const issues = validateLayout({ schemaVersion: 1, columns: [{ column: 'Herhangi' }] }, 'list', null, 'publish');
    expect(issues).toEqual([]);
  });

  it('treats empty text as unreadable', () => {
    expect(validateLayoutText('  ', 'form', facts, 'draft').map(i => i.code)).toEqual(['unreadable']);
  });

  it('severity comes from the mode', () => {
    expect(severityOf('spanRange', 'draft')).toBe('error');
    expect(severityOf('requiredHidden', 'draft')).toBe('warning');
    expect(severityOf('requiredHidden', 'publish')).toBe('error');
    expect(severityOf('unplacedColumn', 'publish')).toBe('warning');
  });

  it('hasErrors only looks at error severity', () => {
    const warning: LayoutIssue = { code: 'emptySection', severity: 'warning' };
    expect(hasErrors([warning])).toBeFalse();
    expect(hasErrors([warning, { code: 'noTabs', severity: 'error' }])).toBeTrue();
  });
});
