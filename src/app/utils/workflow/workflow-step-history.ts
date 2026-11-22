import { WorkflowEvent, WorkflowGraph, WorkflowInstance, WorkflowStep, WorkflowTask } from '../../models/workflow.model';
import { OverlayNodeState, WorkflowOverlay } from './workflow-overlay';

/** A closed task: who decided what, and when. */
export interface StepDecisionEntry {
  kind: 'decision';
  outcome: 'approved' | 'rejected' | 'skipped' | 'expired';
  /** Who decided; null if the system closed it (SLA). */
  by: string | null;
  at: string | null;
  comment: string | null;
  /** Display name of the branch in a parallel step. */
  branch: string | null;
}

/** An open task: whose decision is awaited. */
export interface StepWaitingEntry {
  kind: 'waiting';
  /** The user's name if assigned to a user. */
  user: string | null;
  /** The role's name if assigned to a role pool. */
  role: string | null;
  /** Active members of the role pool (from the server, sorted by name). */
  candidates: string[];
  branch: string | null;
  dueAt: string | null;
  overdue: boolean;
}

export type StepEntry =
  | StepDecisionEntry
  | StepWaitingEntry
  /** Condition evaluated — label of the chosen case; null → default path. */
  | { kind: 'condition'; caseLabel: string | null; at: string }
  | { kind: 'fields'; columns: string[]; at: string }
  | { kind: 'notified'; at: string }
  /** Timer: due time and (if passed) the firing moment. */
  | { kind: 'timer'; until: string | null; firedAt: string | null }
  /** An admin skipped a failing automatic step. */
  | { kind: 'stepSkipped'; at: string }
  | { kind: 'failed'; message: string | null }
  | { kind: 'ended'; outcome: 'completed' | 'rejected'; at: string | null };

export interface StepHistory {
  key: string;
  name: string;
  state: OverlayNodeState;
  entries: StepEntry[];
}

/** Just what the step history needs (the full instance DTO also fits). */
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

/** A history row from a task; cancelled tasks (branch cancellation, rollback) are not shown. */
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

/** History rows from an automatic step's events (in order — each loop round separately). */
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
 * A "what happened" summary for the steps of an instance VISIBLE on the diagram — PURE, untranslated.
 *
 * - Human steps (approval/task/parallel) from tasks: a closed task is a decision
 *   (who, when, comment, branch), an open task is "whose approval is awaited"
 *   (user or role + the role's active members). Rework rounds in order.
 * - Automatic steps from the event log (path chosen by the condition, updated fields,
 *   notification, timer due time).
 * - The failed step gets the instance error text; the end node gets the outcome and finish time.
 *
 * Only steps in the path overlay are returned: an unreached step has no history to tell.
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

/** Names of waiting users/roles (several in parallel, deduplicated) — for the card summary. */
export function waitingNames(history: StepHistory | undefined): string[] {
  const names = (history?.entries ?? [])
    .filter((entry): entry is StepWaitingEntry => entry.kind === 'waiting')
    .map(entry => entry.user ?? entry.role ?? '')
    .filter(Boolean);
  return [...new Set(names)];
}

/** The last decision on the step — for the card summary "Onayladı · Name" (Approved · Name). */
export function lastDecision(history: StepHistory | undefined): StepDecisionEntry | null {
  const decisions = (history?.entries ?? []).filter((entry): entry is StepDecisionEntry => entry.kind === 'decision');
  return decisions[decisions.length - 1] ?? null;
}
