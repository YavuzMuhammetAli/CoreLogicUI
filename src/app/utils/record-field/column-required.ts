import { PublishedColumn } from '../../services/published-model.service';
import { PublishedColumnSchema } from '../../services/published-table.service';

/**
 * Is the column required — the SINGLE decision point in the form.
 *
 * If a schema rule (`/PublishedModel/schema` → `isRequired`) exists, it wins. Otherwise it falls back to
 * the compiled type's `isNullable`; but that is only meaningful for value types: since backend
 * `CoreLogicTypeMap.IsNullable` returns `true` for every REFERENCE type (string, image, file),
 * a required text column appears as `isNullable=true`. The visibility decision used to
 * look directly at `!isNullable`; a required text field could be hidden via the "Kolonlar" (Columns)
 * setting, and Save silently bailed out because of the `required` error on the hidden field.
 */
export function isColumnRequired(
  col: Pick<PublishedColumn, 'isNullable'>,
  rule: Pick<PublishedColumnSchema, 'isRequired'> | undefined
): boolean {
  return rule ? rule.isRequired : col.isNullable === false;
}

/**
 * Must the column stay visible in the form.
 *
 * If a required column is hidden the form stays invalid and the user cannot see what to fill
 * in. Exception: read-only auto-value columns whose value is produced on the server —
 * `AutoValueFormBinding` `disable`s them, a disabled control is never considered invalid
 * and the server writes the value itself. Same as the `readOnly` decision in `auto-value.ts`:
 * the "on save" trigger, a formula using SEQ(), or the column's `isReadOnly`.
 */
export function mustStayVisible(
  col: Pick<PublishedColumn, 'isNullable'>,
  rule: PublishedColumnSchema | undefined
): boolean {
  if (!isColumnRequired(col, rule)) return false;
  return !isServerFilledAutoValue(rule);
}

/** Whether the rule is a read-only auto value whose value is written on the server. */
export function isServerFilledAutoValue(rule: PublishedColumnSchema | undefined): boolean {
  const trigger = rule?.autoValueTrigger;
  const expression = rule?.autoValueExpression?.trim();
  if (!trigger || !expression) return false;
  return trigger === 'save' || !!rule?.isReadOnly || SEQ_CALL.test(expression);
}

const SEQ_CALL = /\bSEQ\s*\(/i;
