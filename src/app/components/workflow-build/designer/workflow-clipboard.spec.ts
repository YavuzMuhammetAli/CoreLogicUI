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

/** mudur → finans → son; finans reddederse mudur'e döner. */
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
  it('seçili adım yoksa pano boş kalır', () => {
    expect(copySteps(sampleDoc(), [])).toBeNull();
    expect(copySteps(sampleDoc(), ['yok'])).toBeNull();
  });

  it('pano belgeden bağımsızdır (derin kopya)', () => {
    const doc = sampleDoc();
    const clip = copySteps(doc, ['mudur'])!;

    doc.graph.steps[0].name = 'değişti';
    expect(clip.steps[0].name).toBe('mudur');
    expect(clip.labels).toEqual({ mudur: 'Müdürde' });
  });

  it('yapıştırılan adım çakışmayan anahtar alır ve kayar', () => {
    const doc = sampleDoc();
    const { doc: next, keys } = pasteSteps(doc, copySteps(doc, ['mudur'])!);

    expect(keys).toEqual(['mudur_2']);
    const copy = findStep(next, 'mudur_2')!;
    expect([copy.x, copy.y]).toEqual([PASTE_OFFSET, PASTE_OFFSET]);
    expect(next.graph.entityStatusMap['mudur_2']).toBe('Müdürde');
    expect(next.graph.startStep).toBe('mudur');
  });

  it('ikinci yapıştırma bir sonraki boş anahtarı alır', () => {
    const doc = sampleDoc();
    const clip = copySteps(doc, ['mudur'])!;
    const once = pasteSteps(doc, clip).doc;

    expect(pasteSteps(once, clip).keys).toEqual(['mudur_3']);
  });

  it('numaralı kopyanın kopyası kökten numaralanır (mudur_2_2 değil)', () => {
    const doc = pasteSteps(sampleDoc(), copySteps(sampleDoc(), ['mudur'])!).doc;

    expect(pasteSteps(doc, copySteps(doc, ['mudur_2'])!).keys).toEqual(['mudur_3']);
  });

  it('kopyalar arasındaki bağlantılar yeni anahtarlara taşınır, dışarı gidenler kopyalanmaz', () => {
    const doc = sampleDoc();
    const { doc: next } = pasteSteps(doc, copySteps(doc, ['mudur', 'finans'])!);

    const mudur = findStep(next, 'mudur_2')!;
    const finans = findStep(next, 'finans_2')!;
    expect(mudur.onApprove).toBe('finans_2');
    expect(finans.onReject).toBe('mudur_2');
    expect(finans.onApprove).toBeNull();

    // Asıllar yerinde.
    expect(findStep(next, 'finans')!.onApprove).toBe('son');
  });

  it('konumsuz adım konumsuz kalır (otomatik yerleşime katılır)', () => {
    const doc = sampleDoc();
    const { doc: next } = pasteSteps(doc, copySteps(doc, ['son'])!);

    expect(findStep(next, 'son_2')!.x).toBeNull();
  });

  it('boş belgeye yapıştırılan ilk kopya başlangıç olur', () => {
    const clip = copySteps(sampleDoc(), ['finans'])!;
    const { doc } = pasteSteps(emptyDoc(), clip);

    expect(doc.graph.startStep).toBe('finans');
    expect(findStep(doc, 'finans')!.onReject).toBeNull();
  });
});
