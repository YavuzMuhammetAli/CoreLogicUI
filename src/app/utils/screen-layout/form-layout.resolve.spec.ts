import { PublishedColumn } from '../../services/published-model.service';
import { FormLayout } from './screen-layout.model';
import { APPENDED_SECTION_ID, APPENDED_TAB_ID, planColumns, resolveFormLayout } from './form-layout.resolve';

function col(columnName: string, dataType = 'string'): PublishedColumn {
  return { columnName, dataType, isNullable: true };
}

const columns = [col('Plaka'), col('Marka'), col('Yil', 'int'), col('Aciklama'), col('SiparisId', 'int')];

function layout(partial: Partial<FormLayout> = {}): FormLayout {
  return {
    schemaVersion: 1,
    tabs: [
      { id: 't1', title: 'Genel', sections: [{ id: 's1', title: 'Araç', items: [
        { kind: 'field', id: 'f1', column: 'Plaka', span: 6 },
        { kind: 'spacer', id: 'x1', span: 6 },
        { kind: 'field', id: 'f2', column: 'Marka', span: 4, newRow: true }
      ] }] },
      { id: 't2', title: 'Ek', sections: [{ id: 's2', items: [
        { kind: 'field', id: 'f3', column: 'Aciklama', span: 12, widget: 'multiline', rows: 5 }
      ] }] }
    ],
    hiddenColumns: ['Yil', 'SiparisId'],
    ...partial
  };
}

describe('form-layout.resolve', () => {
  it('matches the layout to columns; hidden columns are not drawn', () => {
    const plan = resolveFormLayout(layout(), columns);
    expect(planColumns(plan)).toEqual(['Plaka', 'Marka', 'Aciklama']);
    expect(plan.appended).toEqual([]);
    const f2 = plan.tabs[0].sections[0].items[2];
    expect(f2.kind === 'field' && f2.newRow).toBeTrue();
    const f3 = plan.tabs[1].sections[0].items[0];
    expect(f3.kind === 'field' ? [f3.widget, f3.rows] : null).toEqual(['multiline', 5]);
  });

  it('a column added after the design is appended to the end of the first tab', () => {
    const plan = resolveFormLayout(layout({ hiddenColumns: ['SiparisId'] }), columns);
    expect(plan.appended).toEqual(['Yil']);
    expect(plan.unplaced).toEqual(['Yil']);
    const last = plan.tabs[0].sections[plan.tabs[0].sections.length - 1];
    expect(last.id).toBe(APPENDED_SECTION_ID);
    expect(last.appended).toBeTrue();
    expect(plan.location.get('Yil')).toEqual({ tabId: 't1', sectionId: APPENDED_SECTION_ID });
  });

  it('a hidden column that must be visible (required / workflow step) is appended at the end', () => {
    const plan = resolveFormLayout(layout(), columns, { forcedVisible: new Set(['Yil']) });
    expect(plan.appended).toEqual(['Yil']);
    // A deliberately hidden column does not count as "design out of date".
    expect(plan.unplaced).toEqual([]);
  });

  it('the pop-up never draws the FK column — even if it is in the layout', () => {
    const withFk = layout({ hiddenColumns: ['Yil'] });
    const plan = resolveFormLayout({
      ...withFk,
      tabs: [{ ...withFk.tabs[0], sections: [{ id: 's1', items: [{ kind: 'field', id: 'k', column: 'SiparisId', span: 6 }] }] }]
    }, columns, { excluded: new Set(['SiparisId']) });
    expect(planColumns(plan)).not.toContain('SiparisId');
    expect(plan.appended).not.toContain('SiparisId');
  });

  it('an unknown (deleted) column is skipped at runtime, drawn flagged in design', () => {
    const withUnknown = layout();
    const doc: FormLayout = {
      ...withUnknown,
      tabs: [{ ...withUnknown.tabs[0], sections: [{ id: 's1', items: [{ kind: 'field', id: 'u1', column: 'Silindi', span: 6 }] }] },
        withUnknown.tabs[1]]
    };
    const runtime = resolveFormLayout(doc, columns);
    expect(runtime.unknown).toEqual(['Silindi']);
    // s1's only item dropped → the section (and, having no sections left, the tab) is not drawn;
    // appended columns go to the first DRAWN tab.
    expect(runtime.tabs.map(t => t.id)).toEqual(['t2']);

    const design = resolveFormLayout(doc, columns, { design: true });
    const item = design.tabs[0].sections[0].items[0];
    expect(item.kind === 'field' && item.unknown).toBeTrue();
    expect(design.appended).toEqual([]);
  });

  it('empty sections and tabs are kept in design mode', () => {
    const doc = layout({ tabs: [{ id: 't1', title: '', sections: [{ id: 's1', items: [] }] }] });
    expect(resolveFormLayout(doc, columns, { design: true }).tabs[0].sections.length).toBe(1);
    // At runtime an empty section and an emptied tab are skipped; appended columns get their own tab.
    const runtime = resolveFormLayout(doc, columns);
    expect(runtime.tabs.map(t => t.id)).toEqual([APPENDED_TAB_ID]);
    expect(runtime.tabs[0].sections.map(s => s.id)).toEqual([APPENDED_SECTION_ID]);
  });

  it('when no tabs remain, appended columns get their own tab', () => {
    const plan = resolveFormLayout(layout({ tabs: [], hiddenColumns: [] }), columns);
    expect(plan.tabs.map(t => t.id)).toEqual([APPENDED_TAB_ID]);
    expect(plan.appended.length).toBe(columns.length);
  });

  it('ignores the collapsed flag of a non-collapsible section', () => {
    const plan = resolveFormLayout(layout({
      tabs: [{ id: 't1', title: '', sections: [
        { id: 's1', collapsed: true, items: [{ kind: 'divider', id: 'd' }] },
        { id: 's2', collapsible: true, collapsed: true, items: [{ kind: 'divider', id: 'e' }] }
      ] }]
    }), columns);
    expect(plan.tabs[0].sections.map(s => s.collapsed)).toEqual([false, true, false]);
  });
});
