import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WorkflowTaskService } from '../../services/workflow-task.service';
import { WorkflowTask } from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { formatDate } from '../../utils/locale-format';

/**
 * "Görevlerim" — kullanıcıya doğrudan atanmış veya üyesi olduğu rollerin
 * havuzundaki bekleyen onaylar.
 *
 * Bu ekran aynı zamanda uygulamanın görev GELEN KUTUSU'dur: projede SignalR
 * olmadığı için anlık bildirim yok, sidebar rozeti bu uçtan pollanıyor.
 *
 * Signal tabanlı (user-list deseni) — alanlar yerine sinyal kullanıldığı için
 * markDirty gerekmiyor.
 */
@Component({
  selector: 'app-my-tasks',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
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

  /** Vade tarihi — sabit 'tr-TR' değil, aktif dile göre biçimlenir. */
  dueLabel(task: WorkflowTask): string {
    return task.dueAt
      ? formatDate(new Date(task.dueAt), this.languageService.lang())
      : this.languageService.t('task.list.noDue');
  }

  /** Atanan: doğrudan kullanıcı yoksa rol adı gösterilir. */
  assigneeLabel(task: WorkflowTask): string {
    if (task.assignedRoleName) return task.assignedRoleName;
    return task.assignedUserId ? `#${task.assignedUserId}` : '—';
  }
}
