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

  describe('koşul ve bitiş', () => {
    const condition: WorkflowStep = {
      key: 'tutar', type: 'condition', name: 'Tutar?', defaultTo: 'son',
      cases: [
        { key: 'buyuk', label: 'Büyük', when: [], to: 'finans' },
        { key: 'acil', label: null, when: [], to: null }
      ]
    };

    it('koşul: durum başına nötr port + varsayılan, terminale düşmez', () => {
      const exits = exitsOf(condition);
      expect(exits.map(e => e.port)).toEqual(['case:buyuk', 'case:acil', 'default']);
      expect(exits.every(e => e.kind === 'neutral' && e.fallback === null)).toBeTrue();
      expect(exits.map(e => e.label)).toEqual(['Büyük', 'acil', null]);
      expect(exits.map(e => e.target)).toEqual(['finans', null, 'son']);
    });

    it('bitişin çıkışı yok', () => {
      expect(exitsOf({ key: 'son', type: 'end', name: 'Son', outcome: 'completed' })).toEqual([]);
    });

    it('setExit durum ve varsayılan yolu yazar; değişmeyende aynı nesne', () => {
      expect(setExit(condition, casePort('acil'), 'mudur').cases![1].to).toBe('mudur');
      expect(setExit(condition, 'default', 'red').defaultTo).toBe('red');
      expect(setExit(condition, casePort('buyuk'), 'finans')).toBe(condition);
      expect(setExit(condition, casePort('yok'), 'x')).toBe(condition);
      expect(setExit(condition, 'approve', 'x')).toBe(condition);
    });

    it('mapRefs koşul yollarını da taşır', () => {
      const renamed = mapRefs(condition, key => key === 'finans' ? 'muhasebe' : key === 'son' ? null : key);
      expect(renamed.cases![0].to).toBe('muhasebe');
      expect(renamed.defaultTo).toBeNull();
    });

    it('port ↔ durum anahtarı', () => {
      expect(caseKeyOf('case:buyuk')).toBe('buyuk');
      expect(caseKeyOf('default')).toBeNull();
    });
  });

  describe('alan güncelle / bildirim', () => {
    const action: WorkflowStep = { key: 'yaz', type: 'action', name: 'Yaz', sets: [], next: 'son' };

    it('tek nötr "sonraki" çıkışı; hedefsizse terminale düşmez', () => {
      expect(exitsOf(action)).toEqual([
        { port: 'next', kind: 'neutral', target: 'son', fallback: null, enabled: true, label: null }
      ]);
      expect(exitsOf({ ...action, type: 'notify', next: null })[0].target).toBeNull();
    });

    it('setExit yalnız next yazar; mapRefs onu da taşır', () => {
      expect(setExit(action, 'next', 'finans').next).toBe('finans');
      expect(setExit(action, 'approve', 'finans')).toBe(action);
      expect(setExit(action, 'next', 'son')).toBe(action);
      expect(mapRefs(action, key => key === 'son' ? null : key).next).toBeNull();
    });
  });
});
