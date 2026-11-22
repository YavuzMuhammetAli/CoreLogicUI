import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter,
  Input, OnChanges, Output, SimpleChanges, ViewChild, inject
} from '@angular/core';
import { from, concatMap } from 'rxjs';
import { RelationshipService } from '../../../services/relationship.service';
import { PublishedTableService } from '../../../services/published-table.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { RelationshipDialogComponent } from './relationship-dialog.component';
import { PublishPreviewDialogComponent } from './publish-preview-dialog.component';
import {
  RelationshipDefinition,
  RelationshipType,
  RelationshipUpsert,
  RelationshipValidationResult,
  RELATIONSHIP_TYPE_OPTIONS
} from '../../../models/relationship.model';
import { markDirty } from '../../../utils/change-detection';
import { IconComponent } from '../../shared/icon/icon.component';

/**
 * "İlişkiler" (Relationships) tab — the whole lifecycle of model relationships (G1).
 *
 * Split out of table-detail: the main screen no longer knows the relationship model at all, it only
 * calls <c>flush()</c> in the save flow. The tab manages the list, live graph
 * validation, the delete confirmation and the staging in NEW MODEL mode itself.
 *
 * Why staging lives here: until the model is saved for the first time there is no table ID and
 * relationships cannot be sent to the server. Pending ones are kept in memory and POSTed
 * in order after the first save.
 */
