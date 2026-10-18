import { WorkflowStep } from '../../../models/workflow.model';
import {
  addCase, addRow, checkExpression, moveCase, nextCaseKey, removeCase, removeRow,
  setFormulaMode, updateCase, updateRow, valueInputKind
} from './condition-form';

function condition(): WorkflowStep {
  return {
    key: 'k', type: 'condition', name: 'K', defaultTo: 'son',
    cases: [
      { key: 'durum1', label: 'Büyük', match: 'all', when: [{ field: 'Tutar', operator: 'ge', value: '10000' }], to: 'finans' },
      { key: 'durum2', label: 'Acil', match: 'all', when: [], to: 'mudur' }
    ]
  };
}

describe('condition-form', () => {
  it('yeni durum çakışmayan anahtar alır; girdi değişmez', () => {
    const step = condition();
    const next = addCase(step, 'Yeni');

    expect(nextCaseKey(step)).toBe('durum3');
    expect(next.cases!.map(c => c.key)).toEqual(['durum1', 'durum2', 'durum3']);
    expect(step.cases!.length).toBe(2);
  });

  it('sıra değişimi ilk eşleşeni değiştirir; sınırda aynı adım', () => {
    const step = condition();
    expect(moveCase(step, 1, -1).cases!.map(c => c.key)).toEqual(['durum2', 'durum1']);
    expect(moveCase(step, 0, -1)).toBe(step);
    expect(removeCase(step, 0).cases!.map(c => c.key)).toEqual(['durum2']);
  });

  it('satır ekle / güncelle / sil', () => {
    let step = addRow(condition(), 1, 'Oncelik');
    step = updateRow(step, 1, 0, { operator: 'eq', value: 'acil' });
    expect(step.cases![1].when).toEqual([{ field: 'Oncelik', operator: 'eq', value: 'acil' }]);
    expect(removeRow(step, 1, 0).cases![1].when).toEqual([]);
  });

  it('formül moduna geçiş satırları korur; satıra dönüş formülü temizler', () => {
    let step = setFormulaMode(condition(), 0, true);
    expect(step.cases![0].expression).toBe('');
    expect(step.cases![0].when.length).toBe(1);

    step = updateCase(step, 0, { expression: '[Tutar] > 5' });
    expect(setFormulaMode(step, 0, false).cases![0].expression).toBeNull();
  });

  it('formül denetimi: sözdizimi, SEQ ve bilinmeyen alan', () => {
    expect(checkExpression('[Tutar] >= 10000', ['Tutar'], ['mudur']).error).toBeNull();
    expect(checkExpression('[Tutar] >= (', ['Tutar'], []).error).not.toBeNull();
    expect(checkExpression('SEQ(3) > 0', [], []).sequence).toBeTrue();
    expect(checkExpression('[Yok] = 1 AND [mudur.Not] = 1 AND [hayalet.X] = 1', ['Tutar'], ['mudur']).unknown)
      .toEqual(['Yok', 'hayalet.X']);
    expect(checkExpression('  ', [], []).error).toBe('empty');
  });

  it('değer giriş tipi kolon tipinden', () => {
    expect(valueInputKind('decimal')).toBe('number');
    expect(valueInputKind('dateonly')).toBe('date');
    expect(valueInputKind('boolean')).toBe('boolean');
    expect(valueInputKind('string')).toBe('text');
    expect(valueInputKind(undefined)).toBe('text');
  });
});
