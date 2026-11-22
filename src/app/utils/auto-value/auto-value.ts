/**
 * Auto-value rules — planning (validation + dependency order) and computation.
 *
 * A column has at most one rule:
 *   create — when the form first opens (NEW records only)
 *   change — when a field used in the formula changes (+ on open for a new record)
 *   save   — while saving
 *
 * The server (`AutoValueApplier`) applies the same table and is the SOURCE OF TRUTH; the computation
 * here is for instant feedback to the user. Who writes when:
 *
 *   trigger | new record                          | update
 *   create  | always if read-only, else if empty  | untouched
 *   change  | always if read-only, else if empty  | recomputed if read-only
 *   save    | computed                            | computed
 *
 * Rules using `save` or SEQ() are always read-only: the former's value is overwritten on save
 * anyway, and only the server knows the latter's number.
 */

import {
  DateValue, ExprNode, ExpressionError, Value,
  evaluate, formatDate, isBlank, parseExpression, parseIsoDate, parseNumberText,
  referencedFields, roundAway, toBool, toNumber, toText, usesSequence
} from './expression';

export type AutoValueTrigger = 'create' | 'change' | 'save';
export const AUTO_VALUE_TRIGGERS: readonly AutoValueTrigger[] = ['create', 'change', 'save'];

/** A column entering planning — from the schema DTO or the designer form. */
export interface AutoValueColumn {
  name: string;
  dataType: string;
  autoValueTrigger?: string | null;
  autoValueExpression?: string | null;
  isReadOnly?: boolean | null;
}

export interface AutoValueRule {
  column: string;
  dataType: string;
  trigger: AutoValueTrigger;
  expression: string;
  /** Effective read-only flag (save / SEQ ⇒ always true). */
  readOnly: boolean;
  ast: ExprNode;
  /** Columns used in the formula — with their real (schema) names. */
  refs: string[];
  usesSequence: boolean;
}

export type RuleIssueCode =
  | 'expressionRequired' | 'parse' | 'unknownField' | 'targetType'
  | 'sequenceTrigger' | 'sequenceRef' | 'cycle';

export interface RuleIssue {
  column: string;
  code: RuleIssueCode;
  /** parse: ExpressionError code · unknownField/sequenceRef: field name · cycle: A → B → A */
  detail: string;
  /** Position of the parse error in the formula (-1 if none). */
  pos: number;
  /** The offending fragment of a parse error (unknown function name, unexpected character…). */
  arg: string;
}

export interface AutoValuePlan {
  /** Error-free rules in dependency order (dependencies first). */
  rules: AutoValueRule[];
  byColumn: Map<string, AutoValueRule>;
  issues: RuleIssue[];
  /** Column name → data type (to type the formula fields). */
  types: Map<string, string>;
}

/** Types that cannot be a formula target. */
const NON_TARGET_TYPES = new Set(['image', 'file']);
const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'lookup']);
const REAL_TYPES = new Set(['decimal', 'double', 'float']);

export const EMPTY_PLAN: AutoValuePlan = { rules: [], byColumn: new Map(), issues: [], types: new Map() };

/**
 * Validates the columns' rules and orders them by dependency. Invalid rules
 * go to `issues` and are removed from the plan (they don't lock the form, they just don't run).
 */
