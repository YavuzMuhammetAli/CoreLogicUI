import { FormLayout } from '../../../utils/screen-layout/screen-layout.model';
import { validateLayout } from '../../../utils/screen-layout/screen-layout.validate';
import {
  addSection, addTab, endOfTab, findField, findItem, hideColumn, insertElement, moveItem, moveItemBy,
  moveSectionBy, moveTabBy, patchItem, patchSection, placeField, placedColumns, removeColumnEverywhere,
  removeItem, removeSection, removeTab, renameTab, setSpan, unhideColumn
} from './form-layout.commands';

function doc(): FormLayout {
  return {
    schemaVersion: 1,
    tabs: [
      { id: 't1', title: 'Genel', sections: [
        { id: 's1', items: [
          { kind: 'field', id: 'f1', column: 'A', span: 6 },
          { kind: 'field', id: 'f2', column: 'B', span: 6 },
          { kind: 'field', id: 'f3', column: 'C', span: 6 }
        ] },
        { id: 's2', items: [{ kind: 'field', id: 'f4', column: 'D', span: 12 }] }
      ] },
      { id: 't2', title: 'Ek', sections: [{ id: 's3', items: [] }] }
    ],
    hiddenColumns: ['E']
  };
}

const order = (d: FormLayout, sectionId: string) =>
  d.tabs.flatMap(t => t.sections).find(s => s.id === sectionId)!.items.map(i => i.id);

