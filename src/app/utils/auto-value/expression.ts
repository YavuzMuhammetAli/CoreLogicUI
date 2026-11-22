/**
 * Auto-value formula language — parser + evaluator (pure, independent of DOM/Angular).
 *
 * ⚠️ It has an exact twin in the backend: `Business/Concrete/Dynamic/AutoValue/AutoValueExpression.cs`.
 * The server recomputes the SAME formula on save; if the two sides produce different results
 * the user sees one value on screen and finds another in the record. Every edit that changes behaviour
 * must be made to both files together and a vector added to `auto-value.vectors.json` (its backend
 * copy is `Tests/Business.Tests/AutoValue/auto-value.vectors.json`).
 *
 * Syntax (Excel-like, small):
 *   field        [ColumnName]
 *   literal      12  12.5  'text'  "text"  TRUE  FALSE  NULL
 *   arithmetic   + - * / %   (unary -)
 *   concatenate  &
 *   comparison   = != <> < <= > >=
 *   logical      AND  OR  NOT
 *   function     IF COALESCE MIN MAX ROUND ABS CONCAT UPPER LOWER TRIM LEFT RIGHT LEN
 *                TODAY NOW FORMAT_DATE ADD_DAYS SEQ
 *
 * Semantic rules (same on both sides):
 *   - An empty field counts as 0 in arithmetic and '' in text.
 *   - Division by zero / arithmetic with non-numeric text → runtime error; the rule result stays empty.
 *   - Numbers are doubles; floating-point noise is dropped by rounding to 10 decimals when converting to text.
 *   - Rounding is "half away from zero" and done by hand WITHOUT Math.round/Math.Round
 *     (see `roundAway`) — the two languages' library rounding behaves differently.
 */

// ─── Value types ────────────────────────────────────────────────────────────

/**
 * A date(/time) without a time zone. `ms` is the wall-clock time read as if it were UTC
 * — so formatting and adding days never touch the browser's local time zone.
 */
export class DateValue {
  constructor(readonly ms: number, readonly hasTime: boolean) {}
}

export type Value = number | string | boolean | DateValue | null;

// ─── Errors ─────────────────────────────────────────────────────────────────

export type ExpressionErrorCode =
  | 'empty' | 'tooLong' | 'tooDeep'
  | 'unterminatedString' | 'unterminatedField' | 'emptyField'
  | 'unexpectedChar' | 'unexpectedToken' | 'unexpectedEnd'
  | 'unknownFunction' | 'argCount' | 'bareIdentifier'
  // runtime
  | 'notNumber' | 'notDate' | 'divideByZero' | 'overflow' | 'argRange' | 'unknownField'
  | 'sequencePending';

export class ExpressionError extends Error {
  constructor(
    readonly code: ExpressionErrorCode,
    readonly pos: number = -1,
    readonly detail: string = ''
  ) {
    super(`${code}${detail ? ': ' + detail : ''}${pos >= 0 ? ' @' + pos : ''}`);
  }
}

// ─── AST ────────────────────────────────────────────────────────────────────

export type ExprNode =
  | { t: 'lit'; v: Value }
  | { t: 'field'; name: string }
  | { t: 'unary'; op: '-' | '+' | 'NOT'; a: ExprNode }
  | { t: 'bin'; op: string; a: ExprNode; b: ExprNode }
  | { t: 'call'; fn: string; args: ExprNode[] };

export const MAX_EXPRESSION_LENGTH = 1000;
const MAX_DEPTH = 64;

/** Function name → [min, max] arguments. */
export const FUNCTIONS: Readonly<Record<string, readonly [number, number]>> = {
  IF: [2, 3],
  COALESCE: [1, Infinity],
  MIN: [1, Infinity],
  MAX: [1, Infinity],
  ROUND: [1, 2],
  ABS: [1, 1],
  CONCAT: [1, Infinity],
  UPPER: [1, 1],
  LOWER: [1, 1],
  TRIM: [1, 1],
  LEFT: [2, 2],
  RIGHT: [2, 2],
  LEN: [1, 1],
  TODAY: [0, 1],
  NOW: [0, 1],
  FORMAT_DATE: [2, 2],
  ADD_DAYS: [2, 2],
  SEQ: [1, 2]
};

