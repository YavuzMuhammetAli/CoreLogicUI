import { WorkflowIssue, WorkflowIssueSeverity } from '../../../models/workflow.model';
import { sameKey } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc } from './workflow-design.doc';

/**
 * Screen form of validation findings — PURE.
 *
 * The server returns a `code` and a Turkish fallback `message` for each finding; the screen text
 * is built from the `workflow.issue.{code}` translation (with language changes and the step NAME).
 * If a new code without translation arrives, the server's text is shown — so a missing
 * translation does not leak to the user as a raw key.
 */
export interface IssueText {
  t(key: string, params?: Record<string, string | number>): string;
}

/** Row of the issue list. */
export interface IssueRow {
  severity: WorkflowIssueSeverity;
  /** Message without location ("Atama tanımlı değil." — no assignment defined). */
  text: string;
  /** "Müdür Onayı" or "Paralel onay / Finans"; null for a flow-wide issue. */
  location: string | null;
  stepKey: string | null;
  /** Where a click leads: step, trigger tab or info only. */
  target: 'step' | 'trigger' | 'flow';
}

export interface IssueCounts {
  errors: number;
  warnings: number;
}

/** The finding's message (excluding location). */
export function issueText(issue: WorkflowIssue, i18n: IssueText): string {
  const key = `workflow.issue.${issue.code}`;
  const params: Record<string, string | number> = { ...(issue.args ?? {}) };
  if (issue.port) {
    // The name of a condition path is the case's label (the server sends it quoted in the "label" argument).
    params['port'] = issue.port.startsWith('case:')
      ? (issue.args?.['label'] ?? issue.port.slice(5)).replace(/"/g, '')
      : i18n.t(`workflow.inspector.exit.${issue.port}`);
  }

  const text = i18n.t(key, params);
  return text === key ? issue.message : text;
}

/** Location of the finding: the step's (and branch's) NAME; the key if the step is not in the document. */
export function issueLocation(issue: WorkflowIssue, doc: WorkflowDesignDoc): string | null {
  if (!issue.stepKey) return null;

  const step = doc.graph.steps.find(s => sameKey(s.key, issue.stepKey!));
  const stepLabel = step?.name?.trim() || issue.stepKey;
  if (!issue.branchKey) return stepLabel;

  const branch = step?.branches?.find(b => sameKey(b.key, issue.branchKey!));
  return `${stepLabel} / ${branch?.name?.trim() || issue.branchKey}`;
}

function targetOf(issue: WorkflowIssue): IssueRow['target'] {
  if (issue.stepKey) return 'step';
  return issue.code.startsWith('trigger.') ? 'trigger' : 'flow';
}

/** Listing order: errors first, then warnings; within each group the server's order. */
export function issueRows(issues: ReadonlyArray<WorkflowIssue>, doc: WorkflowDesignDoc, i18n: IssueText): IssueRow[] {
  const rank = (issue: WorkflowIssue) => issue.severity === 'error' ? 0 : 1;
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => rank(a.issue) - rank(b.issue) || a.index - b.index)
    .map(({ issue }) => ({
      severity: issue.severity,
      text: issueText(issue, i18n),
      location: issueLocation(issue, doc),
      stepKey: issue.stepKey ?? null,
      target: targetOf(issue)
    }));
}

export function countIssues(issues: ReadonlyArray<{ severity: WorkflowIssueSeverity }>): IssueCounts {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === 'error') errors++; else warnings++;
  }
  return { errors, warnings };
}

/** Rows per step (lower-case key) — node badge and inspector panel. */
export function rowsByStep(rows: ReadonlyArray<IssueRow>): Map<string, IssueRow[]> {
  const byStep = new Map<string, IssueRow[]>();
  for (const row of rows) {
    if (!row.stepKey) continue;
    const key = row.stepKey.toLowerCase();
    byStep.set(key, [...(byStep.get(key) ?? []), row]);
  }
  return byStep;
}

/** Badge tooltip: the first issue's text, more as "+N". */
export function badgeTitle(rows: ReadonlyArray<IssueRow>, i18n: IssueText): string {
  if (rows.length === 0) return '';
  const first = rows[0].text;
  return rows.length === 1 ? first : `${first} ${i18n.t('workflow.issues.more', { n: rows.length - 1 })}`;
}
