import { WorkflowSimulation } from '../../models/workflow.model';
import { edgeId, simulationOverlay } from './workflow-overlay';

function sim(extra: Partial<WorkflowSimulation>): WorkflowSimulation {
  return {
    outcome: 'completed',
    path: [
      { seq: 1, stepKey: 'Mudur', type: 'approval', port: 'approve' },
      { seq: 2, stepKey: 'tutar', type: 'condition', port: 'case:buyuk', caseKey: 'buyuk' },
      { seq: 3, stepKey: 'son', type: 'end', port: null }
    ],
    endStepKey: 'son',
    ...extra
  };
}

describe('workflow-overlay', () => {
  it('geçilen adımlar ve çıkılan portlar; bitiş işaretlenir', () => {
    const overlay = simulationOverlay(sim({}));

    expect(overlay.nodes).toEqual({ mudur: 'visited', tutar: 'visited', son: 'end' });
    expect(overlay.edges).toEqual([edgeId('Mudur', 'approve'), edgeId('tutar', 'case:buyuk')]);
    expect(edgeId('Mudur', 'approve')).toBe('mudur|approve');
  });

  it('bekleyen adım current, olaydaki adım failed', () => {
    expect(simulationOverlay(sim({ outcome: 'waiting', endStepKey: null, stopStepKey: 'son' })).nodes['son']).toBe('current');
    expect(simulationOverlay(sim({ outcome: 'incident', endStepKey: null, stopStepKey: 'tutar' })).nodes['tutar']).toBe('failed');
  });
});