// ─── Tokenizer ──────────────────────────────────────────────────────────────

type TokKind = 'num' | 'str' | 'field' | 'ident' | 'op' | '(' | ')' | ',' | 'eof';
interface Token { kind: TokKind; value: string; pos: number; }

const TWO_CHAR_OPS = new Set(['<=', '>=', '!=', '<>']);
const ONE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '&', '=', '<', '>']);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') { i++; continue; }

    const start = i;
    if (ch >= '0' && ch <= '9') {
      while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      if (src[i] === '.' && src[i + 1] >= '0' && src[i + 1] <= '9') {
        i++;
        while (i < src.length && src[i] >= '0' && src[i] <= '9') i++;
      }
      tokens.push({ kind: 'num', value: src.slice(start, i), pos: start });
      continue;
    }
    if (ch === '\'' || ch === '"') {
      // A quote inside quotes is written twice ('Ali''nin'). No backslash escaping.
      let text = '';
      i++;
      for (;;) {
        if (i >= src.length) throw new ExpressionError('unterminatedString', start);
        if (src[i] === ch) {
          if (src[i + 1] === ch) { text += ch; i += 2; continue; }
          i++;
          break;
        }
        text += src[i++];
      }
      tokens.push({ kind: 'str', value: text, pos: start });
      continue;
    }
    if (ch === '[') {
      const end = src.indexOf(']', i + 1);
      if (end < 0) throw new ExpressionError('unterminatedField', start);
      const name = trimText(src.slice(i + 1, end));
      if (!name) throw new ExpressionError('emptyField', start);
      tokens.push({ kind: 'field', value: name, pos: start });
      i = end + 1;
      continue;
    }
    if (isIdentStart(ch)) {
      while (i < src.length && isIdentPart(src[i])) i++;
      tokens.push({ kind: 'ident', value: src.slice(start, i), pos: start });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) { tokens.push({ kind: 'op', value: two, pos: start }); i += 2; continue; }
    if (ONE_CHAR_OPS.has(ch)) { tokens.push({ kind: 'op', value: ch, pos: start }); i++; continue; }
    if (ch === '(' || ch === ')' || ch === ',') { tokens.push({ kind: ch, value: ch, pos: start }); i++; continue; }

    throw new ExpressionError('unexpectedChar', start, ch);
  }
  tokens.push({ kind: 'eof', value: '', pos: src.length });
  return tokens;
}

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
}
function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9');
}

// ─── Parser (precedence: OR < AND < NOT < comparison < & < + - < * / % < unary) ──

