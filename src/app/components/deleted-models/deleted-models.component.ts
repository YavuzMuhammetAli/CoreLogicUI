import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Lists models that were published at least once and have been deactivated (deleted).
 * Published models deactivated with "Sil" (Delete) on the /models page appear here and
 * can be reactivated with Geri Yükle (Restore) (the table tree + ModelDefinition versions
 * are activated, the compiled type is recompiled). Never-published drafts do not land
 * in this list — /drafts/deleted is used for those.
 *
 * The list/error/restore flow lives in DeletedListComponent; only the data source
 * specific to this screen is defined here.
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
