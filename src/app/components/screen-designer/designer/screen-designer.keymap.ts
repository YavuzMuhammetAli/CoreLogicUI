/**
 * Screen designer shortcuts — PURE (no DOM).
 *
 * The workflow canvas's `commandFor` deliberately ignores Alt combinations; here
 * Alt+arrow is the keyboard equivalent of drag and drop (accessibility and the non-touch path).
 */

export type ScreenCommand =
  | 'undo' | 'redo' | 'save'
  | 'delete' | 'deselect'
  | 'moveBack' | 'moveForward'
  | 'narrower' | 'wider';

export interface KeyInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export function screenCommandFor(e: KeyInput): ScreenCommand | null {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (mod && !e.altKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    if (key === 's') return 'save';
    return null;
  }

  if (e.altKey && !mod && !e.shiftKey) {
    if (key === 'ArrowUp') return 'moveBack';
    if (key === 'ArrowDown') return 'moveForward';
    if (key === 'ArrowLeft') return 'narrower';
    if (key === 'ArrowRight') return 'wider';
    return null;
  }

  if (!mod && !e.altKey && !e.shiftKey) {
    if (key === 'Delete') return 'delete';
    if (key === 'Escape') return 'deselect';
  }
  return null;
}