class Parser {
  private i = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): ExprNode {
    const node = this.or();
    const t = this.peek();
    if (t.kind !== 'eof') throw new ExpressionError('unexpectedToken', t.pos, t.value);
    return node;
  }

  private peek(): Token { return this.tokens[this.i]; }
  private next(): Token { return this.tokens[this.i++]; }
  private isKeyword(word: string): boolean {
    const t = this.peek();
    return t.kind === 'ident' && t.value.toUpperCase() === word;
  }
  private isOp(...ops: string[]): boolean {
    const t = this.peek();
    return t.kind === 'op' && ops.includes(t.value);
  }

  private enter(pos: number): void {
    // Deep recursion crashes the process on the server (StackOverflow cannot be caught) — same limit on both sides.
    if (++this.depth > MAX_DEPTH) throw new ExpressionError('tooDeep', pos);
  }
  private leave(): void { this.depth--; }

  private or(): ExprNode {
    let a = this.and();
    while (this.isKeyword('OR')) { this.next(); a = { t: 'bin', op: 'OR', a, b: this.and() }; }
    return a;
  }
  private and(): ExprNode {
    let a = this.not();
    while (this.isKeyword('AND')) { this.next(); a = { t: 'bin', op: 'AND', a, b: this.not() }; }
    return a;
  }
  private not(): ExprNode {
    if (this.isKeyword('NOT')) {
      const t = this.next();
      this.enter(t.pos);
      const a = this.not();
      this.leave();
      return { t: 'unary', op: 'NOT', a };
    }
    return this.cmp();
  }
  private cmp(): ExprNode {
    let a = this.concat();
    while (this.isOp('=', '!=', '<>', '<', '<=', '>', '>=')) {
      const op = this.next().value;
      a = { t: 'bin', op: op === '<>' ? '!=' : op, a, b: this.concat() };
    }
    return a;
  }
  private concat(): ExprNode {
    let a = this.add();
    while (this.isOp('&')) { this.next(); a = { t: 'bin', op: '&', a, b: this.add() }; }
    return a;
  }
  private add(): ExprNode {
    let a = this.mul();
    while (this.isOp('+', '-')) { const op = this.next().value; a = { t: 'bin', op, a, b: this.mul() }; }
    return a;
  }
  private mul(): ExprNode {
    let a = this.unary();
    while (this.isOp('*', '/', '%')) { const op = this.next().value; a = { t: 'bin', op, a, b: this.unary() }; }
    return a;
  }
  private unary(): ExprNode {
    if (this.isOp('-', '+')) {
      const t = this.next();
      this.enter(t.pos);
      const a = this.unary();
      this.leave();
      return { t: 'unary', op: t.value as '-' | '+', a };
    }
    return this.primary();
  }
  private primary(): ExprNode {
    const t = this.next();
    switch (t.kind) {
      case 'num': return { t: 'lit', v: parseFloat(t.value) };
      case 'str': return { t: 'lit', v: t.value };
      case 'field': return { t: 'field', name: t.value };
      case '(': {
        this.enter(t.pos);
        const inner = this.or();
        this.leave();
        this.expect(')');
        return inner;
      }
      case 'ident': {
        const upper = t.value.toUpperCase();
        if (upper === 'TRUE') return { t: 'lit', v: true };
        if (upper === 'FALSE') return { t: 'lit', v: false };
        if (upper === 'NULL') return { t: 'lit', v: null };
        if (this.peek().kind !== '(') throw new ExpressionError('bareIdentifier', t.pos, t.value);
        const arity = FUNCTIONS[upper];
        if (!arity) throw new ExpressionError('unknownFunction', t.pos, t.value);
        this.next(); // (
        this.enter(t.pos);
        const args: ExprNode[] = [];
        if (this.peek().kind !== ')') {
          args.push(this.or());
          while (this.peek().kind === ',') { this.next(); args.push(this.or()); }
        }
        this.leave();
        this.expect(')');
        if (args.length < arity[0] || args.length > arity[1]) {
          throw new ExpressionError('argCount', t.pos, upper);
        }
        return { t: 'call', fn: upper, args };
      }
      case 'eof': throw new ExpressionError('unexpectedEnd', t.pos);
      default: throw new ExpressionError('unexpectedToken', t.pos, t.value);
    }
  }
  private expect(kind: TokKind): void {
    const t = this.next();
    if (t.kind === kind) return;
    if (t.kind === 'eof') throw new ExpressionError('unexpectedEnd', t.pos);
    throw new ExpressionError('unexpectedToken', t.pos, t.value);
  }
}

const astCache = new Map<string, ExprNode>();

/** Parses the formula (cached). Throws `ExpressionError` if invalid. */
export function parseExpression(src: string): ExprNode {
  const cached = astCache.get(src);
  if (cached) return cached;
  if (!trimText(src)) throw new ExpressionError('empty', 0);
  if (src.length > MAX_EXPRESSION_LENGTH) throw new ExpressionError('tooLong', MAX_EXPRESSION_LENGTH);
  const ast = new Parser(tokenize(src)).parse();
  if (astCache.size > 500) astCache.clear();
  astCache.set(src, ast);
  return ast;
}

/** Field names used in the formula — as written, deduplicated. */
export function referencedFields(ast: ExprNode): string[] {
  const out = new Set<string>();
  walk(ast, n => { if (n.t === 'field') out.add(n.name); });
  return [...out];
}

/** Whether the formula uses SEQ() — the number is assigned only on the server, at save time. */
export function usesSequence(ast: ExprNode): boolean {
  let found = false;
  walk(ast, n => { if (n.t === 'call' && n.fn === 'SEQ') found = true; });
  return found;
}

