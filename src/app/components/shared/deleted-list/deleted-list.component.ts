import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { LanguageService } from '../../../services/language.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { DeletedItem, DeletedListSource } from './deleted-list.model';
import { IconComponent } from '../icon/icon.component';

/**
 * Shared body of the "Silinenler" (Deleted) screens: listing, error display, confirmed
 * restore and dropping the row from the list after success.
 *
 * WHY SHARED: deleted-models / deleted-drafts / deleted-reports / deleted-dashboards
 * were written as four separate components and most of the ~1160 lines in total were
 * identical (two SCSS files were identical down to the character). A fix had to be
 * repeated in four places; in practice one was forgotten.
 *
 * Screens now only provide a <see cref="DeletedListSource"/>.
 */
@Component({
    selector: 'app-deleted-list',
    imports: [RouterLink, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './deleted-list.component.html',
    styleUrls: ['./deleted-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedListComponent implements OnInit {
  /** How long the row stays in the list after a successful restore (ms). */
  private static readonly RemoveAfterRestoreMs = 1500;

  private readonly languageService = inject(LanguageService);

  source = input.required<DeletedListSource>();

  readonly items = signal<DeletedItem[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  /** Id of the record locked while restoring; null means no operation in progress. */
  readonly restoringId = signal<number | null>(null);

  /** Record awaiting confirmation; null means the dialog is closed. */
  readonly pendingRestore = signal<DeletedItem | null>(null);

  /** Per-row feedback: id → { message, success }. */
  readonly feedback = signal<Record<number, { message: string; success: boolean }>>({});

  ngOnInit(): void {
    this.load();
  }

  /** Expands a screen-specific translation key to its full form. */
  key(suffix: string): string {
    return `${this.source().i18nPrefix}.${suffix}`;
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.items.set([]);
    this.feedback.set({});

    this.source().load().subscribe({
      next: res => {
        this.loading.set(false);
        if (!res.success) {
          this.loadError.set(res.message ?? this.languageService.t(this.key('loadFailed')));
          return;
        }
        this.items.set(res.items);
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(
          err?.error?.message ?? this.languageService.t('deleted.serverConnectionError'));
      }
    });
  }

  askRestore(item: DeletedItem): void {
    if (this.restoringId() !== null) return;
    this.pendingRestore.set(item);
  }

  cancelRestore(): void {
    this.pendingRestore.set(null);
  }

  confirmRestore(): void {
    const item = this.pendingRestore();
    if (!item) return;

    this.pendingRestore.set(null);
    this.restoringId.set(item.id);
    this.setFeedback(item.id, null);

    this.source().restore(item).subscribe({
      next: res => {
        this.restoringId.set(null);
        this.setFeedback(item.id, {
          success: res.success,
          message: res.message ?? this.languageService.t(
            res.success ? this.key('restoreSuccess') : 'deleted.restoreFailed')
        });

        if (res.success) {
          // The row stays briefly so the user can see the success message.
          setTimeout(
            () => this.items.update(list => list.filter(i => i.id !== item.id)),
            DeletedListComponent.RemoveAfterRestoreMs);
        }
      },
      error: err => {
        this.restoringId.set(null);
        this.setFeedback(item.id, {
          success: false,
          message: err?.error?.message ?? this.languageService.t('deleted.restoreServerError')
        });
      }
    });
  }

  private setFeedback(id: number, value: { message: string; success: boolean } | null): void {
    this.feedback.update(current => {
      const next = { ...current };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }
}
