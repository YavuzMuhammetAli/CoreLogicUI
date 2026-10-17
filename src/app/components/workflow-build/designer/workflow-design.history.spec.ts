import { canRedo, canUndo, createHistory, record, redo, undo } from './workflow-design.history';

describe('workflow-design.history', () => {
  it('kayıt geri alınır ve yinelenir', () => {
    let h = createHistory('a');
    h = record(h, 'b', '', 1000);
    h = record(h, 'c', '', 2000);

    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBeFalse();

    h = redo(h);
    h = redo(h);
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBeFalse();
  });

  it('aynı sebeple pencere içinde gelen kayıt öncekinin yerine geçer', () => {
    let h = createHistory('');
    h = record(h, 'S', 'form', 1000);
    h = record(h, 'Sa', 'form', 1300);
    h = record(h, 'Sat', 'form', 1800);

    expect(h.present).toBe('Sat');
    expect(h.past).toEqual(['']);
  });

  it('pencere dolunca yeni adım açılır', () => {
    let h = createHistory('');
    h = record(h, 'S', 'form', 1000);
    h = record(h, 'Sa', 'form', 1000 + 601);

    expect(h.past).toEqual(['', 'S']);
  });

  it('farklı sebep ya da boş sebep birleşmez', () => {
    let h = createHistory(0);
    h = record(h, 1, 'form', 1000);
    h = record(h, 2, 'step', 1100);
    h = record(h, 3, '', 1200);
    h = record(h, 4, '', 1250);

    expect(h.past).toEqual([0, 1, 2, 3]);
  });

  it('yeni kayıt yineleme dalını temizler', () => {
    let h = createHistory('a');
    h = record(h, 'b', '', 1000);
    h = undo(h);
    h = record(h, 'x', '', 2000);

    expect(h.future.length).toBe(0);
    expect(canRedo(h)).toBeFalse();
  });

  it('geri almadan sonraki yazım geri alınan duruma birleşmez', () => {
    let h = createHistory('');
    h = record(h, 'ab', 'form', 1000);
    h = undo(h);
    h = record(h, 'x', 'form', 1100);

    expect(h.past).toEqual(['']);
    expect(h.present).toBe('x');
  });

  it('aynı referans kaydedilmez (boş komut geçmişe adım düşürmez)', () => {
    const state = { a: 1 };
    const h = createHistory(state);
    expect(record(h, state, '', 1000)).toBe(h);
  });

  it('sınır aşılınca en eski adım düşer', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = record(h, i, '', i * 1000, 600, 3);

    expect(h.past).toEqual([2, 3, 4]);
    expect(h.present).toBe(5);
  });
});