@Component({
    selector: 'app-relationships-tab',
    imports: [
        TranslatePipe, ConfirmDialogComponent,
        RelationshipDialogComponent, PublishPreviewDialogComponent, IconComponent
    ],
    templateUrl: './relationships-tab.component.html',
    styleUrls: ['./relationships.shared.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RelationshipsTabComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly relationshipService = inject(RelationshipService);
  private readonly publishedTableService = inject(PublishedTableService);
  private readonly languageService = inject(LanguageService);

  /**
   * The source model's PublishedTable.ID value; the route parameter of the relationship endpoints.
   * In new model mode it is null until the first save completes.
   */
  @Input() tableId: number | null = null;

  /** Name of the model edited on this screen (SelfReference target + staged rows). */
  @Input() modelName = '';

  /** Whether this is new model creation mode. */
  @Input() isNew = false;

  /** Autocomplete source — only published models. */
  @Input() publishedModelNames: string[] = [];

  /**
   * Whether the tab is visible. The component is kept ALIVE even when the tab is closed: the relationship count
   * and validation state are shown in the badge on the tab bar, so the data
   * must be loaded even before the tab is opened for the first time.
   */
  @Input() active = false;

  /**
   * A relationship change was persisted on the server. The main screen uses this
   * to mark the "model as publishable".
   */
  @Output() persisted = new EventEmitter<void>();

  /** For the badge on the tab bar: relationship count + whether the graph is valid. */
  @Output() statusChanged = new EventEmitter<{ count: number; isValid: boolean }>();

  /** The main screen opens the relationship guide (the guide is shared with the columns). */
  @Output() helpRequested = new EventEmitter<void>();
  @Output() typeHelpRequested = new EventEmitter<RelationshipType>();

  @ViewChild(RelationshipDialogComponent) private dialog?: RelationshipDialogComponent;
  @ViewChild(PublishPreviewDialogComponent) private previewDialog?: PublishPreviewDialogComponent;

  /** Relationships on the server (edit mode) or pending in memory (new model). */
  relationships: RelationshipDefinition[] = [];

  /** Live validation result — the user sees cycle/depth warnings before saving. */
  validation: RelationshipValidationResult | null = null;

  errorMessage: string | null = null;
  isSaving = false;
  isDeleting = false;

  /** Delete target awaiting confirmation; null means the confirm dialog is closed. */
  toRemove: RelationshipDefinition | null = null;

  relationshipTypeOptions = RELATIONSHIP_TYPE_OPTIONS;

  /**
   * Temporary id → pending relationship. A Map is used instead of an array + parallel index:
   * relying on index matching between `relationships` and this collection
   * silently updates the wrong record when a saved relationship sits in between.
   *
   * Insertion order is preserved (Map insertion order) — the flush order matters for publish.
   */
  private pending = new Map<string, RelationshipUpsert>();

  /**
   * MONOTONIC counter generating temporary ids for pending relationships.
   *
   * The Map size cannot be used: when a relationship is deleted and a new one added, the same id
   * is generated a second time; the existing entry is overwritten and @for ... track breaks
   * with a duplicate key.
   */
  private pendingIdSeq = 0;

  ngOnChanges(changes: SimpleChanges): void {
    // Relationships are loaded when the table ID is first resolved (or changes).
    if (changes['tableId'] && this.tableId !== null) {
      this.load();
    }
  }

  /** To add a relationship the model must be saved (its table ID must exist). */
  get canManage(): boolean {
    return this.tableId !== null || this.isNew;
  }

  // ─── List + validation ──────────────────────────────────────────────────────

  private load(): void {
    if (this.tableId === null) return;

    this.relationshipService.list(this.tableId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.relationships = res.success ? (res.data ?? []) : [];
        this.emitStatus();
        this.runValidation();
      },
      error: () => { this.relationships = []; this.emitStatus(); }
    });
  }

  /** State feeding the tab badge — whenever the list or validation changes. */
  private emitStatus(): void {
    this.statusChanged.emit({
      count: this.relationships.length,
      isValid: this.validation?.isValid ?? true
    });
  }

  /** Runs the graph validation — the user sees the error before publishing. */
  private runValidation(): void {
    if (this.tableId === null) {
      this.validation = null;
      return;
    }

    this.relationshipService.validateGraph(this.tableId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.validation = res.data ?? null;
        this.emitStatus();
      },
      error: (err: { error?: { data?: RelationshipValidationResult } }) => {
        // A validation error may also come back with 400; the result in the body is still used.
        this.validation = err?.error?.data ?? null;
        this.emitStatus();
      }
    });
  }

  // ─── Popup flow ─────────────────────────────────────────────────────────────

  openAdd(): void {
    this.errorMessage = null;
    this.dialog?.openForCreate(this.relationships.length + 1);
  }

  openEdit(relationship: RelationshipDefinition): void {
    this.errorMessage = null;
    this.dialog?.openForEdit(relationship);
  }

  onDialogSave(body: RelationshipUpsert): void {
    // If the model is not saved yet the relationship is kept in memory; after the first save,
    // once the table ID exists, they are sent in bulk.
    if (this.tableId === null) {
      this.stagePending(body);
      return;
    }

    const editingId = this.dialog?.editingRelationshipId ?? null;

    this.isSaving = true;
    this.errorMessage = null;

    const request$ = editingId
      ? this.relationshipService.update(this.tableId, editingId, body)
      : this.relationshipService.add(this.tableId, body);

    request$.pipe(markDirty(this.cdr)).subscribe({
      next: () => {
        this.isSaving = false;
        this.dialog?.close();
        this.load();
        this.persisted.emit();
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isSaving = false;
        this.errorMessage =
          err?.error?.message ?? err?.message ?? this.languageService.t('common.error');
      }
    });
  }

  /** In new model mode keeps the relationship in memory and shows it in the list. */
  private stagePending(body: RelationshipUpsert): void {
    const editingId = this.dialog?.editingRelationshipId ?? null;

    if (editingId) {
      this.pending.set(editingId, body);
      this.relationships = this.relationships.map(r =>
        r.relationshipId === editingId ? this.toStagedDefinition(body, editingId) : r);
    } else {
      const stagedId = `pending-${++this.pendingIdSeq}`;
      this.pending.set(stagedId, body);
      this.relationships = [...this.relationships, this.toStagedDefinition(body, stagedId)];
    }

    this.emitStatus();

    this.dialog?.close();
  }

  /** Converts a relationship pending in memory into a display object to show in the list. */
  private toStagedDefinition(body: RelationshipUpsert, stagedId: string): RelationshipDefinition {
    const now = new Date().toISOString();
    return {
      relationshipId:   stagedId,
      sourceModel:      this.modelName,
      targetModel:      body.targetModel,
      relationshipType: body.relationshipType,
      propertyName:     body.propertyName,
      inverseProperty:  body.inverseProperty ?? null,
      foreignKeyName:   body.foreignKeyName ?? null,
      joinTableName:    body.joinTableName ?? null,
      cascadeDelete:    body.cascadeDelete,
      required:         body.required,
      depth:            0,
      order:            body.order,
      displayName:      body.displayName ?? null,
      createdAt:        now,
      updatedAt:        now
    };
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  /**
   * Opens the delete confirmation. Deletion cannot be undone (the SQL FK of a persisted relationship
   * is dropped on the next publish), so a DELETE is not sent directly.
   */
  askRemove(relationship: RelationshipDefinition): void {
    this.toRemove = relationship;
  }

  cancelRemove(): void {
    this.toRemove = null;
  }

  confirmRemove(): void {
    const relationship = this.toRemove;
    if (!relationship) return;

    // Relationship pending in memory (not saved yet)
    if (this.tableId === null) {
      this.pending.delete(relationship.relationshipId);
      this.relationships = this.relationships
        .filter(r => r.relationshipId !== relationship.relationshipId);
      this.toRemove = null;
      this.emitStatus();
      return;
    }

    this.isDeleting = true;

    this.relationshipService.delete(this.tableId, relationship.relationshipId)
      .pipe(markDirty(this.cdr)).subscribe({
        next: () => {
          this.isDeleting = false;
          this.toRemove = null;
          this.load();
          this.persisted.emit();
        },
        error: (err: { error?: { message?: string } }) => {
          this.isDeleting = false;
          this.toRemove = null;
          this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
        }
      });
  }

  // ─── Preview ────────────────────────────────────────────────────────────────

  openPreview(): void {
    this.previewDialog?.show();
  }

  // ─── Seam with the save flow ────────────────────────────────────────────────

  /**
   * Sends the pending relationships to the server after the model is saved for the first time.
   * The main screen calls it when onSave() completes.
   *
   * No return value: on error a message is shown to the user in this tab; the main
   * screen's save result is independent of the relationships (the model has been saved).
   */
  flush(rootName: string): void {
    if (this.pending.size === 0) return;

    this.publishedTableService.getAllTables().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const match = (res.data ?? []).find(
          t => t.tableName.toLowerCase() === rootName.toLowerCase());

        // The model was saved but its table was not found in the list — pending relationships
        // cannot be sent. Inform the user instead of returning silently; otherwise the
        // relationships seem to have vanished and it is not clear why.
        if (!match) {
          this.errorMessage = this.languageService.t('relationship.flushTableNotFound');
          return;
        }

        this.tableId = match.id;
        const pending = [...this.pending.values()];
        this.pending.clear();

        from(pending).pipe(
          concatMap(body => this.relationshipService.add(match.id, body))
        ).pipe(markDirty(this.cdr)).subscribe({
          complete: () => this.load(),
          error: (err: { error?: { message?: string } }) => {
            this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
            this.load();
          }
        });
      },
      // If the table list cannot be fetched, the user must not be left without any feedback.
      error: (err: { error?: { message?: string } }) => {
        this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
      }
    });
  }

  // ─── Seam with the main screen: reset and ESC ───────────────────────────────

  /**
   * Returns the tab to an empty state. The main screen calls it when switching to another model
   * on the same route (clicking a sub-model row): since the component is not
   * recreated, the previous model's relationships would otherwise stay on screen.
   *
   * `tableId` is also nulled as an input from the main screen; when the new ID is resolved
   * ngOnChanges loads the list itself.
   */
  reset(): void {
    this.relationships = [];
    this.validation    = null;
    this.errorMessage  = null;
    this.toRemove      = null;
    this.isSaving      = false;
    this.isDeleting    = false;
    this.pending.clear();
    this.pendingIdSeq  = 0;
    this.emitStatus();
  }

  /**
   * ESC — called from the main screen's HostListener. Closes this tab's topmost open
   * dialog and returns true; if there is nothing to close it returns false and the main
   * screen continues with its own popups.
   *
   * There is no delete confirmation here: ConfirmDialogComponent has its own ESC handler.
   */
  handleEscape(): boolean {
    if (this.previewDialog?.open) {
      this.previewDialog.close();
      return true;
    }
    if (this.dialog?.open) {
      this.dialog.close();
      return true;
    }
    return false;
  }

  // ─── Display helpers ────────────────────────────────────────────────────────

  /** Returns the translation key of the relationship type. */
  relationshipTypeLabel(type: RelationshipType): string {
    return this.relationshipTypeOptions.find(o => o.value === type)?.labelKey ?? '';
  }

  hasErrorFor(relationshipId: string): boolean {
    return !!this.validation?.errors.some(i => i.relationshipId === relationshipId);
  }
}
