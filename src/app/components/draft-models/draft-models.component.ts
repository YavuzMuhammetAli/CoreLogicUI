import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { PublishedModelService } from '../../services/published-model.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../shared/icon/icon.component';

interface DraftEntry {
  id: number;
  tableName: string;
  description: string;
  version: number;
  /** D-FK: id of the parent model. If null, this is a root model. */
  parentTableId: number | null;
  /** Depth in the model tree. Root = 1. */
  depth: number;
  /** Sub-models of this node (tree structure, as in form-build). */
  children: DraftEntry[];
  publishing: boolean;
  publishMessage: string | null;
  publishSuccess: boolean | null;
  deleting: boolean;
  deleteMessage: string | null;
  deleteSuccess: boolean | null;
  /**
   * If true, this node's real parent is not in the draft list (already published) —
   * i.e. publishing was left half-done: the root model was published but this sub-model wasn't.
   * It looks like a root in the tree (since its parent isn't in this list) but is actually a sub-model.
   */
  isOrphanChild: boolean;
  /** If isOrphanChild, the ancestor chain from the root to the real parent: "AnaModel → AltModel1" */
  parentPath: string | null;
}

/** A single table entry from the getAllTables() response — used to resolve the ancestor chain for parentPath. */
interface TableRef {
  id: number;
  tableName: string;
  parentTableId: number | null;
}