describe('form-layout.commands', () => {
  describe('placeField', () => {
    it('yerleştirilmemiş kolonu hedefe ekler, yeni kimlik çakışmaz', () => {
      const next = placeField(doc(), 'F', { sectionId: 's1', index: 1 });
      expect(order(next, 's1')).toEqual(['f1', 'f5', 'f2', 'f3']);
      expect(findField(next, 'F')?.item).toEqual({ kind: 'field', id: 'f5', column: 'F', span: 6 });
    });

    it('gizli kolonu yerleştirince gizli listesinden çıkar', () => {
      const next = placeField(doc(), 'E', { sectionId: 's3', index: 0 });
      expect(next.hiddenColumns).toEqual([]);
      expect(order(next, 's3').length).toBe(1);
    });

    it('zaten yerleşik kolonu taşır — aynı alan iki kez durmaz', () => {
      const next = placeField(doc(), 'A', { sectionId: 's3', index: 0 });
      expect(order(next, 's1')).toEqual(['f2', 'f3']);
      expect(order(next, 's3')).toEqual(['f1']);
    });

    it('olmayan bölüme hiçbir şey yapmaz (aynı referans)', () => {
      const d = doc();
      expect(placeField(d, 'F', { sectionId: 'yok', index: 0 })).toBe(d);
    });
  });

  describe('moveItem', () => {
    it('aynı bölümde sıra değiştirir', () => {
      expect(order(moveItem(doc(), 'f3', { sectionId: 's1', index: 0 }), 's1')).toEqual(['f3', 'f1', 'f2']);
      expect(order(moveItem(doc(), 'f1', { sectionId: 's1', index: 2 }), 's1')).toEqual(['f2', 'f3', 'f1']);
    });

    it('kendi yerine bırakmak aynı referansı döndürür', () => {
      const d = doc();
      expect(moveItem(d, 'f2', { sectionId: 's1', index: 1 })).toBe(d);
    });

    it('başka sekmedeki bölüme taşır; sıra sınırlanır', () => {
      const next = moveItem(doc(), 'f2', { sectionId: 's3', index: 99 });
      expect(order(next, 's3')).toEqual(['f2']);
      expect(findItem(next, 'f2')?.tab.id).toBe('t2');
    });
  });

  describe('moveItemBy (Alt+↑/↓)', () => {
    it('bölüm içinde bir adım', () => {
      expect(order(moveItemBy(doc(), 'f2', 1), 's1')).toEqual(['f1', 'f3', 'f2']);
    });

    it('bölüm sonunda bir sonraki bölümün başına geçer, sekmeyi aşmaz', () => {
      const next = moveItemBy(doc(), 'f3', 1);
      expect(order(next, 's2')).toEqual(['f3', 'f4']);
      const d = doc();
      expect(moveItemBy(d, 'f4', 1)).toBe(d);
    });

    it('bölüm başında bir önceki bölümün sonuna geçer', () => {
      expect(order(moveItemBy(doc(), 'f4', -1), 's1')).toEqual(['f1', 'f2', 'f3', 'f4']);
    });
  });

  it('setSpan 1–12 aralığına sıkıştırır; aynı değer aynı referans', () => {
    expect(findItem(setSpan(doc(), 'f1', 20), 'f1')?.item).toEqual(jasmine.objectContaining({ span: 12 }));
    expect(findItem(setSpan(doc(), 'f1', 0), 'f1')?.item).toEqual(jasmine.objectContaining({ span: 1 }));
    const d = doc();
    expect(setSpan(d, 'f1', 6)).toBe(d);
  });

  describe('patchItem', () => {
    it('varsayılanlar belgeye yazılmaz', () => {
      const withRow = patchItem(doc(), 'f1', { newRow: true });
      expect(findItem(withRow, 'f1')?.item).toEqual({ kind: 'field', id: 'f1', column: 'A', span: 6, newRow: true });
      const back = patchItem(withRow, 'f1', { newRow: false });
      expect(findItem(back, 'f1')?.item).toEqual({ kind: 'field', id: 'f1', column: 'A', span: 6 });
    });

    it('satır sayısı yalnız çok satırlı gösterimde tutulur', () => {
      let next = patchItem(doc(), 'f1', { rows: 5 });
      expect(findItem(next, 'f1')?.item).not.toEqual(jasmine.objectContaining({ rows: 5 }));
      next = patchItem(patchItem(doc(), 'f1', { widget: 'multiline' }), 'f1', { rows: 99 });
      expect(findItem(next, 'f1')?.item).toEqual(jasmine.objectContaining({ widget: 'multiline', rows: 20 }));
      next = patchItem(next, 'f1', { widget: null });
      expect(findItem(next, 'f1')?.item).toEqual({ kind: 'field', id: 'f1', column: 'A', span: 6 });
    });

    it('değişmeyen yama aynı referansı döndürür', () => {
      const d = doc();
      expect(patchItem(d, 'f1', { newRow: false })).toBe(d);
    });
  });

  describe('öğe ekleme / kaldırma', () => {
    it('boşluk, ayırıcı ve not kendi önekleriyle eklenir', () => {
      let next = insertElement(doc(), 'spacer', { sectionId: 's3', index: 0 });
      next = insertElement(next, 'divider', { sectionId: 's3', index: 1 });
      next = insertElement(next, 'note', { sectionId: 's3', index: 2 });
      expect(order(next, 's3')).toEqual(['x1', 'd1', 'n1']);
      expect(findItem(next, 'n1')?.item).toEqual({ kind: 'note', id: 'n1', text: '', tone: 'info', span: 12 });
    });

    it('alanı kaldırmak onu gizlemez — yerleştirilmemişe döner', () => {
      const next = removeItem(doc(), 'f1');
      expect(placedColumns(next).has('A')).toBeFalse();
      expect(next.hiddenColumns).toEqual(['E']);
    });

    it('gizle / göster', () => {
      const hidden = hideColumn(doc(), 'A');
      expect(placedColumns(hidden).has('A')).toBeFalse();
      expect(hidden.hiddenColumns).toEqual(['E', 'A']);
      expect(unhideColumn(hidden, 'A').hiddenColumns).toEqual(['E']);
    });

    it('silinmiş kolonun tüm izi kalkar', () => {
      const d = { ...doc(), hiddenColumns: ['A'] };
      const next = removeColumnEverywhere(d, 'A');
      expect(placedColumns(next).has('A')).toBeFalse();
      expect(next.hiddenColumns).toEqual([]);
    });
  });

  describe('bölümler', () => {
    it('ekle, yamala, taşı, kaldır', () => {
      let next = addSection(doc(), 't2', 'Notlar');
      const added = next.tabs[1].sections[1];
      expect(added).toEqual({ id: 's4', title: 'Notlar', items: [] });
      next = patchSection(next, 's4', { collapsible: true, collapsed: true });
      expect(next.tabs[1].sections[1]).toEqual({ id: 's4', title: 'Notlar', collapsible: true, collapsed: true, items: [] });
      next = patchSection(next, 's4', { collapsible: false });
      expect(next.tabs[1].sections[1]).toEqual({ id: 's4', title: 'Notlar', items: [] });
      next = moveSectionBy(next, 's4', -1);
      expect(next.tabs[1].sections.map(s => s.id)).toEqual(['s4', 's3']);
      next = removeSection(next, 's4');
      expect(next.tabs[1].sections.map(s => s.id)).toEqual(['s3']);
    });

    it('katlanmayan bölüme kapalı bayrağı yazılmaz', () => {
      const d = doc();
      expect(patchSection(d, 's1', { collapsed: true })).toBe(d);
    });

    it('bölüm kaldırılınca alanları yerleştirilmemişe döner', () => {
      expect(placedColumns(removeSection(doc(), 's2')).has('D')).toBeFalse();
    });
  });

  describe('sekmeler', () => {
    it('yeni sekme boş bir bölümle gelir', () => {
      const next = addTab(doc(), 'Ekler');
      expect(next.tabs[2]).toEqual({ id: 't3', title: 'Ekler', sections: [{ id: 's4', items: [] }] });
    });

    it('yeniden adlandır, taşı; son sekme kaldırılamaz', () => {
      let next = renameTab(doc(), 't2', 'Detay');
      expect(next.tabs[1].title).toBe('Detay');
      next = moveTabBy(next, 't2', -1);
      expect(next.tabs.map(t => t.id)).toEqual(['t2', 't1']);
      next = removeTab(next, 't2');
      expect(next.tabs.map(t => t.id)).toEqual(['t1']);
      expect(removeTab(next, 't1')).toBe(next);
    });

    it('sekme sonu: son bölümün sonu', () => {
      expect(endOfTab(doc(), 't1')).toEqual({ sectionId: 's2', index: 1 });
      expect(endOfTab(doc(), 'yok')).toBeNull();
    });
  });

  it('komut zinciri her zaman geçerli kimlikler üretir', () => {
    let next = doc();
    for (let i = 0; i < 5; i++) {
      next = addTab(next, 'S' + i);
      next = insertElement(next, 'note', endOfTab(next, next.tabs[next.tabs.length - 1].id)!);
      next = addSection(next, next.tabs[0].id);
    }
    const issues = validateLayout(next, 'form', null, 'draft');
    expect(issues.filter(i => i.code === 'badId' || i.code === 'duplicateId')).toEqual([]);
  });
});
