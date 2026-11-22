import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';

import { RouterLink } from '@angular/router';
import { WorkflowTaskService } from '../../services/workflow-task.service';
import { WorkflowTask } from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { formatDate } from '../../utils/locale-format';
import { IconComponent } from '../shared/icon/icon.component';

/**
 * "Görevlerim" (My tasks) — pending approvals assigned directly to the user or in the pool
 * of the roles they belong to.
 *
 * This screen is also the app's task INBOX: there is no SignalR in the project,
 * so there are no instant notifications; the sidebar badge polls this endpoint.
 *
 * Signal-based (user-list pattern) — since signals are used instead of fields,
 * markDirty isn't needed.
 */
@Component({
    selector: 'app-my-tasks',
    imports: [RouterLink, TranslatePipe, ModelLabelPipe, IconComponent],
    templateUrl: './my-tasks.component.html',
    styleUrl: './my-tasks.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyTasksComponent {
  private readonly taskService = inject(WorkflowTaskService);
  private readonly languageService = inject(LanguageService);

  readonly tasks = signal<WorkflowTask[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly hasTasks = computed(() => this.tasks().length > 0);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.taskService.my().subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.tasks.set(res.data ?? []);
        } else {
          this.loadError.set(res.message ?? this.languageService.t('task.list.loadFailed'));
        }
      },
      error: err => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? this.languageService.t('task.list.serverError'));
      }
    });
  }

  /** Due date — formatted for the active language, not a fixed 'tr-TR'. */
  dueLabel(task: WorkflowTask): string {
    return task.dueAt
      ? formatDate(new Date(task.dueAt), this.languageService.lang())
      : this.languageService.t('task.list.noDue');
  }

  /** Assignee: if there is no direct user, the role name is shown. */
  assigneeLabel(task: WorkflowTask): string {
    if (task.assignedRoleName) return task.assignedRoleName;
    return task.assignedUserId ? `#${task.assignedUserId}` : '—';
  }
}
