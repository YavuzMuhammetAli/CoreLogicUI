import { PublishedColumn } from '../../services/published-model.service';
import { RecordField, RecordWorkflowState } from '../../models/workflow.model';
import { sanitizePayload } from '../model-data/model-data.util';

/**
 * Record screen rules of a form-based workflow — PURE (with spec).
 *
 * The server owns the lock decision (`/WorkflowInstance/recordState` and
 * PublishedModelManager go through the same gate); these functions only apply
 * that decision to the form. Column names are matched case-insensitively on the
 * server, so they are matched that way here too.
 */

type DataRow = Record<string, unknown>;

const lower = (value: string) => value.toLowerCase();

/**
 * Columns to lock (disable) in the form. Empty set when there is no lock or the user
 * can bypass it (admin); otherwise everything EXCEPT the editable columns.
 */
export function lockedColumns(
  columns: PublishedColumn[], state: RecordWorkflowState | null
): Set<string> {
  if (!state?.isLocked || state.canBypass) return new Set();

  const editable = new Set(state.editableColumns.map(lower));
  return new Set(
    columns
      .filter(c => !editable.has(lower(c.columnName)))
      .map(c => c.columnName));
}

/** Whether a value is "empty" — same as the server's required check: null, empty/whitespace text. false is FILLED. */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/** The step's required record fields left empty in the form (by their real form column name). */
export function missingRequired(
  fields: RecordField[], raw: DataRow, columns: PublishedColumn[]
): string[] {
  const byLower = new Map(columns.map(c => [lower(c.columnName), c.columnName]));

  return fields
    .filter(f => f.isRequired)
    .map(f => byLower.get(lower(f.column)) ?? f.column)
    .filter(name => isEmptyValue(raw[name]));
}

/**
 * Record values to send to the server: ONLY the given columns, sanitized by the
 * model types (empty text → null). The partial payload is intentional — the server
 * writes only the keys it receives, other fields are not overwritten.
 */
export function buildRecordValues(
  columnNames: string[], raw: DataRow, columns: PublishedColumn[]
): DataRow {
  const wanted = new Set(columnNames.map(lower));
  const selected = columns.filter(c => wanted.has(lower(c.columnName)));

  const values: DataRow = {};
  for (const column of selected) values[column.columnName] = raw[column.columnName];

  return sanitizePayload(selected, values);
}
