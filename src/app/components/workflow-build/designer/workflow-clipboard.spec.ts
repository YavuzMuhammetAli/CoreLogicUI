import { WorkflowStep } from '../../../models/workflow.model';
import { WorkflowDesignDoc, emptyDoc } from './workflow-design.doc';
import { findStep } from './workflow-design.commands';
import { PASTE_OFFSET, copySteps, pasteSteps } from './workflow-clipboard';

function approval(key: string, onApprove: string | null = null, onReject: string | null = null,
                  x: number | null = null, y: number | null = null): WorkflowStep {
  return {
    key, type: 'approval', name: key,
    assignment: { mode: 'role', roleId: 1 }, onApprove, onReject, x, y
  };
}

/** mudur → finans → son; if finans rejects, it returns to mudur. */
function sampleDoc(): WorkflowDesignDoc {
  const doc = emptyDoc();
  return {
    ...doc,
    graph: {
      startStep: 'mudur',
      steps: [
        approval('mudur', 'finans', null, 0, 0),
        approval('finans', 'son', 'mudur', 0, 120),
        approval('son')
      ],
      entityStatusMap: { mudur: 'Müdürde', finans: 'Finansta', __completed: 'Onaylandı' }
    }
  };
}

describe('workflow-clipboard', () => {
  it('the clipboard stays empty when no step is selected', () => {
    expect(copySteps(sampleDoc(), [])).toBeNull();
    expect(copySteps(sampleDoc(), ['yok'])).toBeNull();
  });

  it('the clipboard is independent of the document (deep copy)', () => {
    const doc = sampleDoc();
    const clip = copySteps(doc, ['mudur'])!;

    doc.graph.steps[0].name = 'değişti';
    expect(clip.steps[0].name).toBe('mudur');
    expect(clip.labels).toEqual({ mudur: 'Müdürde' });
  });

  it('a pasted step gets a non-colliding key and is shifted', () => {
    const doc = sampleDoc();
    const { doc: next, keys } = pasteSteps(doc, copySteps(doc, ['mudur'])!);

    expect(keys).toEqual(['mudur_2']);
    const copy = findStep(next, 'mudur_2')!;
    expect([copy.x, copy.y]).toEqual([PASTE_OFFSET, PASTE_OFFSET]);
    expect(next.graph.entityStatusMap['mudur_2']).toBe('Müdürde');
    expect(next.graph.startStep).toBe('mudur');
  });

  it('a second paste takes the next free key', () => {
    const doc = sampleDoc();
    const clip = copySteps(doc, ['mudur'])!;
    const once = pasteSteps(doc, clip).doc;

    expect(pasteSteps(once, clip).keys).toEqual(['mudur_3']);
  });

  it('a copy of a numbered copy is numbered from the root (not mudur_2_2)', () => {
    const doc = pasteSteps(sampleDoc(), copySteps(sampleDoc(), ['mudur'])!).doc;

    expect(pasteSteps(doc, copySteps(doc, ['mudur_2'])!).keys).toEqual(['mudur_3']);
  });

  it('connections between copies move to the new keys, outgoing ones are not copied', () => {
    const doc = sampleDoc();
    const { doc: next } = pasteSteps(doc, copySteps(doc, ['mudur', 'finans'])!);

    const managerCopy = findStep(next, 'mudur_2')!;
    const financeCopy = findStep(next, 'finans_2')!;
    expect(managerCopy.onApprove).toBe('finans_2');
    expect(financeCopy.onReject).toBe('mudur_2');
    expect(financeCopy.onApprove).toBeNull();

    // The originals are unchanged.
    expect(findStep(next, 'finans')!.onApprove).toBe('son');
  });

  it('a step without position stays without position (joins auto layout)', () => {
    const doc = sampleDoc();
    const { doc: next } = pasteSteps(doc, copySteps(doc, ['son'])!);

    expect(findStep(next, 'son_2')!.x).toBeNull();
  });

  it('the first copy pasted into an empty document becomes the start', () => {
    const clip = copySteps(sampleDoc(), ['finans'])!;
    const { doc } = pasteSteps(emptyDoc(), clip);

    expect(doc.graph.startStep).toBe('finans');
    expect(findStep(doc, 'finans')!.onReject).toBeNull();
  });
});
