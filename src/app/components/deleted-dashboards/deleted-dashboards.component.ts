import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { DashboardService } from '../../services/dashboard.service';
import { LanguageService } from '../../services/language.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Pasiflenmiş (silinmiş) dashboard tanımlarını listeler. Bir dashboard doğrudan silindiğinde
 * veya bağlı olduğu model /models sayfasından silinince (cascade) burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir.
 *
 * Listeleme/hata/geri yükleme akışı DeletedListComponent'tedir; burada yalnızca
 * bu ekrana özel veri kaynağı tanımlanır.
 */
@Component({
    selector: 'app-deleted-dashboards',
    imports: [DeletedListComponent],
    template: '<app-deleted-list [source]="source" />',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedDashboardsComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly languageService = inject(LanguageService);

  readonly source: DeletedListSource = {
    i18nPrefix: 'deleted.dashboards',
    backLink: '/dashboard',

    load: () => this.dashboardService.listDeleted().pipe(
      map(res => ({
        success: res.success,
        message: res.message,
        items: (res.data ?? []).map<DeletedItem>(d => ({
          id: d.id,
          title: d.name,
          badges: [
            this.languageService.t('deleted.dashboards.widgetCount', {
              count: d.widgets?.length ?? 0
            })
          ],
          restoreKey: d.id
        }))
      }))
    ),

    restore: item => this.dashboardService.restore(Number(item.restoreKey))
  };
}
