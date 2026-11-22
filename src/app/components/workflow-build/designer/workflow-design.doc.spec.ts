import { WorkflowDefinition } from '../../../models/workflow.model';
import { docFromDefinition, docToPayload, emptyDoc, semanticKey, serializeDoc } from './workflow-design.doc';

function definition(definitionJson: string, triggerConditionJson: string | null = null): WorkflowDefinition {
  return {
    id: 7, name: 'Satın alma', code: 'satinalma', modelName: 'SatinalmaTalebi', version: 0,
    status: 'Draft', definitionJson, triggerEvent: 'onUpdate', triggerConditionJson,
    isEnabled: false, createdOn: '2026-10-17T00:00:00', runningInstanceCount: 0
  };
}

const GRAPH = {
  startStep: 'mudur',
  steps: [
    {
      key: 'mudur', type: 'approval', name: 'Müdür', x: 40, y: 80,
      assignment: { mode: 'role', roleId: 3 },
      form: { fields: [{ name: 'not', dataType: 'string', isRequired: false, maxLength: 200 }] },
      aciklama: 'AI notu'
    }
  ],
  entityStatusMap: { mudur: 'Müdür onayında', __completed: 'Onaylandı' },
  designer: { start: { x: 10, y: 0 } }
};

describe('workflow-design.doc', () => {
  it('builds a document from the definition', () => {
    const doc = docFromDefinition(definition(JSON.stringify(GRAPH),
      '[{"field":"Tutar","operator":"gt","value":"0"}]'));

    expect(doc.meta).toEqual({
      name: 'Satın alma', code: 'satinalma', modelName: 'SatinalmaTalebi',
      triggerEvent: 'onUpdate', isEnabled: false
    });
    expect(doc.graph.startStep).toBe('mudur');
    expect(doc.conditions).toEqual([{ field: 'Tutar', operator: 'gt', value: '0' }]);
    expect(doc.extras).toEqual({ designer: { start: { x: 10, y: 0 } } });
  });

  it('round trip is lossless: position, unknown fields, maxLength, end label', () => {
    // The old buildGraph deleted all of these on every save.
    const doc = docFromDefinition(definition(JSON.stringify(GRAPH)));
    const payload = docToPayload(doc, 7);

    expect(JSON.parse(payload.definitionJson!)).toEqual(GRAPH);
    expect(payload.id).toBe(7);
    expect(payload.triggerConditionJson).toBeNull();
  });

  it('conditions are sent as JSON when present', () => {
    const doc = docFromDefinition(definition(JSON.stringify(GRAPH),
      '[{"field":"Tutar","operator":"gt","value":"0"}]'));

    expect(JSON.parse(docToPayload(doc, null).triggerConditionJson!))
      .toEqual([{ field: 'Tutar', operator: 'gt', value: '0' }]);
    expect(docToPayload(doc, null).id).toBe(0);
  });

  it('a broken definition yields an empty graph, does not throw', () => {
    const doc = docFromDefinition(definition('{bozuk'));

    expect(doc.graph).toEqual({ startStep: '', steps: [], entityStatusMap: {} });
    expect(doc.extras).toEqual({});
  });

  it('the position-independent key does not change on drag, changes with content', () => {
    const doc = docFromDefinition(definition(JSON.stringify(GRAPH)));
    const moved = {
      ...doc,
      graph: { ...doc.graph, steps: doc.graph.steps.map(s => ({ ...s, x: 999, y: 999 })) }
    };
    const renamed = {
      ...doc,
      graph: { ...doc.graph, steps: doc.graph.steps.map(s => ({ ...s, name: 'Değişti' })) }
    };

    expect(semanticKey(moved)).toBe(semanticKey(doc));
    expect(serializeDoc(moved)).not.toBe(serializeDoc(doc));
    expect(semanticKey(renamed)).not.toBe(semanticKey(doc));
  });

  it('a new flow\'s defaults match the old design screen', () => {
    expect(emptyDoc().meta.triggerEvent).toBe('onCreate');
    expect(emptyDoc().meta.isEnabled).toBeTrue();
  });
});
