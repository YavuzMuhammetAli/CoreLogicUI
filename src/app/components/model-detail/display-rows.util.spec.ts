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
  it('does not mutate the input array', () => {
    const rows = [{ ID: 2, Ad: 'b' }, { ID: 1, Ad: 'a' }];
    const original = [...rows];

    computeDisplayRows(input({ rows, sortCol: 'Ad' }));

    expect(rows).toEqual(original);
  });

  it('searches the term in the visible columns', () => {
    const rows = [
      { ID: 1, Ad: 'Ankara', Not: 'zzz' },
      { ID: 2, Ad: 'İzmir', Not: 'ankara ofisi' }
    ];

    const result = computeDisplayRows(
      input({ rows, searchTerm: 'ankara', searchableColumns: ['Ad'] }));

    expect(result.length).toBe(1);
    expect(result[0]['ID']).toBe(1);
  });

  it('the search term also matches the ID', () => {
    const rows = [{ ID: 42, Ad: 'x' }, { ID: 7, Ad: 'y' }];

    const result = computeDisplayRows(
      input({ rows, searchTerm: '42', searchableColumns: ['Ad'] }));

    expect(result.length).toBe(1);
    expect(result[0]['ID']).toBe(42);
  });

  it('sorts numeric columns as numbers, not as text', () => {
    const rows = [{ Adet: 10 }, { Adet: 9 }, { Adet: 100 }];

    const result = computeDisplayRows(input({ rows, sortCol: 'Adet' }));

    expect(result.map(r => r['Adet'])).toEqual([9, 10, 100]);
  });

  it('reverses the sort order in desc direction', () => {
    const rows = [{ Adet: 1 }, { Adet: 3 }, { Adet: 2 }];

    const result = computeDisplayRows(input({ rows, sortCol: 'Adet', sortDir: 'desc' }));

    expect(result.map(r => r['Adet'])).toEqual([3, 2, 1]);
  });

  it('takes the language into account when sorting text (TR i/ı distinction)', () => {
    const rows = [{ Ad: 'ırmak' }, { Ad: 'istanbul' }];

    const tr = computeDisplayRows(input({ rows, sortCol: 'Ad', locale: 'tr' }));
    const en = computeDisplayRows(input({ rows, sortCol: 'Ad', locale: 'en' }));

    // In the TR alphabet 'ı' comes before 'i'; in EN it comes after.
    expect(tr[0]['Ad']).toBe('ırmak');
    expect(en[0]['Ad']).toBe('istanbul');
  });
});

describe('selectDisplayRows', () => {
  it('returns the SAME cache (and array identity) when the inputs are equal', () => {
    const rows = [{ ID: 1 }];
    const first = selectDisplayRows(input({ rows }), undefined);
    const second = selectDisplayRows(input({ rows }), first);

    expect(second).toBe(first);
    expect(second.result).toBe(first.result);
  });

  it('recomputes when the row reference changes', () => {
    const first = selectDisplayRows(input({ rows: [{ ID: 1 }] }), undefined);
    const second = selectDisplayRows(input({ rows: [{ ID: 1 }] }), first);

    expect(second).not.toBe(first);
  });

  it('recomputes when the LANGUAGE changes', () => {
    // Regression: the cache key did not include the language; on TR→EN switch the sorting
    // froze and the user kept seeing the list in the old language's order.
    const rows = [{ Ad: 'ırmak' }, { Ad: 'istanbul' }];

    const tr = selectDisplayRows(input({ rows, sortCol: 'Ad', locale: 'tr' }), undefined);
    const en = selectDisplayRows(input({ rows, sortCol: 'Ad', locale: 'en' }), tr);

    expect(en).not.toBe(tr);
    expect(en.result[0]['Ad']).toBe('istanbul');
  });
});