function walk(n: ExprNode, visit: (n: ExprNode) => void): void {
  visit(n);
  if (n.t === 'unary') walk(n.a, visit);
  else if (n.t === 'bin') { walk(n.a, visit); walk(n.b, visit); }
  else if (n.t === 'call') n.args.forEach(a => walk(a, visit));
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

export interface EvalContext {
  /** Field value (typed). Must throw `ExpressionError('unknownField')` for an unknown field. */
  field(name: string): Value;
  /** "Now" for TODAY/NOW (wall-clock time). */
  now: DateValue;
  /** SEQ(scope) → the next number. If absent (client), SEQ throws `sequencePending`. */
  sequence?: (scope: string) => number;
}

export function evaluate(ast: ExprNode, ctx: EvalContext): Value {
  const v = ev(ast, ctx);
  return typeof v === 'number' ? normalizeZero(v) : v;
}

function ev(n: ExprNode, ctx: EvalContext): Value {
  switch (n.t) {
    case 'lit': return n.v;
    case 'field': return ctx.field(n.name);
    case 'unary': {
      if (n.op === 'NOT') return !toBool(ev(n.a, ctx));
      const x = toNumber(ev(n.a, ctx));
      return n.op === '-' ? -x : x;
    }
    case 'bin': return binary(n.op, n.a, n.b, ctx);
    case 'call': return call(n.fn, n.args, ctx);
  }
}

function binary(op: string, an: ExprNode, bn: ExprNode, ctx: EvalContext): Value {
  if (op === 'AND') return toBool(ev(an, ctx)) && toBool(ev(bn, ctx));
  if (op === 'OR') return toBool(ev(an, ctx)) || toBool(ev(bn, ctx));

  const a = ev(an, ctx);
  const b = ev(bn, ctx);
  switch (op) {
    case '&': return toText(a) + toText(b);
    case '+': return finite(toNumber(a) + toNumber(b));
    case '-': return finite(toNumber(a) - toNumber(b));
    case '*': return finite(toNumber(a) * toNumber(b));
    case '/': {
      const d = toNumber(b);
      if (d === 0) throw new ExpressionError('divideByZero');
      return finite(toNumber(a) / d);
    }
    case '%': {
      const d = toNumber(b);
      if (d === 0) throw new ExpressionError('divideByZero');
      return finite(toNumber(a) % d);
    }
    default: {
      const c = compare(a, b);
      switch (op) {
        case '=': return c === 0;
        case '!=': return c !== 0;
        case '<': return c !== null && c < 0;
        case '<=': return c !== null && c <= 0;
        case '>': return c !== null && c > 0;
        case '>=': return c !== null && c >= 0;
      }
      throw new ExpressionError('unexpectedToken', -1, op);
    }
  }
}

function call(fn: string, args: ExprNode[], ctx: EvalContext): Value {
  const arg = (i: number): Value => ev(args[i], ctx);
  switch (fn) {
    case 'IF':
      return toBool(arg(0)) ? arg(1) : (args.length > 2 ? arg(2) : null);
    case 'COALESCE':
      for (let i = 0; i < args.length; i++) {
        const v = arg(i);
        if (!isBlank(v)) return v;
      }
      return null;
    case 'MIN':
    case 'MAX': {
      let result: number | null = null;
      for (let i = 0; i < args.length; i++) {
        const v = arg(i);
        if (isBlank(v)) continue;             // Like Excel: blanks are ignored
        const x = toNumber(v);
        if (result === null || (fn === 'MIN' ? x < result : x > result)) result = x;
      }
      return result;
    }
    case 'ROUND': {
      const digits = args.length > 1 ? toInt(arg(1)) : 0;
      if (digits < 0 || digits > 10) throw new ExpressionError('argRange', -1, 'ROUND');
      return roundAway(toNumber(arg(0)), digits);
    }
    case 'ABS': return Math.abs(toNumber(arg(0)));
    case 'CONCAT': {
      let s = '';
      for (let i = 0; i < args.length; i++) s += toText(arg(i));
      return s;
    }
    case 'UPPER': return toText(arg(0)).toUpperCase();
    case 'LOWER': return toText(arg(0)).toLowerCase();
    case 'TRIM': return trimText(toText(arg(0)));
    case 'LEFT':
    case 'RIGHT': {
      const s = toText(arg(0));
      const count = toInt(arg(1));
      if (count < 0) throw new ExpressionError('argRange', -1, fn);
      if (count >= s.length) return s;
      return fn === 'LEFT' ? s.substring(0, count) : s.substring(s.length - count);
    }
    case 'LEN': return toText(arg(0)).length;
    case 'TODAY':
    case 'NOW': {
      const d = fn === 'TODAY' ? dateOnly(ctx.now) : ctx.now;
      return args.length > 0 ? formatDate(d, toText(arg(0))) : d;
    }
    case 'FORMAT_DATE': {
      const v = arg(0);
      if (isBlank(v)) return null;
      return formatDate(toDate(v), toText(arg(1)));
    }
    case 'ADD_DAYS': {
      const v = arg(0);
      if (isBlank(v)) return null;
      const d = toDate(v);
      return new DateValue(d.ms + toInt(arg(1)) * 86_400_000, d.hasTime);
    }
    case 'SEQ': {
      const width = toInt(arg(0));
      if (width < 1 || width > 12) throw new ExpressionError('argRange', -1, 'SEQ');
      const scope = args.length > 1 ? toText(arg(1)) : '';
      if (scope.length > 100) throw new ExpressionError('argRange', -1, 'SEQ');
      if (!ctx.sequence) throw new ExpressionError('sequencePending');
      return String(ctx.sequence(scope)).padStart(width, '0');
    }
  }
  throw new ExpressionError('unknownFunction', -1, fn);
}

// ─── Conversions (must be IDENTICAL to the backend twin) ────────────────────

export function isBlank(v: Value): boolean {
  return v === null || v === '';
}

const NUMBER_TEXT = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** Converts text to a number; the decimal separator is a dot or comma (NO thousands separator). */
export function parseNumberText(s: string): number | null {
  const t = trimText(s);
  if (t === '') return null;
  if (!NUMBER_TEXT.test(t)) return null;
  return parseFloat(t.replace(',', '.'));
}

export function toNumber(v: Value): number {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') {
    if (trimText(v) === '') return 0;
    const n = parseNumberText(v);
    if (n === null) throw new ExpressionError('notNumber', -1, v);
    return n;
  }
  throw new ExpressionError('notNumber', -1, 'date');
}

