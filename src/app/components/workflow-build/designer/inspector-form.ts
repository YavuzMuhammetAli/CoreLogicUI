import {
  WorkflowAssignmentMode, WorkflowJoinMode, WorkflowStep
} from '../../../models/workflow.model';
import { ExitKind, ExitPort, exitsOf, sameKey } from '../../../utils/workflow/workflow-exits';
import { KEY_PATTERN } from '../workflow-step.form';

/**
 * Özellik panelinin adım dönüşümleri — SAF. Her biri adımın yeni halini döner;
 * değer değişmiyorsa AYNI nesneyi döner (belge değişmesin, geri al adımı oluşmasın).
 * Panelde karşılığı olmayan alanlar (form alanları, dallar, SLA politikası) korunur.
 */

export function setName(step: WorkflowStep, name: string): WorkflowStep {
  return step.name === name ? step : { ...step, name };
}

/** Atama türü değişince seçili kişi/rol sıfırlanır (rol id'si kullanıcı id'si olamaz). */
export function setAssignmentMode(step: WorkflowStep, mode: WorkflowAssignmentMode): WorkflowStep {
  if (step.assignment?.mode === mode) return step;

  switch (mode) {
    case 'role': return { ...step, assignment: { mode, roleId: null } };
    case 'user': return { ...step, assignment: { mode, userId: null } };
    default:     return { ...step, assignment: { mode } };
  }
}

/** Rol/kullanıcı seçimi; boş seçim (0/NaN) eksik atama olarak kalır. */
export function setAssignee(step: WorkflowStep, id: number | null): WorkflowStep {
  const value = id && id > 0 ? id : null;
  const assignment = step.assignment;
  if (!assignment || assignment.mode === 'creator') return step;

  if (assignment.mode === 'role') {
    return assignment.roleId === value ? step : { ...step, assignment: { mode: 'role', roleId: value } };
  }
  return assignment.userId === value ? step : { ...step, assignment: { mode: 'user', userId: value } };
}

/**
 * Süre sınırı (saat). Boş/sıfır süre sınırını kaldırır; yükseltme süresi yoksa
 * SLA bloğu tamamen düşer (boş SLA nesnesi doğrulamada anlamsız alan bırakırdı).
 */
export function setDueHours(step: WorkflowStep, hours: number | null): WorkflowStep {
  const value = hours != null && Number.isFinite(hours) && hours > 0 ? hours : null;
  const current = step.sla?.dueHours ?? null;
  if (current === value) return step;

  if (value === null) {
    if (!step.sla) return step;
    const { escalateAfterHours, onTimeout } = step.sla;
    return { ...step, sla: escalateAfterHours ? { escalateAfterHours, onTimeout } : null };
  }

  return { ...step, sla: { onTimeout: 'escalate', ...(step.sla ?? {}), dueHours: value } };
}

/**
 * Reddetme izni — Onay ↔ Görev. Kapatınca red hedefi de temizlenir: reddi
 * kapalı adımda red hedefi doğrulamada hata (ölü kenar).
 */
export function setAllowReject(step: WorkflowStep, allow: boolean): WorkflowStep {
  const current = step.form?.allowReject !== false;
  if (current === allow) return step;

  const form = { fields: [], ...(step.form ?? {}), allowReject: allow };
  return allow ? { ...step, form } : { ...step, form, onReject: null };
}

export function setJoinMode(step: WorkflowStep, mode: WorkflowJoinMode): WorkflowStep {
  return (step.mode ?? 'all') === mode ? step : { ...step, mode };
}

export type KeyProblem = 'empty' | 'invalid' | 'duplicate';

/** Yeni anahtar kabul edilebilir mi? Kendi eski anahtarı "yinelenen" sayılmaz. */
export function keyProblem(key: string, existing: ReadonlyArray<string>, own: string): KeyProblem | null {
  if (!key.trim()) return 'empty';
  if (!KEY_PATTERN.test(key)) return 'invalid';
  if (existing.some(k => sameKey(k, key) && !sameKey(k, own))) return 'duplicate';
  return null;
}

/** Paneldeki çıkış satırı: etiket türü, port ve şu anki hedef. */
export interface ExitRow {
  port: ExitPort;
  kind: ExitKind;
  target: string;
}

/** Bağlanabilir çıkışlar (kapalı çıkış listelenmez — görevin red çıkışı gibi). */
export function exitRows(step: WorkflowStep): ExitRow[] {
  return exitsOf(step)
    .filter(exit => exit.enabled)
    .map(exit => ({ port: exit.port, kind: exit.kind, target: exit.target ?? '' }));
}

/** Etiketin çeviri anahtarı: tekil adımda onay/red, paralelde tamamlanma/herhangi biri reddederse. */
export function exitLabelKey(port: ExitPort): string {
  return `workflow.inspector.exit.${port}`;
}
