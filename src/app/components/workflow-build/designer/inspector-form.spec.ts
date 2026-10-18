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
  it('değişmeyen değer aynı adım nesnesini döner', () => {
    const step = approval();
    expect(setName(step, 'Müdür')).toBe(step);
    expect(setAssignmentMode(step, 'role')).toBe(step);
    expect(setAssignee(step, 3)).toBe(step);
    expect(setDueHours(step, null)).toBe(step);
    expect(setAllowReject(step, true)).toBe(step);
  });

  it('atama türü değişince seçim sıfırlanır', () => {
    expect(setAssignmentMode(approval(), 'user').assignment).toEqual({ mode: 'user', userId: null });
    expect(setAssignmentMode(approval(), 'creator').assignment).toEqual({ mode: 'creator' });
  });

  it('rol/kullanıcı seçimi; boş seçim eksik atama bırakır', () => {
    expect(setAssignee(approval(), 5).assignment).toEqual({ mode: 'role', roleId: 5 });
    expect(setAssignee(approval(), 0).assignment).toEqual({ mode: 'role', roleId: null });
    const user = setAssignmentMode(approval(), 'user');
    expect(setAssignee(user, 9).assignment).toEqual({ mode: 'user', userId: 9 });
    const creator = setAssignmentMode(approval(), 'creator');
    expect(setAssignee(creator, 9)).toBe(creator);
  });

  describe('süre sınırı', () => {
    it('ilk kez verilince yükseltme politikasıyla SLA açılır', () => {
      expect(setDueHours(approval(), 48).sla).toEqual({ onTimeout: 'escalate', dueHours: 48 });
    });

    it('mevcut SLA ayarları korunur', () => {
      const step = approval({ sla: { dueHours: 24, escalateAfterHours: 48, onTimeout: 'autoReject' } });
      expect(setDueHours(step, 12).sla).toEqual({ dueHours: 12, escalateAfterHours: 48, onTimeout: 'autoReject' });
    });

    it('silinince yalnız süre kalkar; başka ayar yoksa SLA düşer', () => {
      const withEscalation = approval({ sla: { dueHours: 24, escalateAfterHours: 48, onTimeout: 'escalate' } });
      expect(setDueHours(withEscalation, null).sla).toEqual({ escalateAfterHours: 48, onTimeout: 'escalate' });
      expect(setDueHours(approval({ sla: { dueHours: 24, onTimeout: 'escalate' } }), 0).sla).toBeNull();
    });
  });

  it('reddi kapatmak red hedefini temizler (görev olur); açmak geri getirmez', () => {
    const task = setAllowReject(approval(), false);
    expect(task.form?.allowReject).toBeFalse();
    expect(task.onReject).toBeNull();
    expect(exitRows(task).map(r => r.port)).toEqual(['approve']);

    const back = setAllowReject(task, true);
    expect(back.form?.allowReject).toBeTrue();
    expect(exitRows(back).map(r => r.port)).toEqual(['approve', 'reject']);
  });

  it('paralel ilerleme kuralı', () => {
    const step: WorkflowStep = { key: 'p', type: 'parallel', name: 'P', branches: [] };
    expect(setJoinMode(step, 'all')).toBe(step);
    expect(setJoinMode(step, 'any').mode).toBe('any');
  });

  it('anahtar denetimi', () => {
    const keys = ['mudur', 'finans'];
    expect(keyProblem('', keys, 'mudur')).toBe('empty');
    expect(keyProblem('1abc', keys, 'mudur')).toBe('invalid');
    expect(keyProblem('müdür', keys, 'mudur')).toBe('invalid');
    expect(keyProblem('FINANS', keys, 'mudur')).toBe('duplicate');
    expect(keyProblem('MUDUR', keys, 'mudur')).toBeNull();
    expect(keyProblem('yonetici', keys, 'mudur')).toBeNull();
  });

  it('çıkış satırları hedefleri taşır', () => {
    expect(exitRows(approval())).toEqual([
      { port: 'approve', kind: 'approve', target: 'finans' },
      { port: 'reject', kind: 'reject', target: 'geri' }
    ]);
  });
});

describe('panel komutları', () => {
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

  it('patchStep değişmeyen dönüşümde belgeyi aynen döner', () => {
    const d = doc();
    expect(patchStep(d, 'mudur', step => step)).toBe(d);
    expect(findStep(patchStep(d, 'MUDUR', step => setName(step, 'Yönetici')), 'mudur')!.name).toBe('Yönetici');
  });

  it('labelStep etiketi yazar ve siler', () => {
    expect(labelStep(doc(), 'finans', 'Finansta').graph.entityStatusMap['finans']).toBe('Finansta');
    expect(labelStep(doc(), 'mudur', '').graph.entityStatusMap['mudur']).toBeUndefined();
  });

  it('renameStep referansları, başlangıcı ve etiketi taşır', () => {
    const renamed = renameStep(doc(), 'mudur', 'yonetici');

    expect(renamed.graph.startStep).toBe('yonetici');
    expect(findStep(renamed, 'finans')!.onReject).toBe('yonetici');
    expect(renamed.graph.entityStatusMap['yonetici']).toBe('Müdürde');
    expect(renameStep(renamed, 'yonetici', 'yonetici')).toBe(renamed);
  });
});
