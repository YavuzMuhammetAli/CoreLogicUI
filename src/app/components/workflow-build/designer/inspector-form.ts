import {
  WorkflowAssignmentMode, WorkflowJoinMode, WorkflowStep
} from '../../../models/workflow.model';
import { ExitKind, ExitPort, exitsOf, sameKey } from '../../../utils/workflow/workflow-exits';
import { KEY_PATTERN } from '../workflow-step.form';

/**
 * Step transformations of the inspector panel — PURE. Each returns the new step;
 * if the value does not change it returns the SAME object (no document change, no undo step).
 * Fields without a counterpart in the panel (form fields, branches, SLA policy) are preserved.
 */

export function setName(step: WorkflowStep, name: string): WorkflowStep {
  return step.name === name ? step : { ...step, name };
}

/** When the assignment type changes the selected user/role is reset (a role id cannot be a user id). */
export function setAssignmentMode(step: WorkflowStep, mode: WorkflowAssignmentMode): WorkflowStep {
  if (step.assignment?.mode === mode) return step;

  switch (mode) {
    case 'role': return { ...step, assignment: { mode, roleId: null } };
    case 'user': return { ...step, assignment: { mode, userId: null } };
    default:     return { ...step, assignment: { mode } };
  }
}

/** Role/user selection; an empty selection (0/NaN) remains a missing assignment. */
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
 * Time limit (hours). An empty/zero duration removes the limit; if there is no escalation
 * duration the SLA block is dropped entirely (an empty SLA object would leave a meaningless field in validation).
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
 * Reject permission — Approval ↔ Task. Turning it off also clears the reject target: a reject
 * target on a step with rejection disabled is a validation error (dead edge).
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

/** Is the new key acceptable? Its own old key does not count as a "duplicate". */
export function keyProblem(key: string, existing: ReadonlyArray<string>, own: string): KeyProblem | null {
  if (!key.trim()) return 'empty';
  if (!KEY_PATTERN.test(key)) return 'invalid';
  if (existing.some(k => sameKey(k, key) && !sameKey(k, own))) return 'duplicate';
  return null;
}

/** Exit row in the panel: label type, port and current target. */
export interface ExitRow {
  port: ExitPort;
  kind: ExitKind;
  target: string;
}

/** Connectable exits (a closed exit is not listed — like a task's reject exit). */
export function exitRows(step: WorkflowStep): ExitRow[] {
  return exitsOf(step)
    .filter(exit => exit.enabled)
    .map(exit => ({ port: exit.port, kind: exit.kind, target: exit.target ?? '' }));
}
