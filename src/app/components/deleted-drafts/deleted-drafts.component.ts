import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Lists models that were never published (drafts) and have been deactivated (deleted).
 * Drafts deactivated with "Sil" (Delete) on the /drafts page appear here and
 * can be reactivated with Geri Yükle (Restore). Deleting a model that was published
 * before does not land in this list — the backend (ModelDefinitionManager.GetDeletedDrafts)
 * treats those without ModelDefinition history as "drafts".
 *
 * The list/error/restore flow lives in DeletedListComponent; only the data source
 * specific to this screen is defined here.
 */
@Component({
    selector: 'app-deleted-drafts',
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
