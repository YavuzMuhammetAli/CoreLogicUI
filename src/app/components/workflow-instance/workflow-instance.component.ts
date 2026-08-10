import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkflowInstanceService } from '../../services/workflow-task.service';
import {
  WorkflowChain, WorkflowEvent, WorkflowInstance, WorkflowStepInfo, WorkflowTask
} from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { PermissionService } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { markDirty } from '../../utils/change-detection';
import { formatDate } from '../../utils/locale-format';

/**
 * Süreç detayı — zaman çizelgesi, görevler ve zincir doğrulama.
 *
 * Görevler adım anahtarına göre gruplanır: paralel adımda aynı StepKey altında
 * birden çok dal görevi bulunur ve düz bir liste "aynı adım iki kez açılmış" gibi
 * okunurdu.
 */
@Component({
  selector: 'app-workflow-instance',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './workflow-instance.component.html',
  styleUrl: './workflow-instance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowInstanceComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);
  private readonly permissionService = inject(PermissionService);

  instance: WorkflowInstance | null = null;
  /** Adım anahtarına göre gruplanmış görevler — paralel dallar bir arada. */
  stepGroups: Array<{ stepKey: string; tasks: WorkflowTask[] }> = [];
  chain: WorkflowChain | null = null;

  loading = false;
  loadError: string | null = null;
  verifying = false;
  cancelling = false;
  pendingCancel = false;

  // ── Rollback ──────────────────────────────────────────────────────────────
  /** Tanımdaki adımlar — rollback hedefi seçimi için. */
  steps: WorkflowStepInfo[] = [];
  rollbackTarget = '';
  rollingBack = false;
  pendingRollback = false;

  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  get canCancel(): boolean {
    return this.isAdmin && this.instance?.status === 'Running';
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.loadError = this.languageService.t('workflow.instance.loadFailed');
      return;
    }
    this.load(id);
  }

  load(id: number): void {
    this.loading = true;
    this.loadError = null;

    this.instanceService.get(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('workflow.instance.loadFailed');
          return;
        }
        this.instance = res.data;
        this.stepGroups = this.groupByStep(res.data.tasks ?? []);
        if (this.isAdmin) this.loadSteps(id);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.instance.serverError');
      }
    });
  }

  /** Görev sırası korunur; grup sırası ilk görevin oluşma sırasıdır. */
  private groupByStep(tasks: WorkflowTask[]): Array<{ stepKey: string; tasks: WorkflowTask[] }> {
    const groups = new Map<string, WorkflowTask[]>();
    for (const task of tasks) {
      const bucket = groups.get(task.stepKey) ?? [];
      bucket.push(task);
      groups.set(task.stepKey, bucket);
    }
    return [...groups.entries()].map(([stepKey, list]) => ({ stepKey, tasks: list }));
  }

  verifyChain(): void {
    if (!this.instance) return;
    this.verifying = true;

    this.instanceService.verifyChain(this.instance.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.verifying = false;
        this.chain = res.data ?? null;
      },
      error: err => {
        this.verifying = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  /** Rollback hedefleri instance'ın BAŞLADIĞI sürümün tanımından gelir. */
  private loadSteps(instanceId: number): void {
    this.instanceService.steps(instanceId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) this.steps = res.data ?? [];
      },
      error: () => { this.steps = []; }
    });
  }

  /** ngModel yerine düz change: bu ekranda reactive form yok, FormsModule getirmeye değmez. */
  onRollbackTargetChange(event: Event): void {
    this.rollbackTarget = (event.target as HTMLSelectElement).value;
  }

  askRollback(): void {
    if (!this.rollbackTarget) return;
    this.pendingRollback = true;
  }

  cancelRollback(): void { this.pendingRollback = false; }

  confirmRollback(): void {
    const instance = this.instance;
    const target = this.rollbackTarget;
    this.pendingRollback = false;
    if (!instance || !target) return;

    this.rollingBack = true;
    this.instanceService.rollback(instance.id, target).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.rollingBack = false;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.rollbackTarget = '';
          this.load(instance.id);
        } else {
          this.notification.warn(res.message ?? '');
        }
      },
      error: err => {
        this.rollingBack = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  get rollbackMessage(): string {
    return this.languageService.t('workflow.instance.rollbackConfirm', { step: this.rollbackTarget });
  }

  askCancel(): void { this.pendingCancel = true; }
  cancelCancel(): void { this.pendingCancel = false; }

  confirmCancel(): void {
    const instance = this.instance;
    this.pendingCancel = false;
    if (!instance) return;

    this.cancelling = true;
    this.instanceService.cancel(instance.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.cancelling = false;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.load(instance.id);
        } else {
          this.notification.warn(res.message ?? '');
        }
      },
      error: err => {
        this.cancelling = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  // ── Görünüm yardımcıları ──────────────────────────────────────────────────

  eventLabel(event: WorkflowEvent): string {
    return this.languageService.t('workflow.event.' + event.eventType);
  }

  when(value: string | null | undefined): string {
    return value ? formatDate(new Date(value), this.languageService.lang()) : '—';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Rejected':
      case 'Failed':    return 'badge-danger';
      case 'Running':   return 'badge-warn';
      default:          return 'badge-meta';
    }
  }

  taskStatusClass(status: string): string {
    switch (status) {
      case 'Completed': return 'badge-success';
      case 'Rejected':
      case 'Expired':   return 'badge-danger';
      case 'Pending':   return 'badge-warn';
      default:          return 'badge-meta';
    }
  }

  /** Paralel adım mı — aynı adımda birden çok dal görevi varsa. */
  isParallelGroup(group: { tasks: WorkflowTask[] }): boolean {
    return group.tasks.some(t => !!t.branchKey);
  }
}
