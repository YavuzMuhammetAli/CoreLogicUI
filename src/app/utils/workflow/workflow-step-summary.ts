import { WorkflowAssignment, WorkflowRecipient, WorkflowStep } from '../../models/workflow.model';

/**
 * Adımın tek satırlık özeti (atama, süre) — SAF. Adım listesi, düğüm kartı ve
 * özellik paneli aynı metni gösterir; rol/kullanıcı adları ve çeviri dışarıdan
 * verilir.
 */
export interface SummaryLookup {
  roleName(id: number): string | null;
  userName(id: number): string | null;
  t(key: string, params?: Record<string, string | number>): string;
}

/** Atama tanımlı değil ya da seçim eksik. */
export const MISSING = '—';

/** "Müdür" · "Ayşe Yılmaz" · "Kaydı oluşturan" · eksikse "—". */
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

/** Liste sütunu: tekil adımda atama, paralelde dal sayısı. */
export function assignmentSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  switch (step.type) {
    case 'parallel':  return lookup.t('workflow.build.branchCount', { n: (step.branches ?? []).length });
    case 'condition':
    case 'action':
    case 'notify':    return lookup.t('workflow.node.automatic');
    case 'end':       return '—';
    default:          return assignmentText(step.assignment, lookup);
  }
}

/** Kartın özet satırı: atama özeti, varsa "· 48 sa" süre sınırı; koşulda durum sayısı, bitişte sonuç. */
export function stepSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  if (step.type === 'condition') return lookup.t('workflow.node.caseCount', { n: (step.cases ?? []).length });
  if (step.type === 'end') {
    return lookup.t(step.outcome === 'rejected' ? 'workflow.node.endRejected' : 'workflow.node.endCompleted');
  }
  if (step.type === 'action') return actionSummary(step, lookup);
  if (step.type === 'notify') return recipientsSummary(step.notify?.recipients ?? [], lookup);

  const parts = [assignmentSummary(step, lookup)];
  const due = step.type === 'parallel' ? null : step.sla?.dueHours;
  if (due && due > 0) parts.push(lookup.t('workflow.node.hours', { n: due }));
  return parts.join(' · ');
}

/** Alan güncelle özeti: tek alanda "Durum = Onaylandı", çoğunda alan sayısı. */
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

/** Alıcının görünen adı: "Kaydı oluşturan", rol/kişi adı, "Finans Onayı görevlileri". */
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

/** Kart özeti: ilk alıcı, fazlası "+2". */
export function recipientsSummary(recipients: ReadonlyArray<WorkflowRecipient>, lookup: SummaryLookup): string {
  if (recipients.length === 0) return MISSING;
  const first = recipientText(recipients[0], lookup);
  return recipients.length > 1 ? `${first} +${recipients.length - 1}` : first;
}
