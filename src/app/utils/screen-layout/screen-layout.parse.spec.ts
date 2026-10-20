import { FormLayout } from './screen-layout.model';
import { parseFormLayout, parseListLayout, serializeLayout } from './screen-layout.parse';

describe('screen-layout.parse', () => {
  it('sunucunun normalize ettiği metinle aynı çıktı — anahtar sırası, varsayılanlar atlanır', () => {
    // Backend ScreenLayoutNormalizeTests.Normalize_varsayilanlari_atlar… ile aynı girdi/çıktı.
    const parsed = parseFormLayout(JSON.stringify({
      schemaVersion: 1, extra: true,
      tabs: [{ title: 'Genel', id: 't1', sections: [{
        id: 's1', collapsible: false, collapsed: true, title: '', items: [
          { span: 6, kind: 'field', id: 'f1', column: 'Plaka', newRow: false, widget: null, rows: 5, color: 'red' },
          { kind: 'field', id: 'f2', column: 'Aciklama', span: 12, widget: 'multiline', rows: 4 }
        ]
      }] }],
      hiddenColumns: []
    }));

    expect(serializeLayout(parsed!)).toBe(
      '{"schemaVersion":1,"tabs":[{"id":"t1","title":"Genel","sections":[{"id":"s1","items":['
      + '{"kind":"field","id":"f1","column":"Plaka","span":6},'
      + '{"kind":"field","id":"f2","column":"Aciklama","span":12,"widget":"multiline","rows":4}]}]}],'
      + '"hiddenColumns":[]}');
  });

  it('katlanır bölümde kapalı bayrağı korunur, katlanmayanda atılır', () => {
    const layout: FormLayout = {
      schemaVersion: 1,
      tabs: [{ id: 't1', title: '', sections: [
        { id: 's1', title: 'A', collapsible: true, collapsed: true, items: [{ kind: 'divider', id: 'd1' }] },
        { id: 's2', collapsed: true, items: [{ kind: 'divider', id: 'd2' }] }
      ] }],
      hiddenColumns: []
    };
    expect(serializeLayout(layout)).toContain('{"id":"s1","title":"A","collapsible":true,"collapsed":true,"items"');
    expect(serializeLayout(layout)).toContain('{"id":"s2","items"');
  });

  it('şema sürümü tanınmıyorsa null — ekran varsayılan görünüme düşer', () => {
    expect(parseFormLayout('{"schemaVersion":2,"tabs":[],"hiddenColumns":[]}')).toBeNull();
    expect(parseFormLayout('bozuk')).toBeNull();
    expect(parseFormLayout(null)).toBeNull();
  });

  it('yapısal hatalı belge kullanılmaz', () => {
    expect(parseFormLayout('{"schemaVersion":1,"tabs":[{"id":"t1","title":"","sections":[{"id":"s1","items":'
      + '[{"kind":"field","id":"f1","column":"A","span":0}]}]}]}')).toBeNull();
  });

  it('liste: tekrar eden kolon bir kez, genişlik korunur', () => {
    const list = parseListLayout('{"schemaVersion":1,"columns":[{"column":"A","width":120},{"column":"B"}]}');
    expect(list).toEqual({ schemaVersion: 1, columns: [{ column: 'A', width: 120 }, { column: 'B' }] });
    expect(serializeLayout({ schemaVersion: 1, columns: [{ column: 'A' }, { column: 'A', width: 90 }] }))
      .toBe('{"schemaVersion":1,"columns":[{"column":"A"}]}');
  });
});
