import { WorkflowStep } from '../../models/workflow.model';
import { exitsOf } from './workflow-exits';
import { NODE_KINDS, createStep, isNodeKind, nodeKindInfo, nodeKindOf, nodeTone } from './workflow-node-types';
import { assignmentSummary, assignmentText, stepSummary, SummaryLookup } from './workflow-step-summary';

const lookup: SummaryLookup = {
  roleName: id => (id === 3 ? 'Müdür' : null),
  userName: id => (id === 7 ? 'Ayşe Yılmaz' : null),
  t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key)
};

describe('workflow-node-types', () => {
  it('every kind has its own label and icon', () => {
    expect(new Set(NODE_KINDS.map(k => k.kind)).size).toBe(NODE_KINDS.length);
    expect(NODE_KINDS.every(k => k.labelKey && k.icon)).toBeTrue();
    expect(nodeKindInfo('task').type).toBe('approval');
    expect(isNodeKind('parallel')).toBeTrue();
    expect(isNodeKind('timer')).toBeTrue();
    expect(isNodeKind('subprocess')).toBeFalse();
  });

  it('recognizes the kind of an existing step: approval with reject disabled = task', () => {
    const base: WorkflowStep = { key: 'a', type: 'approval', name: 'A' };
    expect(nodeKindOf(base)).toBe('approval');
    expect(nodeKindOf({ ...base, form: { fields: [], allowReject: false } })).toBe('task');
    expect(nodeKindOf({ ...base, form: { fields: [], allowReject: true } })).toBe('approval');
    expect(nodeKindOf({ ...base, type: 'parallel' })).toBe('parallel');
  });

  it('a task only has a completion exit (no reject port)', () => {
    const task = createStep('task', { key: 'is', name: 'İş', completeLabel: 'Tamamla' });

    expect(nodeKindOf(task)).toBe('task');
    expect(task.form?.approveLabel).toBe('Tamamla');
    expect(exitsOf(task).filter(e => e.enabled).map(e => e.port)).toEqual(['approve']);
  });

  it('a parallel step starts with two branches and the "all" rule', () => {
    const step = createStep('parallel', { key: 'p', name: 'P', branchNames: ['Finans', 'Hukuk'] });

    expect(step.mode).toBe('all');
    expect(step.branches?.map(b => b.name)).toEqual(['Finans', 'Hukuk']);
    expect(exitsOf(step).map(e => e.port)).toEqual(['complete', 'anyReject']);
  });

  it('a new approval step gets an assignment with no role selected (so it shows as an issue)', () => {
    const step = createStep('approval', { key: 'a', name: 'A' });
    expect(step.assignment).toEqual({ mode: 'role', roleId: null });
    expect(assignmentText(step.assignment, lookup)).toBe('—');
  });
});

describe('condition and end kinds', () => {
  it('a new condition starts with one case and an empty default path', () => {
    const step = createStep('condition', { key: 'k', name: 'K', caseLabel: 'Evet' });
    expect(nodeKindOf(step)).toBe('condition');
    expect(step.cases?.map(c => c.label)).toEqual(['Evet']);
    expect(step.defaultTo).toBeNull();
    expect(exitsOf(step).map(e => e.port)).toEqual(['case:case1', 'default']);
  });

  it('end colour depends on the outcome', () => {
    const end = createStep('end', { key: 'son', name: 'Son' });
    expect(nodeTone(end)).toBe('success');
    expect(nodeTone({ ...end, outcome: 'rejected' })).toBe('danger');
    expect(nodeKindInfo('condition').automatic).toBeTrue();
  });

  it('summary: case count for a condition, outcome for an end', () => {
    expect(stepSummary(createStep('condition', { key: 'k', name: 'K' }), lookup)).toBe('workflow.node.caseCount:{"n":1}');
    expect(stepSummary(createStep('end', { key: 's', name: 'S' }), lookup)).toBe('workflow.node.endCompleted');
  });
});

describe('workflow-step-summary', () => {
  it('assignment text: role, user, record creator, missing', () => {
    expect(assignmentText({ mode: 'role', roleId: 3 }, lookup)).toBe('Müdür');
    expect(assignmentText({ mode: 'user', userId: 7 }, lookup)).toBe('Ayşe Yılmaz');
    expect(assignmentText({ mode: 'user', userId: 99 }, lookup)).toBe('—');
    expect(assignmentText({ mode: 'creator' }, lookup)).toBe('workflow.assign.creator');
    expect(assignmentText(null, lookup)).toBe('—');
  });

  it('branch count for a parallel step', () => {
    const step = createStep('parallel', { key: 'p', name: 'P' });
    expect(assignmentSummary(step, lookup)).toBe('workflow.build.branchCount:{"n":2}');
  });

  it('card summary adds the time limit', () => {
    const step: WorkflowStep = {
      key: 'a', type: 'approval', name: 'A',
      assignment: { mode: 'role', roleId: 3 }, sla: { dueHours: 48, onTimeout: 'escalate' }
    };
    expect(stepSummary(step, lookup)).toBe('Müdür · workflow.node.hours:{"n":48}');
    expect(stepSummary({ ...step, sla: null }, lookup)).toBe('Müdür');
  });
});
