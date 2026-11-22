import { FormControl, FormGroup } from '@angular/forms';
import vectors from './auto-value.vectors.json';
import { ExpressionError, parseExpression, parseIsoDate, referencedFields, usesSequence } from './expression';
import { AutoValueColumn, buildAutoValuePlan, computeAutoValues, evaluateRule, toTypedValue } from './auto-value';
import { AutoValueFormBinding } from './auto-value-form';

interface VectorCase {
  name: string;
  expr: string;
  columns?: Record<string, string>;
  values?: Record<string, unknown>;
  target?: string;
  seq?: number;
  expected?: unknown;
  parseError?: string;
}

const NOW = parseIsoDate(vectors.now)!;

describe('auto-value', () => {

  // Backend `AutoValueVectorTests` runs the same file — both sides must produce the same result.
  describe('shared vectors', () => {
    for (const c of vectors.cases as VectorCase[]) {
      it(c.name, () => {
        if (c.parseError) {
          let code: string | null = null;
          try { parseExpression(c.expr); } catch (e) { code = (e as ExpressionError).code; }
          expect(code).toBe(c.parseError);
          return;
        }

        const columns = c.columns ?? {};
        const plan = buildAutoValuePlan([
          ...Object.entries(columns).map(([name, dataType]) => ({ name, dataType })),
          { name: 'Hedef', dataType: c.target!, autoValueTrigger: 'create', autoValueExpression: c.expr }
        ]);
        expect(plan.issues).toEqual([]);

        let next = c.seq ?? 1;
        const values = c.values ?? {};
        const result = evaluateRule(
          plan.byColumn.get('Hedef')!,
          col => toTypedValue(values[col], columns[col]),
          NOW,
          () => next++);
        expect(result).toEqual(c.expected as never);
      });
    }
  });

  describe('parseExpression', () => {
    it('returns fields as written and deduplicated', () => {
      expect(referencedFields(parseExpression('[A] + [B] * [A]'))).toEqual(['A', 'B']);
    });

    it('recognizes SEQ usage', () => {
      expect(usesSequence(parseExpression("TODAY('ddMMyyyy') & SEQ(3)"))).toBeTrue();
      expect(usesSequence(parseExpression('[A] + 1'))).toBeFalse();
    });

    it('rejects a too deeply nested expression', () => {
      let code: string | null = null;
      try { parseExpression('('.repeat(70) + '1' + ')'.repeat(70)); } catch (e) { code = (e as ExpressionError).code; }
      expect(code).toBe('tooDeep');
    });

    it('function names and keywords are case-insensitive', () => {
      expect(() => parseExpression("if([A] > 1 and true, round(1.5), null)")).not.toThrow();
    });
  });

  describe('buildAutoValuePlan', () => {
    const col = (name: string, dataType: string, trigger?: string, expr?: string, ro?: boolean): AutoValueColumn =>
      ({ name, dataType, autoValueTrigger: trigger, autoValueExpression: expr, isReadOnly: ro });

    it('orders rules by dependency', () => {
      const plan = buildAutoValuePlan([
        col('Toplam', 'decimal', 'change', '[Net] + [Kdv]'),
        col('Kdv', 'decimal', 'change', '[Net] * 0.2'),
        col('Net', 'decimal')
      ]);
      expect(plan.issues).toEqual([]);
      expect(plan.rules.map(r => r.column)).toEqual(['Kdv', 'Toplam']);
    });

    it('detects a cycle and does not run the rules in it', () => {
      const plan = buildAutoValuePlan([
        col('A', 'int', 'change', '[B] + 1'),
        col('B', 'int', 'change', '[A] + 1'),
        col('C', 'int', 'change', '[D] * 2'),
        col('D', 'int')
      ]);
      expect(plan.issues.map(i => [i.column, i.code])).toEqual([['A', 'cycle'], ['B', 'cycle']]);
      expect(plan.issues[0].detail).toBe('A → B → A');
      expect(plan.rules.map(r => r.column)).toEqual(['C']);
    });

    it('counts a self-reference as a cycle', () => {
      const plan = buildAutoValuePlan([col('A', 'int', 'change', '[A] + 1')]);
      expect(plan.issues[0].code).toBe('cycle');
    });

    it('reports an unknown field, a file target and an empty formula', () => {
      const plan = buildAutoValuePlan([
        col('A', 'int', 'change', '[Yok] + 1'),
        col('Foto', 'image', 'create', "'x'"),
        col('B', 'string', 'save', '  ')
      ]);
      expect(plan.issues.map(i => [i.column, i.code, i.detail])).toEqual([
        ['A', 'unknownField', 'Yok'],
        ['Foto', 'targetType', 'image'],
        ['B', 'expressionRequired', '']
      ]);
    });

    it('matches field names case-insensitively, keeping the real name', () => {
      const plan = buildAutoValuePlan([col('Net', 'decimal', 'change', '[fiyat] - [VERGI]'), col('Fiyat', 'decimal'), col('Vergi', 'decimal')]);
      expect(plan.byColumn.get('Net')!.refs).toEqual(['Fiyat', 'Vergi']);
    });

    it('SEQ only with create, referencing a SEQ column is forbidden', () => {
      const plan = buildAutoValuePlan([
        col('No', 'string', 'create', 'SEQ(3)'),
        col('No2', 'string', 'save', 'SEQ(3)'),
        col('Etiket', 'string', 'create', "'#' & [No]")
      ]);
      expect(plan.issues.map(i => [i.column, i.code])).toEqual([['No2', 'sequenceTrigger'], ['Etiket', 'sequenceRef']]);
      expect(plan.byColumn.get('No')!.readOnly).toBeTrue();
    });

    it('a save rule is always read-only', () => {
      const plan = buildAutoValuePlan([col('Son', 'datetime', 'save', 'NOW()', false)]);
      expect(plan.byColumn.get('Son')!.readOnly).toBeTrue();
    });
  });

  describe('computeAutoValues', () => {
    const plan = buildAutoValuePlan([
      { name: 'No', dataType: 'string', autoValueTrigger: 'create', autoValueExpression: "TODAY('ddMMyyyy') & '-' & SEQ(3)" },
      { name: 'Tarih', dataType: 'dateonly', autoValueTrigger: 'create', autoValueExpression: 'TODAY()' },
      { name: 'Fiyat', dataType: 'decimal' },
      { name: 'Vergi', dataType: 'decimal' },
      { name: 'Net', dataType: 'decimal', autoValueTrigger: 'change', autoValueExpression: '[Fiyat] - [Vergi]', isReadOnly: true },
      { name: 'Kdv', dataType: 'decimal', autoValueTrigger: 'change', autoValueExpression: '[Net] * 0.2' },
      { name: 'Son', dataType: 'datetime', autoValueTrigger: 'save', autoValueExpression: 'NOW()' }
    ]);
    const empty = { No: '', Tarih: '', Fiyat: '', Vergi: '', Net: '', Kdv: '', Son: '' };

    it('applies create rules when a new record opens, SEQ stays pending', () => {
      const r = computeAutoValues(plan, empty, { phase: 'open', isNew: true, now: NOW });
      expect(r.patch).toEqual({ Tarih: '2026-09-25' });
      expect(r.pending).toEqual(['No']);
    });

    it('does not overwrite a user-entered value on open (unless read-only)', () => {
      const r = computeAutoValues(plan, { ...empty, Tarih: '2026-01-01' }, { phase: 'open', isNew: true, now: NOW });
      expect(r.patch['Tarih']).toBeUndefined();
    });

    it('does nothing when an existing record opens', () => {
      const r = computeAutoValues(plan, empty, { phase: 'open', isNew: false, now: NOW });
      expect(r.patch).toEqual({});
    });

    it('recomputes in a chain when a field changes', () => {
      const r = computeAutoValues(plan, { ...empty, Fiyat: 100, Vergi: 18 }, { phase: 'change', isNew: false, changed: ['Vergi'], now: NOW });
      expect(r.patch).toEqual({ Net: 82, Kdv: 16.4 });
    });

    it('does not compute when an unrelated field changes', () => {
      const r = computeAutoValues(plan, { ...empty, Fiyat: 100 }, { phase: 'change', isNew: false, changed: ['Son'], now: NOW });
      expect(r.patch).toEqual({});
    });

    it('runs save rules when saving', () => {
      const r = computeAutoValues(plan, { ...empty, Fiyat: 10, Vergi: 1, Net: 9 }, { phase: 'save', isNew: false, now: NOW });
      expect(r.patch).toEqual({ Son: '2026-09-25T14:30:05' });
    });
  });

  describe('AutoValueFormBinding', () => {
    function makeForm(): FormGroup {
      return new FormGroup({
        Fiyat: new FormControl<unknown>(''),
        Vergi: new FormControl<unknown>(''),
        Net: new FormControl<unknown>(''),
        No: new FormControl<unknown>('')
      });
    }
    const plan = buildAutoValuePlan([
      { name: 'Fiyat', dataType: 'decimal' },
      { name: 'Vergi', dataType: 'decimal' },
      { name: 'Net', dataType: 'decimal', autoValueTrigger: 'change', autoValueExpression: '[Fiyat] - [Vergi]', isReadOnly: true },
      { name: 'No', dataType: 'string', autoValueTrigger: 'create', autoValueExpression: 'SEQ(3)' }
    ]);

    it('locks read-only fields and computes on change', () => {
      const form = makeForm();
      const binding = new AutoValueFormBinding(form, plan, true, () => NOW).start();

      expect(form.get('Net')!.disabled).toBeTrue();
      expect(binding.isPending('No')).toBeTrue();

      form.get('Fiyat')!.setValue(100);
      form.get('Vergi')!.setValue(18);
      expect(form.getRawValue()['Net']).toBe(82);

      binding.stop();
      form.get('Vergi')!.setValue(20);
      expect(form.getRawValue()['Net']).toBe(82);
    });
  });
});
