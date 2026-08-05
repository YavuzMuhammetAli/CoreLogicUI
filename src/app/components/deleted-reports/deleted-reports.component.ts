import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { ReportService } from '../../services/report.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Pasiflenmiş (silinmiş) rapor tanımlarını listeler. Bir rapor doğrudan silindiğinde veya
 * bağlı olduğu model /models sayfasından silinince (cascade) burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir.
 *
 * Listeleme/hata/geri yükleme akışı DeletedListComponent'tedir; burada yalnızca
 * bu ekrana özel veri kaynağı tanımlanır.
 */
@Component({
  selector: 'app-deleted-reports',
  standalone: true,
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
