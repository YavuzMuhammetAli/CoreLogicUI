/**
 * Otomatik değer kuralları — planlama (doğrulama + bağımlılık sırası) ve hesaplama.
 *
 * Bir kolonun en fazla bir kuralı vardır:
 *   create — form ilk açıldığında (yalnız YENİ kayıt)
 *   change — formülde geçen bir alan değişince (+ yeni kayıtta açılışta)
 *   save   — kaydedilirken
 *
 * Sunucu (`AutoValueApplier`) aynı tabloyu uygular ve ESAS KAYNAKTIR; buradaki hesap
 * kullanıcıya anında geri bildirim içindir. Kimin ne zaman yazdığı:
 *
 *   tetik   | yeni kayıt                          | güncelleme
 *   create  | salt okunursa hep, değilse boşsa    | dokunulmaz
 *   change  | salt okunursa hep, değilse boşsa    | salt okunursa yeniden hesaplanır
 *   save    | hesaplanır                          | hesaplanır
 *
 * `save` ve SEQ() kullanan kurallar her zaman salt okunurdur: ilkinin değeri kayıtta
 * zaten ezilir, ikincisinin numarasını yalnız sunucu bilir.
 */

import {
  DateValue, ExprNode, ExpressionError, Value,
  evaluate, formatDate, isBlank, parseExpression, parseIsoDate, parseNumberText,
  referencedFields, roundAway, toBool, toNumber, toText, usesSequence
} from './expression';

export type AutoValueTrigger = 'create' | 'change' | 'save';
export const AUTO_VALUE_TRIGGERS: readonly AutoValueTrigger[] = ['create', 'change', 'save'];

/** Planlamaya giren kolon — şema DTO'sundan ya da tasarımcı formundan. */
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
  /** Etkin salt okunurluk (save / SEQ ⇒ her zaman true). */
  readOnly: boolean;
  ast: ExprNode;
  /** Formülde geçen kolonlar — gerçek (şemadaki) adlarıyla. */
  refs: string[];
  usesSequence: boolean;
}

export type RuleIssueCode =
  | 'expressionRequired' | 'parse' | 'unknownField' | 'targetType'
  | 'sequenceTrigger' | 'sequenceRef' | 'cycle';

export interface RuleIssue {
  column: string;
  code: RuleIssueCode;
  /** parse: ExpressionError kodu · unknownField/sequenceRef: alan adı · cycle: A → B → A */
  detail: string;
  /** parse hatasının formüldeki konumu (yoksa -1). */
  pos: number;
  /** parse hatasında sorunlu parça (bilinmeyen fonksiyon adı, beklenmeyen karakter…). */
  arg: string;
}

export interface AutoValuePlan {
  /** Hatasız kurallar, bağımlılık sırasında (önce bağımlı olunan). */
  rules: AutoValueRule[];
  byColumn: Map<string, AutoValueRule>;
  issues: RuleIssue[];
  /** Kolon adı → veri tipi (formül alanlarını tiplemek için). */
  types: Map<string, string>;
}

/** Formülün hedefi olamayacak tipler. */
const NON_TARGET_TYPES = new Set(['image', 'file']);
const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'lookup']);
const REAL_TYPES = new Set(['decimal', 'double', 'float']);

export const EMPTY_PLAN: AutoValuePlan = { rules: [], byColumn: new Map(), issues: [], types: new Map() };

/**
 * Kolonların kurallarını doğrular ve bağımlılık sırasına dizer. Hatalı kurallar
 * `issues`'a düşer ve plandan çıkarılır (formu kilitlemez, yalnız çalışmaz).
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

  // SEQ kolonuna bağımlı kural: numara kayıt anında (sunucuda, en son) verilir,
  // bağımlısı onu hiçbir zaman göremez.
  for (const rule of [...candidates.values()]) {
    const seqRef = rule.refs.find(r => candidates.get(r)?.usesSequence && r !== rule.column);
    if (seqRef) { issue(rule.column, 'sequenceRef', seqRef); candidates.delete(rule.column); }
  }

  // Topolojik sıra + döngü tespiti (DFS). Döngüdeki kurallar plandan çıkar.
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

// ─── Değer dönüşümleri ──────────────────────────────────────────────────────

/** Form/kayıt değerini kolon tipine göre formül değerine çevirir. Boş → null. */
export function toTypedValue(raw: unknown, dataType: string): Value {
  if (raw === undefined || raw === null || raw === '') return null;
  // Dosya içeriği istemcide base64, sunucuda byte[] — aynı değeri üretemezler; formülde boş sayılır.
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
 * Formül sonucunu hedef kolonun KANONİK değerine çevirir — sunucu da aynı değeri yazar.
 * Tam sayılar yuvarlanır, ondalıklar 10 haneye indirilir, tarihler ISO metne döner.
 * Çevrilemeyen sonuç (ör. sayı kolonuna "abc") null olur.
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
 * Tek bir kuralı verilen alan değerleriyle hesaplar ve kanonik değer döndürür.
 * Formül alan kullanıyor ve bunların HEPSİ boşsa sonuç boştur — boş bir formda
 * "Net Gelir = 0" gibi yanıltıcı değerler belirmesin diye.
 * Çalışma hatası (sıfıra bölme vb.) → null. `sequencePending` yukarı fırlatılır.
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

// ─── İstemci aşamaları ──────────────────────────────────────────────────────

export type AutoValuePhase = 'open' | 'change' | 'save';

export interface ComputeOptions {
  phase: AutoValuePhase;
  isNew: boolean;
  /** `change` aşamasında kullanıcının değiştirdiği kolonlar. */
  changed?: Iterable<string>;
  now: DateValue;
}

export interface ComputeResult {
  /** Kolon → forma yazılacak değer (yalnız değişenler). */
  patch: Record<string, unknown>;
  /** Numarası kayıtta verilecek (SEQ) kolonlar. */
  pending: string[];
}

/**
 * Bir aşamada çalışması gereken kuralları uygular.
 *
 *   open   (yeni kayıt) create + change → hedef boşsa ya da salt okunursa
 *   change  change → formülündeki bir alan (zincirleme dahil) değiştiyse
 *   save    save + salt okunur change
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
      pending.push(rule.column);            // SEQ — sunucu verecek
      continue;
    }

    const formValue = value ?? (rule.dataType === 'boolean' ? false : '');
    if (!sameFormValue(current[rule.column], formValue)) {
      current[rule.column] = formValue;
      patch[rule.column] = formValue;
      dirty.add(rule.column);               // zincir: buna bağlı kurallar da yeniden hesaplanır
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
