import { ListLayout } from '../../../utils/screen-layout/screen-layout.model';
import { hideListColumn, moveColumn, moveColumnBy, setColumnWidth, showColumn } from './list-layout.commands';

const doc = (): ListLayout => ({ schemaVersion: 1, columns: [{ column: 'A' }, { column: 'B', width: 120 }, { column: 'C' }] });
const names = (d: ListLayout) => d.columns.map(c => c.column);

describe('list-layout.commands', () => {
  it('show: at the end or at the given index; moves it if already present', () => {
    expect(names(showColumn(doc(), 'D'))).toEqual(['A', 'B', 'C', 'D']);
    expect(names(showColumn(doc(), 'D', 1))).toEqual(['A', 'D', 'B', 'C']);
    expect(names(showColumn(doc(), 'C', 0))).toEqual(['C', 'A', 'B']);
  });

  it('hide', () => {
    expect(names(hideListColumn(doc(), 'B'))).toEqual(['A', 'C']);
    const d = doc();
    expect(hideListColumn(d, 'Yok')).toBe(d);
  });

  it('move: within bounds; same place returns the same reference', () => {
    expect(names(moveColumn(doc(), 'A', 5))).toEqual(['B', 'C', 'A']);
    expect(names(moveColumnBy(doc(), 'B', -1))).toEqual(['B', 'A', 'C']);
    const d = doc();
    expect(moveColumnBy(d, 'A', -1)).toBe(d);
  });

  it('width is clamped to the 60–800 range; null means automatic', () => {
    expect(setColumnWidth(doc(), 'A', 30).columns[0]).toEqual({ column: 'A', width: 60 });
    expect(setColumnWidth(doc(), 'A', 1000).columns[0]).toEqual({ column: 'A', width: 800 });
    expect(setColumnWidth(doc(), 'B', null).columns[1]).toEqual({ column: 'B' });
    const d = doc();
    expect(setColumnWidth(d, 'B', 120)).toBe(d);
  });
});
