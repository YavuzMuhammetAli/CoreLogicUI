import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';

import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs';
import { PublishedTableService } from '../../services/published-table.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { ModelUsageService, ModelUsage } from '../../services/model-usage.service';
import { ReportService } from '../../services/report.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { LanguageService } from '../../services/language.service';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';

/**
 * FormBuildComponent — published model list + delete.
 * Creating a new table and editing an existing one now happen in a separate detail view
 * (`TableDetailComponent`, routes: `/build/new` and `/build/:typeName`).
 */
@Component({
    selector: 'app-form-build',
    imports: [RouterLink, ConfirmDialogComponent, TranslatePipe, IconComponent, ModelIconComponent],
    templateUrl: './form-build.component.html',
    styleUrls: ['./form-build.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormBuildComponent {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  models: PublishedModel[] = [];
  loadingModels = false;
  listError: string | null = null;

  /** typeName → being deleted? (deactivation request in progress) */
  isDeleting: Record<string, boolean> = {};
  deleteError: string | null = null;

  /** State of the delete confirm modal */
  confirmOpen = false;
  confirmBusy = false;
  confirmUsageLoading = false;
  confirmUsage: ModelUsage | null = null;
  /** Name of the model awaiting confirmation */
  pendingTypeName: string | null = null;

  private readonly languageService = inject(LanguageService);

  constructor(
    private publishedTableService: PublishedTableService,
    private publishedModel: PublishedModelService,
    private modelUsageService: ModelUsageService,
    private reportService: ReportService,
    private dashboardService: DashboardService,
    private notification: NotificationService
  ) {
    this.loadModels();
  }

  private loadModels(): void {
    this.loadingModels = true;
    this.listError = null;

    this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loadingModels = false;
        if (!res.success) {
          this.listError = res.message ?? this.languageService.t('formBuild.modelsLoadFailed');
          return;
        }
        this.models = res.data ?? [];
      },
      error: err => {
        this.loadingModels = false;
        this.listError = err?.error?.message ?? this.languageService.t('formBuild.serverConnectionError');
      }
    });
  }

  /**
   * Before deactivating the model, checks where it is used (reports/dashboards)
   * and opens the confirm modal. The actual deactivation happens in `onConfirmDelete()`, after the user
   * confirms the modal.
   */
  onDeleteModel(typeName: string): void {
    this.deleteError = null;
    this.pendingTypeName = typeName;
    this.confirmUsage = null;
    this.confirmUsageLoading = true;
    this.confirmOpen = true;

    this.modelUsageService.getUsage(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: usage => {
        // The user may have cancelled while the modal was open; ignore the result then.
        if (this.pendingTypeName === typeName) {
          this.confirmUsage = usage;
          this.confirmUsageLoading = false;
        }
      },
      error: () => {
        // If usage info can't be fetched we don't block the delete flow; treat it as no usage.
        if (this.pendingTypeName === typeName) {
          this.confirmUsage = { reports: [], dashboards: [], isEmpty: true };
          this.confirmUsageLoading = false;
        }
      }
    });
  }

  onCancelDelete(): void {
    if (this.confirmBusy) return;
    this.confirmOpen = false;
    this.pendingTypeName = null;
    this.confirmUsage = null;
    this.confirmUsageLoading = false;
  }

  /**
   * The user confirmed the modal: first deactivates linked reports/dashboards (if any), then the model.
   * PublishedTable/PublishedTableMember + ModelDefinition records become Active=false,
   * the compiled type is dropped from the assembly. The SQL table and its records are never deleted.
   */
  onConfirmDelete(): void {
    const typeName = this.pendingTypeName;
    if (!typeName) return;

    this.confirmBusy = true;
    this.isDeleting[typeName] = true;
    this.deleteError = null;

    const usage = this.confirmUsage;
    const cascadeCalls = [
      ...(usage?.reports.map(r => this.reportService.delete(r.id).pipe(catchError(() => of(null)))) ?? []),
      ...(usage?.dashboards.map(d => this.dashboardService.delete(d.id).pipe(catchError(() => of(null)))) ?? [])
    ];
    // Pass at least 1 element even when empty so forkJoin always infers the same type.
    if (cascadeCalls.length === 0) {
      cascadeCalls.push(of(null));
    }

    forkJoin(cascadeCalls).pipe(markDirty(this.cdr)).subscribe({
      next: () => this.deleteModelAndClose(typeName),
      error: () => this.deleteModelAndClose(typeName)
    });
  }

  private deleteModelAndClose(typeName: string): void {
    this.publishedTableService.deleteModel(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.confirmBusy = false;
        this.isDeleting[typeName] = false;
        this.confirmOpen = false;
        this.pendingTypeName = null;
        this.confirmUsage = null;

        if (res.success) {
          this.models = this.models.filter(m => m.typeName !== typeName);
          this.notification.success(this.languageService.t('formBuild.modelDeactivated', { name: typeName }));
        } else {
          this.deleteError = res.message ?? this.languageService.t('formBuild.modelDeactivateFailed', { name: typeName });
        }
      },
      error: err => {
        this.confirmBusy = false;
        this.isDeleting[typeName] = false;
        this.confirmOpen = false;
        this.pendingTypeName = null;
        this.confirmUsage = null;
        this.deleteError = err?.error?.message ?? this.languageService.t('formBuild.serverConnectionError');
      }
    });
  }
}
