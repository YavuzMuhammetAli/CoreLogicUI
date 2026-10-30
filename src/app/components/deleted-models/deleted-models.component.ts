import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Daha önce en az bir kez yayınlanmış olup pasiflenmiş (silinmiş) modelleri listeler.
 * /models sayfasından "Sil" ile pasiflenen yayınlanmış modeller burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir (tablo ağacı + ModelDefinition sürümleri
 * aktif edilir, derlenmiş tip yeniden derlenir). Hiç yayınlanmamış taslaklar bu listeye
 * girmez — onlar için /drafts/deleted kullanılır.
 *
 * Listeleme/hata/geri yükleme akışı DeletedListComponent'tedir; burada yalnızca
 * bu ekrana özel veri kaynağı tanımlanır.
 */
@Component({
    selector: 'app-deleted-models',
    imports: [DeletedListComponent],
    template: '<app-deleted-list [source]="source" />',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedModelsComponent {
  private readonly publishedTable = inject(PublishedTableService);

  readonly source: DeletedListSource = {
    i18nPrefix: 'deleted.models',
    backLink: '/models',

    load: () => this.publishedTable.getDeletedModels().pipe(
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

    restore: item => this.publishedTable.restoreModel(String(item.restoreKey))
  };
}
