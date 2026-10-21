import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkflowTaskService, WorkflowInstanceService } from '../../services/workflow-task.service';
import { WorkflowEvent, WorkflowTask } from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { PermissionService } from '../../services/permission.service';
import { RoleAdminService } from '../../services/role-admin.service';
import { Role } from '../../models/role';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { TaskDecisionFormComponent } from '../shared/task-decision-form/task-decision-form.component';
import { markDirty } from '../../utils/change-detection';
import { formatDate } from '../../utils/locale-format';

/**
 * Görev detayı — onay/red ekranı.
 *
 * Karar formu (adım alanları + açıklama + Onayla/Reddet) `shared/task-decision-form`
 * bileşeninde durur; aynı form kayıt detayında da kullanılır. Bu ekran görev
 * künyesini, yönetici işlemlerini ve süreç geçmişini ekler.
 */
@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, ModelLabelPipe, ConfirmDialogComponent, TaskDecisionFormComponent],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(WorkflowTaskService);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);
  private readonly permissionService = inject(PermissionService);
  private readonly roleService = inject(RoleAdminService);

  /** Yönetici "Atla" işlemi gerekçeyi karar formunun açıklama alanından okur. */
  @ViewChild(TaskDecisionFormComponent) private decisionForm?: TaskDecisionFormComponent;

  task: WorkflowTask | null = null;
  timeline: WorkflowEvent[] = [];

  loading = false;
  loadError: string | null = null;
  /** Yönetici işlemlerinin hatası (karar hatası formun kendisinde gösterilir). */
  adminError: string | null = null;

  // ── Yönetici işlemleri (Faz 4) ────────────────────────────────────────────
  /** Atlama, onaydan AYRI tutulur: audit'te ayırt edilebilmeli. */
  pendingSkip = false;
  skipping = false;
  roles: Role[] = [];
  reassignRoleId: number | null = null;
  reassigning = false;

  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  get isClosed(): boolean {
    return !!this.task && this.task.status !== 'Pending';
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.loadError = this.languageService.t('task.detail.loadFailed');
      return;
    }
    this.load(id);
    if (this.isAdmin) this.loadRoles();
  }


  private load(id: number): void {
    this.loading = true;
    this.loadError = null;

    this.taskService.get(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('task.detail.loadFailed');
          return;
        }

        this.task = res.data;
        this.loadTimeline(res.data.instanceId);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('task.detail.serverError');
      }
    });
  }

  /** Süreç geçmişi ayrı çekilir; görev ekranı süreç bağlamını da göstermeli. */
  private loadTimeline(instanceId: number): void {
    this.instanceService.get(instanceId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success && res.data) this.timeline = res.data.timeline ?? [];
      },
      // Zaman çizelgesi ikincil bilgi — alınamazsa ekran çalışmaya devam etsin.
      error: () => { this.timeline = []; }
    });
  }

  /** Karar sunucuda kabul edildi — ortak form bildirir, ekran listeye döner. */
  onCompleted(message: string): void {
    this.notification.success(message);
    this.router.navigate(['/tasks']);
  }

  eventLabel(event: WorkflowEvent): string {
    return this.languageService.t('workflow.event.' + event.eventType);
  }

  eventTime(event: WorkflowEvent): string {
    return formatDate(new Date(event.createdAt), this.languageService.lang());
  }

  /** Vade tarihi; yoksa "süresiz". */
  get dueLabel(): string {
    return this.task?.dueAt
      ? formatDate(new Date(this.task.dueAt), this.languageService.lang())
      : this.languageService.t('task.list.noDue');
  }

  // ── Yönetici işlemleri ────────────────────────────────────────────────────

  private loadRoles(): void {
    this.roleService.getRoles().pipe(markDirty(this.cdr)).subscribe({
      next: res => { if (res.success) this.roles = res.data ?? []; },
      error: () => { this.roles = []; }
    });
  }

  askSkip(): void { this.pendingSkip = true; }
  cancelSkip(): void { this.pendingSkip = false; }

  confirmSkip(): void {
    const task = this.task;
    this.pendingSkip = false;
    if (!task) return;

    this.skipping = true;
    this.adminError = null;
    this.taskService.skip(task.id, this.decisionForm?.commentValue ?? null)
      .pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.skipping = false;
          if (res.success) {
            this.notification.success(res.message ?? '');
            this.router.navigate(['/tasks']);
          } else {
            this.adminError = res.message ?? '';
          }
        },
        error: err => {
          this.skipping = false;
          this.adminError = err?.error?.message ?? this.languageService.t('task.detail.serverError');
        }
      });
  }

  onReassignRoleChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.reassignRoleId = value ? Number(value) : null;
  }

  reassign(): void {
    const task = this.task;
    if (!task || !this.reassignRoleId) return;

    this.reassigning = true;
    this.adminError = null;
    this.taskService.reassign({ taskId: task.id, roleId: this.reassignRoleId })
      .pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.reassigning = false;
          if (res.success) {
            this.notification.success(res.message ?? '');
            this.reassignRoleId = null;
            this.load(task.id);
          } else {
            this.adminError = res.message ?? '';
          }
        },
        error: err => {
          this.reassigning = false;
          this.adminError = err?.error?.message ?? this.languageService.t('task.detail.serverError');
        }
      });
  }

  get skipMessage(): string {
    return this.languageService.t('task.detail.skipConfirm', { name: this.task?.name ?? '' });
  }
}
