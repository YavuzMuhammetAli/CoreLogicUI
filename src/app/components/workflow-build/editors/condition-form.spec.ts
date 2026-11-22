import { WorkflowStep } from '../../../models/workflow.model';
import {
  addCase, addRow, checkExpression, moveCase, nextCaseKey, removeCase, removeRow,
  setFormulaMode, updateCase, updateRow, valueInputKind
} from './condition-form';

function condition(): WorkflowStep {
  return {
    key: 'k', type: 'condition', name: 'K', defaultTo: 'son',
    cases: [
      { key: 'case1', label: 'Büyük', match: 'all', when: [{ field: 'Tutar', operator: 'ge', value: '10000' }], to: 'finans' },
      { key: 'case2', label: 'Acil', match: 'all', when: [], to: 'mudur' }
    ]
  };
}

describe('condition-form', () => {
  it('a new case gets a non-colliding key; the input is not mutated', () => {
    const step = condition();
    const next = addCase(step, 'Yeni');

    expect(nextCaseKey(step)).toBe('case3');
    expect(next.cases!.map(c => c.key)).toEqual(['case1', 'case2', 'case3']);
    expect(step.cases!.length).toBe(2);
  });

  it('reordering changes the first match; at the boundary the same step', () => {
    const step = condition();
    expect(moveCase(step, 1, -1).cases!.map(c => c.key)).toEqual(['case2', 'case1']);
    expect(moveCase(step, 0, -1)).toBe(step);
    expect(removeCase(step, 0).cases!.map(c => c.key)).toEqual(['case2']);
  });

  it('add / update / delete row', () => {
    let step = addRow(condition(), 1, 'Oncelik');
    step = updateRow(step, 1, 0, { operator: 'eq', value: 'acil' });
    expect(step.cases![1].when).toEqual([{ field: 'Oncelik', operator: 'eq', value: 'acil' }]);
    expect(removeRow(step, 1, 0).cases![1].when).toEqual([]);
  });

  it('switching to formula mode keeps rows; switching back to rows clears the formula', () => {
    let step = setFormulaMode(condition(), 0, true);
    expect(step.cases![0].expression).toBe('');
    expect(step.cases![0].when.length).toBe(1);

    step = updateCase(step, 0, { expression: '[Tutar] > 5' });
    expect(setFormulaMode(step, 0, false).cases![0].expression).toBeNull();
  });

  it('formula check: syntax, SEQ and unknown field', () => {
    expect(checkExpression('[Tutar] >= 10000', ['Tutar'], ['mudur']).error).toBeNull();
    expect(checkExpression('[Tutar] >= (', ['Tutar'], []).error).not.toBeNull();
    expect(checkExpression('SEQ(3) > 0', [], []).sequence).toBeTrue();
    expect(checkExpression('[Yok] = 1 AND [mudur.Not] = 1 AND [hayalet.X] = 1', ['Tutar'], ['mudur']).unknown)
      .toEqual(['Yok', 'hayalet.X']);
    expect(checkExpression('  ', [], []).error).toBe('empty');
  });

  it('value input type comes from the column type', () => {
    expect(valueInputKind('decimal')).toBe('number');
    expect(valueInputKind('dateonly')).toBe('date');
    expect(valueInputKind('boolean')).toBe('boolean');
    expect(valueInputKind('string')).toBe('text');
    expect(valueInputKind(undefined)).toBe('text');
  });
});
