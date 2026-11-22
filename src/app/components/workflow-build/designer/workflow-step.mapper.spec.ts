import { FormBuilder } from '@angular/forms';
import { WorkflowStep } from '../../../models/workflow.model';
import { buildAssignment, buildSla, newStepGroup } from '../workflow-step.form';
import { stepFromFormValue } from './workflow-step.mapper';

/**
 * Step building rules MUST NOT CHANGE while the design screen moves from a FormArray to
 * the design document. The function below is a FROZEN copy of the per-step body of the old
 * `WorkflowBuildComponent.buildGraph()`; the mapper must produce the same step from the
 * same form value. Deliberate differences (preserved fields, source of the position) are pinned in
 * separate tests.
 */
function frozenBuildGraphStep(step: Record<string, unknown>): WorkflowStep {
  const key = String(step['key'] ?? '');
  const isParallel = step['type'] === 'parallel';
  const fields = (step['fields'] ?? []) as Array<Record<string, unknown>>;
  const approveTarget = String(step['onApprove'] ?? '') || null;
  const rejectTarget = String(step['onReject'] ?? '') || null;

  if (isParallel) {
    const branches = (step['branches'] ?? []) as Array<Record<string, unknown>>;
    return {
      key,
      type: 'parallel',
      name: String(step['name'] ?? ''),
      mode: (step['mode'] as 'all' | 'any') ?? 'all',
      branches: branches.map(branch => ({
        key: String(branch['key'] ?? ''),
        name: String(branch['name'] ?? ''),
        assignment: buildAssignment(branch),
        sla: buildSla(branch)
      })),
      assignment: null,
      sla: null,
      form: null,
      onComplete: approveTarget,
      onAnyReject: rejectTarget,
      x: step['x'] as number | null,
      y: step['y'] as number | null
    };
  }

  const recordFields = (step['recordFields'] ?? []) as Array<Record<string, unknown>>;
  const approveLabel = String(step['approveLabel'] ?? '').trim();
  const allowReject = step['allowReject'] !== false;
  const rejectLabel = allowReject ? String(step['rejectLabel'] ?? '').trim() : '';
  const hasForm = fields.length > 0 || recordFields.length > 0
    || !!approveLabel || !!rejectLabel || !allowReject;

  return {
    key,
    type: 'approval',
    name: String(step['name'] ?? ''),
    assignment: buildAssignment(step),
    sla: buildSla(step),
    form: hasForm ? {
      fields: fields.map(field => ({
        name: String(field['name'] ?? ''),
        dataType: String(field['dataType'] ?? 'string'),
        label: String(field['label'] ?? '') || null,
        isRequired: !!field['isRequired'],
        enumValues: String(field['enumValues'] ?? '') || null
      })),
      recordFields: recordFields.map(field => ({
        column: String(field['column'] ?? ''),
        isRequired: !!field['isRequired']
      })),
      approveLabel: approveLabel || null,
      rejectLabel: rejectLabel || null,
      allowReject
    } : null,
    onApprove: approveTarget,
    onReject: allowReject ? rejectTarget : null,
    x: step['x'] as number | null,
    y: step['y'] as number | null
  };
}

