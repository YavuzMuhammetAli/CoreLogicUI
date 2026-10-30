import {
  activeFilterCount, ariaSortOf, filterKindOf, hasFilterValue, isSortable, nextSort, toListFilters
} from './list-query';

describe('list-query', () => {
  describe('filterKindOf', () => {
    it('kolon tipini filtre denetimine çevirir', () => {
      expect(filterKindOf('string')).toBe('text');
      expect(filterKindOf('enum')).toBe('enum');
      expect(filterKindOf('int')).toBe('number');
      expect(filterKindOf('decimal')).toBe('number');
      expect(filterKindOf('dateonly')).toBe('date');
      expect(filterKindOf('datetime')).toBe('datetime');
      expect(filterKindOf('boolean')).toBe('boolean');
    });

    it('dosya, lookup ve guid filtrelenmez', () => {
      for (const type of ['image', 'file', 'lookup', 'guid']) {
        expect(filterKindOf(type)).toBe('none');
      }
    });
  });

  it('isSortable: lookup numaraya göre sıralanacağı için kapalıdır', () => {
    expect(isSortable('string')).toBeTrue();
    expect(isSortable('timeonly')).toBeTrue();
    expect(isSortable('lookup')).toBeFalse();
    expect(isSortable('image')).toBeFalse();
  });

  describe('toListFilters', () => {
    const columns = [
      { columnName: 'Ad', dataType: 'string' },
      { columnName: 'Durum', dataType: 'enum' },
      { columnName: 'Adet', dataType: 'int' },
      { columnName: 'Tarih', dataType: 'dateonly' },
      { columnName: 'Zaman', dataType: 'datetime' },
      { columnName: 'Onayli', dataType: 'boolean' }
    ];

    it('boş seçim filtre üretmez', () => {
      expect(toListFilters(columns, {})).toEqual([]);
      expect(toListFilters(columns, { Ad: { value: '' }, Adet: { from: '', to: '' } })).toEqual([]);
    });

    it('metin içerir, enum ve mantıksal eşittir olur', () => {
      expect(toListFilters(columns, { Ad: { value: 'ali' }, Durum: { value: 'Aktif' }, Onayli: { value: 'false' } }))
        .toEqual([
          { field: 'Ad', operator: 'contains', value: 'ali' },
          { field: 'Durum', operator: 'eq', value: 'Aktif' },
          { field: 'Onayli', operator: 'eq', value: 'false' }
        ]);
    });

    it('sayı ve tarih aralığı iki uçtan da açık bırakılabilir', () => {
      expect(toListFilters(columns, { Adet: { from: '5' }, Tarih: { to: '2026-02-01' } })).toEqual([
        { field: 'Adet', operator: 'ge', value: '5' },
        { field: 'Tarih', operator: 'le', value: '2026-02-01' }
      ]);
    });

    it('datetime bitiş günü sonuna kadar dahildir', () => {
      expect(toListFilters(columns, { Zaman: { from: '2026-02-01', to: '2026-02-28' } })).toEqual([
        { field: 'Zaman', operator: 'ge', value: '2026-02-01' },
        { field: 'Zaman', operator: 'lt', value: '2026-03-01' }
      ]);
    });

    it('ay ve yıl sonunda taşar', () => {
      expect(toListFilters(columns, { Zaman: { to: '2026-12-31' } })[0].value).toBe('2027-01-01');
    });

    it('filtre panelinde olmayan kolonun kalıntısı gönderilmez', () => {
      expect(toListFilters(columns, { Silinen: { value: 'x' } })).toEqual([]);
    });
  });

  it('activeFilterCount aralığı tek filtre sayar', () => {
    expect(activeFilterCount({ Adet: { from: '1', to: '5' }, Ad: { value: 'x' }, Bos: { value: '' } })).toBe(2);
    expect(hasFilterValue(undefined)).toBeFalse();
  });

  describe('nextSort', () => {
    it('artan → azalan → yok döngüsü', () => {
      const asc = nextSort(null, 'Ad');
      expect(asc).toEqual({ column: 'Ad', direction: 'asc' });
      const desc = nextSort(asc, 'Ad');
      expect(desc).toEqual({ column: 'Ad', direction: 'desc' });
      expect(nextSort(desc, 'Ad')).toBeNull();
    });

    it('başka kolona geçince artandan başlar', () => {
      expect(nextSort({ column: 'Ad', direction: 'desc' }, 'Adet')).toEqual({ column: 'Adet', direction: 'asc' });
    });
  });

  it('ariaSortOf', () => {
    expect(ariaSortOf(null, 'Ad')).toBe('none');
    expect(ariaSortOf({ column: 'Ad', direction: 'asc' }, 'Ad')).toBe('ascending');
    expect(ariaSortOf({ column: 'Ad', direction: 'desc' }, 'Ad')).toBe('descending');
    expect(ariaSortOf({ column: 'Ad', direction: 'asc' }, 'Adet')).toBe('none');
  });
});