function toInt(v: Value): number {
  return Math.trunc(toNumber(v));
}

export function toBool(v: Value): boolean {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const t = trimText(v).toLowerCase();
    return t !== '' && t !== 'false' && t !== '0';
  }
  return true;
}

export function toText(v: Value): string {
  if (v === null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return formatNumber(v);
  return formatDate(v, v.hasTime ? 'yyyy-MM-ddTHH:mm:ss' : 'yyyy-MM-dd');
}

/**
 * Converts a number to culture-independent text. The digits come from the shortest round-trip
 * representation (`String(n)` ≡ C# `ToString("R")` — both produce the same digits), but
 * their exponent notation differs (1e-7 ↔ 1E-07); so exponent notation is expanded by hand
 * into a plain decimal. `toFixed` is not used: it prints binary noise (1234567.8910000001).
 */
export function formatNumber(n: number): string {
  const x = normalizeZero(roundAway(n, 10));
  if (Number.isInteger(x) && Math.abs(x) >= 2 ** 53) return BigInt(x).toString();
  return expandExponent(String(x));
}

/** '1.5e-7' / '1.5E-07' / '1e+21' → plain decimal text. */
export function expandExponent(s: string): string {
  const m = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(s);
  if (!m) return s;
  const [, sign, intPart, frac = '', expText] = m;
  const digits = intPart + frac;
  const point = intPart.length + parseInt(expText, 10);
  let out: string;
  if (point <= 0) out = '0.' + '0'.repeat(-point) + digits;
  else if (point >= digits.length) out = digits + '0'.repeat(point - digits.length);
  else out = digits.slice(0, point) + '.' + digits.slice(point);
  out = out.replace(/^0+(?=\d)/, '');
  if (out.includes('.')) out = out.replace(/0+$/, '').replace(/\.$/, '');
  return sign + out;
}

const POW10 = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10];

