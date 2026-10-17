import { WorkflowStep } from '../../../models/workflow.model';
import { WorkflowDesignDoc, emptyDoc } from './workflow-design.doc';
import {
  clearPositions,
  connect,
  disconnect,
  findStep,
  moveStep,
  moveSteps,
  removeStep,
  removeSteps,
  setConditions,
  setMeta,
  setStart,
  suggestKey,
  upsertStep
} from './workflow-design.commands';

function approval(key: string, onApprove: string | null = null, onReject: string | null = null): WorkflowStep {
  return {
    key, type: 'approval', name: key,
    assignment: { mode: 'role', roleId: 1 }, onApprove, onReject
  };
}

function parallel(key: string, onComplete: string | null = null, onAnyReject: string | null = null): WorkflowStep {
  return {
    key, type: 'parallel', name: key, mode: 'all',
    branches: [{ key: 'b1', name: 'B1' }, { key: 'b2', name: 'B2' }],
    onComplete, onAnyReject
  };
}

/** yonetici → onaylar(paralel) → final; onaylar reddederse yonetici'ye döner. */
function sampleDoc(): WorkflowDesignDoc {
  const doc = emptyDoc();
  return {
    ...doc,
    graph: {
      startStep: 'yonetici',
      steps: [approval('yonetici', 'onaylar'), parallel('onaylar', 'final', 'yonetici'), approval('final')],
      entityStatusMap: {
        yonetici: 'Yönetici onayında',
        onaylar: 'Paralel onayda',
        __completed: 'Onaylandı',
        __rejected: 'Reddedildi'
      }
    }
  };
}

