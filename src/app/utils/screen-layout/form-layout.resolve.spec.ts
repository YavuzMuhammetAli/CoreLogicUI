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
  it('yerleşimi kolonlarla eşler; gizli kolonlar çizilmez', () => {
    const plan = resolveFormLayout(layout(), columns);
    expect(planColumns(plan)).toEqual(['Plaka', 'Marka', 'Aciklama']);
    expect(plan.appended).toEqual([]);
    const f2 = plan.tabs[0].sections[0].items[2];
    expect(f2.kind === 'field' && f2.newRow).toBeTrue();
    const f3 = plan.tabs[1].sections[0].items[0];
    expect(f3.kind === 'field' ? [f3.widget, f3.rows] : null).toEqual(['multiline', 5]);
  });

  it('tasarımdan sonra eklenen kolon ilk sekmenin sonuna eklenir', () => {
    const plan = resolveFormLayout(layout({ hiddenColumns: ['SiparisId'] }), columns);
    expect(plan.appended).toEqual(['Yil']);
    expect(plan.unplaced).toEqual(['Yil']);
    const last = plan.tabs[0].sections[plan.tabs[0].sections.length - 1];
    expect(last.id).toBe(APPENDED_SECTION_ID);
    expect(last.appended).toBeTrue();
    expect(plan.location.get('Yil')).toEqual({ tabId: 't1', sectionId: APPENDED_SECTION_ID });
  });

  it('gizli ama görünmesi gereken kolon (zorunlu / iş akışı adımı) sona eklenir', () => {
    const plan = resolveFormLayout(layout(), columns, { forcedVisible: new Set(['Yil']) });
    expect(plan.appended).toEqual(['Yil']);
    // Bilinçli gizlenmiş kolon "tasarım güncel değil" sayılmaz.
    expect(plan.unplaced).toEqual([]);
  });

  it('pop-up FK kolonunu hiç çizmez — yerleşimde olsa da', () => {
    const withFk = layout({ hiddenColumns: ['Yil'] });
    const plan = resolveFormLayout({
      ...withFk,
      tabs: [{ ...withFk.tabs[0], sections: [{ id: 's1', items: [{ kind: 'field', id: 'k', column: 'SiparisId', span: 6 }] }] }]
    }, columns, { excluded: new Set(['SiparisId']) });
    expect(planColumns(plan)).not.toContain('SiparisId');
    expect(plan.appended).not.toContain('SiparisId');
  });

  it('bilinmeyen (silinmiş) kolon çalışma anında atlanır, tasarımda işaretli çizilir', () => {
    const withUnknown = layout();
    const doc: FormLayout = {
      ...withUnknown,
      tabs: [{ ...withUnknown.tabs[0], sections: [{ id: 's1', items: [{ kind: 'field', id: 'u1', column: 'Silindi', span: 6 }] }] },
        withUnknown.tabs[1]]
    };
    const runtime = resolveFormLayout(doc, columns);
    expect(runtime.unknown).toEqual(['Silindi']);
    // s1'in tek öğesi düştü → bölüm (ve sekmenin kendi bölümü kalmadığı için) çizilmez;
    // sona eklenen kolonlar ilk ÇİZİLEN sekmeye gider.
    expect(runtime.tabs.map(t => t.id)).toEqual(['t2']);

    const design = resolveFormLayout(doc, columns, { design: true });
    const item = design.tabs[0].sections[0].items[0];
    expect(item.kind === 'field' && item.unknown).toBeTrue();
    expect(design.appended).toEqual([]);
  });

  it('tasarım modunda boş bölüm ve sekme korunur', () => {
    const doc = layout({ tabs: [{ id: 't1', title: '', sections: [{ id: 's1', items: [] }] }] });
    expect(resolveFormLayout(doc, columns, { design: true }).tabs[0].sections.length).toBe(1);
    // Çalışma anında boş bölüm ve içi boşalan sekme atlanır; sona eklenen kolonlar kendi sekmesinde.
    const runtime = resolveFormLayout(doc, columns);
    expect(runtime.tabs.map(t => t.id)).toEqual([APPENDED_TAB_ID]);
    expect(runtime.tabs[0].sections.map(s => s.id)).toEqual([APPENDED_SECTION_ID]);
  });

  it('hiç sekme kalmazsa sona eklenenler kendi sekmesinde', () => {
    const plan = resolveFormLayout(layout({ tabs: [], hiddenColumns: [] }), columns);
    expect(plan.tabs.map(t => t.id)).toEqual([APPENDED_TAB_ID]);
    expect(plan.appended.length).toBe(columns.length);
  });

  it('katlanmayan bölümün kapalı bayrağı yok sayılır', () => {
    const plan = resolveFormLayout(layout({
      tabs: [{ id: 't1', title: '', sections: [
        { id: 's1', collapsed: true, items: [{ kind: 'divider', id: 'd' }] },
        { id: 's2', collapsible: true, collapsed: true, items: [{ kind: 'divider', id: 'e' }] }
      ] }]
    }), columns);
    expect(plan.tabs[0].sections.map(s => s.collapsed)).toEqual([false, true, false]);
  });
});
