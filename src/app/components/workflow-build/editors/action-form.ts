import { WorkflowSetField, WorkflowSetMode, WorkflowStep } from '../../../models/workflow.model';
import { PublishedColumn } from '../../../services/published-model.service';

/**
 * Alan güncelle düzenleyicisinin saf yardımcıları. Her biri adımın KOPYASINI
 * döner — düzenleyici değişikliği yayar, pop-up Kaydet'te belgeye yazar.
 */

/** Akışın değer yazamayacağı kolon tipleri (içerik istemcide base64) — backend ile aynı. */
const UNWRITABLE_TYPES: ReadonlySet<string> = new Set(['image', 'file']);

/** Seçicide sunulan kolonlar: görsel/dosya hariç. (Salt okunur otomatik değer kolonunu sunucu yayında reddeder.) */
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
 * Değer kaynağını değiştirir. Eski değer taşınmaz: sabit "Onaylandı" formül
 * olarak geçersizdir, formül de sabit değer olarak anlamsızdır.
 */
export function setMode(step: WorkflowStep, index: number, mode: WorkflowSetMode): WorkflowStep {
  const current = setsOf(step)[index];
  if (!current || (current.mode ?? 'value') === mode) return step;
  return updateSet(step, index, { mode, value: mode === 'clear' ? null : '' });
}

/** Kolon değişince tipi farklı olabilir — değer sıfırlanır (formül korunur). */
export function setColumn(step: WorkflowStep, index: number, column: string): WorkflowStep {
  const current = setsOf(step)[index];
  if (!current || current.column === column) return step;
  return updateSet(step, index, { column, value: current.mode === 'formula' ? current.value : current.mode === 'clear' ? null : '' });
}

/** Birden çok satırda yazılan kolonlar (küçük harf) — sonuncu kazanırdı, kullanıcıya gösterilir. */
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
