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
  it('her türün kendi etiketi ve ikonu var', () => {
    expect(new Set(NODE_KINDS.map(k => k.kind)).size).toBe(NODE_KINDS.length);
    expect(NODE_KINDS.every(k => k.labelKey && k.icon)).toBeTrue();
    expect(nodeKindInfo('task').type).toBe('approval');
    expect(isNodeKind('parallel')).toBeTrue();
    expect(isNodeKind('timer')).toBeTrue();
    expect(isNodeKind('subprocess')).toBeFalse();
  });

  it('var olan adımın türünü tanır: reddi kapalı onay = görev', () => {
    const base: WorkflowStep = { key: 'a', type: 'approval', name: 'A' };
    expect(nodeKindOf(base)).toBe('approval');
    expect(nodeKindOf({ ...base, form: { fields: [], allowReject: false } })).toBe('task');
    expect(nodeKindOf({ ...base, form: { fields: [], allowReject: true } })).toBe('approval');
    expect(nodeKindOf({ ...base, type: 'parallel' })).toBe('parallel');
  });

  it('görev yalnız tamamlanma çıkışı verir (red portu yok)', () => {
    const task = createStep('task', { key: 'is', name: 'İş', completeLabel: 'Tamamla' });

    expect(nodeKindOf(task)).toBe('task');
    expect(task.form?.approveLabel).toBe('Tamamla');
    expect(exitsOf(task).filter(e => e.enabled).map(e => e.port)).toEqual(['approve']);
  });

  it('paralel adım iki dalla ve "hepsi" kuralıyla başlar', () => {
    const step = createStep('parallel', { key: 'p', name: 'P', branchNames: ['Finans', 'Hukuk'] });

    expect(step.mode).toBe('all');
    expect(step.branches?.map(b => b.name)).toEqual(['Finans', 'Hukuk']);
    expect(exitsOf(step).map(e => e.port)).toEqual(['complete', 'anyReject']);
  });

  it('yeni onay adımında rol seçilmemiş atama bırakılır (sorun olarak görünsün)', () => {
    const step = createStep('approval', { key: 'a', name: 'A' });
    expect(step.assignment).toEqual({ mode: 'role', roleId: null });
    expect(assignmentText(step.assignment, lookup)).toBe('—');
  });
});

describe('koşul ve bitiş türleri', () => {
  it('yeni koşul bir durum ve boş varsayılan yolla başlar', () => {
    const step = createStep('condition', { key: 'k', name: 'K', caseLabel: 'Evet' });
    expect(nodeKindOf(step)).toBe('condition');
    expect(step.cases?.map(c => c.label)).toEqual(['Evet']);
    expect(step.defaultTo).toBeNull();
    expect(exitsOf(step).map(e => e.port)).toEqual(['case:durum1', 'default']);
  });

  it('bitiş rengi sonuca göre', () => {
    const end = createStep('end', { key: 'son', name: 'Son' });
    expect(nodeTone(end)).toBe('success');
    expect(nodeTone({ ...end, outcome: 'rejected' })).toBe('danger');
    expect(nodeKindInfo('condition').automatic).toBeTrue();
  });

  it('özet: koşulda durum sayısı, bitişte sonuç', () => {
    expect(stepSummary(createStep('condition', { key: 'k', name: 'K' }), lookup)).toBe('workflow.node.caseCount:{"n":1}');
    expect(stepSummary(createStep('end', { key: 's', name: 'S' }), lookup)).toBe('workflow.node.endCompleted');
  });
});

describe('workflow-step-summary', () => {
  it('atama metni: rol, kullanıcı, kaydı oluşturan, eksik', () => {
    expect(assignmentText({ mode: 'role', roleId: 3 }, lookup)).toBe('Müdür');
    expect(assignmentText({ mode: 'user', userId: 7 }, lookup)).toBe('Ayşe Yılmaz');
    expect(assignmentText({ mode: 'user', userId: 99 }, lookup)).toBe('—');
    expect(assignmentText({ mode: 'creator' }, lookup)).toBe('workflow.assign.creator');
    expect(assignmentText(null, lookup)).toBe('—');
  });

  it('paralel adımda dal sayısı', () => {
    const step = createStep('parallel', { key: 'p', name: 'P' });
    expect(assignmentSummary(step, lookup)).toBe('workflow.build.branchCount:{"n":2}');
  });

  it('kart özeti süre sınırını ekler', () => {
    const step: WorkflowStep = {
      key: 'a', type: 'approval', name: 'A',
      assignment: { mode: 'role', roleId: 3 }, sla: { dueHours: 48, onTimeout: 'escalate' }
    };
    expect(stepSummary(step, lookup)).toBe('Müdür · workflow.node.hours:{"n":48}');
    expect(stepSummary({ ...step, sla: null }, lookup)).toBe('Müdür');
  });
});