export function buildAutoValuePlan(columns: readonly AutoValueColumn[]): AutoValuePlan {
  const types = new Map<string, string>();
  const byLower = new Map<string, string>();
  for (const c of columns) {
    types.set(c.name, c.dataType);
    byLower.set(c.name.toLowerCase(), c.name);
  }

  const issues: RuleIssue[] = [];
  const candidates = new Map<string, AutoValueRule>();
  const issue = (column: string, code: RuleIssueCode, detail = '', pos = -1, arg = '') =>
    issues.push({ column, code, detail, pos, arg });

  for (const c of columns) {
    const trigger = normalizeTrigger(c.autoValueTrigger);
    if (!trigger) continue;
    const expression = (c.autoValueExpression ?? '').trim();
    if (!expression) { issue(c.name, 'expressionRequired'); continue; }
    if (NON_TARGET_TYPES.has(c.dataType)) { issue(c.name, 'targetType', c.dataType); continue; }

    let ast: ExprNode;
    try {
      ast = parseExpression(expression);
    } catch (e) {
      const err = e as ExpressionError;
      issue(c.name, 'parse', err.code ?? 'unexpectedToken', err.pos ?? -1, err.detail ?? '');
      continue;
    }

    const refs: string[] = [];
    let unknown = false;
    for (const name of referencedFields(ast)) {
      const actual = byLower.get(name.toLowerCase());
      if (!actual) { issue(c.name, 'unknownField', name); unknown = true; continue; }
      if (!refs.includes(actual)) refs.push(actual);
    }
    if (unknown) continue;

    const seq = usesSequence(ast);
    if (seq && trigger !== 'create') { issue(c.name, 'sequenceTrigger'); continue; }

    candidates.set(c.name, {
      column: c.name,
      dataType: c.dataType,
      trigger,
      expression,
      readOnly: trigger === 'save' || seq || !!c.isReadOnly,
      ast,
      refs,
      usesSequence: seq
    });
  }

  // A rule depending on a SEQ column: the number is assigned at save time (on the server, last),
  // so its dependant can never see it.
  for (const rule of [...candidates.values()]) {
    const seqRef = rule.refs.find(r => candidates.get(r)?.usesSequence && r !== rule.column);
    if (seqRef) { issue(rule.column, 'sequenceRef', seqRef); candidates.delete(rule.column); }
  }

  // Topological order + cycle detection (DFS). Rules in a cycle are removed from the plan.
  const ordered: AutoValueRule[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const inCycle = new Set<string>();
  const visit = (name: string, path: string[]): void => {
    const rule = candidates.get(name);
    if (!rule || state.get(name) === 'done') return;
    if (state.get(name) === 'visiting') {
      const cycle = [...path.slice(path.indexOf(name)), name];
      for (const n of cycle) {
        if (inCycle.has(n)) continue;
        inCycle.add(n);
        issue(n, 'cycle', cycle.join(' → '));
      }
      return;
    }
    state.set(name, 'visiting');
    for (const ref of rule.refs) visit(ref, [...path, name]);
    state.set(name, 'done');
    ordered.push(rule);
  };
  for (const name of candidates.keys()) visit(name, []);

  const rules = ordered.filter(r => !inCycle.has(r.column));
  return { rules, byColumn: new Map(rules.map(r => [r.column, r])), issues, types };
}

function normalizeTrigger(t: string | null | undefined): AutoValueTrigger | null {
  const v = (t ?? '').trim().toLowerCase();
  return (AUTO_VALUE_TRIGGERS as readonly string[]).includes(v) ? v as AutoValueTrigger : null;
}

// ─── Value conversions ──────────────────────────────────────────────────────

/** Converts a form/record value into a formula value by column type. Empty → null. */
export function toTypedValue(raw: unknown, dataType: string): Value {
  if (raw === undefined || raw === null || raw === '') return null;
  // File content is base64 on the client and byte[] on the server — they can't produce the same value; treated as empty in formulas.
  if (NON_TARGET_TYPES.has(dataType)) return null;
  if (INT_TYPES.has(dataType) || REAL_TYPES.has(dataType)) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    return typeof raw === 'string' ? parseNumberText(raw) : null;
  }
  if (dataType === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    return String(raw).toLowerCase() === 'true';
  }
  if (dataType === 'datetime' || dataType === 'dateonly') {
    const d = typeof raw === 'string' ? parseIsoDate(raw) : null;
    if (!d) return null;
    return dataType === 'dateonly' ? new DateValue(d.ms, false) : d;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean' || typeof raw === 'string') return raw;
  return String(raw);
}

/**
 * Converts a formula result into the target column's CANONICAL value — the server writes the same value.
 * Integers are rounded, decimals are cut to 10 digits, dates become ISO text.
 * A result that cannot be converted (e.g. "abc" into a number column) becomes null.
 */
export function coerceToColumn(v: Value, dataType: string): string | number | boolean | null {
  if (v === null) return null;
  try {
    if (INT_TYPES.has(dataType)) return zero(roundAway(toNumber(v), 0));
    if (REAL_TYPES.has(dataType)) return zero(roundAway(toNumber(v), 10));
    if (dataType === 'boolean') return toBool(v);
    if (dataType === 'dateonly' || dataType === 'datetime') {
      const d = v instanceof DateValue ? v : typeof v === 'string' ? parseIsoDate(v) : null;
      if (!d) return null;
      return formatDate(d, dataType === 'dateonly' ? 'yyyy-MM-dd' : 'yyyy-MM-ddTHH:mm:ss');
    }
    if (dataType === 'timeonly') {
      if (v instanceof DateValue) return formatDate(v, 'HH:mm:ss');
      const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(toText(v).trim());
      return m ? `${m[1]}:${m[2]}:${m[3] ?? '00'}` : null;
    }
    if (NON_TARGET_TYPES.has(dataType)) return null;
    const s = toText(v);
    return s === '' ? null : s;
  } catch {
    return null;
  }
}

function zero(n: number): number { return n === 0 ? 0 : n; }

/**
 * Evaluates a single rule with the given field values and returns the canonical value.
 * If the formula uses fields and ALL of them are empty the result is empty — so misleading values
 * like "Net Gelir = 0" (net income) don't appear on an empty form.
 * Runtime error (division by zero etc.) → null. `sequencePending` is rethrown.
 */
export function evaluateRule(
  rule: AutoValueRule,
  typedField: (column: string) => Value,
  now: DateValue,
  sequence?: (scope: string) => number
): string | number | boolean | null {
  if (rule.refs.length > 0 && rule.refs.every(r => isBlank(typedField(r)))) return null;
  try {
    const v = evaluate(rule.ast, {
      field: name => {
        const actual = rule.refs.find(r => r.toLowerCase() === name.toLowerCase());
        if (!actual) throw new ExpressionError('unknownField', -1, name);
        return typedField(actual);
      },
      now,
      sequence
    });
    return coerceToColumn(v, rule.dataType);
  } catch (e) {
    if (e instanceof ExpressionError && e.code === 'sequencePending') throw e;
    return null;
  }
}

// ─── Client phases ──────────────────────────────────────────────────────────

export type AutoValuePhase = 'open' | 'change' | 'save';

export interface ComputeOptions {
  phase: AutoValuePhase;
  isNew: boolean;
  /** Columns the user changed, in the `change` phase. */
  changed?: Iterable<string>;
  now: DateValue;
}

export interface ComputeResult {
  /** Column → value to write into the form (changed ones only). */
  patch: Record<string, unknown>;
  /** Columns whose number is assigned on save (SEQ). */
  pending: string[];
}

/**
 * Applies the rules that must run in a phase.
 *
 *   open   (new record) create + change → if the target is empty or read-only
 *   change  change → if a field in its formula changed (including chained)
 *   save    save + read-only change
 */
export function computeAutoValues(
  plan: AutoValuePlan,
  values: Readonly<Record<string, unknown>>,
  opts: ComputeOptions
): ComputeResult {
  const current: Record<string, unknown> = { ...values };
  const patch: Record<string, unknown> = {};
  const pending: string[] = [];
  const dirty = new Set(opts.changed ?? []);
  const typed = (col: string) => toTypedValue(current[col], plan.types.get(col) ?? 'string');

  for (const rule of plan.rules) {
    if (!appliesOnClient(rule, current[rule.column], opts, dirty)) continue;

    let value: string | number | boolean | null;
    try {
      value = evaluateRule(rule, typed, opts.now);
    } catch {
      pending.push(rule.column);            // SEQ — the server will assign it
      continue;
    }

    const formValue = value ?? (rule.dataType === 'boolean' ? false : '');
    if (!sameFormValue(current[rule.column], formValue)) {
      current[rule.column] = formValue;
      patch[rule.column] = formValue;
      dirty.add(rule.column);               // chain: rules depending on this are recomputed too
    }
  }
  return { patch, pending };
}

function appliesOnClient(
  rule: AutoValueRule, target: unknown, opts: ComputeOptions, dirty: Set<string>
): boolean {
  switch (opts.phase) {
    case 'open':
      if (!opts.isNew) return false;
      if (rule.trigger === 'save') return false;
      return rule.readOnly || isEmptyFormValue(target);
    case 'change':
      return rule.trigger === 'change' && rule.refs.some(r => dirty.has(r));
    case 'save':
      return rule.trigger === 'save' || (rule.trigger === 'change' && rule.readOnly);
  }
}

export function isEmptyFormValue(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

function sameFormValue(a: unknown, b: unknown): boolean {
  if (isEmptyFormValue(a) && isEmptyFormValue(b)) return true;
  return String(a) === String(b);
}
