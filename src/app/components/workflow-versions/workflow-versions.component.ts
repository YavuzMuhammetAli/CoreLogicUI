import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { WorkflowService } from '../../services/workflow.service';
import { WorkflowDefinition } from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { formatDate } from '../../utils/locale-format';

/**
 * Bir akış kodunun sürüm geçmişi.
 *
 * Yayınlanan sürüm DEĞİŞMEZ: her yayın yeni bir satır ekler, öncekini arşivler.
 * Bu ekran o zinciri gösterir — "hangi süreç hangi kurallarla koştu" sorusu
 * denetimde sıkça sorulur ve arşiv satırları silinmediği için cevaplanabilir.
 */
@Component({
  selector: 'app-workflow-versions',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './workflow-versions.component.html',
  styleUrl: './workflow-versions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowVersionsComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly workflowService = inject(WorkflowService);
  private readonly languageService = inject(LanguageService);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);

  versions: WorkflowDefinition[] = [];
  code = '';
  loading = false;
  loadError: string | null = null;

  ngOnInit(): void {
    this.code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!this.code) {
      this.loadError = this.languageService.t('workflow.versions.loadFailed');
      return;
    }

    this.loading = true;
    this.workflowService.versions(this.code).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.versions = res.data ?? [];
        } else {
          this.loadError = res.message ?? this.languageService.t('workflow.versions.loadFailed');
        }
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.instance.serverError');
      }
    });
  }

  busy = false;

  /** Açık taslak varsa yeni sürüm butonu gizlenir; taslağın "Düzenle"si yeterli. */
  get hasDraft(): boolean {
    return this.versions.some(v => v.status === 'Draft');
  }

  /** Taslağın yayınlanınca alacağı sürüm numarası. */
  get nextVersion(): number {
    return Math.max(0, ...this.versions.map(v => v.version)) + 1;
  }

  startNewVersion(version: WorkflowDefinition): void {
    this.busy = true;

    this.workflowService.newVersion(version.id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.busy = false;
        if (res.success && res.data) {
          this.router.navigate(['/workflows', res.data, 'edit']);
        } else {
          this.notification.warn(res.message ?? this.languageService.t('workflow.versions.loadFailed'));
        }
      },
      error: err => {
        this.busy = false;
        this.notification.warn(err?.error?.message ?? this.languageService.t('workflow.instance.serverError'));
      }
    });
  }

  when(value: string): string {
    return formatDate(new Date(value), this.languageService.lang());
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Published': return 'badge-success';
      case 'Draft':     return 'badge-warn';
      default:          return 'badge-meta';
    }
  }
}
