import { KeyInput, screenCommandFor } from './screen-designer.keymap';

const key = (value: string, mods: Partial<KeyInput> = {}): KeyInput =>
  ({ key: value, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

describe('screen-designer.keymap', () => {
  it('undo / redo / save (Ctrl or Cmd)', () => {
    expect(screenCommandFor(key('z', { ctrlKey: true }))).toBe('undo');
    expect(screenCommandFor(key('Z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(screenCommandFor(key('y', { ctrlKey: true }))).toBe('redo');
    expect(screenCommandFor(key('s', { ctrlKey: true }))).toBe('save');
  });

  it('Alt+arrow is the keyboard equivalent of drag and drop', () => {
    expect(screenCommandFor(key('ArrowUp', { altKey: true }))).toBe('moveBack');
    expect(screenCommandFor(key('ArrowDown', { altKey: true }))).toBe('moveForward');
    expect(screenCommandFor(key('ArrowLeft', { altKey: true }))).toBe('narrower');
    expect(screenCommandFor(key('ArrowRight', { altKey: true }))).toBe('wider');
  });

  it('Delete and Escape only without modifiers', () => {
    expect(screenCommandFor(key('Delete'))).toBe('delete');
    expect(screenCommandFor(key('Escape'))).toBe('deselect');
    expect(screenCommandFor(key('Delete', { shiftKey: true }))).toBeNull();
  });

  it('an unrecognised key is null — left to the browser', () => {
    expect(screenCommandFor(key('ArrowUp'))).toBeNull();
    expect(screenCommandFor(key('a', { ctrlKey: true }))).toBeNull();
    expect(screenCommandFor(key('Backspace'))).toBeNull();
  });
});
