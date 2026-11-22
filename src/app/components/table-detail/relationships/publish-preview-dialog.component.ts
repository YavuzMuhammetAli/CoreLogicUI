import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { RelationshipService } from '../../../services/relationship.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { EntityGraphComponent } from '../../shared/entity-graph/entity-graph.component';
import { PublishPreview } from '../../../models/relationship.model';
import { markDirty } from '../../../utils/change-detection';

/** Tabs of the preview dialog. */
type PreviewTab = 'graph' | 'code' | 'sql';

/**
 * Publish preview — shows the entity graph to be created, the C# code to be generated and the
 * migration SQL WITHOUT WRITING to the assembly.
 *
 * Fetches the data itself: sends a single request when the dialog opens and releases
 * the result when it closes. So the main screen never carries the preview state.
 */
@Component({
    selector: 'app-publish-preview-dialog',
    imports: [TranslatePipe, EntityGraphComponent],
    templateUrl: './publish-preview-dialog.component.html',
    styleUrls: ['./relationships.shared.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublishPreviewDialogComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly relationshipService = inject(RelationshipService);
  private readonly languageService = inject(LanguageService);

  /** The source model's PublishedTable.ID value. */
  @Input() tableId: number | null = null;

  @Output() closed = new EventEmitter<void>();

  open = false;
  isLoading = false;
  preview: PublishPreview | null = null;
  activeTab: PreviewTab = 'graph';
  errorMessage: string | null = null;

  /** Opens the dialog and fetches the preview. Does nothing if the model is not saved. */
  show(): void {
    if (this.tableId === null) return;

    this.open = true;
    this.activeTab = 'graph';
    this.isLoading = true;
    this.preview = null;
    this.errorMessage = null;

    this.relationshipService.preview(this.tableId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.isLoading = false;
        this.preview = res.data ?? null;
      },
      error: (err: { error?: { message?: string } }) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message ?? this.languageService.t('common.error');
      }
    });
  }

  close(): void {
    this.open = false;
    this.preview = null;
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close();
  }

  setTab(tab: PreviewTab): void {
    this.activeTab = tab;
  }
}
