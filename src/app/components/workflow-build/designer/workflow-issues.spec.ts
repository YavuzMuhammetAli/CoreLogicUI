import { WorkflowIssue } from '../../../models/workflow.model';
import { WorkflowDesignDoc, emptyDoc } from './workflow-design.doc';
import {
  IssueText, badgeTitle, countIssues, issueLocation, issueRows, issueText, rowsByStep
} from './workflow-issues';

const DICT: Record<string, string> = {
  'workflow.issue.assignment.roleRequired': 'Rol seçilmeli.',
  'workflow.issue.transition.targetNotFound': '"{port}" çıkışının hedefi bulunamadı: {target}.',
  'workflow.inspector.exit.approve': 'Onaylanınca',
  'workflow.issues.more': '(+{n})'
};

const i18n: IssueText = {
  t: (key, params) => {
    let text = DICT[key] ?? key;
    for (const [k, v] of Object.entries(params ?? {})) text = text.replaceAll(`{${k}}`, String(v));
    return text;
  }
};

function issue(extra: Partial<WorkflowIssue>): WorkflowIssue {
  return { code: 'x', severity: 'error', message: 'Sunucu metni', args: {}, ...extra };
}

function doc(): WorkflowDesignDoc {
  const base = emptyDoc();
  return {
    ...base,
    graph: {
      startStep: 'mudur',
      steps: [
        { key: 'mudur', type: 'approval', name: 'Müdür Onayı' },
        { key: 'onaylar', type: 'parallel', name: 'Onaylar', branches: [{ key: 'fin', name: 'Finans' }] }
      ],
      entityStatusMap: {}
    }
  };
}

describe('workflow-issues', () => {
  it('çeviriden metin kurar; port etiketi ve argümanlar yerleşir', () => {
    expect(issueText(issue({ code: 'assignment.roleRequired' }), i18n)).toBe('Rol seçilmeli.');
    expect(issueText(issue({ code: 'transition.targetNotFound', port: 'approve', args: { target: 'yok' } }), i18n))
      .toBe('"Onaylanınca" çıkışının hedefi bulunamadı: yok.');
  });

  it('çevirisi olmayan kodda sunucu metnine düşer', () => {
    expect(issueText(issue({ code: 'yeni.kod' }), i18n)).toBe('Sunucu metni');
  });

  it('konum adımın ve dalın ADINI kullanır; bilinmeyende anahtar', () => {
    expect(issueLocation(issue({ stepKey: 'MUDUR' }), doc())).toBe('Müdür Onayı');
    expect(issueLocation(issue({ stepKey: 'onaylar', branchKey: 'fin' }), doc())).toBe('Onaylar / Finans');
    expect(issueLocation(issue({ stepKey: 'silinmis' }), doc())).toBe('silinmis');
    expect(issueLocation(issue({}), doc())).toBeNull();
  });

  it('satırlar: önce hatalar, hedef türü koddan', () => {
    const rows = issueRows([
      issue({ code: 'key.nonAscii', severity: 'warning', stepKey: 'mudur' }),
      issue({ code: 'trigger.fieldEmpty' }),
      issue({ code: 'start.missing' }),
      issue({ code: 'assignment.roleRequired', stepKey: 'mudur' })
    ], doc(), i18n);

    expect(rows.map(r => r.severity)).toEqual(['error', 'error', 'error', 'warning']);
    expect(rows.map(r => r.target)).toEqual(['trigger', 'flow', 'step', 'step']);
    expect(countIssues(rows)).toEqual({ errors: 3, warnings: 1 });
  });

  it('adım başına gruplar ve rozet ipucu kurar', () => {
    const rows = issueRows([
      issue({ code: 'assignment.roleRequired', stepKey: 'Mudur' }),
      issue({ code: 'b', stepKey: 'mudur' }),
      issue({ code: 'start.missing' })
    ], doc(), i18n);
    const byStep = rowsByStep(rows);

    expect(byStep.get('mudur')?.length).toBe(2);
    expect(byStep.size).toBe(1);
    expect(badgeTitle(byStep.get('mudur')!, i18n)).toBe('Rol seçilmeli. (+1)');
    expect(badgeTitle([], i18n)).toBe('');
  });
});
