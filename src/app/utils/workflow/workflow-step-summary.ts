import { WorkflowAssignment, WorkflowStep } from '../../models/workflow.model';

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
  return step.type === 'parallel'
    ? lookup.t('workflow.build.branchCount', { n: (step.branches ?? []).length })
    : assignmentText(step.assignment, lookup);
}

/** Kartın özet satırı: atama özeti, varsa "· 48 sa" süre sınırı. */
export function stepSummary(step: WorkflowStep, lookup: SummaryLookup): string {
  const parts = [assignmentSummary(step, lookup)];
  const due = step.type === 'parallel' ? null : step.sla?.dueHours;
  if (due && due > 0) parts.push(lookup.t('workflow.node.hours', { n: due }));
  return parts.join(' · ');
}
