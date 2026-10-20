import { WorkflowEvent, WorkflowGraph, WorkflowInstance, WorkflowStep, WorkflowTask } from '../../models/workflow.model';
import { OverlayNodeState, WorkflowOverlay } from './workflow-overlay';

/** Kapanmış görev: kim, ne karar verdi, ne zaman. */
export interface StepDecisionEntry {
  kind: 'decision';
  outcome: 'approved' | 'rejected' | 'skipped' | 'expired';
  /** Kararı veren; sistem kapattıysa (SLA) null. */
  by: string | null;
  at: string | null;
  comment: string | null;
  /** Paralel adımda dalın görünen adı. */
  branch: string | null;
}

/** Açık görev: kimin kararı bekleniyor. */
export interface StepWaitingEntry {
  kind: 'waiting';
  /** Kişiye atanmışsa kişinin adı. */
  user: string | null;
  /** Rol havuzuna atanmışsa rolün adı. */
  role: string | null;
  /** Rol havuzunun aktif üyeleri (sunucudan, ada göre sıralı). */
  candidates: string[];
  branch: string | null;
  dueAt: string | null;
  overdue: boolean;
}

export type StepEntry =
  | StepDecisionEntry
  | StepWaitingEntry
  /** Koşul değerlendirildi — seçilen durumun etiketi; null → varsayılan yol. */
  | { kind: 'condition'; caseLabel: string | null; at: string }
  | { kind: 'fields'; columns: string[]; at: string }
  | { kind: 'notified'; at: string }
  /** Bekleme: vade ve (geçtiyse) ateşlenme anı. */
  | { kind: 'timer'; until: string | null; firedAt: string | null }
  /** Yönetici hata veren otomatik adımı atladı. */
  | { kind: 'stepSkipped'; at: string }
  | { kind: 'failed'; message: string | null }
  | { kind: 'ended'; outcome: 'completed' | 'rejected'; at: string | null };

export interface StepHistory {
  key: string;
  name: string;
  state: OverlayNodeState;
  entries: StepEntry[];
}

/** Adım geçmişi için gereken kadarı (tam süreç DTO'su da uyar). */
export type StepHistoryInstance =
  Pick<WorkflowInstance, 'status' | 'timeline' | 'tasks' | 'completedAt' | 'errorMessage'>;

