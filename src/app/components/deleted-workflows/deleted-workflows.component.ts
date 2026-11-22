import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { map } from 'rxjs';
import { LanguageService } from '../../services/language.service';
import { WorkflowService } from '../../services/workflow.service';
import { DeletedListComponent } from '../shared/deleted-list/deleted-list.component';
import { DeletedItem, DeletedListSource } from '../shared/deleted-list/deleted-list.model';

/**
 * Lists deactivated (deleted) workflow definitions.
 *
 * The list/error/restore flow lives in DeletedListComponent; only the data source
 * specific to this screen is defined here (same pattern as deleted-reports).
 */
@Component({
    selector: 'app-deleted-workflows',
    imports: [DeletedListComponent],
    template: '<app-deleted-list [source]="source" />',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeletedWorkflowsComponent {
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);

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
          // Target model and version badges: if two workflows share a name, they help
          // tell which one is which.
          badges: [w.modelName, w.version > 0 ? `v${w.version}` : this.languageService.t('workflow.status.Draft')],
          restoreKey: w.id
        }))
      }))
    ),

    restore: item => this.workflowService.restore(Number(item.restoreKey))
  };
}
