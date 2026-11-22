/**
 * Undo / redo history — PURE, a stack of immutable snapshots.
 *
 * Since the document is immutable each step is just a reference; 100 snapshots of a
 * 50-step workflow come to a few hundred KB.
 *
 * Coalescing: records arriving with the same `reason` within `windowMs` replace the
 * previous one instead of stacking on top. So every letter typed into a field does not become
 * a separate undo step ("Ctrl+Z undoes a word, not a single letter").
 * An empty `reason` never coalesces.
 */
export interface DesignHistory<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** Reason and time of the last record — for the coalescing decision. */
  readonly lastReason: string | null;
  readonly lastAt: number;
}

export const HISTORY_LIMIT = 100;
export const COALESCE_WINDOW_MS = 600;

export function createHistory<T>(present: T): DesignHistory<T> {
  return { past: [], present, future: [], lastReason: null, lastAt: 0 };
}

/**
 * Records the new state. If the state did not change (same reference) the history is returned as is —
 * so a command that does nothing does not produce an empty undo step.
 */
export function record<T>(
  history: DesignHistory<T>,
  next: T,
  reason: string,
  now: number,
  windowMs = COALESCE_WINDOW_MS,
  limit = HISTORY_LIMIT
): DesignHistory<T> {
  if (next === history.present) return history;

  const coalesce = reason !== ''
    && reason === history.lastReason
    && now - history.lastAt <= windowMs;

  if (coalesce) {
    return { past: history.past, present: next, future: [], lastReason: reason, lastAt: now };
  }

  const past = [...history.past, history.present];
  if (past.length > limit) past.splice(0, past.length - limit);

  return { past, present: next, future: [], lastReason: reason, lastAt: now };
}

export function undo<T>(history: DesignHistory<T>): DesignHistory<T> {
  if (history.past.length === 0) return history;

  const past = history.past.slice(0, -1);
  const present = history.past[history.past.length - 1];

  // Typing after an undone step must not coalesce: otherwise the letter
  // the user just typed would overwrite the state they undid to.
  return { past, present, future: [history.present, ...history.future], lastReason: null, lastAt: 0 };
}

export function redo<T>(history: DesignHistory<T>): DesignHistory<T> {
  if (history.future.length === 0) return history;

  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present, future, lastReason: null, lastAt: 0 };
}

export function canUndo<T>(history: DesignHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: DesignHistory<T>): boolean {
  return history.future.length > 0;
}
