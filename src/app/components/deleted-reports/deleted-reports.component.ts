import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { ReportService } from '../../services/report.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Lists deactivated (deleted) report definitions. When a report is deleted directly or
 * the model it depends on is deleted from the /models page (cascade), it appears here and
 * can be reactivated with Geri Yükle (Restore).
 *
 * The list/error/restore flow lives in DeletedListComponent; only the data source
 * specific to this screen is defined here.
 */
@Component({
    selector: 'app-deleted-reports',
    imports: [DeletedListComponent],
    template: '<app-deleted-list [source]="source" />',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedReportsComponent {
  private readonly reportService = inject(ReportService);

  readonly source: DeletedListSource = {
    i18nPrefix: 'deleted.reports',
    backLink: '/reports',

    load: () => this.reportService.listDeleted().pipe(
      map(res => ({
        success: res.success,
        message: res.message,
        items: (res.data ?? []).map<DeletedItem>(r => ({
          id: r.id,
          title: r.name,
          badges: [r.modelName],
          restoreKey: r.id
        }))
      }))
    ),

    restore: item => this.reportService.restore(Number(item.restoreKey))
  };
}
