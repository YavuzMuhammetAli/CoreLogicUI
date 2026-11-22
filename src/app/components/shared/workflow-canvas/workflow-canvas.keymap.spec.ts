import { KeyInput, commandFor, isActivationTarget, isTypingTarget } from './workflow-canvas.keymap';

function key(value: string, mods: Partial<Omit<KeyInput, 'key'>> = {}): KeyInput {
  return { key: value, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods };
}

describe('workflow-canvas.keymap', () => {
  describe('commandFor', () => {
    it('Ctrl and Cmd give the same commands', () => {
      expect(commandFor(key('z', { ctrlKey: true }))?.command).toBe('undo');
      expect(commandFor(key('z', { metaKey: true }))?.command).toBe('undo');
    });

    it('redo: Ctrl+Y or Ctrl+Shift+Z (even if Shift uppercases the letter)', () => {
      expect(commandFor(key('y', { ctrlKey: true }))?.command).toBe('redo');
      expect(commandFor(key('Z', { ctrlKey: true, shiftKey: true }))?.command).toBe('redo');
    });

    it('clipboard and selection shortcuts', () => {
      expect(commandFor(key('c', { ctrlKey: true }))?.command).toBe('copy');
      expect(commandFor(key('v', { ctrlKey: true }))?.command).toBe('paste');
      expect(commandFor(key('d', { ctrlKey: true }))?.command).toBe('duplicate');
      expect(commandFor(key('a', { ctrlKey: true }))?.command).toBe('selectAll');
    });

    it('single keys', () => {
      expect(commandFor(key('Delete'))?.command).toBe('delete');
      expect(commandFor(key('Backspace'))?.command).toBe('delete');
      expect(commandFor(key('Escape'))?.command).toBe('escape');
      expect(commandFor(key('Enter'))?.command).toBe('open');
      expect(commandFor(key('F', { shiftKey: true }))?.command).toBe('fit');
      expect(commandFor(key('+'))?.command).toBe('zoomIn');
      expect(commandFor(key('='))?.command).toBe('zoomIn');
      expect(commandFor(key('-'))?.command).toBe('zoomOut');
    });

    it('arrows nudge; Shift marks the large step', () => {
      expect(commandFor(key('ArrowLeft'))).toEqual({ command: 'nudgeLeft', large: false });
      expect(commandFor(key('ArrowDown', { shiftKey: true }))).toEqual({ command: 'nudgeDown', large: true });
    });

    it('an Alt or unrecognised combination gives no command (may be a browser/OS shortcut)', () => {
      expect(commandFor(key('z', { ctrlKey: true, altKey: true }))).toBeNull();
      expect(commandFor(key('ArrowLeft', { altKey: true }))).toBeNull();
      expect(commandFor(key('f', { ctrlKey: true }))).toBeNull();
      expect(commandFor(key('q'))).toBeNull();
    });
  });

  describe('target element', () => {
    function element(html: string): HTMLElement {
      const host = document.createElement('div');
      host.innerHTML = html;
      return host.firstElementChild as HTMLElement;
    }

    it('text fields disable shortcuts, a checkbox does not', () => {
      expect(isTypingTarget(element('<input>'))).toBeTrue();
      expect(isTypingTarget(element('<input type="number">'))).toBeTrue();
      expect(isTypingTarget(element('<textarea></textarea>'))).toBeTrue();
      expect(isTypingTarget(element('<select></select>'))).toBeTrue();
      expect(isTypingTarget(element('<input type="checkbox">'))).toBeFalse();
      expect(isTypingTarget(element('<div tabindex="0"></div>'))).toBeFalse();
      expect(isTypingTarget(null)).toBeFalse();
    });

    it('elements that use Enter themselves are activation targets', () => {
      expect(isActivationTarget(element('<button></button>'))).toBeTrue();
      expect(isActivationTarget(element('<a href="/x">x</a>'))).toBeTrue();
      expect(isActivationTarget(element('<div role="menuitem"></div>'))).toBeTrue();
      expect(isActivationTarget(element('<a>x</a>'))).toBeFalse();
      expect(isActivationTarget(element('<div tabindex="0"></div>'))).toBeFalse();
    });
  });
});
