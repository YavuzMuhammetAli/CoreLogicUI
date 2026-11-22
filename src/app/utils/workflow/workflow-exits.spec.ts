import { WorkflowStep } from '../../models/workflow.model';
import { caseKeyOf, casePort, exitForKind, exitsOf, mapRefs, sameKey, setExit } from './workflow-exits';

const approval: WorkflowStep = {
  key: 'mudur', type: 'approval', name: 'Müdür', onApprove: 'finans', onReject: ''
};

const parallel: WorkflowStep = {
  key: 'onaylar', type: 'parallel', name: 'Onaylar',
  branches: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
  onComplete: null, onAnyReject: 'mudur'
};

describe('workflow-exits', () => {
  it('an approval step has approve/reject exits; an empty target falls back to terminal', () => {
    const exits = exitsOf(approval);

    expect(exits.map(e => [e.port, e.target, e.fallback])).toEqual([
      ['approve', 'finans', '__completed'],
      ['reject', null, '__rejected']
    ]);
  });

  it('a parallel step has complete/anyReject exits', () => {
    expect(exitsOf(parallel).map(e => [e.port, e.kind, e.target])).toEqual([
      ['complete', 'approve', null],
      ['anyReject', 'reject', 'mudur']
    ]);
  });

  it('the reject exit is disabled on an approval step with reject disabled', () => {
    const step = { ...approval, form: { fields: [], allowReject: false } };
    expect(exitsOf(step)[1].enabled).toBeFalse();
  });

  it('the reject exit is disabled on a parallel step where no branch can reject', () => {
    const step = {
      ...parallel,
      branches: parallel.branches!.map(b => ({ ...b, form: { fields: [], allowReject: false } }))
    };
    expect(exitsOf(step)[1].enabled).toBeFalse();
    expect(exitsOf(parallel)[1].enabled).toBeTrue();
  });

  it('a canvas port kind resolves to the step\'s actual exit', () => {
    expect(exitForKind(approval, 'reject')?.port).toBe('reject');
    expect(exitForKind(parallel, 'approve')?.port).toBe('complete');
  });

  it('setExit writes only a port belonging to the step and returns a copy', () => {
    const updated = setExit(approval, 'reject', 'duzelt');
    expect(updated.onReject).toBe('duzelt');
    expect(approval.onReject).toBe('');
    expect(setExit(approval, 'complete', 'x')).toBe(approval);
    expect(setExit(parallel, 'complete', '')).toEqual({ ...parallel, onComplete: null });
  });

  it('mapRefs rewrites targets; returns the same object for an unchanged step', () => {
    const renamed = mapRefs(parallel, key => sameKey(key, 'MUDUR') ? 'yonetici' : key);
    expect(renamed.onAnyReject).toBe('yonetici');

    expect(mapRefs(approval, key => key)).toBe(approval);
    expect(mapRefs(approval, key => key === 'finans' ? null : key).onApprove).toBeNull();
  });

  describe('condition and end', () => {
    const condition: WorkflowStep = {
      key: 'tutar', type: 'condition', name: 'Tutar?', defaultTo: 'son',
      cases: [
        { key: 'buyuk', label: 'Büyük', when: [], to: 'finans' },
        { key: 'acil', label: null, when: [], to: null }
      ]
    };

    it('condition: a neutral port per case + default, no terminal fallback', () => {
      const exits = exitsOf(condition);
      expect(exits.map(e => e.port)).toEqual(['case:buyuk', 'case:acil', 'default']);
      expect(exits.every(e => e.kind === 'neutral' && e.fallback === null)).toBeTrue();
      expect(exits.map(e => e.label)).toEqual(['Büyük', 'acil', null]);
      expect(exits.map(e => e.target)).toEqual(['finans', null, 'son']);
    });

    it('an end has no exits', () => {
      expect(exitsOf({ key: 'son', type: 'end', name: 'Son', outcome: 'completed' })).toEqual([]);
    });

    it('setExit writes case and default paths; same object when unchanged', () => {
      expect(setExit(condition, casePort('acil'), 'mudur').cases![1].to).toBe('mudur');
      expect(setExit(condition, 'default', 'red').defaultTo).toBe('red');
      expect(setExit(condition, casePort('buyuk'), 'finans')).toBe(condition);
      expect(setExit(condition, casePort('yok'), 'x')).toBe(condition);
      expect(setExit(condition, 'approve', 'x')).toBe(condition);
    });

    it('mapRefs also carries condition paths', () => {
      const renamed = mapRefs(condition, key => key === 'finans' ? 'muhasebe' : key === 'son' ? null : key);
      expect(renamed.cases![0].to).toBe('muhasebe');
      expect(renamed.defaultTo).toBeNull();
    });

    it('port ↔ case key', () => {
      expect(caseKeyOf('case:buyuk')).toBe('buyuk');
      expect(caseKeyOf('default')).toBeNull();
    });
  });

  describe('update field / notification', () => {
    const action: WorkflowStep = { key: 'yaz', type: 'action', name: 'Yaz', sets: [], next: 'son' };

    it('a single neutral "next" exit; no terminal fallback without a target', () => {
      expect(exitsOf(action)).toEqual([
        { port: 'next', kind: 'neutral', target: 'son', fallback: null, enabled: true, label: null }
      ]);
      expect(exitsOf({ ...action, type: 'notify', next: null })[0].target).toBeNull();
    });

    it('a timer also has a single "next" exit', () => {
      const timer: WorkflowStep = { key: 'bekle', type: 'timer', name: 'Bekle', timer: { mode: 'duration', amount: 1, unit: 'days' }, next: 'son' };
      expect(exitsOf(timer).map(e => e.port)).toEqual(['next']);
      expect(setExit(timer, 'next', 'x').next).toBe('x');
    });

    it('setExit writes only next; mapRefs carries it too', () => {
      expect(setExit(action, 'next', 'finans').next).toBe('finans');
      expect(setExit(action, 'approve', 'finans')).toBe(action);
      expect(setExit(action, 'next', 'son')).toBe(action);
      expect(mapRefs(action, key => key === 'son' ? null : key).next).toBeNull();
    });
  });
});
