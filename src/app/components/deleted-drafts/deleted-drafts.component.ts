import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PublishedTableService } from '../../services/published-table.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';

interface DeletedDraftEntry {
  id: number;
  tableName: string;
  description: string;
  version: number;
  restoring: boolean;
  restoreMessage: string | null;
  restoreSuccess: boolean | null;
}

/**
 * Hiç yayınlanmamış (taslak) olup pasiflenmiş (silinmiş) modelleri listeler.
 * /drafts sayfasından "Sil" ile pasiflenen taslaklar burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir. Daha önce yayınlanmış bir
 * modelin silinmesi bu listeye girmez — backend (ModelDefinitionManager.GetDeletedDrafts)
 * ModelDefinition geçmişi olmayanları "taslak" sayar.
 */
@Component({
  selector: 'app-deleted-drafts',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './deleted-drafts.component.html',
  styleUrls: ['./deleted-drafts.component.scss']
})
export class DeletedDraftsComponent implements OnInit {
  drafts: DeletedDraftEntry[] = [];
  loading = false;
  loadError: string | null = null;

  private readonly languageService = inject(LanguageService);

  constructor(private publishedTable: PublishedTableService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.drafts = [];

    this.publishedTable.getDeletedDrafts().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.loadError = res.message ?? this.languageService.t('deleted.drafts.loadFailed');
          return;
        }

        this.drafts = (res.data ?? []).map(t => ({
          id: t.id,
          tableName: t.tableName,
          description: t.description,
          version: t.version,
          restoring: false,
          restoreMessage: null,
          restoreSuccess: null
        }));
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('deleted.serverConnectionError');
      }
    });
  }

  /** Pasiflenmiş taslağı yeniden aktif yapar (Active=true). SQL'e dokunulmaz. */
  restore(draft: DeletedDraftEntry): void {
    if (draft.restoring) return;

    const confirmed = confirm(this.languageService.t('deleted.drafts.restoreConfirm', { name: draft.tableName }));
    if (!confirmed) return;

    draft.restoring = true;
    draft.restoreMessage = null;
    draft.restoreSuccess = null;

    this.publishedTable.restoreDraft(draft.tableName).subscribe({
      next: res => {
        draft.restoring = false;
        draft.restoreSuccess = res.success;
        draft.restoreMessage = res.message ?? (res.success
          ? this.languageService.t('deleted.drafts.restoreSuccess')
          : this.languageService.t('deleted.restoreFailed'));

        if (res.success) {
          setTimeout(() => {
            this.drafts = this.drafts.filter(d => d.id !== draft.id);
          }, 1500);
        }
      },
      error: err => {
        draft.restoring = false;
        draft.restoreSuccess = false;
        draft.restoreMessage = err?.error?.message ?? this.languageService.t('deleted.restoreServerError');
      }
    });
  }
}