function dataOf(event: WorkflowEvent): Record<string, unknown> {
  if (!event.dataJson) return {};
  try {
    const parsed: unknown = JSON.parse(event.dataJson);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function branchName(step: WorkflowStep, branchKey: string | null | undefined): string | null {
  if (!branchKey) return null;
  const branch = step.branches?.find(b => b.key.toLowerCase() === branchKey.toLowerCase());
  return branch?.name?.trim() || branchKey;
}

const OUTCOMES: Partial<Record<WorkflowTask['status'], StepDecisionEntry['outcome']>> = {
  Completed: 'approved',
  Rejected: 'rejected',
  Skipped: 'skipped',
  Expired: 'expired'
};

/** Görevden geçmiş satırı; iptal edilen görev (dal iptali, geri alma) gösterilmez. */
function taskEntry(step: WorkflowStep, task: WorkflowTask): StepEntry | null {
  const branch = branchName(step, task.branchKey);

  if (task.status === 'Pending') {
    return {
      kind: 'waiting',
      user: task.assignedUserId ? (task.assignedUserName || `#${task.assignedUserId}`) : null,
      role: task.assignedRoleId ? (task.assignedRoleName || `#${task.assignedRoleId}`) : null,
      candidates: task.candidates ?? [],
      branch,
      dueAt: task.dueAt ?? null,
      overdue: task.isOverdue
    };
  }

  const outcome = OUTCOMES[task.status];
  if (!outcome) return null;

  return {
    kind: 'decision',
    outcome,
    by: task.completedBy ? (task.completedByName || `#${task.completedBy}`) : null,
    at: task.completedAt ?? null,
    comment: task.comment?.trim() || null,
    branch
  };
}

/** Otomatik adımın olaylarından geçmiş satırları (sırayla — döngüde her tur ayrı). */
function eventEntries(step: WorkflowStep, events: WorkflowEvent[]): StepEntry[] {
  const entries: StepEntry[] = [];

  for (const event of events) {
    const data = dataOf(event);
    switch (event.eventType) {
      case 'ConditionEvaluated': {
        const caseKey = typeof data['caseKey'] === 'string' ? data['caseKey'] : null;
        const match = caseKey ? step.cases?.find(c => c.key === caseKey) : undefined;
        entries.push({ kind: 'condition', caseLabel: caseKey ? (match?.label?.trim() || caseKey) : null, at: event.createdAt });
        break;
      }
      case 'FieldsUpdated': {
        const columns = Array.isArray(data['columns'])
          ? (data['columns'] as unknown[]).filter((c): c is string => typeof c === 'string')
          : [];
        entries.push({ kind: 'fields', columns, at: event.createdAt });
        break;
      }
      case 'NotificationQueued':
        entries.push({ kind: 'notified', at: event.createdAt });
        break;
      case 'TimerScheduled':
        entries.push({ kind: 'timer', until: typeof data['fireAt'] === 'string' ? data['fireAt'] : null, firedAt: null });
        break;
      case 'TimerFired': {
        const open = [...entries].reverse().find(e => e.kind === 'timer' && !e.firedAt);
        if (open?.kind === 'timer') open.firedAt = event.createdAt;
        else entries.push({ kind: 'timer', until: null, firedAt: event.createdAt });
        break;
      }
      case 'StepSkipped':
        entries.push({ kind: 'stepSkipped', at: event.createdAt });
        break;
    }
  }
  return entries;
}

/**
 * Sürecin şemada GÖRÜNEN adımları için "ne oldu" özeti — SAF, çevirisiz.
 *
 * - İnsan adımları (onay/görev/paralel) görevlerden: kapanan görev karar
 *   (kim, ne zaman, açıklama, dal), açık görev "kimin onayı bekleniyor"
 *   (kişi ya da rol + rolün aktif üyeleri). Yeniden işleme turları sırayla.
 * - Otomatik adımlar olay günlüğünden (koşulun seçtiği yol, güncellenen alanlar,
 *   bildirim, bekleme vadesi).
 * - Hatadaki adıma sürecin hata metni, bitiş düğümüne sonuç ve bitiş anı eklenir.
 *
 * Yalnız yol katmanındaki adımlar döner: ulaşılmayan adımın anlatacak geçmişi yok.
 */
export function buildStepHistory(
  graph: WorkflowGraph, instance: StepHistoryInstance, overlay: WorkflowOverlay
): Record<string, StepHistory> {
  const result: Record<string, StepHistory> = {};

  for (const step of graph.steps) {
    const key = step.key.toLowerCase();
    const state = overlay.nodes[key];
    if (!state) continue;

    const tasks = (instance.tasks ?? [])
      .filter(task => task.stepKey.toLowerCase() === key)
      .sort((a, b) => a.id - b.id);
    const events = (instance.timeline ?? []).filter(event => event.stepKey?.toLowerCase() === key);

    const entries: StepEntry[] = [
      ...tasks.map(task => taskEntry(step, task)).filter((entry): entry is StepEntry => entry !== null),
      ...eventEntries(step, events)
    ];

    if (state === 'failed') {
      entries.push({ kind: 'failed', message: instance.errorMessage?.trim() || null });
    }
    if (state === 'end') {
      const outcome = step.outcome === 'rejected' || (!step.outcome && instance.status === 'Rejected')
        ? 'rejected' : 'completed';
      entries.push({ kind: 'ended', outcome, at: instance.completedAt ?? null });
    }

    result[key] = { key: step.key, name: step.name || step.key, state, entries };
  }
  return result;
}

/** Bekleyen kişi/rol adları (paralelde birden çok, tekrarsız) — kart özeti için. */
export function waitingNames(history: StepHistory | undefined): string[] {
  const names = (history?.entries ?? [])
    .filter((entry): entry is StepWaitingEntry => entry.kind === 'waiting')
    .map(entry => entry.user ?? entry.role ?? '')
    .filter(Boolean);
  return [...new Set(names)];
}

/** Adımdaki son karar — kart özeti "Onayladı · Ad" için. */
export function lastDecision(history: StepHistory | undefined): StepDecisionEntry | null {
  const decisions = (history?.entries ?? []).filter((entry): entry is StepDecisionEntry => entry.kind === 'decision');
  return decisions[decisions.length - 1] ?? null;
}
