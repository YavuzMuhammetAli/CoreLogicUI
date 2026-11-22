import { WorkflowEvent, WorkflowGraph } from '../../models/workflow.model';
import { edgeId } from './workflow-overlay';
import { buildRuntimeOverlay } from './workflow-runtime.overlay';

const graph: WorkflowGraph = {
  startStep: 'mudur',
  steps: [
    { key: 'mudur', type: 'approval', name: 'Müdür', onApprove: 'onaylar', onReject: 'red' },
    { key: 'onaylar', type: 'parallel', name: 'Onaylar', branches: [{ key: 'f', name: 'F' }, { key: 's', name: 'S' }], onComplete: 'tutar', onAnyReject: 'mudur' },
    { key: 'tutar', type: 'condition', name: 'Tutar', cases: [{ key: 'buyuk', when: [], to: 'finans' }], defaultTo: 'son' },
    { key: 'finans', type: 'approval', name: 'Finans', onApprove: 'son' },
    { key: 'son', type: 'end', name: 'Son', outcome: 'completed' },
    { key: 'red', type: 'end', name: 'Red', outcome: 'rejected' }
  ],
  entityStatusMap: {}
};

let id = 0;
function ev(eventType: string, stepKey: string | null, data?: object): WorkflowEvent {
  return { id: ++id, eventType, stepKey, dataJson: data ? JSON.stringify(data) : null, createdAt: '' };
}

const start = [ev('InstanceStarted', 'mudur'), ev('StepEntered', 'mudur'), ev('TaskCreated', 'mudur')];

describe('workflow-runtime.overlay', () => {
  it('sequential progress: visited steps and edges, the current step is current', () => {
    const overlay = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar')
    ], { status: 'Running', currentStepKey: 'onaylar' });

    expect(overlay.nodes).toEqual({ mudur: 'visited', onaylar: 'current' });
    expect(overlay.edges).toEqual([edgeId('mudur', 'approve')]);
  });

  it('a single branch approval in parallel produces no edge; a branch cancellation is not a decision', () => {
    const overlay = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar'),
      ev('TaskCompleted', 'onaylar', { branch: 'f' })
    ], { status: 'Running', currentStepKey: 'onaylar' });
    expect(overlay.edges).toEqual([edgeId('mudur', 'approve')]);

    const done = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar'),
      ev('TaskCompleted', 'onaylar'), ev('TaskCompleted', 'onaylar'),
      ev('StepEntered', 'tutar'), ev('ConditionEvaluated', 'tutar', { port: 'case:buyuk' }),
      ev('StepEntered', 'finans')
    ], { status: 'Running', currentStepKey: 'finans' });
    expect(done.edges).toEqual([edgeId('mudur', 'approve'), edgeId('onaylar', 'complete'), edgeId('tutar', 'case:buyuk')]);
  });

  it('reject path and finishing at an end', () => {
    const overlay = buildRuntimeOverlay(graph, [
      ...start, ev('TaskRejected', 'mudur'), ev('StepEntered', 'red'), ev('InstanceRejected', 'red')
    ], { status: 'Rejected', currentStepKey: null });

    expect(overlay.nodes).toEqual({ mudur: 'visited', red: 'end' });
    expect(overlay.edges).toEqual([edgeId('mudur', 'reject')]);
  });

  it('the last decision of an instance finishing via an untargeted exit counts as an edge', () => {
    const open: WorkflowGraph = {
      startStep: 'mudur',
      steps: [
        { key: 'mudur', type: 'approval', name: 'Müdür', onApprove: 'finans', onReject: null },
        { key: 'finans', type: 'approval', name: 'Finans', onApprove: null, onReject: null }
      ],
      entityStatusMap: {}
    };

    const completed = buildRuntimeOverlay(open, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'finans'), ev('TaskCompleted', 'finans'),
      ev('InstanceCompleted', 'finans')
    ], { status: 'Completed', currentStepKey: null });
    expect(completed.edges).toEqual([edgeId('mudur', 'approve'), edgeId('finans', 'approve')]);

    const rejected = buildRuntimeOverlay(open, [
      ...start, ev('TaskRejected', 'mudur'), ev('InstanceRejected', 'mudur')
    ], { status: 'Rejected', currentStepKey: null });
    expect(rejected.nodes).toEqual({ mudur: 'visited' });
    expect(rejected.edges).toEqual([edgeId('mudur', 'reject')]);
  });

  it('a pending decision in a running instance produces no edge', () => {
    const overlay = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar'), ev('TaskCompleted', 'onaylar', { branch: 'f' })
    ], { status: 'Running', currentStepKey: 'onaylar' });
    expect(overlay.edges).toEqual([edgeId('mudur', 'approve')]);
  });

  it('a rollback cuts the trail back to the target', () => {
    const overlay = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar'),
      ev('TaskSkipped', 'onaylar', { reason: 'branchCancelled' }),
      ev('RolledBack', 'mudur', { targetStep: 'mudur' }), ev('StepEntered', 'mudur'), ev('TaskCreated', 'mudur')
    ], { status: 'Running', currentStepKey: 'mudur' });

    expect(overlay.nodes).toEqual({ mudur: 'current' });
    expect(overlay.edges).toEqual([]);
  });

  it('update field and notification draw the "next" edge', () => {
    const automation: WorkflowGraph = {
      startStep: 'yaz',
      steps: [
        { key: 'yaz', type: 'action', name: 'Yaz', sets: [], next: 'haber' },
        { key: 'haber', type: 'notify', name: 'Haber', next: 'son' },
        { key: 'son', type: 'end', name: 'Son', outcome: 'completed' }
      ],
      entityStatusMap: {}
    };
    const overlay = buildRuntimeOverlay(automation, [
      ev('InstanceStarted', 'yaz'), ev('StepEntered', 'yaz'), ev('FieldsUpdated', 'yaz'),
      ev('StepEntered', 'haber'), ev('NotificationQueued', 'haber'), ev('StepEntered', 'son'), ev('InstanceCompleted', 'son')
    ], { status: 'Completed', currentStepKey: null });

    expect(overlay.nodes).toEqual({ yaz: 'visited', haber: 'visited', son: 'end' });
    expect(overlay.edges).toEqual([edgeId('yaz', 'next'), edgeId('haber', 'next')]);
  });

  it('an automatic step in an incident is failed; a skip draws the default edge', () => {
    const failed = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar'),
      ev('TaskCompleted', 'onaylar'), ev('StepEntered', 'tutar'), ev('StepFailed', 'tutar', { reason: 'x' })
    ], { status: 'Running', currentStepKey: 'tutar', errorMessage: 'x' });
    expect(failed.nodes['tutar']).toBe('failed');

    const skipped = buildRuntimeOverlay(graph, [
      ...start, ev('TaskCompleted', 'mudur'), ev('StepEntered', 'onaylar'),
      ev('TaskCompleted', 'onaylar'), ev('StepEntered', 'tutar'), ev('StepFailed', 'tutar'),
      ev('StepSkipped', 'tutar', { port: 'default' }), ev('StepEntered', 'son'), ev('InstanceCompleted', 'son')
    ], { status: 'Completed', currentStepKey: null });
    expect(skipped.nodes).toEqual({ mudur: 'visited', onaylar: 'visited', tutar: 'visited', son: 'end' });
    expect(skipped.edges).toContain(edgeId('tutar', 'default'));
  });
});
