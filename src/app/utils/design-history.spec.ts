import { canRedo, canUndo, createHistory, record, redo, undo } from './design-history';

describe('design-history', () => {
  it('a record can be undone and redone', () => {
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

  it('a record with the same reason within the window replaces the previous one', () => {
    let h = createHistory('');
    h = record(h, 'S', 'form', 1000);
    h = record(h, 'Sa', 'form', 1300);
    h = record(h, 'Sat', 'form', 1800);

    expect(h.present).toBe('Sat');
    expect(h.past).toEqual(['']);
  });

  it('opens a new step once the window has passed', () => {
    let h = createHistory('');
    h = record(h, 'S', 'form', 1000);
    h = record(h, 'Sa', 'form', 1000 + 601);

    expect(h.past).toEqual(['', 'S']);
  });

  it('a different or empty reason does not coalesce', () => {
    let h = createHistory(0);
    h = record(h, 1, 'form', 1000);
    h = record(h, 2, 'step', 1100);
    h = record(h, 3, '', 1200);
    h = record(h, 4, '', 1250);

    expect(h.past).toEqual([0, 1, 2, 3]);
  });

  it('a new record clears the redo branch', () => {
    let h = createHistory('a');
    h = record(h, 'b', '', 1000);
    h = undo(h);
    h = record(h, 'x', '', 2000);

    expect(h.future.length).toBe(0);
    expect(canRedo(h)).toBeFalse();
  });

  it('typing after an undo does not coalesce into the undone state', () => {
    let h = createHistory('');
    h = record(h, 'ab', 'form', 1000);
    h = undo(h);
    h = record(h, 'x', 'form', 1100);

    expect(h.past).toEqual(['']);
    expect(h.present).toBe('x');
  });

  it('the same reference is not recorded (a no-op command adds no history step)', () => {
    const state = { a: 1 };
    const h = createHistory(state);
    expect(record(h, state, '', 1000)).toBe(h);
  });

  it('drops the oldest step when the limit is exceeded', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = record(h, i, '', i * 1000, 600, 3);

    expect(h.past).toEqual([2, 3, 4]);
    expect(h.present).toBe(5);
  });
});
