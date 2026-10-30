import { isFileType, joinFileGroups, kbToMb, mbToKb, parseFileGroups } from './file-size';
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
    enumValues:          valueListOf(v.dataType, v.enumValues) ?? '',
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

// ── Kayıtlı kolonun meta verisi (updateMemberMetadata) ─────────────────────────

/** Zorunluluğu yalnız çalışma anında denetlenen tipler — derlenen C# tipi değişmez. */
const REQUIRED_RUNTIME_ONLY_TYPES = new Set(['string', 'enum', 'file', 'image']);

/**
 * Zorunluluk derlenen C# tipini değiştirir mi? Değer tiplerinde evet (`int` ⇄ `int?`).
 * Backend `CoreLogicTypeMap.RequiredAffectsClrType`'ın ikizi.
 */
export function requiredAffectsClrType(dataType: string): boolean {
  return !REQUIRED_RUNTIME_ONLY_TYPES.has(dataType);
}

/**
 * Kayıtlı bir kolonun zorunluluğu şu an değiştirilebilir mi? Yayınlanmış modelde değer
 * tipinin zorunluluğu değişirse sonraki yayın NULL değerli satırları okuyamaz hâle getirir —
 * sunucu da reddeder; arayüz kutuyu önceden kilitler.
 */
export function requiredChangeAllowed(dataType: string, modelPublished: boolean): boolean {
  return !modelPublished || !requiredAffectsClrType(dataType);
}

/** POST /Published/updateMemberMetadata gövdesi — TAM değiştirme (boş kural kaldırılır). */
export interface MemberMetadataUpdate {
  typeName: string;
  memberName: string;
  label: string | null;
  description: string | null;
  isRequired: boolean;
  minLength: number | null;
  maxLength: number | null;
  min: number | null;
  max: number | null;
  regex: string | null;
  regexMessage: string | null;
  enumValues: string | null;
  lookupDisplayColumn: string | null;
}

/** Meta verinin karşılaştırılabilir hâli (ad/tip hariç). */
type MemberMetadata = Omit<MemberMetadataUpdate, 'typeName' | 'memberName'>;

/** Kaydetmeye hazır (normalizeColumnRules'tan geçmiş) form sütunu. */
export interface MetadataColumn extends ColumnRuleValue {
  columnName: string;
  isNullable: boolean;
  label?: string | null;
  description?: string | null;
}

const text = (v: string | null | undefined): string | null => (v ?? '').trim() || null;
const num = (v: number | null | undefined): number | null => (v === undefined || v === null || Number.isNaN(v) ? null : v);

/**
 * `enumValues` alanının tipe göre değeri: enum seçenekleri ya da dosyanın izinli tür grupları
 * (bkz. utils/file-size). Taslakta tip değişince kalan eski değer sunucuya gitmesin.
 */
function valueListOf(dataType: string, value: string | null | undefined): string | null {
  if (dataType === 'enum') return enumKey(value);
  return dataType === 'file' ? (joinFileGroups(parseFileGroups(value)) || null) : null;
}

/** "a | b ||a" → "a|b": backend NormalizeEnumValues ile aynı (sıra korunur, yinelenen atılır). */
function enumKey(v: string | null | undefined): string | null {
  const values = [...new Set((v ?? '').split('|').map(s => s.trim()).filter(Boolean))];
  return values.length ? values.join('|') : null;
}

/**
 * Tipe göre ayıklanmış meta veri — backend UpdateMemberMetadata'nın sakladığıyla aynı şekil;
 * böylece kayıtlı şemadan ve formdan üretilen anahtarlar değişiklik yoksa birebir eşleşir.
 */
function memberMetadata(
  dataType: string,
  v: {
    label?: string | null; description?: string | null; isRequired: boolean;
    minLength?: number | null; maxLength?: number | null; min?: number | null; max?: number | null;
    regex?: string | null; regexMessage?: string | null; enumValues?: string | null; lookupDisplayColumn?: string | null;
  }
): MemberMetadata {
  const isText = dataType === 'string';
  const isNumeric = NUMERIC_COLUMN_TYPES.has(dataType);
  return {
    label:               text(v.label),
    description:         text(v.description),
    isRequired:          v.isRequired,
    minLength:           isText ? num(v.minLength) : null,
    maxLength:           isText || isFileType(dataType) ? num(v.maxLength) : null,
    min:                 isNumeric ? num(v.min) : null,
    max:                 isNumeric ? num(v.max) : null,
    regex:               isText ? text(v.regex) : null,
    regexMessage:        isText ? text(v.regexMessage) : null,
    enumValues:          valueListOf(dataType, v.enumValues),
    lookupDisplayColumn: dataType === 'lookup' ? text(v.lookupDisplayColumn) : null
  };
}

/** Formdaki sütundan istek gövdesi. */
export function toMemberMetadataUpdate(typeName: string, c: MetadataColumn): MemberMetadataUpdate {
  return {
    typeName,
    memberName: c.columnName,
    ...memberMetadata(c.dataType, { ...c, isRequired: !c.isNullable })
  };
}

/** Formdaki sütunun meta veri anahtarı — kayıtlı hâliyle karşılaştırıp değişeni bulmak için. */
export function metadataKey(c: MetadataColumn): string {
  return JSON.stringify(memberMetadata(c.dataType, { ...c, isRequired: !c.isNullable }));
}

/** Sunucudan okunan kolonun meta veri anahtarı (getSchema satırı). */
export function schemaMetadataKey(c: {
  dataType: string; isRequired: boolean; label?: string | null; description?: string | null;
  minLength?: number | null; maxLength?: number | null; min?: number | null; max?: number | null;
  regex?: string | null; regexMessage?: string | null; enumValues?: string | null; lookupDisplayColumn?: string | null;
}): string {
  return JSON.stringify(memberMetadata(c.dataType, c));
}
