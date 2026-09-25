import { isFileType, kbToMb, mbToKb } from './file-size';
import { parseExpression, usesSequence } from './auto-value/expression';

/** Sayısal (Min/Max kurallı) tipler. */
export const NUMERIC_COLUMN_TYPES = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

/** Şema ekranındaki sütun formunun kural alanları (model-node sütun FormGroup'u). */
export interface ColumnRuleValue {
  dataType: string;
  minLength?: number | null;
  maxLength?: number | null;
  min?: number | null;
  max?: number | null;
  regex?: string | null;
  regexMessage?: string | null;
  enumValues?: string | null;
  lookupTargetTable?: string | null;
  lookupDisplayColumn?: string | null;
  /** Yalnız formda: image/file boyut sınırı (MB). Saklanan değer `maxLength` (KB). */
  maxFileSizeMb?: number | null;
  /** Otomatik değer kuralı — '' kural yok (bkz. utils/auto-value). */
  autoValueTrigger?: string | null;
  autoValueExpression?: string | null;
  isReadOnly?: boolean | null;
}

/**
 * Sütunun kurallarını tipine göre ayıklar; kaydetmeden hemen önce çağrılır.
 *
 * Form, tip değişince eski tipin kurallarını tutmaya devam eder. Temizlenmezse
 * `maxLength` gibi paylaşılan bir alan anlam değiştirirdi: string'ten dosyaya
 * çevrilen sütunun "100 karakter"i sessizce "100 KB" dosya sınırı olurdu.
 *
 * image/file'da `maxLength` = MB girişinden türetilen KB. MB alanı değişmediyse
 * saklı KB aynen korunur — MB'nin 2 ondalığa yuvarlanması (1000 KB → 0,98 MB →
 * 1004 KB) kayıtlı değeri kaydırmasın.
 */
export function normalizeColumnRules<T extends ColumnRuleValue>(v: T): T & Required<ColumnRuleValue> {
  const isString = v.dataType === 'string';
  const isFile = isFileType(v.dataType);
  const isNumeric = NUMERIC_COLUMN_TYPES.has(v.dataType);

  let maxLength: number | null = null;
  if (isString) {
    maxLength = v.maxLength ?? null;
  } else if (isFile) {
    maxLength = (v.maxFileSizeMb ?? null) === kbToMb(v.maxLength)
      ? (v.maxLength ?? null)
      : mbToKb(v.maxFileSizeMb);
  }

  return {
    ...v,
    minLength:           isString ? (v.minLength ?? null) : null,
    maxLength,
    regex:               isString ? (v.regex ?? '') : '',
    regexMessage:        isString ? (v.regexMessage ?? '') : '',
    min:                 isNumeric ? (v.min ?? null) : null,
    max:                 isNumeric ? (v.max ?? null) : null,
    enumValues:          v.dataType === 'enum' ? (v.enumValues ?? '') : '',
    lookupTargetTable:   v.dataType === 'lookup' ? (v.lookupTargetTable ?? '') : '',
    lookupDisplayColumn: v.dataType === 'lookup' ? (v.lookupDisplayColumn ?? '') : '',
    maxFileSizeMb:       isFile ? kbToMb(maxLength) : null,
    ...normalizeAutoValue(v, isFile)
  };
}

/**
 * Otomatik değer kuralını ayıklar: kural yoksa formül/salt okunur temizlenir (gizli bir
 * formül sessizce saklanmasın); dosya kolonları formül hedefi olamaz. `save` tetiği ve
 * SEQ() her zaman salt okunurdur — değeri kullanıcı değil sistem belirler.
 */
function normalizeAutoValue(v: ColumnRuleValue, isFile: boolean) {
  const trigger = isFile ? '' : (v.autoValueTrigger ?? '').trim();
  const expression = trigger ? (v.autoValueExpression ?? '').trim() : '';
  const forced = trigger === 'save' || expressionUsesSequence(expression);
  return {
    autoValueTrigger: trigger,
    autoValueExpression: expression,
    isReadOnly: trigger ? (forced || !!v.isReadOnly) : false
  };
}

function expressionUsesSequence(expression: string): boolean {
  try {
    return !!expression && usesSequence(parseExpression(expression));
  } catch {
    return false;                     // hatalı formül zaten kaydedilmeden reddedilir
  }
}

/** Kolonun kuralını tek metne indirger — kayıtlı haliyle karşılaştırıp değişeni bulmak için. */
export function autoValueKey(c: Pick<ColumnRuleValue, 'autoValueTrigger' | 'autoValueExpression' | 'isReadOnly'>): string {
  const trigger = (c.autoValueTrigger ?? '').trim();
  return trigger ? `${trigger}|${(c.autoValueExpression ?? '').trim()}|${!!c.isReadOnly}` : '';
}
