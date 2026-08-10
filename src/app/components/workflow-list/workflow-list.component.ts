import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowDefinition } from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { PermissionService } from '../../services/permission.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { markDirty } from '../../utils/change-detection';

/**
 * İş akışı tanım listesi.
 *
 * Yapı report-list'in aynısı: .page-header + .data-table + empty-state.
 * Silme onayı için native confirm() değil shared/confirm-dialog kullanılır.
 */
@Component({
  selector: 'app-workflow-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './workflow-list.component.html',
  styleUrl: './workflow-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowListComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);
  private readonly permissionService = inject(PermissionService);

  workflows: WorkflowDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  /** Satır bazlı işlem kilidi — aynı akışa iki kez tıklanmasın. */
  busyId: number | null = null;

  /** confirm-dialog'u açan bekleyen silme isteği. */
  pendingDelete: WorkflowDefinition | null = null;

  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;

    this.workflowService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.workflows = res.data ?? [];
        } else {
          this.loadError = res.message ?? this.languageService.t('workflow.list.loadFailed');
        }
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.list.serverError');
      }
    });
  }

  publish(workflow: WorkflowDefinition): void {
    this.busyId = workflow.id;

    this.workflowService.publish(workflow.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busyId = null;
        if (res.success) {
          this.notification.success(res.message ?? this.languageService.t('workflow.list.publishSuccess'));
          this.load();
        } else {
          this.notification.warn(res.message ?? this.languageService.t('workflow.list.loadFailed'));
        }
      },
      error: err => {
        this.busyId = null;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
      }
    });
  }

  askDelete(workflow: WorkflowDefinition): void {
    this.pendingDelete = workflow;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
  }

  confirmDelete(): void {
    const target = this.pendingDelete;
    if (!target) return;

    this.busyId = target.id;
    this.pendingDelete = null;

    this.workflowService.delete(target.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busyId = null;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.load();
        } else {
          this.notification.warn(res.message ?? this.languageService.t('workflow.list.loadFailed'));
        }
      },
      error: err => {
        this.busyId = null;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
      }
    });
  }

  /** Silme onayı metnindeki {name} yer tutucusunu doldurur. */
  get deleteMessage(): string {
    return this.languageService.t('workflow.list.deleteConfirm', { name: this.pendingDelete?.name ?? '' });
  }

  /** Durum rozetinin renk sınıfı. */
  statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'badge-success';
      case 'Draft':     return 'badge-warn';
      default:          return 'badge-meta';
    }
  }
}
