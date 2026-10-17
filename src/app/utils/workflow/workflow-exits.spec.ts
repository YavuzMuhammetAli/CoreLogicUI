import { WorkflowStep } from '../../models/workflow.model';
import { exitForKind, exitsOf, mapRefs, sameKey, setExit } from './workflow-exits';

const approval: WorkflowStep = {
  key: 'mudur', type: 'approval', name: 'Müdür', onApprove: 'finans', onReject: ''
};

const parallel: WorkflowStep = {
  key: 'onaylar', type: 'parallel', name: 'Onaylar',
  branches: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }],
  onComplete: null, onAnyReject: 'mudur'
};

describe('workflow-exits', () => {
  it('onay adımı approve/reject çıkışları verir; boş hedef terminale düşer', () => {
    const exits = exitsOf(approval);

    expect(exits.map(e => [e.port, e.target, e.fallback])).toEqual([
      ['approve', 'finans', '__completed'],
      ['reject', null, '__rejected']
    ]);
  });

  it('paralel adım complete/anyReject çıkışları verir', () => {
    expect(exitsOf(parallel).map(e => [e.port, e.kind, e.target])).toEqual([
      ['complete', 'approve', null],
      ['anyReject', 'reject', 'mudur']
    ]);
  });

  it('red kapalı onay adımında red çıkışı kapalıdır', () => {
    const step = { ...approval, form: { fields: [], allowReject: false } };
    expect(exitsOf(step)[1].enabled).toBeFalse();
  });

  it('hiçbir dalı reddedemeyen paralel adımda red çıkışı kapalıdır', () => {
    const step = {
      ...parallel,
      branches: parallel.branches!.map(b => ({ ...b, form: { fields: [], allowReject: false } }))
    };
    expect(exitsOf(step)[1].enabled).toBeFalse();
    expect(exitsOf(parallel)[1].enabled).toBeTrue();
  });

  it('canvas port türü adımın gerçek çıkışına çözülür', () => {
    expect(exitForKind(approval, 'reject')?.port).toBe('reject');
    expect(exitForKind(parallel, 'approve')?.port).toBe('complete');
  });

  it('setExit yalnız adıma ait portu yazar ve kopya döner', () => {
    const updated = setExit(approval, 'reject', 'duzelt');
    expect(updated.onReject).toBe('duzelt');
    expect(approval.onReject).toBe('');
    expect(setExit(approval, 'complete', 'x')).toBe(approval);
    expect(setExit(parallel, 'complete', '')).toEqual({ ...parallel, onComplete: null });
  });

  it('mapRefs hedefleri yeniden yazar; değişmeyen adımı aynı nesneyle döner', () => {
    const renamed = mapRefs(parallel, key => sameKey(key, 'MUDUR') ? 'yonetici' : key);
    expect(renamed.onAnyReject).toBe('yonetici');

    expect(mapRefs(approval, key => key)).toBe(approval);
    expect(mapRefs(approval, key => key === 'finans' ? null : key).onApprove).toBeNull();
  });
});
