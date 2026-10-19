import { WorkflowStep } from '../../models/workflow.model';
import { SummaryLookup, actionSummary, recipientsSummary, timerSummary } from './workflow-step-summary';

const lookup: SummaryLookup = {
  roleName: id => (id === 3 ? 'Müdür' : null),
  userName: () => null,
  t: (key, params) => `${key}${params ? JSON.stringify(params) : ''}`
};

const timer = (config: WorkflowStep['timer']): WorkflowStep => ({ key: 'b', type: 'timer', name: 'B', timer: config });

describe('workflow-step-summary (otomasyon)', () => {
  it('bekleme: süre, tarih, kaydırma, eksik', () => {
    expect(timerSummary(timer({ mode: 'duration', amount: 2, unit: 'days' }), lookup)).toBe('workflow.timer.unit.days{"n":2}');
    expect(timerSummary(timer({ mode: 'untilField', field: 'Bitis' }), lookup)).toBe('workflow.timer.summaryUntil{"field":"Bitis"}');
    expect(timerSummary(timer({ mode: 'untilField', field: 'Bitis', offsetHours: -24 }), lookup))
      .toBe('workflow.timer.summaryBefore{"field":"Bitis","n":24}');
    expect(timerSummary(timer({ mode: 'duration', amount: 0 }), lookup)).toBe('—');
  });

  it('alan güncelle: tek satır değeri, çok satır sayısı', () => {
    const step: WorkflowStep = { key: 'a', type: 'action', name: 'A', sets: [{ column: 'Durum', mode: 'value', value: 'Onaylandı' }] };
    expect(actionSummary(step, lookup)).toBe('Durum = Onaylandı');
    expect(actionSummary({ ...step, sets: [...step.sets!, { column: 'X', mode: 'clear' }] }, lookup)).toBe('workflow.node.fieldCount{"n":2}');
  });

  it('bildirim: ilk alıcı +N', () => {
    expect(recipientsSummary([{ kind: 'role', id: 3 }, { kind: 'creator' }], lookup)).toBe('Müdür +1');
    expect(recipientsSummary([], lookup)).toBe('—');
  });
});
