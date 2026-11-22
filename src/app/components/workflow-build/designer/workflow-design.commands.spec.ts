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

/** yonetici → onaylar(parallel) → final; if onaylar rejects, it returns to yonetici. */
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
    it('appends a new step; becomes the start if there is none', () => {
      const doc = upsertStep(emptyDoc(), null, approval('ilk'), '');

      expect(doc.graph.steps.map(s => s.key)).toEqual(['ilk']);
      expect(doc.graph.startStep).toBe('ilk');
    });

    it('a new step does not change the start when one exists', () => {
      const doc = upsertStep(sampleDoc(), null, approval('ek'), '');

      expect(doc.graph.startStep).toBe('yonetici');
      expect(doc.graph.steps.length).toBe(4);
    });

    it('when the key changes, exits, the start and the status label are moved', () => {
      const original = sampleDoc();
      const renamed = { ...findStep(original, 'yonetici')!, key: 'mudur' };

      const doc = upsertStep(original, 'yonetici', renamed, 'Müdür onayında');

      expect(doc.graph.startStep).toBe('mudur');
      expect(findStep(doc, 'onaylar')!.onAnyReject).toBe('mudur');
      expect(doc.graph.entityStatusMap['mudur']).toBe('Müdür onayında');
      expect('yonetici' in doc.graph.entityStatusMap).toBeFalse();
    });

    it('renaming matches case-insensitively (like backend FindStep)', () => {
      const original = sampleDoc();
      const steps = original.graph.steps.map(s => s.key === 'onaylar' ? { ...s, onAnyReject: 'YONETICI' } : s);
      const doc = upsertStep({ ...original, graph: { ...original.graph, steps } },
        'yonetici', { ...findStep(original, 'yonetici')!, key: 'mudur' }, '');

      expect(findStep(doc, 'onaylar')!.onAnyReject).toBe('mudur');
    });

    it('end labels and other steps\' labels are kept', () => {
      // Because the old buildGraph rebuilt the map from the steps, end labels
      // were deleted on every save.
      const doc = upsertStep(sampleDoc(), 'final', approval('final'), 'Son kontrol');

      expect(doc.graph.entityStatusMap).toEqual({
        yonetici: 'Yönetici onayında',
        onaylar: 'Paralel onayda',
        final: 'Son kontrol',
        __completed: 'Onaylandı',
        __rejected: 'Reddedildi'
      });
    });

    it('an empty status label deletes the entry', () => {
      const doc = upsertStep(sampleDoc(), 'yonetici', findStep(sampleDoc(), 'yonetici')!, '  ');
      expect('yonetici' in doc.graph.entityStatusMap).toBeFalse();
    });
  });

  describe('removeStep', () => {
    it('exits connected to the step fall to the terminal, its label is deleted', () => {
      const doc = removeStep(sampleDoc(), 'onaylar');

      expect(doc.graph.steps.map(s => s.key)).toEqual(['yonetici', 'final']);
      expect(findStep(doc, 'yonetici')!.onApprove).toBeNull();
      expect('onaylar' in doc.graph.entityStatusMap).toBeFalse();
      expect(doc.graph.entityStatusMap['__completed']).toBe('Onaylandı');
    });

    it('when the start step is deleted the first remaining step becomes the start', () => {
      const doc = removeStep(sampleDoc(), 'YONETICI');

      expect(doc.graph.startStep).toBe('onaylar');
      expect(findStep(doc, 'onaylar')!.onAnyReject).toBeNull();
    });

    it('returns the document unchanged for an unknown step', () => {
      const doc = sampleDoc();
      expect(removeStep(doc, 'yok')).toBe(doc);
    });
  });

  describe('connect', () => {
    it('writes to approve/reject fields on an approval step', () => {
      const doc = connect(sampleDoc(), 'final', 'reject', 'yonetici');
      expect(findStep(doc, 'final')!.onReject).toBe('yonetici');
    });

    it('writes to complete/anyReject fields on a parallel step', () => {
      const doc = connect(sampleDoc(), 'onaylar', 'complete', 'yonetici');
      expect(findStep(doc, 'onaylar')!.onComplete).toBe('yonetici');
    });

    it('ignores a self-connection', () => {
      const doc = sampleDoc();
      expect(connect(doc, 'final', 'approve', 'FINAL')).toBe(doc);
    });

    it('does not write to the reject exit of a step with rejection disabled (so it does not silently vanish on save)', () => {
      const base = sampleDoc();
      const steps = base.graph.steps.map(s =>
        s.key === 'final' ? { ...s, form: { fields: [], allowReject: false } } : s);
      const doc = { ...base, graph: { ...base.graph, steps } };

      expect(connect(doc, 'final', 'reject', 'yonetici')).toBe(doc);
    });

    it('ignores a port that does not belong to the step', () => {
      const doc = sampleDoc();
      expect(findStep(connect(doc, 'onaylar', 'approve', 'final'), 'onaylar')!.onApprove).toBeUndefined();
    });
  });

  describe('position', () => {
    it('a move is rounded to whole pixels', () => {
      const doc = moveStep(sampleDoc(), 'final', 10.4, 20.6);
      expect([findStep(doc, 'final')!.x, findStep(doc, 'final')!.y]).toEqual([10, 21]);
    });

    it('moving to the same position does not change the document', () => {
      const moved = moveStep(sampleDoc(), 'final', 10, 20);
      expect(moveStep(moved, 'final', 10, 20)).toBe(moved);
    });

    it('auto arrange deletes positions; without positions the document is returned unchanged', () => {
      const moved = moveStep(sampleDoc(), 'final', 10, 20);
      const cleared = clearPositions(moved);

      expect(findStep(cleared, 'final')!.x).toBeNull();
      expect(clearPositions(cleared)).toBe(cleared);
    });
  });

  describe('bulk operations', () => {
    it('moveSteps writes all in a single document; if none change the same document is returned', () => {
      const doc = moveSteps(sampleDoc(), [{ key: 'yonetici', x: 0, y: 0 }, { key: 'FINAL', x: 40, y: 80 }]);

      expect([findStep(doc, 'yonetici')!.x, findStep(doc, 'final')!.y]).toEqual([0, 80]);
      expect(moveSteps(doc, [{ key: 'final', x: 40, y: 80 }])).toBe(doc);
      expect(moveSteps(doc, [{ key: 'yok', x: 1, y: 1 }])).toBe(doc);
    });

    it('removeSteps deletes several steps and clears all their references', () => {
      const doc = removeSteps(sampleDoc(), ['onaylar', 'yonetici']);

      expect(doc.graph.steps.map(s => s.key)).toEqual(['final']);
      expect(doc.graph.startStep).toBe('final');
      expect(doc.graph.entityStatusMap['onaylar']).toBeUndefined();
      expect(doc.graph.entityStatusMap['__completed']).toBe('Onaylandı');
    });

    it('disconnect drops the exit to the terminal, does not touch the other exit', () => {
      const doc = disconnect(sampleDoc(), 'onaylar', 'anyReject');
      const step = findStep(doc, 'onaylar')!;

      expect(step.onAnyReject).toBeNull();
      expect(step.onComplete).toBe('final');
    });

    it('cutting an unconnected exit or an unknown step does not change the document', () => {
      const doc = sampleDoc();
      expect(disconnect(doc, 'final', 'approve')).toBe(doc);
      expect(disconnect(doc, 'yok', 'approve')).toBe(doc);
    });
  });

  describe('header', () => {
    it('an unchanged value returns the same document (no empty undo step)', () => {
      const doc = sampleDoc();
      expect(setMeta(doc, { name: doc.meta.name, isEnabled: doc.meta.isEnabled })).toBe(doc);
      expect(setConditions(doc, [])).toBe(doc);
      expect(setStart(doc, 'yonetici')).toBe(doc);
    });

    it('a changed value returns a new document', () => {
      const doc = sampleDoc();
      expect(setMeta(doc, { name: 'Satın alma' }).meta.name).toBe('Satın alma');
      expect(setConditions(doc, [{ field: 'Tutar', operator: 'gt', value: '0' }]).conditions.length).toBe(1);
    });
  });

  it('the suggested key does not collide with existing keys', () => {
    const doc = upsertStep(upsertStep(emptyDoc(), null, approval('step2'), ''), null, approval('step3'), '');
    expect(suggestKey(doc)).toBe('step4');
  });

  it('commands do not mutate the input', () => {
    const doc = sampleDoc();
    const snapshot = JSON.stringify(doc);

    upsertStep(doc, 'yonetici', { ...findStep(doc, 'yonetici')!, key: 'x' }, 'X');
    removeStep(doc, 'onaylar');
    connect(doc, 'final', 'approve', 'yonetici');
    moveStep(doc, 'final', 5, 5);

    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});
