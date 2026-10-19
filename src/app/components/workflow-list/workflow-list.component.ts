import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowDefinition, WorkflowUsage } from '../../models/workflow.model';
import { downloadText } from '../../utils/download';
import { freeCode, packageFileName, parsePackage, serializePackage, toPackage } from '../../utils/workflow/workflow-package';
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
  private readonly router = inject(Router);

  workflows: WorkflowDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  /** Satır bazlı işlem kilidi — aynı akışa iki kez tıklanmasın. */
  busyId: number | null = null;

  /** confirm-dialog'u açan bekleyen silme isteği. */
  pendingDelete: WorkflowDefinition | null = null;

  /** Plan kotası — okunamazsa şerit gösterilmez. */
  usage: WorkflowUsage | null = null;
  importing = false;

  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  ngOnInit(): void {
    this.load();
    this.loadUsage();
  }

  private loadUsage(): void {
    this.workflowService.usage().pipe(markDirty(this.cdr)).subscribe({
      next: res => { this.usage = res.success ? res.data ?? null : null; },
      error: () => { this.usage = null; }
    });
  }

  /** "3 / 5" ya da sınırsızsa yalnız kullanım. */
  quotaText(used: number, limit: number | null | undefined): string {
    return limit == null ? String(used) : `${used} / ${limit}`;
  }

  // ── Durdur / sürdür ───────────────────────────────────────────────────────

  /** Yayındaki akışın tetiğini durdurur ya da sürdürür; açık süreçler etkilenmez. */
  toggleEnabled(workflow: WorkflowDefinition): void {
    this.busyId = workflow.id;
    this.workflowService.setEnabled(workflow.id, !workflow.isEnabled).pipe(markDirty(this.cdr)).subscribe({
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

  // ── Dışa / içe aktarım ────────────────────────────────────────────────────

  exportWorkflow(workflow: WorkflowDefinition): void {
    downloadText(serializePackage(toPackage(workflow)), packageFileName(workflow.code));
  }

  /**
   * Paket her zaman yeni bir TASLAK olarak eklenir; kod çakışırsa sonek alır.
   * Rol/kişi atamaları hedef şirkette geçersiz olabilir — tasarımcı bunları
   * sorun olarak gösterir.
   */
  onImportFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    file.text().then(text => {
      const parsed = parsePackage(text);
      if (!parsed.ok) {
        this.notification.warn(this.languageService.t(`workflow.package.error.${parsed.error}`));
        return;
      }

      const code = freeCode(parsed.workflow.code, this.allCodes);
      this.importing = true;
      this.cdr.markForCheck();
      this.workflowService.define({ ...parsed.workflow, code }).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.importing = false;
          if (res.success && res.data) {
            this.notification.success(this.languageService.t('workflow.package.imported', { code }));
            this.router.navigate(['/workflows', res.data, 'edit']);
          } else {
            this.notification.warn(res.message ?? this.languageService.t('workflow.package.error.fields'));
          }
        },
        error: err => {
          this.importing = false;
          this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.list.serverError'));
        }
      });
    });
  }

  /** Arşiv dahil tüm kodlar — içe aktarılan akış mevcut bir kodun üstüne yazılmasın. */
  private allCodes: string[] = [];

  load(): void {
    this.loading = true;
    this.loadError = null;

    this.workflowService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          const all = res.data ?? [];

          // Taslağın hangi sürüm olacağını göstermek için Code başına en yüksek
          // yayın numarası — arşiv satırları gizlenmeden ÖNCE hesaplanır.
          this.allCodes = [...new Set(all.map(w => w.code))];
          this.maxVersionByCode = new Map();
          for (const w of all) {
            this.maxVersionByCode.set(w.code, Math.max(this.maxVersionByCode.get(w.code) ?? 0, w.version));
          }

          // Arşivlenmiş sürümler listede tutulmaz; her yayında liste büyürdü.
          // Geçmiş /workflows/versions/:code ekranında.
          this.workflows = all.filter(w => w.status !== 'Archived');
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

  /**
   * Yayınlanmış akıştan düzenlenebilir taslak açar ve tasarımcıya götürür.
   * Açık taslak varsa sunucu onu döndüğü için çift tıklama çift taslak üretmez.
   */
  startNewVersion(workflow: WorkflowDefinition): void {
    this.busyId = workflow.id;

    this.workflowService.newVersion(workflow.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busyId = null;
        if (res.success && res.data) {
          this.router.navigate(['/workflows', res.data, 'edit']);
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

  /** Code başına en yüksek yayın numarası (arşiv dahil). */
  private maxVersionByCode = new Map<string, number>();

  /** Sürüm sütunu: yayınlanmışta "v2", yeni sürüm taslağında "v3 taslak". */
  versionLabel(workflow: WorkflowDefinition): string {
    if (workflow.version > 0) return 'v' + workflow.version;

    const next = (this.maxVersionByCode.get(workflow.code) ?? 0) + 1;
    return this.languageService.t('workflow.list.draftVersion', { n: next });
  }

  /** O Code için açık taslak varsa "Yeni Sürüm" yerine taslağın "Düzenle"si yeterli. */
  hasDraft(code: string): boolean {
    return this.workflows.some(w => w.code === code && w.status === 'Draft');
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