@Component({
    selector: 'app-draft-models',
    imports: [CommonModule, RouterLink, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './draft-models.component.html',
    styleUrls: ['./draft-models.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftModelsComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  /** Flat list — kept to rebuild the tree after publish/delete. */
  private drafts: DraftEntry[] = [];
  /** Root models; each one's sub-models are nested in its children array. */
  tree: DraftEntry[] = [];
  loading = false;
  loadError: string | null = null;

  private readonly languageService = inject(LanguageService);

  constructor(
    private publishedTable: PublishedTableService,
    private publishedModel: PublishedModelService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.drafts = [];
    this.tree = [];

    // Fetch saved tables and published models in parallel
    forkJoin({
      tables: this.publishedTable.getAllTables(),
      published: this.publishedModel.getModels()
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ tables, published }) => {
        this.loading = false;

        if (!tables.success) {
          this.loadError = tables.message ?? this.languageService.t('draft.tablesLoadFailed');
          return;
        }

        // Keep published model names as a set
        const publishedNames = new Set(
          (published.success ? (published.data ?? []) : []).map(m => m.typeName)
        );

        // All tables (published + draft) — the full list is kept so the ancestor chain
        // of orphan sub-models can be resolved (even if the parent is already published).
        const allTables = tables.data ?? [];
        const allById = new Map<number, TableRef>(allTables.map(t => [t.id, t]));

        // Show only the unpublished ones
        this.drafts = allTables
          .filter(t => !publishedNames.has(t.tableName))
          .map(t => ({
            id: t.id,
            tableName: t.tableName,
            description: t.description,
            version: t.version,
            parentTableId: t.parentTableId,
            depth: t.depth,
            children: [],
            publishing: false,
            publishMessage: null,
            publishSuccess: null,
            deleting: false,
            deleteMessage: null,
            deleteSuccess: null,
            isOrphanChild: false,
            parentPath: null
          }));

        // For nodes whose parent is not in the draft list (= already published),
        // compute the "half-finished publish" flag and the ancestor chain.
        const draftIds = new Set(this.drafts.map(d => d.id));
        for (const draft of this.drafts) {
          if (draft.parentTableId != null && !draftIds.has(draft.parentTableId)) {
            draft.isOrphanChild = true;
            draft.parentPath = this.buildParentPath(draft.parentTableId, allById);
          }
        }

        this.tree = this.buildTree(this.drafts);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('draft.serverConnectionError');
      }
    });
  }

  /**
   * Turns the flat draft list into a root model → sub-model tree (same as the
   * model-node structure in form-build). Nodes whose parent is not in the draft list
   * (e.g. the parent is already published) are shown as roots too.
   */
  private buildTree(flat: DraftEntry[]): DraftEntry[] {
    const byId = new Map(flat.map(d => [d.id, d]));
    const roots: DraftEntry[] = [];

    for (const draft of flat) {
      draft.children = [];
    }

    for (const draft of flat) {
      const parent = draft.parentTableId != null ? byId.get(draft.parentTableId) : undefined;
      if (parent) {
        parent.children.push(draft);
      } else {
        roots.push(draft);
      }
    }

    const sortByName = (a: DraftEntry, b: DraftEntry) => a.tableName.localeCompare(b.tableName);
    const sortTree = (nodes: DraftEntry[]) => {
      nodes.sort(sortByName);
      for (const node of nodes) {
        sortTree(node.children);
      }
    };
    sortTree(roots);

    return roots;
  }

  /**
   * Returns the ancestor chain from startId up to the root (root → ... → startId) as a list of names.
   * allById contains ALL tables (published + draft) — since an orphan sub-model's parent
   * is published (and therefore not in this.drafts), the chain can only be resolved
   * through this full list.
   */
  private buildParentPath(startId: number, allById: Map<number, TableRef>): string {
    const names: string[] = [];
    let current: TableRef | undefined = allById.get(startId);

    while (current) {
      names.unshift(current.tableName);
      current = current.parentTableId != null ? allById.get(current.parentTableId) : undefined;
    }

    return names.join(' → ');
  }

  publish(draft: DraftEntry): void {
    if (draft.publishing) return;

    draft.publishing = true;
    draft.publishMessage = null;
    draft.publishSuccess = null;

    this.publishedTable.publish(draft.tableName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        draft.publishing = false;
        draft.publishSuccess = res.success;
        draft.publishMessage = res.message ?? (res.success
          ? this.languageService.t('draft.publishedSuccess')
          : this.languageService.t('draft.publishFailed'));

        // After a successful publish remove it from the tree (root model + all its sub-models together)
        if (res.success) {
          setTimeout(() => {
            this.removeFromTree(draft.id);
            this.cdr.markForCheck();   // OnPush: the timer callback doesn't trigger CD
          }, 1500);
        }
      },
      error: err => {
        draft.publishing = false;
        draft.publishSuccess = false;
        draft.publishMessage = err?.error?.message ?? this.languageService.t('draft.publishServerError');
      }
    });
  }

  /** Draft to deactivate while the confirm dialog is open; null means the dialog is closed. */
  pendingDelete: DraftEntry | null = null;

  /** Confirm dialog text — for a draft with sub-models it gets the "and its sub-models" suffix. */
  deleteConfirmMessage(): string {
    const draft = this.pendingDelete;
    if (!draft) return '';
    return this.languageService.t('draft.deactivateConfirm', {
      name: draft.tableName,
      childrenSuffix: draft.children.length > 0 ? this.languageService.t('draft.andSubModels') : ''
    });
  }

  askDelete(draft: DraftEntry): void {
    if (draft.publishing || draft.deleting) return;
    this.pendingDelete = draft;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  /**
   * Deactivates the draft (soft-delete). PublishedTable/PublishedTableMember records
   * become Active=false; SQL is never touched (a draft was never published, so there is
   * no SQL table anyway). Can be restored from the "Silinen Taslaklar" (Deleted drafts) page.
   */
  confirmDelete(): void {
    const draft = this.pendingDelete;
    this.pendingDelete = null;
    if (!draft || draft.publishing || draft.deleting) return;

    draft.deleting = true;
    draft.deleteMessage = null;
    draft.deleteSuccess = null;

    this.publishedTable.deleteModel(draft.tableName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        draft.deleting = false;
        if (res.success) {
          this.removeFromTree(draft.id);
        } else {
          draft.deleteSuccess = false;
          draft.deleteMessage = res.message ?? this.languageService.t('draft.deactivateFailed');
        }
      },
      error: err => {
        draft.deleting = false;
        draft.deleteSuccess = false;
        draft.deleteMessage = err?.error?.message ?? this.languageService.t('draft.serverConnectionError');
      }
    });
  }

  /** Removes a root model (and its whole sub-model tree) from the flat list and the tree. */
  private removeFromTree(rootId: number): void {
    this.drafts = this.drafts.filter(d => d.id !== rootId);
    this.tree = this.tree.filter(d => d.id !== rootId);
  }
}
