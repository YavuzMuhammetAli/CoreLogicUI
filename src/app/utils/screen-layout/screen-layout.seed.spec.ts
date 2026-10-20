import { PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { collectIds, layoutFacts, nextId, seedFormLayout, seedListLayout } from './screen-layout.seed';
import { validateLayout } from './screen-layout.validate';

const columns: PublishedColumn[] = [
  { columnName: 'Plaka', dataType: 'string', isNullable: true },
  { columnName: 'Marka', dataType: 'string', isNullable: true },
  { columnName: 'Yil', dataType: 'int', isNullable: true }
];

const rules = new Map<string, PublishedColumnSchema>([
  ['Plaka', { name: 'Plaka', dataType: 'string', isRequired: true } as PublishedColumnSchema]
]);

describe('screen-layout.seed', () => {
  it('ilk taslak bugünkü görünümden: görünenler yerleşir, gizlenenler gizli listede', () => {
    const seeded = seedFormLayout(columns, rules, ['Yil']);
    const items = seeded.tabs[0].sections[0].items;
    // Plaka zorunlu: "Kolonlar" ayarında gizli olsa da yerleşir.
    expect(items.map(i => i.kind === 'field' ? i.column : null)).toEqual(['Plaka', 'Yil']);
    expect(seeded.hiddenColumns).toEqual(['Marka']);
  });

  it('ayar yoksa tüm kolonlar yerleşir ve belge yayınlanabilir', () => {
    const seeded = seedFormLayout(columns, rules, null);
    expect(seeded.hiddenColumns).toEqual([]);
    expect(validateLayout(seeded, 'form', layoutFacts(columns, rules), 'publish')).toEqual([]);
  });

  it('liste taslağı görünen kolonlar, şema sırasıyla', () => {
    expect(seedListLayout(columns, ['Yil', 'Plaka']).columns.map(c => c.column)).toEqual(['Plaka', 'Yil']);
  });

  it('kolon bilgisi zorunluluğu şema kuralından okur', () => {
    expect(layoutFacts(columns, rules).map(f => f.mustStayVisible)).toEqual([true, false, false]);
  });

  it('yeni kimlik deterministik ve çakışmasız', () => {
    const ids = collectIds(seedFormLayout(columns, rules, null));
    expect([...ids]).toEqual(['t1', 's1', 'f1', 'f2', 'f3']);
    expect(nextId(ids, 'f')).toBe('f4');
    expect(nextId(ids, 'n')).toBe('n1');
    expect(nextId(new Set(['fx', 'f9', 'f10']), 'f')).toBe('f11');
  });
});