/**
 * Rounds halves away from zero. The `+1e-9` margin prevents values like 1.005, stored in binary
 * as 1.00499999…, from rounding down.
 * Only basic IEEE operations are used → bit-for-bit the same result as the C# side.
 */
export function roundAway(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const p = POW10[digits];
  const a = Math.abs(x) * p;
  if (a >= 2 ** 52) return x;               // already at integer precision
  const r = Math.floor(a + 0.5 + 1e-9) / p;
  return r === 0 ? 0 : (x < 0 ? -r : r);
}

function normalizeZero(n: number): number {
  return n === 0 ? 0 : n;                    // -0 → 0
}

function finite(n: number): number {
  if (!Number.isFinite(n)) throw new ExpressionError('overflow');
  return n;
}

/** Only ASCII/Latin whitespace — the Unicode sets of `String.trim` and .NET `Trim` differ. */
function trimText(s: string): string {
  return s.replace(/^[ \t\r\n ]+|[ \t\r\n ]+$/g, '');
}

/** Comparison: -1/0/1, null if not comparable. */
export function compare(a: Value, b: Value): number | null {
  if (a === null && b === null) return 0;

  if (a instanceof DateValue || b instanceof DateValue) {
    if (a instanceof DateValue && b instanceof DateValue) return Math.sign(a.ms - b.ms);
    return null;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    if ((typeof a === 'boolean' || a === null) && (typeof b === 'boolean' || b === null)) {
      return Math.sign((a ? 1 : 0) - (b ? 1 : 0));
    }
    return null;
  }
  if (typeof a === 'number' || typeof b === 'number') {
    const x = numberOrNull(a);
    const y = numberOrNull(b);
    if (x !== null && y !== null) return Math.sign(x - y);
  }
  const s = toText(a).toLowerCase();
  const t = toText(b).toLowerCase();
  return s < t ? -1 : s > t ? 1 : 0;
}

function numberOrNull(v: Value): number | null {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return trimText(v) === '' ? 0 : parseNumberText(v);
  return null;
}

// ─── Date helpers ───────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm(:ss)' → DateValue; null if it cannot be parsed. */
export function parseIsoDate(s: string): DateValue | null {
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const hasTime = m[4] !== undefined;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], hasTime ? +m[4] : 0, hasTime ? +m[5] : 0, m[6] ? +m[6] : 0);
  return new DateValue(ms, hasTime);
}

function toDate(v: Value): DateValue {
  if (v instanceof DateValue) return v;
  if (typeof v === 'string') {
    const d = parseIsoDate(v);
    if (d) return d;
  }
  throw new ExpressionError('notDate', -1, toText(v));
}

function dateOnly(d: DateValue): DateValue {
  return new DateValue(d.ms - (((d.ms % 86_400_000) + 86_400_000) % 86_400_000), false);
}

/** Supported tokens: yyyy yy MM dd HH mm ss — every other character is written as is. */
export function formatDate(d: DateValue, fmt: string): string {
  const date = new Date(d.ms);
  const parts: Record<string, string> = {
    yyyy: String(date.getUTCFullYear()).padStart(4, '0'),
    yy: String(date.getUTCFullYear() % 100).padStart(2, '0'),
    MM: String(date.getUTCMonth() + 1).padStart(2, '0'),
    dd: String(date.getUTCDate()).padStart(2, '0'),
    HH: String(date.getUTCHours()).padStart(2, '0'),
    mm: String(date.getUTCMinutes()).padStart(2, '0'),
    ss: String(date.getUTCSeconds()).padStart(2, '0')
  };
  let out = '';
  let i = 0;
  while (i < fmt.length) {
    const token = ['yyyy', 'yy', 'MM', 'dd', 'HH', 'mm', 'ss'].find(k => fmt.startsWith(k, i));
    if (token) { out += parts[token]; i += token.length; }
    else out += fmt[i++];
  }
  return out;
}

/** The browser's local wall-clock time — "now" for the client preview. */
export function clientNow(): DateValue {
  const d = new Date();
  return new DateValue(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()),
    true);
}
