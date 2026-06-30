import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PublishedTableService } from '../../services/published-table.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';

interface DeletedModelEntry {
  id: number;
  tableName: string;
  description: string;
  version: number;
  restoring: boolean;
  restoreMessage: string | null;
  restoreSuccess: boolean | null;
}

/**
 * Daha önce en az bir kez yayınlanmış olup pasiflenmiş (silinmiş) modelleri listeler.
 * /models sayfasından "Sil" ile pasiflenen yayınlanmış modeller burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir (tablo ağacı + ModelDefinition sürümleri
 * aktif edilir, derlenmiş tip yeniden derlenir). Hiç yayınlanmamış taslaklar bu listeye
 * girmez — onlar için /drafts/deleted kullanılır.
 */
@Component({
  selector: 'app-deleted-models',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './deleted-models.component.html',
  styleUrls: ['./deleted-models.component.scss']
})
export class DeletedModelsComponent implements OnInit {
  models: DeletedModelEntry[] = [];
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
    this.models = [];

    this.publishedTable.getDeletedModels().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.loadError = res.message ?? this.languageService.t('deleted.models.loadFailed');
          return;
        }

        this.models = (res.data ?? []).map(t => ({
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

  /** Pasiflenmiş modeli yeniden aktif yapar (tablo ağacı + ModelDefinition + derlenmiş tip). */
  restore(model: DeletedModelEntry): void {
    if (model.restoring) return;

    const confirmed = confirm(this.languageService.t('deleted.models.restoreConfirm', { name: model.tableName }));
    if (!confirmed) return;

    model.restoring = true;
    model.restoreMessage = null;
    model.restoreSuccess = null;

    this.publishedTable.restoreModel(model.tableName).subscribe({
      next: res => {
        model.restoring = false;
        model.restoreSuccess = res.success;
        model.restoreMessage = res.message ?? (res.success
          ? this.languageService.t('deleted.models.restoreSuccess')
          : this.languageService.t('deleted.restoreFailed'));

        if (res.success) {
          setTimeout(() => {
            this.models = this.models.filter(m => m.id !== model.id);
          }, 1500);
        }
      },
      error: err => {
        model.restoring = false;
        model.restoreSuccess = false;
        model.restoreMessage = err?.error?.message ?? this.languageService.t('deleted.restoreServerError');
      }
    });
  }
}
