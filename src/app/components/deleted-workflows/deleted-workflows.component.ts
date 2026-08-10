import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { WorkflowService } from '../../services/workflow.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Pasiflenmiş (silinmiş) iş akışı tanımlarını listeler.
 *
 * Listeleme/hata/geri yükleme akışı DeletedListComponent'tedir; burada yalnızca
 * bu ekrana özel veri kaynağı tanımlanır (deleted-reports ile aynı desen).
 */
@Component({
  selector: 'app-deleted-workflows',
  standalone: true,
  imports: [DeletedListComponent],
  template: '<app-deleted-list [source]="source" />',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedWorkflowsComponent {
  private readonly workflowService = inject(WorkflowService);

  readonly source: DeletedListSource = {
    i18nPrefix: 'deleted.workflows',
    backLink: '/workflows',

    load: () => this.workflowService.listDeleted().pipe(
      map(res => ({
        success: res.success,
        message: res.message,
        items: (res.data ?? []).map<DeletedItem>(w => ({
          id: w.id,
          title: w.name,
          description: w.code,
          // Hedef model ve sürüm rozetleri: aynı adlı iki akış varsa hangisi
          // olduğunu ayırt etmeye yarar.
          badges: [w.modelName, w.version > 0 ? `v${w.version}` : 'taslak'],
          restoreKey: w.id
        }))
      }))
    ),

    restore: item => this.workflowService.restore(Number(item.restoreKey))
  };
}
