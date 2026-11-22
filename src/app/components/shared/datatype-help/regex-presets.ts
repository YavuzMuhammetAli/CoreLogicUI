/**
 * Ready-made pattern library and syntax table shown in the regex guide.
 *
 * These patterns are written straight into the column's `regex` field when the user presses
 * "Kullan" (Use); `messageKey` also fills the `regexMessage` field if it is empty.
 * The patterns are kept simple so they also work with C# `Regex` on the backend —
 * engine-specific features like lookbehind/named groups aren't used.
 */

export interface RegexPreset {
  /** i18n key suffix: `help.regex.preset.<key>` and `...<key>Message`. */
  key: string;
  /** The pattern itself — this string is written to the form. */
  pattern: string;
  /** Sample value that MATCHES the pattern (written automatically into the live test). */
  sampleOk: string;
  /** Sample value that does NOT match the pattern. */
  sampleFail: string;
}

export const REGEX_PRESETS: RegexPreset[] = [
  {
    key: 'email',
    pattern: '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$',
    sampleOk: 'ali@ornek.com',
    sampleFail: 'ali@ornek'
  },
  {
    key: 'mobilePhone',
    pattern: '^(05)[0-9]{9}$',
    sampleOk: '05321234567',
    sampleFail: '5321234567'
  },
  {
    key: 'landlinePhone',
    pattern: '^(0)[2-4][0-9]{9}$',
    sampleOk: '02121234567',
    sampleFail: '0212123456'
  },
  {
    key: 'tckn',
    pattern: '^[1-9][0-9]{10}$',
    sampleOk: '12345678950',
    sampleFail: '01234567895'
  },
  {
    key: 'taxNumber',
    pattern: '^[0-9]{10}$',
    sampleOk: '1234567890',
    sampleFail: '123456789'
  },
  {
    key: 'iban',
    pattern: '^TR[0-9]{24}$',
    sampleOk: 'TR330006100519786457841326',
    sampleFail: 'TR3300061005197864'
  },
  {
    key: 'plate',
    pattern: '^[0-9]{2}[A-Z]{1,3}[0-9]{2,4}$',
    sampleOk: '34ABC123',
    sampleFail: '34-abc-123'
  },
  {
    key: 'postalCode',
    pattern: '^[0-9]{5}$',
    sampleOk: '34710',
    sampleFail: '3471'
  },
  {
    key: 'url',
    pattern: '^https?://[^\\s/$.?#].[^\\s]*$',
    sampleOk: 'https://corelogic.com/urunler',
    sampleFail: 'corelogic.com'
  },
  {
    key: 'slug',
    pattern: '^[a-z0-9]+(-[a-z0-9]+)*$',
    sampleOk: 'yeni-urun-2026',
    sampleFail: 'Yeni Urun'
  },
  {
    key: 'lettersOnly',
    pattern: '^[A-Za-zÇĞİÖŞÜçğıöşü ]+$',
    sampleOk: 'Ali Yavuz',
    sampleFail: 'Ali 123'
  },
  {
    key: 'startsUpper',
    pattern: '^[A-ZÇĞİÖŞÜ].*$',
    sampleOk: 'Ürün adı',
    sampleFail: 'ürün adı'
  },
  {
    key: 'dateDmy',
    pattern: '^(0[1-9]|[12][0-9]|3[01])\\.(0[1-9]|1[0-2])\\.[0-9]{4}$',
    sampleOk: '01.08.2026',
    sampleFail: '1.8.2026'
  },
  {
    key: 'positiveInt',
    pattern: '^[1-9][0-9]*$',
    sampleOk: '1250',
    sampleFail: '0125'
  },
  {
    key: 'productCode',
    pattern: '^[A-Z]{2,4}-[0-9]{3,6}$',
    sampleOk: 'URN-004512',
    sampleFail: 'urn-4512'
  },
  {
    key: 'noWhitespace',
    pattern: '^\\S+$',
    sampleOk: 'kullanici_adi',
    sampleFail: 'kullanici adi'
  }
];

/** Syntax table row — described by the `help.regex.syntax.<key>` key. */
export interface RegexSyntaxRow {
  key: string;
  token: string;
}

export const REGEX_SYNTAX: RegexSyntaxRow[] = [
  { key: 'caret',      token: '^' },
  { key: 'dollar',     token: '$' },
  { key: 'dot',        token: '.' },
  { key: 'digit',      token: '\\d' },
  { key: 'nonDigit',   token: '\\D' },
  { key: 'word',       token: '\\w' },
  { key: 'space',      token: '\\s' },
  { key: 'nonSpace',   token: '\\S' },
  { key: 'set',        token: '[abc]' },
  { key: 'negSet',     token: '[^abc]' },
  { key: 'range',      token: '[a-z]' },
  { key: 'plus',       token: '+' },
  { key: 'star',       token: '*' },
  { key: 'question',   token: '?' },
  { key: 'exactly',    token: '{3}' },
  { key: 'between',    token: '{2,5}' },
  { key: 'atLeast',    token: '{2,}' },
  { key: 'alternate',  token: 'a|b' },
  { key: 'group',      token: '(abc)' },
  { key: 'escape',     token: '\\.' }
];

/**
 * Longest pattern/value accepted by the live test box.
 *
 * Since the user's pattern runs in the browser on every keystroke,
 * catastrophic backtracking (ReDoS) can freeze the tab. Full isolation would
 * require a Web Worker + timeout; for this guide a length limit is a sufficient
 * and proportionate guard.
 */
export const REGEX_LAB_MAX_LENGTH = 200;
