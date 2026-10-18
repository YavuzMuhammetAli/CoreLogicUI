import { WorkflowIssue, WorkflowIssueSeverity } from '../../../models/workflow.model';
import { sameKey } from '../../../utils/workflow/workflow-exits';
import { WorkflowDesignDoc } from './workflow-design.doc';

/**
 * Doğrulama bulgularının ekran hali — SAF.
 *
 * Sunucu her bulgu için bir `code` ve Türkçe yedek `message` döner; ekran metni
 * `workflow.issue.{code}` çevirisinden kurulur (dil değişimi ve adım ADI ile).
 * Çevirisi olmayan yeni bir kod gelirse sunucunun metni gösterilir — eksik
 * çeviri kullanıcıya ham anahtar olarak sızmasın.
 */
export interface IssueText {
  t(key: string, params?: Record<string, string | number>): string;
}

/** Sorun listesinin satırı. */
export interface IssueRow {
  severity: WorkflowIssueSeverity;
  /** Konumsuz mesaj ("Atama tanımlı değil."). */
  text: string;
  /** "Müdür Onayı" ya da "Paralel onay / Finans"; akış geneli sorunda null. */
  location: string | null;
  stepKey: string | null;
  /** Tıklanınca nereye gidilir: adım, tetikleyici sekmesi ya da yalnız bilgi. */
  target: 'step' | 'trigger' | 'flow';
}

export interface IssueCounts {
  errors: number;
  warnings: number;
}

/** Bulgunun mesajı (konum hariç). */
export function issueText(issue: WorkflowIssue, i18n: IssueText): string {
  const key = `workflow.issue.${issue.code}`;
  const params: Record<string, string | number> = { ...(issue.args ?? {}) };
  if (issue.port) params['port'] = i18n.t(`workflow.inspector.exit.${issue.port}`);

  const text = i18n.t(key, params);
  return text === key ? issue.message : text;
}

/** Bulgunun konumu: adımın (ve dalın) ADI; adım belgede yoksa anahtarı. */
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

/** Listeleme sırası: önce hatalar, sonra uyarılar; her grupta sunucunun sırası. */
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

/** Adım başına satırlar (anahtar küçük harfli) — düğüm rozeti ve özellik paneli. */
export function rowsByStep(rows: ReadonlyArray<IssueRow>): Map<string, IssueRow[]> {
  const byStep = new Map<string, IssueRow[]>();
  for (const row of rows) {
    if (!row.stepKey) continue;
    const key = row.stepKey.toLowerCase();
    byStep.set(key, [...(byStep.get(key) ?? []), row]);
  }
  return byStep;
}

/** Rozet ipucu: ilk sorunun metni, fazlası "+N". */
export function badgeTitle(rows: ReadonlyArray<IssueRow>, i18n: IssueText): string {
  if (rows.length === 0) return '';
  const first = rows[0].text;
  return rows.length === 1 ? first : `${first} ${i18n.t('workflow.issues.more', { n: rows.length - 1 })}`;
}
