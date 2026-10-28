import vectors from './nav-layout.vectors.json';
import { NavFacts, NavLayout, NavValidationMode } from './nav-layout.model';
import { isAllowedNavUrl, navSeverityOf, validateNavLayout, validateNavLayoutText } from './nav-layout.validate';
import { parseNavLayout, serializeNavLayout } from './nav-layout.parse';

interface VectorCase {
  name: string;
  mode: NavValidationMode;
  layout?: unknown;
  raw?: string;
  expected: { code: string; severity: string; targetId?: string }[];
  normalized?: string;
}

const facts: NavFacts = {
  models: new Set(vectors.facts.models),
  dashboards: new Set(vectors.facts.dashboards),
  reports: new Set(vectors.facts.reports)
};
const cases = vectors.cases as unknown as VectorCase[];

const key = (i: { code: string; severity: string; targetId?: string }) => `${i.code}|${i.severity}|${i.targetId ?? ''}`;

describe('nav-layout.validate', () => {
  describe('sunucuyla ortak vektörler', () => {
    for (const c of cases) {
      it(c.name, () => {
        const text = c.raw ?? JSON.stringify(c.layout);
        const actual = validateNavLayoutText(text, facts, c.mode).map(key).sort();
        expect(actual).toEqual(c.expected.map(key).sort());

        // Sunucunun normalize çıktısıyla bayt bayt aynı metin — aksi halde kaydedilen taslak hep "değişmiş" görünür.
        if (c.normalized !== undefined) {
          const doc = parseNavLayout(text);
          expect(doc).not.toBeNull();
          expect(serializeNavLayout(doc as NavLayout)).toBe(c.normalized);
        }
      });
    }
  });

  it('bilgi yoksa hedef denetimleri atlanır', () => {
    const doc = { schemaVersion: 1, items: [{ kind: 'model', id: 'm1', typeName: 'Yok' }] };
    expect(validateNavLayout(doc, null, 'publish')).toEqual([]);
  });

  it('yalnız http(s) bağlantılara izin verilir', () => {
    expect(isAllowedNavUrl('https://ornek.com.tr/yol?a=1')).toBeTrue();
    expect(isAllowedNavUrl('http://intranet')).toBeTrue();
    expect(isAllowedNavUrl('javascript:alert(1)')).toBeFalse();
    expect(isAllowedNavUrl('data:text/html,x')).toBeFalse();
    expect(isAllowedNavUrl('//ornek.com')).toBeFalse();
    expect(isAllowedNavUrl('https://')).toBeFalse();
  });

  it('önem derecesi kipten gelir', () => {
    expect(navSeverityOf('badUrl', 'draft')).toBe('error');
    expect(navSeverityOf('emptyLabel', 'draft')).toBe('warning');
    expect(navSeverityOf('emptyLabel', 'publish')).toBe('error');
    expect(navSeverityOf('emptyFolder', 'publish')).toBe('warning');
  });

  it('yapısal hatalı metin okunmaz', () => {
    expect(parseNavLayout('{"schemaVersion":1,"items":[{"kind":"folder","id":"f1","label":"A","children":[{"kind":"folder","id":"f2","label":"B","children":[]}]}]}')).toBeNull();
    expect(parseNavLayout(null)).toBeNull();
  });
});
