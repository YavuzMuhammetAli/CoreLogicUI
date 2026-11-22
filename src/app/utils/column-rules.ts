import { isFileType, joinFileGroups, kbToMb, mbToKb, parseFileGroups } from './file-size';
import { parseExpression, usesSequence } from './auto-value/expression';

/** Numeric types (with Min/Max rules). */
export const NUMERIC_COLUMN_TYPES = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

/** Types with length and regex rules: `string` (250 characters) and multi-line `text`. */
export function isTextColumn(dataType: string | null | undefined): boolean {
  return dataType === 'string' || dataType === 'text';
}

/** Rule fields of the column form on the schema screen (model-node column FormGroup). */
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
  /** Form only: image/file size limit (MB). The stored value is `maxLength` (KB). */
  maxFileSizeMb?: number | null;
  /** Auto-value rule — '' means no rule (see utils/auto-value). */
  autoValueTrigger?: string | null;
  autoValueExpression?: string | null;
  isReadOnly?: boolean | null;
}

/**
 * Filters the column's rules by its type; called right before saving.
 *
 * When the type changes the form keeps holding the old type's rules. If not cleared,
 * a shared field such as `maxLength` would change meaning: the "100 characters" of a column
 * changed from string to file would silently become a "100 KB" file limit.
 *
 * For image/file, `maxLength` = KB derived from the MB input. If the MB field did not change
 * the stored KB is kept as is — so rounding MB to 2 decimals (1000 KB → 0.98 MB →
 * 1004 KB) does not shift the saved value.
 */
export function normalizeColumnRules<T extends ColumnRuleValue>(v: T): T & Required<ColumnRuleValue> {
  const isString = isTextColumn(v.dataType);
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
 * Filters the auto-value rule: without a rule the formula/read-only flag are cleared (so a hidden
 * formula is not silently stored); file columns cannot be formula targets. The `save` trigger and
 * SEQ() are always read-only — the system, not the user, determines the value.
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
    return false;                     // an invalid formula is rejected before saving anyway
  }
}

/** Reduces the column's rule to a single string — to compare with the saved one and find changes. */
export function autoValueKey(c: Pick<ColumnRuleValue, 'autoValueTrigger' | 'autoValueExpression' | 'isReadOnly'>): string {
  const trigger = (c.autoValueTrigger ?? '').trim();
  return trigger ? `${trigger}|${(c.autoValueExpression ?? '').trim()}|${!!c.isReadOnly}` : '';
}

// ── Metadata of a saved column (updateMemberMetadata) ─────────────────────────

/** Types whose required-ness is only checked at runtime — the compiled C# type does not change. */
const REQUIRED_RUNTIME_ONLY_TYPES = new Set(['string', 'text', 'enum', 'file', 'image']);

/**
 * Does required-ness change the compiled C# type? Yes for value types (`int` ⇄ `int?`).
 * Twin of backend `CoreLogicTypeMap.RequiredAffectsClrType`.
 */
export function requiredAffectsClrType(dataType: string): boolean {
  return !REQUIRED_RUNTIME_ONLY_TYPES.has(dataType);
}

/**
 * Can a saved column's required-ness be changed right now? On a published model, changing the
 * required-ness of a value type makes rows with NULL values unreadable after the next publish —
 * the server rejects it too; the UI locks the checkbox up front.
 */
export function requiredChangeAllowed(dataType: string, modelPublished: boolean): boolean {
  return !modelPublished || !requiredAffectsClrType(dataType);
}

/** POST /Published/updateMemberMetadata body — FULL replacement (an empty rule is removed). */
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

/** Comparable form of the metadata (excluding name/type). */
type MemberMetadata = Omit<MemberMetadataUpdate, 'typeName' | 'memberName'>;

/** A form column ready to save (passed through normalizeColumnRules). */
export interface MetadataColumn extends ColumnRuleValue {
  columnName: string;
  isNullable: boolean;
  label?: string | null;
  description?: string | null;
}

const text = (v: string | null | undefined): string | null => (v ?? '').trim() || null;
const num = (v: number | null | undefined): number | null => (v === undefined || v === null || Number.isNaN(v) ? null : v);

/**
 * Value of the `enumValues` field by type: enum options or the file's allowed type groups
 * (see utils/file-size). So an old value left over after a type change in a draft is not sent to the server.
 */
function valueListOf(dataType: string, value: string | null | undefined): string | null {
  if (dataType === 'enum') return enumKey(value);
  return dataType === 'file' ? (joinFileGroups(parseFileGroups(value)) || null) : null;
}

/** "a | b ||a" → "a|b": same as backend NormalizeEnumValues (order kept, duplicates dropped). */
function enumKey(v: string | null | undefined): string | null {
  const values = [...new Set((v ?? '').split('|').map(s => s.trim()).filter(Boolean))];
  return values.length ? values.join('|') : null;
}

/**
 * Metadata filtered by type — the same shape backend UpdateMemberMetadata stores;
 * so keys built from the saved schema and from the form match exactly when nothing changed.
 */
function memberMetadata(
  dataType: string,
  v: {
    label?: string | null; description?: string | null; isRequired: boolean;
    minLength?: number | null; maxLength?: number | null; min?: number | null; max?: number | null;
    regex?: string | null; regexMessage?: string | null; enumValues?: string | null; lookupDisplayColumn?: string | null;
  }
): MemberMetadata {
  const isText = isTextColumn(dataType);
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

/** Request body from the form column. */
export function toMemberMetadataUpdate(typeName: string, c: MetadataColumn): MemberMetadataUpdate {
  return {
    typeName,
    memberName: c.columnName,
    ...memberMetadata(c.dataType, { ...c, isRequired: !c.isNullable })
  };
}

/** Metadata key of the form column — to compare with the saved one and find changes. */
export function metadataKey(c: MetadataColumn): string {
  return JSON.stringify(memberMetadata(c.dataType, { ...c, isRequired: !c.isNullable }));
}

/** Metadata key of a column read from the server (a getSchema row). */
export function schemaMetadataKey(c: {
  dataType: string; isRequired: boolean; label?: string | null; description?: string | null;
  minLength?: number | null; maxLength?: number | null; min?: number | null; max?: number | null;
  regex?: string | null; regexMessage?: string | null; enumValues?: string | null; lookupDisplayColumn?: string | null;
}): string {
  return JSON.stringify(memberMetadata(c.dataType, c));
}
