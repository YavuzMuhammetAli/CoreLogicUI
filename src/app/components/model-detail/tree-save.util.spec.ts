import { applyTreeResult, applyUpdateResults, TreeStep } from './tree-save.util';
import { createStagedNode, upsertChild, StagedNode } from './staged-tree.util';

describe('applyTreeResult', () => {
  function tree(): { root: StagedNode; child: StagedNode } {
    const root = createStagedNode('Order', {});
    const child = createStagedNode('OrderLine', {});
    upsertChild(root, 'OrderLine', child);
    return { root, child };
  }

  it('writes the real IDs from the server to the nodes via localId', () => {
    const { root, child } = tree();

    const errors = applyTreeResult(root, {
      savedIds: { [String(root.localId)]: 10, [String(child.localId)]: 11 },
      errors: {}
    });

    expect(root.savedId).toBe(10);
    expect(child.savedId).toBe(11);
    expect(errors).toEqual([]);
  });

  it('writes a row-level error to the node and produces a summary line', () => {
    const { root, child } = tree();

    const errors = applyTreeResult(root, {
      savedIds: {},
      errors: { [String(child.localId)]: 'Adet zorunludur.' }
    });

    expect(child.error).toBe('Adet zorunludur.');
    expect(errors).toEqual(['OrderLine: Adet zorunludur.']);
  });

  it('does not touch a node missing from the response', () => {
    const { root, child } = tree();
    child.error = 'önceki hata';

    applyTreeResult(root, { savedIds: {}, errors: {} });

    expect(child.savedId).toBeNull();
    expect(child.error).toBe('önceki hata');
  });
});

describe('applyUpdateResults', () => {
  function updateStep(ok: boolean, message: string): TreeStep {
    return { kind: 'update', ok, message, node: createStagedNode('OrderLine', {}) };
  }

  it('clears the dirty flag after a successful update', () => {
    const step = updateStep(true, 'Güncellendi');
    step.node!.dirty = true;

    const { errors } = applyUpdateResults([step]);

    expect(step.node!.dirty).toBe(false);
    expect(step.node!.error).toBeNull();
    expect(errors).toEqual([]);
  });

  it('writes a failed update message to the node and the summary', () => {
    const step = updateStep(false, 'Kayıt kilitli');

    const { errors } = applyUpdateResults([step]);

    expect(step.node!.error).toBe('Kayıt kilitli');
    expect(errors).toEqual(['OrderLine: Kayıt kilitli']);
  });

  it('ignores tree steps', () => {
    const { errors } = applyUpdateResults([
      { kind: 'tree', ok: false, message: 'hata', data: { savedIds: {}, errors: {} } }
    ]);

    expect(errors).toEqual([]);
  });
});
