import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WorkflowTaskService } from '../../../services/workflow-task.service';
import { WorkflowTask } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { NotificationService } from '../../../services/notification.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { TaskDecisionFormComponent } from '../task-decision-form/task-decision-form.component';
import { formatDate } from '../../../utils/locale-format';

/**
 * Kayıt detayındaki "Onayınızı bekliyor" paneli.
 *
 * Kullanıcı kendisine atanmış bir görevin kaydını açtığında kararı "Görevlerim"e
 * dönmeden, kaydın altından verebilsin diye var.
 *
 * Ayrı bir backend ucu YOK: `/WorkflowTask/my` zaten doğrudan atanan + rol
 * havuzundaki bekleyen görevleri döndürüyor; bu kayda ait olanlar istemcide
 * süzülüyor. Yetki yine sunucuda (Complete atamayı denetler).
 *
 * Görev yoksa ya da workflow modülü kurulu değilse panel hiç çizilmez.
 */
@Component({
  selector: 'app-record-tasks',
  standalone: true,
  imports: [RouterLink, TranslatePipe, TaskDecisionFormComponent],
  templateUrl: './record-tasks.component.html',
  styleUrl: './record-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordTasksComponent implements OnInit {
  readonly entityType = input.required<string>();
  readonly entityId = input.required<number>();

  /** Bir görev sonuçlandırıldı — süreç panelinin tazelenmesi için. */
  readonly decided = output<void>();

  private readonly taskService = inject(WorkflowTaskService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);

  readonly tasks = signal<WorkflowTask[]>([]);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const type = this.entityType().toLowerCase();
    const id = this.entityId();

    this.taskService.my().subscribe({
      next: res => {
        this.tasks.set(res.success
          ? (res.data ?? []).filter(t => t.entityId === id && t.entityType?.toLowerCase() === type)
          : []);
      },
      // Modül kurulu değil / sunucu hatası — kayıt ekranı akışsız da çalışmalı.
      error: () => this.tasks.set([])
    });
  }

  onCompleted(task: WorkflowTask, message: string): void {
    this.notification.success(message);
    this.tasks.update(list => list.filter(t => t.id !== task.id));
    this.decided.emit();
  }

  dueLabel(task: WorkflowTask): string {
    return task.dueAt
      ? formatDate(new Date(task.dueAt), this.languageService.lang())
      : this.languageService.t('task.list.noDue');
  }
}
