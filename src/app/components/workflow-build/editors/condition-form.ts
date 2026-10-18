import { WorkflowCase, WorkflowCondition, WorkflowStep } from '../../../models/workflow.model';
import { ExpressionError, parseExpression, referencedFields, usesSequence } from '../../../utils/auto-value/expression';

/**
 * Koşul düğümü düzenleyicisinin dönüşümleri — SAF. Her biri adımın yeni halini
 * döner (girdi değişmez). Durumlar SIRALIDIR: ilk eşleşen kazanır, bu yüzden
 * yukarı/aşağı taşıma bir anlam değişikliğidir.
 */

function withCases(step: WorkflowStep, cases: WorkflowCase[]): WorkflowStep {
  return { ...step, cases };
}

function cases(step: WorkflowStep): WorkflowCase[] {
  return step.cases ?? [];
}

/** Çakışmayan durum anahtarı: durum1, durum2… */
export function nextCaseKey(step: WorkflowStep): string {
  const taken = new Set(cases(step).map(c => c.key.toLowerCase()));
  let index = cases(step).length + 1;
  while (taken.has(`durum${index}`)) index++;
  return `durum${index}`;
}

export function addCase(step: WorkflowStep, label: string): WorkflowStep {
  return withCases(step, [...cases(step), { key: nextCaseKey(step), label, match: 'all', when: [], to: null }]);
}

export function removeCase(step: WorkflowStep, index: number): WorkflowStep {
  return withCases(step, cases(step).filter((_, i) => i !== index));
}

/** Durumu bir yukarı (-1) ya da aşağı (+1) taşır; sınırdaysa aynı adım. */
export function moveCase(step: WorkflowStep, index: number, delta: -1 | 1): WorkflowStep {
  const target = index + delta;
  const list = cases(step);
  if (target < 0 || target >= list.length) return step;

  const next = list.slice();
  [next[index], next[target]] = [next[target], next[index]];
  return withCases(step, next);
}

export function updateCase(step: WorkflowStep, index: number, patch: Partial<WorkflowCase>): WorkflowStep {
  return withCases(step, cases(step).map((c, i) => i === index ? { ...c, ...patch } : c));
}

/**
 * Formül ↔ satır modu. Formüle geçerken satırlar korunur (geri dönülebilsin);
 * motor formül doluysa onu esas alır, satır moduna dönünce formül temizlenir.
 */
export function setFormulaMode(step: WorkflowStep, index: number, formula: boolean): WorkflowStep {
  const current = cases(step)[index];
  if (!current) return step;
  return updateCase(step, index, { expression: formula ? (current.expression ?? '') : null });
}

export function addRow(step: WorkflowStep, caseIndex: number, field: string): WorkflowStep {
  const current = cases(step)[caseIndex];
  if (!current) return step;
  return updateCase(step, caseIndex, { when: [...current.when, { field, operator: 'eq', value: '' }] });
}

export function updateRow(step: WorkflowStep, caseIndex: number, rowIndex: number, patch: Partial<WorkflowCondition>): WorkflowStep {
  const current = cases(step)[caseIndex];
  if (!current) return step;
  return updateCase(step, caseIndex, {
    when: current.when.map((row, i) => i === rowIndex ? { ...row, ...patch } : row)
  });
}

export function removeRow(step: WorkflowStep, caseIndex: number, rowIndex: number): WorkflowStep {
  const current = cases(step)[caseIndex];
  if (!current) return step;
  return updateCase(step, caseIndex, { when: current.when.filter((_, i) => i !== rowIndex) });
}

export interface ExpressionCheck {
  /** Sözdizimi hatası kodu (ör. "unexpected"); geçerliyse null. */
  error: string | null;
  /** SEQ kullanılmış — koşulda yasak. */
  sequence: boolean;
  /** Modelde ve önceki adımlarda bulunmayan alanlar. */
  unknown: string[];
}

/**
 * Formülü istemcide denetler (sunucu da yayında denetler). Alan "Kolon" ya da
 * "adim.alan" olabilir; ikincisinde yalnız adımın varlığına bakılır.
 */
export function checkExpression(
  expression: string, columns: ReadonlyArray<string>, stepKeys: ReadonlyArray<string>
): ExpressionCheck {
  if (!expression.trim()) return { error: 'empty', sequence: false, unknown: [] };

  try {
    const ast = parseExpression(expression);
    const known = new Set(columns.map(c => c.toLowerCase()));
    const steps = new Set(stepKeys.map(k => k.toLowerCase()));
    const unknown = referencedFields(ast).filter(field => {
      const dot = field.indexOf('.');
      return dot > 0 ? !steps.has(field.slice(0, dot).toLowerCase()) : !known.has(field.toLowerCase());
    });
    return { error: null, sequence: usesSequence(ast), unknown };
  } catch (e) {
    return { error: e instanceof ExpressionError ? e.code : 'unexpected', sequence: false, unknown: [] };
  }
}

/** Satır değerinin giriş tipi — kolon tipine göre (sunucu ISO tarih ve nokta ondalık bekler). */
export type ValueInputKind = 'number' | 'date' | 'boolean' | 'text';

export function valueInputKind(dataType: string | null | undefined): ValueInputKind {
  switch (dataType) {
    case 'int': case 'long': case 'short': case 'byte': case 'decimal': case 'double': case 'float':
      return 'number';
    case 'datetime': case 'dateonly':
      return 'date';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}