describe('workflow-design.commands', () => {
  describe('upsertStep', () => {
    it('yeni adımı sona ekler; başlangıç yoksa o olur', () => {
      const doc = upsertStep(emptyDoc(), null, approval('ilk'), '');

      expect(doc.graph.steps.map(s => s.key)).toEqual(['ilk']);
      expect(doc.graph.startStep).toBe('ilk');
    });

    it('başlangıç varken yeni adım başlangıcı değiştirmez', () => {
      const doc = upsertStep(sampleDoc(), null, approval('ek'), '');

      expect(doc.graph.startStep).toBe('yonetici');
      expect(doc.graph.steps.length).toBe(4);
    });

    it('anahtar değişince çıkışlar, başlangıç ve durum etiketi taşınır', () => {
      const original = sampleDoc();
      const renamed = { ...findStep(original, 'yonetici')!, key: 'mudur' };

      const doc = upsertStep(original, 'yonetici', renamed, 'Müdür onayında');

      expect(doc.graph.startStep).toBe('mudur');
      expect(findStep(doc, 'onaylar')!.onAnyReject).toBe('mudur');
      expect(doc.graph.entityStatusMap['mudur']).toBe('Müdür onayında');
      expect('yonetici' in doc.graph.entityStatusMap).toBeFalse();
    });

    it('yeniden adlandırma büyük/küçük harf duyarsız eşleşir (backend FindStep gibi)', () => {
      const original = sampleDoc();
      const steps = original.graph.steps.map(s => s.key === 'onaylar' ? { ...s, onAnyReject: 'YONETICI' } : s);
      const doc = upsertStep({ ...original, graph: { ...original.graph, steps } },
        'yonetici', { ...findStep(original, 'yonetici')!, key: 'mudur' }, '');

      expect(findStep(doc, 'onaylar')!.onAnyReject).toBe('mudur');
    });

    it('bitiş etiketleri ve diğer adımların etiketleri korunur', () => {
      // Eski buildGraph haritayı adımlardan yeniden kurduğu için bitiş etiketleri
      // her kayıtta siliniyordu.
      const doc = upsertStep(sampleDoc(), 'final', approval('final'), 'Son kontrol');

      expect(doc.graph.entityStatusMap).toEqual({
        yonetici: 'Yönetici onayında',
        onaylar: 'Paralel onayda',
        final: 'Son kontrol',
        __completed: 'Onaylandı',
        __rejected: 'Reddedildi'
      });
    });

    it('boş durum etiketi girdiyi siler', () => {
      const doc = upsertStep(sampleDoc(), 'yonetici', findStep(sampleDoc(), 'yonetici')!, '  ');
      expect('yonetici' in doc.graph.entityStatusMap).toBeFalse();
    });
  });

  describe('removeStep', () => {
    it('adıma bağlanan çıkışlar terminale düşer, etiketi silinir', () => {
      const doc = removeStep(sampleDoc(), 'onaylar');

      expect(doc.graph.steps.map(s => s.key)).toEqual(['yonetici', 'final']);
      expect(findStep(doc, 'yonetici')!.onApprove).toBeNull();
      expect('onaylar' in doc.graph.entityStatusMap).toBeFalse();
      expect(doc.graph.entityStatusMap['__completed']).toBe('Onaylandı');
    });

    it('başlangıç adımı silinince kalan ilk adım başlangıç olur', () => {
      const doc = removeStep(sampleDoc(), 'YONETICI');

      expect(doc.graph.startStep).toBe('onaylar');
      expect(findStep(doc, 'onaylar')!.onAnyReject).toBeNull();
    });

    it('bilinmeyen adımda belge aynen döner', () => {
      const doc = sampleDoc();
      expect(removeStep(doc, 'yok')).toBe(doc);
    });
  });

  describe('connect', () => {
    it('onay adımında approve/reject alanlarına yazar', () => {
      const doc = connect(sampleDoc(), 'final', 'reject', 'yonetici');
      expect(findStep(doc, 'final')!.onReject).toBe('yonetici');
    });

    it('paralel adımda complete/anyReject alanlarına yazar', () => {
      const doc = connect(sampleDoc(), 'onaylar', 'complete', 'yonetici');
      expect(findStep(doc, 'onaylar')!.onComplete).toBe('yonetici');
    });

    it('kendine bağlantıyı yok sayar', () => {
      const doc = sampleDoc();
      expect(connect(doc, 'final', 'approve', 'FINAL')).toBe(doc);
    });

    it('red kapalı adımın red çıkışına yazmaz (kayıtta sessizce kaybolmasın)', () => {
      const base = sampleDoc();
      const steps = base.graph.steps.map(s =>
        s.key === 'final' ? { ...s, form: { fields: [], allowReject: false } } : s);
      const doc = { ...base, graph: { ...base.graph, steps } };

      expect(connect(doc, 'final', 'reject', 'yonetici')).toBe(doc);
    });

    it('adıma ait olmayan portu yok sayar', () => {
      const doc = sampleDoc();
      expect(findStep(connect(doc, 'onaylar', 'approve', 'final'), 'onaylar')!.onApprove).toBeUndefined();
    });
  });

  describe('konum', () => {
    it('taşıma tam piksele yuvarlanır', () => {
      const doc = moveStep(sampleDoc(), 'final', 10.4, 20.6);
      expect([findStep(doc, 'final')!.x, findStep(doc, 'final')!.y]).toEqual([10, 21]);
    });

    it('aynı konuma taşıma belgeyi değiştirmez', () => {
      const moved = moveStep(sampleDoc(), 'final', 10, 20);
      expect(moveStep(moved, 'final', 10, 20)).toBe(moved);
    });

    it('otomatik düzenle konumları siler; konumsuzsa belge aynen döner', () => {
      const moved = moveStep(sampleDoc(), 'final', 10, 20);
      const cleared = clearPositions(moved);

      expect(findStep(cleared, 'final')!.x).toBeNull();
      expect(clearPositions(cleared)).toBe(cleared);
    });
  });

  describe('çoklu işlemler', () => {
    it('moveSteps hepsini tek belgede yazar; hiçbiri değişmezse aynı belge döner', () => {
      const doc = moveSteps(sampleDoc(), [{ key: 'yonetici', x: 0, y: 0 }, { key: 'FINAL', x: 40, y: 80 }]);

      expect([findStep(doc, 'yonetici')!.x, findStep(doc, 'final')!.y]).toEqual([0, 80]);
      expect(moveSteps(doc, [{ key: 'final', x: 40, y: 80 }])).toBe(doc);
      expect(moveSteps(doc, [{ key: 'yok', x: 1, y: 1 }])).toBe(doc);
    });

    it('removeSteps birden çok adımı siler ve tüm referanslarını temizler', () => {
      const doc = removeSteps(sampleDoc(), ['onaylar', 'yonetici']);

      expect(doc.graph.steps.map(s => s.key)).toEqual(['final']);
      expect(doc.graph.startStep).toBe('final');
      expect(doc.graph.entityStatusMap['onaylar']).toBeUndefined();
      expect(doc.graph.entityStatusMap['__completed']).toBe('Onaylandı');
    });

    it('disconnect çıkışı terminale düşürür, diğer çıkışa dokunmaz', () => {
      const doc = disconnect(sampleDoc(), 'onaylar', 'anyReject');
      const step = findStep(doc, 'onaylar')!;

      expect(step.onAnyReject).toBeNull();
      expect(step.onComplete).toBe('final');
    });

    it('bağlı olmayan çıkışı ya da bilinmeyen adımı kesmek belgeyi değiştirmez', () => {
      const doc = sampleDoc();
      expect(disconnect(doc, 'final', 'approve')).toBe(doc);
      expect(disconnect(doc, 'yok', 'approve')).toBe(doc);
    });
  });

  describe('başlık', () => {
    it('değişmeyen değer aynı belgeyi döner (boş geri al adımı olmasın)', () => {
      const doc = sampleDoc();
      expect(setMeta(doc, { name: doc.meta.name, isEnabled: doc.meta.isEnabled })).toBe(doc);
      expect(setConditions(doc, [])).toBe(doc);
      expect(setStart(doc, 'yonetici')).toBe(doc);
    });

    it('değişen değer yeni belge döner', () => {
      const doc = sampleDoc();
      expect(setMeta(doc, { name: 'Satın alma' }).meta.name).toBe('Satın alma');
      expect(setConditions(doc, [{ field: 'Tutar', operator: 'gt', value: '0' }]).conditions.length).toBe(1);
    });
  });

  it('önerilen anahtar mevcut anahtarlarla çakışmaz', () => {
    const doc = upsertStep(upsertStep(emptyDoc(), null, approval('adim2'), ''), null, approval('adim3'), '');
    expect(suggestKey(doc)).toBe('adim4');
  });

  it('komutlar girdiyi değiştirmez', () => {
    const doc = sampleDoc();
    const snapshot = JSON.stringify(doc);

    upsertStep(doc, 'yonetici', { ...findStep(doc, 'yonetici')!, key: 'x' }, 'X');
    removeStep(doc, 'onaylar');
    connect(doc, 'final', 'approve', 'yonetici');
    moveStep(doc, 'final', 5, 5);

    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});
