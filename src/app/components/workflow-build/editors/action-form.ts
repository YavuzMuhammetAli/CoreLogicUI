import { WorkflowSetField, WorkflowSetMode, WorkflowStep } from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';

/**
 * Pure helpers of the field update editor. Each returns a COPY of the
 * step — the editor emits the change, the pop-up writes it to the document on Save.
 */

/** Column types the flow cannot write values to (content is base64 on the client) — same as the backend. */
const UNWRITABLE_TYPES: ReadonlySet<string> = new Set(['image', 'file']);

/** Columns offered in the picker: excluding image/file. (The server rejects a read-only auto-value column on publish.) */
export function writableColumns(columns: ReadonlyArray<PublishedColumn>): PublishedColumn[] {
  return columns.filter(column => !UNWRITABLE_TYPES.has(column.dataType));
}

function setsOf(step: WorkflowStep): WorkflowSetField[] {
  return step.sets ?? [];
}

export function addSet(step: WorkflowStep, column: string): WorkflowStep {
  return { ...step, sets: [...setsOf(step), { column, mode: 'value', value: '' }] };
}

export function removeSet(step: WorkflowStep, index: number): WorkflowStep {
  return { ...step, sets: setsOf(step).filter((_, i) => i !== index) };
}

export function updateSet(step: WorkflowStep, index: number, patch: Partial<WorkflowSetField>): WorkflowStep {
  const sets = setsOf(step).slice();
  if (!sets[index]) return step;
  sets[index] = { ...sets[index], ...patch };
  return { ...step, sets };
}

/**
 * Changes the value source. The old value is not carried over: a fixed "Onaylandı" (Approved) is
 * invalid as a formula, and a formula is meaningless as a fixed value.
 */
export function setMode(step: WorkflowStep, index: number, mode: WorkflowSetMode): WorkflowStep {
  const current = setsOf(step)[index];
  if (!current || (current.mode ?? 'value') === mode) return step;
  return updateSet(step, index, { mode, value: mode === 'clear' ? null : '' });
}

/** The type may differ when the column changes — the value is reset (the formula is kept). */
export function setColumn(step: WorkflowStep, index: number, column: string): WorkflowStep {
  const current = setsOf(step)[index];
  if (!current || current.column === column) return step;
  return updateSet(step, index, { column, value: current.mode === 'formula' ? current.value : current.mode === 'clear' ? null : '' });
}

/** Columns written by more than one row (lower case) — the last one would win; shown to the user. */
export function duplicateColumns(step: WorkflowStep): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const set of setsOf(step)) {
    const key = set.column.toLowerCase();
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates;
}
