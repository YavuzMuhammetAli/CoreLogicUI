import { PublishedColumn } from '../../services/published-model.service';
import { resolveListColumns, totalListWidth } from './list-layout.resolve';

const columns: PublishedColumn[] = ['Plaka', 'Marka', 'Yil'].map(columnName => ({ columnName, dataType: 'string', isNullable: true }));
const names = (r: ReturnType<typeof resolveListColumns>) => r.map(c => c.column.columnName);

describe('list-layout.resolve', () => {
  it('with a layout, order and width come from it; deleted columns are skipped', () => {
    const resolved = resolveListColumns(
      { schemaVersion: 1, columns: [{ column: 'Yil', width: 90 }, { column: 'Silindi' }, { column: 'Plaka' }] },
      columns, ['Marka']);
    expect(names(resolved)).toEqual(['Yil', 'Plaka']);
    expect(resolved.map(c => c.width)).toEqual([90, null]);
  });

  it('without a layout, the legacy visibility setting in schema order', () => {
    expect(names(resolveListColumns(null, columns, ['Yil', 'Plaka']))).toEqual(['Plaka', 'Yil']);
    expect(names(resolveListColumns(null, columns, null))).toEqual(['Plaka', 'Marka', 'Yil']);
  });

  it('total width counts auto columns with the default', () => {
    const resolved = resolveListColumns({ schemaVersion: 1, columns: [{ column: 'Plaka', width: 200 }, { column: 'Marka' }] }, columns, null);
    expect(totalListWidth(resolved, 160, 80)).toBe(440);
  });
});
