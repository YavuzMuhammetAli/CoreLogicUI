import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Hiç yayınlanmamış (taslak) olup pasiflenmiş (silinmiş) modelleri listeler.
 * /drafts sayfasından "Sil" ile pasiflenen taslaklar burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir. Daha önce yayınlanmış bir
 * modelin silinmesi bu listeye girmez — backend (ModelDefinitionManager.GetDeletedDrafts)
 * ModelDefinition geçmişi olmayanları "taslak" sayar.
 *
 * Listeleme/hata/geri yükleme akışı DeletedListComponent'tedir; burada yalnızca
 * bu ekrana özel veri kaynağı tanımlanır.
 */
@Component({
  selector: 'app-deleted-drafts',
  standalone: true,
  imports: [DeletedListComponent],
  template: '<app-deleted-list [source]="source" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedDraftsComponent {
  private readonly publishedTable = inject(PublishedTableService);

  readonly source: DeletedListSource = {
    i18nPrefix: 'deleted.drafts',
    backLink: '/drafts',

    load: () => this.publishedTable.getDeletedDrafts().pipe(
      map(res => ({
        success: res.success,
        message: res.message,
        items: (res.data ?? []).map<DeletedItem>(t => ({
          id: t.id,
          title: t.tableName,
          description: t.description,
          restoreKey: t.tableName
        }))
      }))
    ),

    restore: item => this.publishedTable.restoreDraft(String(item.restoreKey))
  };
}
