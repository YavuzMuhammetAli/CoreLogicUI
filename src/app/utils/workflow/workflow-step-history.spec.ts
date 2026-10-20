import { WorkflowEvent, WorkflowGraph, WorkflowTask } from '../../models/workflow.model';
import { buildStepHistory, lastDecision, waitingNames } from './workflow-step-history';

const graph: WorkflowGraph = {
  startStep: 'mudur',
  steps: [
    { key: 'Mudur', type: 'approval', name: 'Müdür onayı', onApprove: 'onaylar', onReject: 'red' },
    { key: 'onaylar', type: 'parallel', name: 'Onaylar', branches: [{ key: 'f', name: 'Finans' }, { key: 's', name: 'Satın alma' }], onComplete: 'tutar', onAnyReject: 'mudur' },
    { key: 'tutar', type: 'condition', name: 'Tutar', cases: [{ key: 'buyuk', label: 'Büyük', when: [], to: 'yaz' }], defaultTo: 'son' },
    { key: 'yaz', type: 'action', name: 'Yaz', sets: [], next: 'bekle' },
    { key: 'bekle', type: 'timer', name: 'Bekle', next: 'son' },
    { key: 'son', type: 'end', name: 'Son', outcome: 'completed' },
    { key: 'red', type: 'end', name: 'Red', outcome: 'rejected' }
  ],
  entityStatusMap: {}
};

let id = 0;
function task(partial: Partial<WorkflowTask>): WorkflowTask {
  return {
    id: ++id, instanceId: 1, stepKey: 'mudur', name: '', status: 'Pending', createdOn: '',
    entityType: 'Talep', entityId: 1, workflowName: 'Akış', isOverdue: false, ...partial
  };
}
function ev(eventType: string, stepKey: string, data?: object, createdAt = '2026-10-20T10:00:00'): WorkflowEvent {
  return { id: ++id, eventType, stepKey, dataJson: data ? JSON.stringify(data) : null, createdAt };
}

describe('workflow-step-history', () => {
  it('yalnız yoldaki adımlar döner; anahtar küçük harfli, ad korunur', () => {
    const history = buildStepHistory(graph, { status: 'Running', timeline: [], tasks: [] },
      { nodes: { mudur: 'current' }, edges: [] });

    expect(Object.keys(history)).toEqual(['mudur']);
    expect(history['mudur'].name).toBe('Müdür onayı');
    expect(history['mudur'].key).toBe('Mudur');
  });

  it('turlar sırayla: önceki red kararı + şimdi rol havuzunda bekleyen', () => {
    const history = buildStepHistory(graph, {
      status: 'Running', timeline: [],
      tasks: [
        task({ stepKey: 'Mudur', status: 'Pending', assignedRoleId: 3, assignedRoleName: 'Müdür', candidates: ['Ali', 'Veli'], dueAt: '2026-10-21', isOverdue: true }),
        task({ stepKey: 'mudur', status: 'Rejected', completedBy: 7, completedByName: 'Ayşe Kaya', completedAt: '2026-10-19', comment: '  Bütçe aşıldı ' }),
        task({ stepKey: 'mudur', status: 'Cancelled' })
      ].map((t, i) => ({ ...t, id: [3, 1, 2][i] }))
    }, { nodes: { mudur: 'current' }, edges: [] });

    expect(history['mudur'].entries).toEqual([
      { kind: 'decision', outcome: 'rejected', by: 'Ayşe Kaya', at: '2026-10-19', comment: 'Bütçe aşıldı', branch: null },
      { kind: 'waiting', user: null, role: 'Müdür', candidates: ['Ali', 'Veli'], branch: null, dueAt: '2026-10-21', overdue: true }
    ]);
    expect(waitingNames(history['mudur'])).toEqual(['Müdür']);
    expect(lastDecision(history['mudur'])?.by).toBe('Ayşe Kaya');
  });

  it('paralel dallar adıyla; sistem kapattıysa kim null; ad yoksa #id', () => {
    const history = buildStepHistory(graph, {
      status: 'Running', timeline: [],
      tasks: [
        task({ stepKey: 'onaylar', branchKey: 'f', status: 'Completed', completedBy: 4, completedAt: 'x' }),
        task({ stepKey: 'onaylar', branchKey: 'S', status: 'Expired', completedAt: 'y' }),
        task({ stepKey: 'onaylar', branchKey: 'z', status: 'Pending', assignedUserId: 9, assignedUserName: 'Can' })
      ]
    }, { nodes: { onaylar: 'current' }, edges: [] });

    const [first, second, third] = history['onaylar'].entries;
    expect(first).toEqual(jasmine.objectContaining({ outcome: 'approved', by: '#4', branch: 'Finans' }));
    expect(second).toEqual(jasmine.objectContaining({ outcome: 'expired', by: null, branch: 'Satın alma' }));
    expect(third).toEqual(jasmine.objectContaining({ kind: 'waiting', user: 'Can', role: null, branch: 'z' }));
    expect(waitingNames(history['onaylar'])).toEqual(['Can']);
  });

  it('otomatik adımlar olaylardan: koşul yolu, alanlar, bekleme vadesi ve ateşlenme', () => {
    const history = buildStepHistory(graph, {
      status: 'Completed', completedAt: '2026-10-22T08:00:00',
      tasks: [],
      timeline: [
        ev('StepEntered', 'tutar'),
        ev('ConditionEvaluated', 'tutar', { port: 'case:buyuk', caseKey: 'buyuk' }),
        ev('FieldsUpdated', 'yaz', { columns: ['Durum', 'OnayTarihi'] }),
        ev('TimerScheduled', 'bekle', { fireAt: '2026-10-21T09:00:00Z' }),
        ev('TimerFired', 'bekle', { port: 'next' }, '2026-10-21T09:00:05')
      ]
    }, { nodes: { tutar: 'visited', yaz: 'visited', bekle: 'visited', son: 'end' }, edges: [] });

    expect(history['tutar'].entries).toEqual([{ kind: 'condition', caseLabel: 'Büyük', at: '2026-10-20T10:00:00' }]);
    expect(history['yaz'].entries).toEqual([{ kind: 'fields', columns: ['Durum', 'OnayTarihi'], at: '2026-10-20T10:00:00' }]);
    expect(history['bekle'].entries).toEqual([{ kind: 'timer', until: '2026-10-21T09:00:00Z', firedAt: '2026-10-21T09:00:05' }]);
    expect(history['son'].entries).toEqual([{ kind: 'ended', outcome: 'completed', at: '2026-10-22T08:00:00' }]);
  });

  it('varsayılan yol null etiket; hatadaki adım sürecin hata metnini taşır', () => {
    const history = buildStepHistory(graph, {
      status: 'Running', errorMessage: 'Koşul hesaplanamadı', tasks: [],
      timeline: [ev('ConditionEvaluated', 'tutar', { port: 'default', caseKey: null })]
    }, { nodes: { tutar: 'failed' }, edges: [] });

    expect(history['tutar'].entries).toEqual([
      { kind: 'condition', caseLabel: null, at: '2026-10-20T10:00:00' },
      { kind: 'failed', message: 'Koşul hesaplanamadı' }
    ]);
  });
});
