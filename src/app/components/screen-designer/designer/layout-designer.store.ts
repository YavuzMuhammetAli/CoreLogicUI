import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { DesignHistory, canRedo, canUndo, createHistory, record, redo, undo } from '../../../utils/design-history';

/**
 * Document store of the screen designer — for one view (form or list).
 *
 * Same principle as the workflow designer's store: the document is IMMUTABLE, the only way to change it is
 * `dispatch(reason, command)`; undo / redo via `utils/design-history`, changes with the same reason
 * arriving within 600 ms merge into one step (each letter typed in the inspector does not become a separate
 * step). "Unsaved changes" are detected by content comparison: undoing back to the
 * saved state clears the dirty flag.
 *
 * Not tied to a component, a plain class: the designer holds two instances (form + list), each
 * with its own dirty flag and optimistic-lock stamp.
 */
export class LayoutDesignerStore<T> {
  // Initialised in the constructor: field initialisers may run before parameter properties.
  private readonly history: WritableSignal<DesignHistory<T>>;
  private readonly savedSnapshot: WritableSignal<string>;

  readonly doc: Signal<T>;
  readonly canUndo: Signal<boolean>;
  readonly canRedo: Signal<boolean>;
  readonly dirty: Signal<boolean>;

  /** Selected item/section/tab id (form) or column name (list). */
  readonly selection = signal<string | null>(null);

  /** Optimistic-lock stamp of the server row; null if there is no row. */
  readonly lastModifiedOn = signal<string | null>(null);

  private readonly serialize: (doc: T) => string;

  constructor(initial: T, serialize: (doc: T) => string) {
    this.serialize = serialize;
    this.history = signal(createHistory(initial));
    this.savedSnapshot = signal(serialize(initial));
    this.doc = computed(() => this.history().present);
    this.canUndo = computed(() => canUndo(this.history()));
    this.canRedo = computed(() => canRedo(this.history()));
    this.dirty = computed(() => this.serialize(this.doc()) !== this.savedSnapshot());
  }

  /** Loads the document: history is reset, the document counts as "saved". */
  load(doc: T, lastModifiedOn: string | null): void {
    this.history.set(createHistory(doc));
    this.savedSnapshot.set(this.serialize(doc));
    this.lastModifiedOn.set(lastModifiedOn);
    this.selection.set(null);
  }

  dispatch(reason: string, command: (doc: T) => T, now = Date.now()): void {
    const current = this.history();
    const next = command(current.present);
    this.history.set(record(current, next, reason, now));
  }

  undo(): void {
    this.history.set(undo(this.history()));
  }

  redo(): void {
    this.history.set(redo(this.history()));
  }

  /**
   * Save succeeded. The document used when sending the request is passed in: edits made
   * while the request was in flight must not count as saved.
   */
  markSaved(sent: T, lastModifiedOn: string | null): void {
    this.savedSnapshot.set(this.serialize(sent));
    this.lastModifiedOn.set(lastModifiedOn);
  }

  /**
   * A write that does not touch the document (name/roles/priority) refreshed the row's stamp — the dirty flag
   * is kept, the next save goes with the new stamp (otherwise our own change would count as a conflict).
   */
  restamp(lastModifiedOn: string | null): void {
    this.lastModifiedOn.set(lastModifiedOn);
  }
}
