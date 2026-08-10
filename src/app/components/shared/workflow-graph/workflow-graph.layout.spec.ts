import { layoutWorkflow, EMPTY_VIEW_BOX, NODE_HEIGHT, ROW_GAP, PADDING } from './workflow-graph.layout';
import { WorkflowGraph, WorkflowStep, WORKFLOW_TERMINAL_COMPLETED, WORKFLOW_TERMINAL_REJECTED } from '../../../models/workflow.model';

/**
 * Yerleşim saf bir fonksiyon olduğu için TestBed'e gerek yok
 * (entity-graph.layout.spec.ts ile aynı yaklaşım).
 */
function step(key: string, onApprove?: string, onReject?: string): WorkflowStep {
  return {
    key,
    type: 'approval',
    name: `${key} adımı`,
    assignment: { mode: 'role', roleId: 1 },
    onApprove: onApprove ?? null,
    onReject: onReject ?? null
  };
}

function graph(steps: WorkflowStep[], startStep = steps[0]?.key ?? ''): WorkflowGraph {
  return { startStep, steps, entityStatusMap: {} };
}

describe('layoutWorkflow', () => {
  it('boş/null grafikte boş yerleşim döner', () => {
    expect(layoutWorkflow(null).nodes).toEqual([]);
    expect(layoutWorkflow(null).viewBox).toBe(EMPTY_VIEW_BOX);
    expect(layoutWorkflow(graph([])).nodes).toEqual([]);
  });

  it('sıralı adımları ardışık katmanlara yerleştirir', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'b'),
      step('b', 'c'),
      step('c')
    ]));

    const a = layout.nodes.find(n => n.key === 'a')!;
    const b = layout.nodes.find(n => n.key === 'b')!;
    const c = layout.nodes.find(n => n.key === 'c')!;

    expect(a.layer).toBe(0);
    expect(b.layer).toBe(1);
    expect(c.layer).toBe(2);
    // Yukarıdan aşağı: her katman bir satır aşağı.
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
  });

  it('başlangıç adımını işaretler', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')], 'a'));

    expect(layout.nodes.find(n => n.key === 'a')!.isStart).toBeTrue();
    expect(layout.nodes.find(n => n.key === 'b')!.isStart).toBeFalse();
  });

  it('katman hesabı EN UZUN yolu kullanır', () => {
    // a → b → c ve ayrıca a → c (kısa yol). c en geç ulaşıldığı katmanda
    // çizilmeli ki oklar hep aşağı aksın.
    const layout = layoutWorkflow(graph([
      step('a', 'b', 'c'),
      step('b', 'c'),
      step('c')
    ]));

    expect(layout.nodes.find(n => n.key === 'c')!.layer).toBe(2);
  });

  it('geri dönen (rework) döngüde sonsuza girmez', () => {
    const layout = layoutWorkflow(graph([
      step('a', 'b'),
      step('b', 'c', 'a'),   // red → başa dön
      step('c')
    ]));

    expect(layout.nodes.length).toBeGreaterThan(0);
    expect(layout.nodes.find(n => n.key === 'a')).toBeTruthy();
  });

  it('ulaşılamayan adımı da çizer', () => {
    // Doğrulayıcı bunu hata sayar; şema hatayı GÖRÜNÜR kılmalı.
    const layout = layoutWorkflow(graph([step('a'), step('kopuk')], 'a'));

    expect(layout.nodes.find(n => n.key === 'kopuk')).toBeTruthy();
  });

  it('yalnızca kullanılan terminalleri çizer', () => {
    // Tek adım, hedefleri boş → hem tamamlandı hem reddedildi varsayılana düşer.
    const both = layoutWorkflow(graph([step('a')]));
    expect(both.nodes.some(n => n.key === WORKFLOW_TERMINAL_COMPLETED)).toBeTrue();
    expect(both.nodes.some(n => n.key === WORKFLOW_TERMINAL_REJECTED)).toBeTrue();
  });

  it('terminal düğümler işaretlenir', () => {
    const layout = layoutWorkflow(graph([step('a')]));

    const completed = layout.nodes.find(n => n.key === WORKFLOW_TERMINAL_COMPLETED)!;
    const rejected = layout.nodes.find(n => n.key === WORKFLOW_TERMINAL_REJECTED)!;

    expect(completed.isTerminal).toBeTrue();
    expect(completed.isRejection).toBeFalse();
    expect(rejected.isRejection).toBeTrue();
  });

  it('her adım için onay ve red kenarı üretir', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')]));

    const fromA = layout.edges.filter(e => e.key.startsWith('a->'));
    expect(fromA.length).toBe(2);
    expect(fromA.some(e => !e.isRejection)).toBeTrue();
    expect(fromA.some(e => e.isRejection)).toBeTrue();
  });

  it('hedefi çizilmemiş kenarı sessizce atlar', () => {
    // 'yok' adımı tanımda bulunmuyor — kenar düşer, çökme olmaz.
    const layout = layoutWorkflow(graph([step('a', 'yok')]));

    expect(layout.edges.every(e => !e.key.includes('->yok'))).toBeTrue();
  });

  it('viewBox tüm düğümleri kapsar', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')]));
    const [x, y, width, height] = layout.viewBox.split(' ').map(Number);

    const maxNodeBottom = Math.max(...layout.nodes.map(n => n.y + n.height));
    const maxNodeRight = Math.max(...layout.nodes.map(n => n.x + n.width));

    expect(y + height).toBeGreaterThanOrEqual(maxNodeBottom);
    expect(x + width).toBeGreaterThanOrEqual(maxNodeRight);
  });

  it('ilk katman PADDING kadar içeriden başlar', () => {
    const layout = layoutWorkflow(graph([step('a')]));
    const a = layout.nodes.find(n => n.key === 'a')!;

    expect(a.x).toBe(PADDING);
    expect(a.y).toBe(PADDING);
  });

  it('katmanlar arası dikey aralık sabittir', () => {
    const layout = layoutWorkflow(graph([step('a', 'b'), step('b')]));
    const a = layout.nodes.find(n => n.key === 'a')!;
    const b = layout.nodes.find(n => n.key === 'b')!;

    expect(b.y - a.y).toBe(NODE_HEIGHT + ROW_GAP);
  });

  it('paralel adımın dalları TEK kutuda listelenir', () => {
    // Dallar ayrı düğüm DEĞİL: aynı anda açılıp aynı adımda birleştikleri için
    // tek kutu içinde göstermek şemayı yatayda yaymıyor.
    const parallel: WorkflowStep = {
      key: 'onaylar',
      type: 'parallel',
      name: 'Paralel Onay',
      mode: 'all',
      branches: [
        { key: 'finans', name: 'Finans' },
        { key: 'hukuk', name: 'Hukuk' }
      ],
      onComplete: 'final'
    };

    const layout = layoutWorkflow(graph([step('a', 'onaylar'), parallel, step('final')], 'a'));
    const node = layout.nodes.find(n => n.key === 'onaylar')!;

    expect(node.isParallel).toBeTrue();
    expect(node.branchLabels).toEqual(['Finans', 'Hukuk']);
    expect(layout.nodes.filter(n => n.key === 'finans').length).toBe(0);
  });

  it('paralel kutu dal sayısına göre yükselir', () => {
    const one: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }]
    };
    const three: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }, { key: 'c1', name: 'C' }]
    };

    const h2 = layoutWorkflow(graph([one], 'p')).nodes.find(n => n.key === 'p')!.height;
    const h3 = layoutWorkflow(graph([three], 'p')).nodes.find(n => n.key === 'p')!.height;

    expect(h3).toBeGreaterThan(h2);
  });

  it('paralel adım onComplete/onAnyReject alanlarını kullanır', () => {
    // Tekil adım onApprove/onReject, paralel adım onComplete/onAnyReject okur;
    // karıştırılırsa kenarlar hiç çizilmezdi.
    const parallel: WorkflowStep = {
      key: 'onaylar', type: 'parallel', name: 'P', mode: 'all',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }],
      onComplete: 'final',
      onAnyReject: 'duzeltme'
    };

    const layout = layoutWorkflow(
      graph([parallel, step('final'), step('duzeltme')], 'onaylar'));

    expect(layout.edges.some(e => e.key.startsWith('onaylar->final'))).toBeTrue();
    expect(layout.edges.some(e => e.key.startsWith('onaylar->duzeltme'))).toBeTrue();
  });

  it('join kuralı rozeti gösterilir', () => {
    const any: WorkflowStep = {
      key: 'p', type: 'parallel', name: 'P', mode: 'any',
      branches: [{ key: 'a1', name: 'A' }, { key: 'b1', name: 'B' }]
    };

    expect(layoutWorkflow(graph([any], 'p')).nodes.find(n => n.key === 'p')!.joinLabel)
      .toBe('herhangi biri');
  });

  it('adım anahtarı büyük/küçük harf duyarsız eşleşir', () => {
    const layout = layoutWorkflow(graph([step('Yonetici', 'FINANS'), step('finans')], 'yonetici'));

    expect(layout.nodes.find(n => n.key === 'Yonetici')!.isStart).toBeTrue();
    expect(layout.nodes.find(n => n.key === 'finans')!.layer).toBe(1);
  });
});
