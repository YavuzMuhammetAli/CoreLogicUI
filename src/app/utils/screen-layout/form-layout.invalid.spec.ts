import { PublishedColumn } from '../../services/published-model.service';
import { FormLayout } from './screen-layout.model';
import { resolveFormLayout } from './form-layout.resolve';
import { firstInvalidLocation, invalidCountByTab, sectionsWithColumns, tabsWithColumns } from './form-layout.invalid';

const columns: PublishedColumn[] = ['A', 'B', 'C', 'D'].map(columnName => ({ columnName, dataType: 'string', isNullable: true }));

const doc: FormLayout = {
  schemaVersion: 1,
  tabs: [
    { id: 't1', title: 'Bir', sections: [{ id: 's1', items: [{ kind: 'field', id: 'a', column: 'A', span: 6 }] }] },
    { id: 't2', title: 'İki', sections: [
      { id: 's2', items: [{ kind: 'field', id: 'b', column: 'B', span: 6 }] },
      { id: 's3', collapsible: true, collapsed: true, items: [{ kind: 'field', id: 'c', column: 'C', span: 6 }] }
    ] }
  ],
  hiddenColumns: []
};

const plan = resolveFormLayout(doc, columns);

describe('form-layout.invalid', () => {
  it('ilk geçersiz alan çizim sırasıyla bulunur — sekme ve bölümüyle', () => {
    expect(firstInvalidLocation(plan, new Set(['C', 'B']))).toEqual({ tabId: 't2', sectionId: 's2', column: 'B' });
    expect(firstInvalidLocation(plan, new Set(['C']))).toEqual({ tabId: 't2', sectionId: 's3', column: 'C' });
  });

  it('sona eklenen alan da bulunur', () => {
    expect(firstInvalidLocation(plan, new Set(['D']))?.tabId).toBe('t1');
  });

  it('geçersiz alan yoksa null', () => {
    expect(firstInvalidLocation(plan, new Set())).toBeNull();
    expect(firstInvalidLocation(plan, new Set(['Yok']))).toBeNull();
  });

  it('sekme başına hata sayısı', () => {
    expect([...invalidCountByTab(plan, new Set(['A', 'B', 'C']))]).toEqual([['t1', 1], ['t2', 2]]);
  });

  it('kolonları içeren sekmeler plan sırasıyla, bölümler küme olarak', () => {
    expect(tabsWithColumns(plan, new Set(['C', 'A']))).toEqual(['t1', 't2']);
    expect([...sectionsWithColumns(plan, new Set(['C']))]).toEqual(['s3']);
  });
});
