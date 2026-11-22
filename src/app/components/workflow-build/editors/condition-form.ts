import { WorkflowCase, WorkflowCondition, WorkflowStep } from '../../../models/workflow.model';
import { ExpressionError, parseExpression, referencedFields, usesSequence } from '../../../utils/auto-value/expression';

/**
 * Transformations of the condition node editor — PURE. Each returns the new step
 * (the input is not mutated). Cases are ORDERED: the first match wins, so
 * moving up/down changes the meaning.
 */

function withCases(step: WorkflowStep, cases: WorkflowCase[]): WorkflowStep {
  return { ...step, cases };
}

function cases(step: WorkflowStep): WorkflowCase[] {
  return step.cases ?? [];
}

/** Non-colliding case key: case1, case2… */
export function nextCaseKey(step: WorkflowStep): string {
  const taken = new Set(cases(step).map(c => c.key.toLowerCase()));
  let index = cases(step).length + 1;
  while (taken.has(`case${index}`)) index++;
  return `case${index}`;
}

export function addCase(step: WorkflowStep, label: string): WorkflowStep {
  return withCases(step, [...cases(step), { key: nextCaseKey(step), label, match: 'all', when: [], to: null }]);
}

export function removeCase(step: WorkflowStep, index: number): WorkflowStep {
  return withCases(step, cases(step).filter((_, i) => i !== index));
}

/** Moves a case one up (-1) or down (+1); at the boundary, the same step. */
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
 * Formula ↔ row mode. Rows are kept when switching to formula (so you can switch back);
 * the engine uses the formula if it is filled in; switching back to row mode clears the formula.
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
  /** Syntax error code (e.g. "unexpected"); null if valid. */
  error: string | null;
  /** SEQ is used — forbidden in conditions. */
  sequence: boolean;
  /** Fields not found in the model or in previous steps. */
  unknown: string[];
}

/**
 * Checks the formula on the client (the server also checks on publish). A field can be "Column" or
 * "step.field"; for the latter only the step's existence is checked.
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

/** Input type of a row value — from the column type (the server expects ISO dates and dot decimals). */
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
