import { WorkflowStep } from '../../../models/workflow.model';
import {
  exitRows, keyProblem, setAllowReject, setAssignee, setAssignmentMode, setDueHours, setJoinMode, setName
} from './inspector-form';
import { WorkflowDesignDoc, emptyDoc } from './workflow-design.doc';
import { findStep, labelStep, patchStep, renameStep } from './workflow-design.commands';

function approval(extra: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    key: 'mudur', type: 'approval', name: 'Müdür',
    assignment: { mode: 'role', roleId: 3 }, onApprove: 'finans', onReject: 'geri', ...extra
  };
}

describe('inspector-form', () => {
  it('an unchanged value returns the same step object', () => {
    const step = approval();
    expect(setName(step, 'Müdür')).toBe(step);
    expect(setAssignmentMode(step, 'role')).toBe(step);
    expect(setAssignee(step, 3)).toBe(step);
    expect(setDueHours(step, null)).toBe(step);
    expect(setAllowReject(step, true)).toBe(step);
  });

  it('changing the assignment type resets the selection', () => {
    expect(setAssignmentMode(approval(), 'user').assignment).toEqual({ mode: 'user', userId: null });
    expect(setAssignmentMode(approval(), 'creator').assignment).toEqual({ mode: 'creator' });
  });

  it('role/user selection; an empty selection leaves a missing assignment', () => {
    expect(setAssignee(approval(), 5).assignment).toEqual({ mode: 'role', roleId: 5 });
    expect(setAssignee(approval(), 0).assignment).toEqual({ mode: 'role', roleId: null });
    const user = setAssignmentMode(approval(), 'user');
    expect(setAssignee(user, 9).assignment).toEqual({ mode: 'user', userId: 9 });
    const creator = setAssignmentMode(approval(), 'creator');
    expect(setAssignee(creator, 9)).toBe(creator);
  });

  describe('time limit', () => {
    it('when given for the first time, SLA opens with an escalation policy', () => {
      expect(setDueHours(approval(), 48).sla).toEqual({ onTimeout: 'escalate', dueHours: 48 });
    });

    it('existing SLA settings are kept', () => {
      const step = approval({ sla: { dueHours: 24, escalateAfterHours: 48, onTimeout: 'autoReject' } });
      expect(setDueHours(step, 12).sla).toEqual({ dueHours: 12, escalateAfterHours: 48, onTimeout: 'autoReject' });
    });

    it('when removed only the duration goes; with no other setting the SLA is dropped', () => {
      const withEscalation = approval({ sla: { dueHours: 24, escalateAfterHours: 48, onTimeout: 'escalate' } });
      expect(setDueHours(withEscalation, null).sla).toEqual({ escalateAfterHours: 48, onTimeout: 'escalate' });
      expect(setDueHours(approval({ sla: { dueHours: 24, onTimeout: 'escalate' } }), 0).sla).toBeNull();
    });
  });

  it('disabling rejection clears the reject target (becomes a task); enabling does not restore it', () => {
    const task = setAllowReject(approval(), false);
    expect(task.form?.allowReject).toBeFalse();
    expect(task.onReject).toBeNull();
    expect(exitRows(task).map(r => r.port)).toEqual(['approve']);

    const back = setAllowReject(task, true);
    expect(back.form?.allowReject).toBeTrue();
    expect(exitRows(back).map(r => r.port)).toEqual(['approve', 'reject']);
  });

  it('parallel progress rule', () => {
    const step: WorkflowStep = { key: 'p', type: 'parallel', name: 'P', branches: [] };
    expect(setJoinMode(step, 'all')).toBe(step);
    expect(setJoinMode(step, 'any').mode).toBe('any');
  });

  it('key check', () => {
    const keys = ['mudur', 'finans'];
    expect(keyProblem('', keys, 'mudur')).toBe('empty');
    expect(keyProblem('1abc', keys, 'mudur')).toBe('invalid');
    expect(keyProblem('müdür', keys, 'mudur')).toBe('invalid');
    expect(keyProblem('FINANS', keys, 'mudur')).toBe('duplicate');
    expect(keyProblem('MUDUR', keys, 'mudur')).toBeNull();
    expect(keyProblem('yonetici', keys, 'mudur')).toBeNull();
  });

  it('exit rows carry the targets', () => {
    expect(exitRows(approval())).toEqual([
      { port: 'approve', kind: 'approve', target: 'finans' },
      { port: 'reject', kind: 'reject', target: 'geri' }
    ]);
  });
});

describe('panel commands', () => {
  function doc(): WorkflowDesignDoc {
    const base = emptyDoc();
    return {
      ...base,
      graph: {
        startStep: 'mudur',
        steps: [approval(), { ...approval({ key: 'finans', name: 'Finans', onApprove: null, onReject: 'mudur' }) }],
        entityStatusMap: { mudur: 'Müdürde' }
      }
    };
  }

  it('patchStep returns the document unchanged for a no-op transformation', () => {
    const d = doc();
    expect(patchStep(d, 'mudur', step => step)).toBe(d);
    expect(findStep(patchStep(d, 'MUDUR', step => setName(step, 'Yönetici')), 'mudur')!.name).toBe('Yönetici');
  });

  it('labelStep writes and deletes the label', () => {
    expect(labelStep(doc(), 'finans', 'Finansta').graph.entityStatusMap['finans']).toBe('Finansta');
    expect(labelStep(doc(), 'mudur', '').graph.entityStatusMap['mudur']).toBeUndefined();
  });

  it('renameStep moves references, the start and the label', () => {
    const renamed = renameStep(doc(), 'mudur', 'yonetici');

    expect(renamed.graph.startStep).toBe('yonetici');
    expect(findStep(renamed, 'finans')!.onReject).toBe('yonetici');
    expect(renamed.graph.entityStatusMap['yonetici']).toBe('Müdürde');
    expect(renameStep(renamed, 'yonetici', 'yonetici')).toBe(renamed);
  });
});
