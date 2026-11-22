import { Injectable, computed, signal } from '@angular/core';
import { WorkflowGraph } from '../../../models/workflow.model';
import { Camera } from '../../shared/workflow-canvas/workflow-canvas.camera';
import { WorkflowDesignDoc, emptyDoc, serializeDoc } from './workflow-design.doc';
import { DesignSelection, EMPTY_SELECTION, pruneSelection } from './workflow-selection';
import {
  DesignHistory,
  canRedo,
  canUndo,
  createHistory,
  record,
  redo,
  undo
} from '../../../utils/design-history';

/**
 * State of the flow design screen — design document, undo/redo history,
 * unsaved-changes flag and selection.
 *
 * Component-scoped (`providers: [WorkflowDesignerStore]`): every design
 * screen gets its own instance, and the state goes away when leaving the screen.
 *
 * `dispatch` is the ONLY way to change the document; the rules live in pure commands
 * (workflow-design.commands.ts), the store only keeps records.
 */
@Injectable()
export class WorkflowDesignerStore {
  private readonly history = signal<DesignHistory<WorkflowDesignDoc>>(createHistory(emptyDoc()));

  /** Serialised form of the last saved (or loaded) document. */
  private readonly savedSnapshot = signal(serializeDoc(emptyDoc()));

  readonly doc = computed(() => this.history().present);
  readonly graph = computed<WorkflowGraph>(() => this.doc().graph);

  readonly canUndo = computed(() => canUndo(this.history()));
  readonly canRedo = computed(() => canRedo(this.history()));

  /**
   * Are there unsaved changes. Content is compared, not references:
   * a user who undoes back to the saved state or writes a value back to its old value
   * should not see an "unsaved" warning.
   */
  readonly dirty = computed(() => serializeDoc(this.doc()) !== this.savedSnapshot());

  /** A published/archived version opens read-only. */
  readonly readonly = signal(false);

  /** Selection — the canvas and the step list show the same selection. */
  readonly selection = signal<DesignSelection>(EMPTY_SELECTION);

  /**
   * The canvas camera. The canvas is removed from the DOM on tab change (in a hidden tab
   * it is zero-sized and fitting breaks); the camera is kept here so it reopens
   * where it left off on return. null → the canvas fits the diagram on first open.
   */
  readonly camera = signal<Camera | null>(null);

  /** Loads the document; history, selection and the "unsaved" flag are reset. */
  load(doc: WorkflowDesignDoc): void {
    this.history.set(createHistory(doc));
    this.savedSnapshot.set(serializeDoc(doc));
    this.selection.set(EMPTY_SELECTION);
  }

  /**
   * Applies the command and records it in history. Changes arriving shortly after each other
   * with the same `reason` merge into a single undo step (so each typed letter is not
   * a separate step). If the command did not change the document nothing is recorded.
   */
  dispatch(reason: string, command: (doc: WorkflowDesignDoc) => WorkflowDesignDoc, now = Date.now()): void {
    if (this.readonly()) return;
    const current = this.history();
    this.history.set(record(current, command(current.present), reason, now));
    this.pruneSelection();
  }

  undo(): void {
    if (this.readonly()) return;
    this.history.update(undo);
    this.pruneSelection();
  }

  redo(): void {
    if (this.readonly()) return;
    this.history.update(redo);
    this.pruneSelection();
  }

  /** Steps no longer in the document drop out of the selection (delete, undo). */
  private pruneSelection(): void {
    this.selection.update(selection => pruneSelection(selection, this.doc()));
  }

  /**
   * After a successful save: the SENT document counts as "saved". The snapshot is
   * taken at send time and passed here so edits made while the request is
   * in flight do not appear saved.
   */
  markSaved(doc: WorkflowDesignDoc = this.doc()): void {
    this.savedSnapshot.set(serializeDoc(doc));
  }
}
