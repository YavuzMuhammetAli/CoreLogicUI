import {
  WORKFLOW_TERMINAL_COMPLETED,
  WORKFLOW_TERMINAL_REJECTED,
  WorkflowStep
} from '../../models/workflow.model';

/**
 * A step's exits — the single dictionary.
 *
 * A single (approval) step uses `onApprove/onReject`, a parallel step `onComplete/onAnyReject`,
 * a condition uses `cases[i].to` per case + `defaultTo`; End has no exits.
 * The design screen, canvas, layout and validation all see the same list —
 * a new node type is added only here.
 *
 * Port names are IDENTICAL to backend `WorkflowPorts` / `WorkflowExits` —
 * validation findings (`WorkflowIssue.port`) and event data arrive with these names.
 */
export type ExitPort = 'approve' | 'reject' | 'complete' | 'anyReject' | 'default' | 'next' | `case:${string}`;

/**
 * Port kind on the canvas: positive (approve/complete), negative (reject) or neutral
 * (condition paths — none is "better" than another).
 */
export type ExitKind = 'approve' | 'reject' | 'neutral';

export interface WorkflowExit {
  port: ExitPort;
  kind: ExitKind;
  /** Target step key; if empty the flow falls back to the `fallback` terminal (if any). */
  target: string | null;
  /**
   * The terminal an empty target falls back to. Null for condition paths: an untargeted path is a
   * validation error and does not silently fall back to a terminal.
   */
  fallback: typeof WORKFLOW_TERMINAL_COMPLETED | typeof WORKFLOW_TERMINAL_REJECTED | null;
  /**
   * Whether a connection can be made to this exit. An approval step with reject disabled, or a
   * parallel step where no branch can reject, has no reject exit — the validator rejects
   * writing a target there.
   */
  enabled: boolean;
  /** The condition case's label ("Evet"); null for the default path and for approve/reject. */
  label?: string | null;
}

const CASE_PREFIX = 'case:';

export function casePort(caseKey: string): ExitPort {
  return `${CASE_PREFIX}${caseKey}`;
}

/** The case key if the port belongs to a condition case; otherwise null. */
export function caseKeyOf(port: string | null | undefined): string | null {
  return port?.startsWith(CASE_PREFIX) ? port.slice(CASE_PREFIX.length) : null;
}

/** The step's exits in drawing order (positive first; for a condition, case order with default last). */
export function exitsOf(step: WorkflowStep): WorkflowExit[] {
  switch (step.type) {
    case 'parallel':
      return [
        {
          port: 'complete', kind: 'approve', target: step.onComplete || null,
          fallback: WORKFLOW_TERMINAL_COMPLETED, enabled: true
        },
        {
          port: 'anyReject', kind: 'reject', target: step.onAnyReject || null,
          fallback: WORKFLOW_TERMINAL_REJECTED,
          enabled: (step.branches ?? []).some(b => b.form?.allowReject !== false)
        }
      ];

    case 'condition':
      return [
        ...(step.cases ?? []).map(c => ({
          port: casePort(c.key), kind: 'neutral' as const, target: c.to || null,
          fallback: null, enabled: true, label: c.label || c.key
        })),
        { port: 'default' as const, kind: 'neutral' as const, target: step.defaultTo || null, fallback: null, enabled: true, label: null }
      ];

    case 'end':
      return [];

    // Update field / notification / timer: a single "next" exit; a validation error if left without a target.
    case 'action':
    case 'notify':
    case 'timer':
      return [{ port: 'next', kind: 'neutral', target: step.next || null, fallback: null, enabled: true, label: null }];

    default:
      return [
        {
          port: 'approve', kind: 'approve', target: step.onApprove || null,
          fallback: WORKFLOW_TERMINAL_COMPLETED, enabled: true
        },
        {
          port: 'reject', kind: 'reject', target: step.onReject || null,
          fallback: WORKFLOW_TERMINAL_REJECTED, enabled: step.form?.allowReject !== false
        }
      ];
  }
}

/** Resolves a canvas port kind (positive/negative) to the step's first matching exit. */
export function exitForKind(step: WorkflowStep, kind: ExitKind): WorkflowExit | undefined {
  return exitsOf(step).find(exit => exit.kind === kind);
}

/** Writes the exit's target; returns a COPY of the step. A port not belonging to the step is ignored. */
export function setExit(step: WorkflowStep, port: ExitPort, target: string | null): WorkflowStep {
  const value = target || null;

  if (step.type === 'condition') {
    if (port === 'default') return step.defaultTo === value ? step : { ...step, defaultTo: value };

    const key = caseKeyOf(port);
    const index = key === null ? -1 : (step.cases ?? []).findIndex(c => c.key === key);
    if (index < 0 || (step.cases![index].to || null) === value) return step;

    const cases = step.cases!.slice();
    cases[index] = { ...cases[index], to: value };
    return { ...step, cases };
  }

  if (step.type === 'action' || step.type === 'notify' || step.type === 'timer') {
    return port === 'next' && (step.next || null) !== value ? { ...step, next: value } : step;
  }

  const isParallel = step.type === 'parallel';
  switch (port) {
    case 'approve':   return isParallel || step.type === 'end' ? step : { ...step, onApprove: value };
    case 'reject':    return isParallel || step.type === 'end' ? step : { ...step, onReject: value };
    case 'complete':  return isParallel ? { ...step, onComplete: value } : step;
    case 'anyReject': return isParallel ? { ...step, onAnyReject: value } : step;
    default:          return step;
  }
}

/**
 * Rewrites all of the step's exit targets through `map` (rename,
 * delete). `map` returns the new key, or null to clear the target. If no
 * target changes the SAME object is returned — so unchanged steps are not redrawn.
 */
export function mapRefs(step: WorkflowStep, map: (key: string) => string | null): WorkflowStep {
  let next = step;
  for (const exit of exitsOf(step)) {
    if (!exit.target) continue;
    const mapped = map(exit.target);
    if (mapped !== exit.target) next = setExit(next, exit.port, mapped);
  }
  return next;
}

/** Key comparison is case-insensitive — same as backend FindStep. */
export function sameKey(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}
