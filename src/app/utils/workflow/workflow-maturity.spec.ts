import { WorkflowGraph } from '../../models/workflow.model';
import { diffGraphs, diffOverlay, hasDifferences } from './workflow-diff';
import { edgeId } from './workflow-overlay';
import { WORKFLOW_PACKAGE_FORMAT, freeCode, packageFileName, parsePackage, serializePackage, toPackage } from './workflow-package';
import { WORKFLOW_TEMPLATES } from './workflow-templates';
import { exitsOf } from './workflow-exits';

const v1: WorkflowGraph = {
  startStep: 'mudur',
  steps: [
    { key: 'mudur', type: 'approval', name: 'Müdür', onApprove: 'son', x: 10, y: 10 },
    { key: 'eski', type: 'approval', name: 'Eski adım', onApprove: 'son' },
    { key: 'son', type: 'end', name: 'Son', outcome: 'completed' }
  ],
  entityStatusMap: {}
};

describe('workflow-diff', () => {
  it('eklenen, silinen, değişen adım ve kenarlar; konum fark sayılmaz', () => {
    const v2: WorkflowGraph = {
      startStep: 'mudur',
      steps: [
        { key: 'mudur', type: 'approval', name: 'Müdür', onApprove: 'finans', x: 300, y: 300 },
        { key: 'finans', type: 'approval', name: 'Finans', onApprove: 'son' },
        { key: 'son', type: 'end', name: 'Bitti', outcome: 'completed' }
      ],
      entityStatusMap: {}
    };

    const diff = diffGraphs(v1, v2);

    expect(diff.added).toEqual(['finans']);
    expect(diff.removed).toEqual([{ key: 'eski', name: 'Eski adım' }]);
    expect(diff.changed).toEqual(['mudur', 'son']);
    expect(diff.edgesChanged).toEqual([edgeId('mudur', 'approve'), edgeId('finans', 'approve')]);
    expect(diff.startChanged).toBeFalse();
    expect(diffOverlay(diff).nodes).toEqual({ finans: 'added', mudur: 'changed', son: 'changed' });
  });

  it('yalnız taşınan düğüm fark değildir', () => {
    const moved: WorkflowGraph = { ...v1, steps: v1.steps.map(s => ({ ...s, x: 999, y: 999 })) };
    expect(hasDifferences(diffGraphs(v1, moved))).toBeFalse();
  });
});

describe('workflow-package', () => {
  const definition = {
    name: 'Satın Alma', code: 'satinalma', modelName: 'SatinalmaTalebi', triggerEvent: 'manual' as const,
    triggerConditionJson: null, isEnabled: true, definitionJson: JSON.stringify(v1)
  };

  it('dışa → içe aktarım gidiş-dönüş', () => {
    const text = serializePackage(toPackage(definition, new Date('2026-10-19T00:00:00Z')));
    const parsed = parsePackage(text);
    expect(parsed.ok).toBeTrue();
    if (parsed.ok) expect(parsed.workflow).toEqual(definition);
    expect(JSON.parse(text).format).toBe(WORKFLOW_PACKAGE_FORMAT);
  });

  it('bozuk / başka biçim / yeni sürüm / eksik alan / bozuk şema reddedilir', () => {
    const good = toPackage(definition);
    expect(parsePackage('{bozuk')).toEqual({ ok: false, error: 'json' });
    expect(parsePackage(JSON.stringify({ ...good, format: 'baska' }))).toEqual({ ok: false, error: 'format' });
    expect(parsePackage(JSON.stringify({ ...good, version: 99 }))).toEqual({ ok: false, error: 'version' });
    expect(parsePackage(JSON.stringify({ ...good, workflow: { ...good.workflow, code: ' ' } }))).toEqual({ ok: false, error: 'fields' });
    expect(parsePackage(JSON.stringify({ ...good, workflow: { ...good.workflow, definitionJson: '{"x":1}' } })))
      .toEqual({ ok: false, error: 'definition' });
  });

  it('kod çakışırsa sonek alır; dosya adı güvenli', () => {
    expect(freeCode('satinalma', ['diger'])).toBe('satinalma');
    expect(freeCode('satinalma', ['SATINALMA', 'satinalma_2'])).toBe('satinalma_3');
    expect(freeCode('satinalma_2', ['satinalma_2'])).toBe('satinalma_3');
    expect(freeCode('akis_1792434933557', ['akis_1792434933557'])).toBe('akis_1792434933557_2');
    expect(packageFileName('a b/c')).toBe('akis-a_b_c.json');
  });
});

describe('workflow-templates', () => {
  it('her şablon kendi içinde tutarlı: başlangıç var, tüm hedefler tanımlı adım', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const graph = template.build(key => key);
      const keys = new Set(graph.steps.map(s => s.key));
      expect(keys.has(graph.startStep)).withContext(template.id).toBeTrue();
      for (const step of graph.steps) {
        for (const exit of exitsOf(step)) {
          if (exit.target) expect(keys.has(exit.target)).withContext(`${template.id}.${step.key}.${exit.port}`).toBeTrue();
        }
      }
    }
  });
});
