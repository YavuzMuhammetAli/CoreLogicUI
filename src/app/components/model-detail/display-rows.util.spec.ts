import { computeDisplayRows, selectDisplayRows, DisplayRowsInput } from './display-rows.util';

function input(partial: Partial<DisplayRowsInput> = {}): DisplayRowsInput {
  return {
    rows: [],
    searchTerm: '',
    sortCol: '',
    sortDir: 'asc',
    searchableColumns: [],
    locale: 'tr',
    ...partial
  };
}

describe('computeDisplayRows', () => {
  it('girdi dizisini değiştirmez', () => {
    const rows = [{ ID: 2, Ad: 'b' }, { ID: 1, Ad: 'a' }];
    const original = [...rows];

    computeDisplayRows(input({ rows, sortCol: 'Ad' }));

    expect(rows).toEqual(original);
  });

  it('arama terimini görünür kolonlarda arar', () => {
    const rows = [
      { ID: 1, Ad: 'Ankara', Not: 'zzz' },
      { ID: 2, Ad: 'İzmir', Not: 'ankara ofisi' }
    ];

    const result = computeDisplayRows(
      input({ rows, searchTerm: 'ankara', searchableColumns: ['Ad'] }));

    expect(result.length).toBe(1);
    expect(result[0]['ID']).toBe(1);
  });

  it('arama terimi ID ile de eşleşir', () => {
    const rows = [{ ID: 42, Ad: 'x' }, { ID: 7, Ad: 'y' }];

    const result = computeDisplayRows(
      input({ rows, searchTerm: '42', searchableColumns: ['Ad'] }));

    expect(result.length).toBe(1);
    expect(result[0]['ID']).toBe(42);
  });

  it('sayısal kolonları metin olarak değil sayı olarak sıralar', () => {
    const rows = [{ Adet: 10 }, { Adet: 9 }, { Adet: 100 }];

    const result = computeDisplayRows(input({ rows, sortCol: 'Adet' }));

    expect(result.map(r => r['Adet'])).toEqual([9, 10, 100]);
  });

  it('desc yönünde sıralamayı ters çevirir', () => {
    const rows = [{ Adet: 1 }, { Adet: 3 }, { Adet: 2 }];

    const result = computeDisplayRows(input({ rows, sortCol: 'Adet', sortDir: 'desc' }));

    expect(result.map(r => r['Adet'])).toEqual([3, 2, 1]);
  });

  it('metin sıralamasında dili dikkate alır (TR i/ı ayrımı)', () => {
    const rows = [{ Ad: 'ırmak' }, { Ad: 'istanbul' }];

    const tr = computeDisplayRows(input({ rows, sortCol: 'Ad', locale: 'tr' }));
    const en = computeDisplayRows(input({ rows, sortCol: 'Ad', locale: 'en' }));

    // TR alfabesinde 'ı' 'i'den önce, EN'de sonra gelir.
    expect(tr[0]['Ad']).toBe('ırmak');
    expect(en[0]['Ad']).toBe('istanbul');
  });
});

describe('selectDisplayRows', () => {
  it('girdiler aynıysa AYNI önbelleği (ve dizi kimliğini) döner', () => {
    const rows = [{ ID: 1 }];
    const first = selectDisplayRows(input({ rows }), undefined);
    const second = selectDisplayRows(input({ rows }), first);

    expect(second).toBe(first);
    expect(second.result).toBe(first.result);
  });

  it('satır referansı değişince yeniden hesaplar', () => {
    const first = selectDisplayRows(input({ rows: [{ ID: 1 }] }), undefined);
    const second = selectDisplayRows(input({ rows: [{ ID: 1 }] }), first);

    expect(second).not.toBe(first);
  });

  it('DİL değişince yeniden hesaplar', () => {
    // Regresyon: önbellek anahtarında dil yoktu; TR→EN geçişinde sıralama
    // donuyor, kullanıcı listeyi eski dilin sırasıyla görmeye devam ediyordu.
    const rows = [{ Ad: 'ırmak' }, { Ad: 'istanbul' }];

    const tr = selectDisplayRows(input({ rows, sortCol: 'Ad', locale: 'tr' }), undefined);
    const en = selectDisplayRows(input({ rows, sortCol: 'Ad', locale: 'en' }), tr);

    expect(en).not.toBe(tr);
    expect(en.result[0]['Ad']).toBe('istanbul');
  });
});
