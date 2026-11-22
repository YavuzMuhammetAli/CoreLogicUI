import { WorkflowAssignment, WorkflowRecipient, WorkflowStep } from '../../models/workflow.model';

/**
 * One-line summary of a step (assignment, duration) — PURE. The step list, the node card and
 * the properties panel show the same text; role/user names and translation are supplied
 * from outside.
 */
export interface SummaryLookup {
  roleName(id: number): string | null;
  userName(id: number): string | null;
  t(key: string, params?: Record<string, string | number>): string;
}

/** Assignment not defined or selection missing. */
export const MISSING = '—';

/** "Müdür" (role) · "Ayşe Yılmaz" (user) · "Kaydı oluşturan" (record creator) · "—" if missing. */
export function assignmentText(assignment: WorkflowAssignment | null | undefined, lookup: SummaryLookup): string {
  switch (assignment?.mode) {
    case 'role':
      return assignment.roleId ? lookup.roleName(Number(assignment.roleId)) ?? MISSING : MISSING;
    case 'user':
      return assignment.userId ? lookup.userName(Number(assignment.userId)) ?? MISSING : MISSING;
    case 'creator':
      return lookup.t('workflow.assign.creator');
    default:
      return MISSING;
  }
}

/** List column: the assignment for a single step, the branch count for parallel. */
export function assignmentSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  switch (step.type) {
    case 'parallel':  return lookup.t('workflow.build.branchCount', { n: (step.branches ?? []).length });
    case 'condition':
    case 'action':
    case 'notify':
    case 'timer':     return lookup.t('workflow.node.automatic');
    case 'end':       return '—';
    default:          return assignmentText(step.assignment, lookup);
  }
}

/** The card's summary line: assignment summary plus a "· 48 h" time limit if any; case count for a condition, outcome for an end. */
export function stepSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  if (step.type === 'condition') return lookup.t('workflow.node.caseCount', { n: (step.cases ?? []).length });
  if (step.type === 'end') {
    return lookup.t(step.outcome === 'rejected' ? 'workflow.node.endRejected' : 'workflow.node.endCompleted');
  }
  if (step.type === 'action') return actionSummary(step, lookup);
  if (step.type === 'notify') return recipientsSummary(step.notify?.recipients ?? [], lookup);
  if (step.type === 'timer') return timerSummary(step, lookup);

  const parts = [assignmentSummary(step, lookup)];
  const due = step.type === 'parallel' ? null : step.sla?.dueHours;
  if (due && due > 0) parts.push(lookup.t('workflow.node.hours', { n: due }));
  return parts.join(' · ');
}

/** Update-field summary: "Durum = Onaylandı" for a single field, the field count for several. */
export function actionSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  const sets = (step.sets ?? []).filter(set => set.column);
  if (sets.length === 0) return MISSING;
  if (sets.length > 1) return lookup.t('workflow.node.fieldCount', { n: sets.length });

  const [set] = sets;
  switch (set.mode) {
    case 'clear':   return lookup.t('workflow.action.summaryClear', { field: set.column });
    case 'formula': return lookup.t('workflow.action.summaryFormula', { field: set.column });
    default:        return `${set.column} = ${set.value ?? ''}`;
  }
}

/** Recipient's display name: "Kaydı oluşturan" (record creator), role/user name, "Finans Onayı görevlileri" (step assignees). */
export function recipientText(recipient: WorkflowRecipient, lookup: SummaryLookup): string {
  switch (recipient.kind) {
    case 'creator':       return lookup.t('workflow.recipient.creator');
    case 'starter':       return lookup.t('workflow.recipient.starter');
    case 'role':          return recipient.id ? lookup.roleName(Number(recipient.id)) ?? MISSING : MISSING;
    case 'user':          return recipient.id ? lookup.userName(Number(recipient.id)) ?? MISSING : MISSING;
    case 'stepAssignees': return lookup.t('workflow.recipient.stepAssigneesOf', { step: recipient.stepKey || MISSING });
    default:              return MISSING;
  }
}

/** Card summary: the first recipient, the rest as "+2". */
export function recipientsSummary(recipients: ReadonlyArray<WorkflowRecipient>, lookup: SummaryLookup): string {
  if (recipients.length === 0) return MISSING;
  const first = recipientText(recipients[0], lookup);
  return recipients.length > 1 ? `${first} +${recipients.length - 1}` : first;
}

/** Timer summary: "2 days", "until Bitis", "Bitis − 24 h". */
export function timerSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  const timer = step.timer;
  if (!timer) return MISSING;

  if (timer.mode === 'untilField') {
    if (!timer.field) return MISSING;
    const offset = Number(timer.offsetHours ?? 0);
    if (!offset) return lookup.t('workflow.timer.summaryUntil', { field: timer.field });
    return lookup.t(offset < 0 ? 'workflow.timer.summaryBefore' : 'workflow.timer.summaryAfter',
      { field: timer.field, n: Math.abs(offset) });
  }

  const amount = Number(timer.amount ?? 0);
  if (!(amount > 0)) return MISSING;
  return lookup.t(`workflow.timer.unit.${timer.unit ?? 'hours'}`, { n: amount });
}