/** Drops undefined fields — the JSON-bound form of both sides is compared. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

const FIXTURES: Array<{ name: string; step: WorkflowStep; label: string }> = [
  {
    name: 'role-assigned approval with SLA and two targets',
    label: 'Müdür onayında',
    step: {
      key: 'mudur', type: 'approval', name: 'Müdür Onayı',
      assignment: { mode: 'role', roleId: 3, userId: null },
      sla: { dueHours: 24, escalateAfterHours: 48, onTimeout: 'escalate' },
      form: null, onApprove: 'finans', onReject: 'duzelt', x: 120, y: 40
    }
  },
  {
    name: 'approval with free field, record field, rejection disabled (reject target dropped)',
    label: '',
    step: {
      key: 'kontrol', type: 'approval', name: 'Kontrol',
      assignment: { mode: 'user', roleId: null, userId: 9 },
      sla: null,
      form: {
        fields: [{ name: 'gerekce', dataType: 'enum', label: 'Gerekçe', isRequired: true, enumValues: 'a|b' }],
        recordFields: [{ column: 'Tutar', isRequired: true }],
        approveLabel: 'Kontrol Et', rejectLabel: null, allowReject: false
      },
      onApprove: null, onReject: 'eski'
    }
  },
  {
    name: 'approval assigned to the record creator, with terminal targets',
    label: '',
    step: {
      key: 'talep', type: 'approval', name: 'Talep sahibi',
      assignment: { mode: 'creator', roleId: null, userId: null },
      sla: null, form: null, onApprove: null, onReject: null
    }
  },
  {
    name: 'parallel step with the any rule',
    label: 'Paralel onayda',
    step: {
      key: 'onaylar', type: 'parallel', name: 'Onaylar', mode: 'any',
      branches: [
        { key: 'finans', name: 'Finans', assignment: { mode: 'role', roleId: 4, userId: null }, sla: null },
        { key: 'hukuk', name: 'Hukuk', assignment: { mode: 'user', roleId: null, userId: 7 }, sla: null }
      ],
      assignment: null, sla: null, form: null, onComplete: 'final', onAnyReject: 'duzelt'
    }
  },
  {
    name: 'positioned parallel step with branch SLA and the all rule',
    label: '',
    step: {
      key: 'kurul', type: 'parallel', name: 'Kurul', mode: 'all',
      branches: [
        {
          key: 'uye1', name: 'Üye 1', assignment: { mode: 'role', roleId: 5, userId: null },
          sla: { dueHours: 12, escalateAfterHours: 24, onTimeout: 'autoReject' }
        },
        { key: 'uye2', name: 'Üye 2', assignment: { mode: 'role', roleId: 6, userId: null }, sla: null }
      ],
      assignment: null, sla: null, form: null, onComplete: null, onAnyReject: null, x: 300, y: 260
    }
  },
  {
    name: 'approval with button labels only (form is produced)',
    label: 'Onaylandı',
    step: {
      key: 'son', type: 'approval', name: 'Son',
      assignment: { mode: 'role', roleId: 1, userId: null },
      sla: null,
      form: { fields: [], recordFields: [], approveLabel: 'Bitir', rejectLabel: 'Geri Gönder', allowReject: true },
      onApprove: null, onReject: 'mudur'
    }
  }
];

describe('stepFromFormValue', () => {
  const fb = new FormBuilder();

  const rawOf = (step: WorkflowStep, label = '') =>
    newStepGroup(fb, step.key, step, label).getRawValue() as Record<string, unknown>;

  for (const fixture of FIXTURES) {
    it(`produces the same step as the old buildGraph: ${fixture.name}`, () => {
      const raw = rawOf(fixture.step, fixture.label);

      const mapped = stepFromFormValue(raw, fixture.step);
      const frozen = frozenBuildGraphStep({ ...raw, x: fixture.step.x ?? null, y: fixture.step.y ?? null });

      expect(plain(mapped.step)).toEqual(plain(frozen));
      expect(mapped.statusLabel).toBe(fixture.label);
    });
  }

  it('applying twice gives the same result (normalisation is stable)', () => {
    for (const fixture of FIXTURES) {
      const once = stepFromFormValue(rawOf(fixture.step), fixture.step).step;
      const twice = stepFromFormValue(rawOf(once), once).step;
      expect(plain(twice)).toEqual(plain(once));
    }
  });

  it('keeps the form field\'s maximum length (used to be deleted)', () => {
    const step: WorkflowStep = {
      key: 'a', type: 'approval', name: 'A', assignment: { mode: 'role', roleId: 1 },
      form: { fields: [{ name: 'not', dataType: 'string', isRequired: false, maxLength: 120 }] }
    };

    const mapped = stepFromFormValue(rawOf(step), step).step;

    expect(mapped.form?.fields[0].maxLength).toBe(120);
  });

  it('keeps the parallel branch\'s form (used to be deleted)', () => {
    const step = { ...FIXTURES[3].step };
    step.branches = [
      { ...step.branches![0], form: { fields: [], recordFields: [{ column: 'Tutar', isRequired: true }] } },
      step.branches![1]
    ];

    const mapped = stepFromFormValue(rawOf(step), step).step;

    expect(mapped.branches?.[0].form?.recordFields).toEqual([{ column: 'Tutar', isRequired: true }]);
    expect(mapped.branches?.[1].form).toBeUndefined();
  });

  it('keeps fields of the step we do not know', () => {
    const step = { ...FIXTURES[0].step, aciklama: 'AI notu' } as WorkflowStep & { aciklama: string };

    const mapped = stepFromFormValue(rawOf(step), step).step as WorkflowStep & { aciklama?: string };

    expect(mapped.aciklama).toBe('AI notu');
  });

  it('takes the position from the original step, not the pop-up', () => {
    const step = FIXTURES[0].step;
    const mapped = stepFromFormValue({ ...rawOf(step), x: 1, y: 2 }, step).step;

    expect([mapped.x, mapped.y]).toEqual([120, 40]);
  });

  it('a new step starts without position (auto layout)', () => {
    const mapped = stepFromFormValue(rawOf(FIXTURES[0].step), null).step;
    expect([mapped.x, mapped.y]).toEqual([null, null]);
  });

  it('approval fields are deleted from a step turned parallel', () => {
    const original = FIXTURES[0].step;
    const raw = { ...rawOf(original), type: 'parallel', branches: [] };

    const mapped = stepFromFormValue(raw, original).step;

    expect('onApprove' in mapped).toBeFalse();
    expect('onReject' in mapped).toBeFalse();
    expect(mapped.onComplete).toBe('finans');
  });

  it('parallel fields are deleted from a step turned approval (a leftover branch would fail publishing)', () => {
    const original = FIXTURES[3].step;
    const raw = { ...rawOf(original), type: 'approval' };

    const mapped = stepFromFormValue(raw, original).step;

    for (const key of ['branches', 'mode', 'onComplete', 'onAnyReject']) {
      expect(key in mapped).withContext(key).toBeFalse();
    }
    expect(mapped.onApprove).toBe('final');
  });
});
