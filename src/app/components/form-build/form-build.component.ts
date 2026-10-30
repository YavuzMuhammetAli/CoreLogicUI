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
 * FormBuildComponent — yayınlanmış model listesi + silme.
 * Yeni tablo oluşturma ve mevcut tabloyu düzenleme artık ayrı bir detay görünümünde
 * (`TableDetailComponent`, route: `/build/new` ve `/build/:typeName`) yapılır.
 */
@Component({
    selector: 'app-form-build',
    imports: [RouterLink, ConfirmDialogComponent, TranslatePipe, IconComponent, ModelIconComponent],
    templateUrl: './form-build.component.html',
    styleUrls: ['./form-build.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class FormBuildComponent {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  models: PublishedModel[] = [];
  loadingModels = false;
  listError: string | null = null;

  /** typeName → siliniyor mu (pasifleştirme isteği devam ediyor) */
  isDeleting: Record<string, boolean> = {};
  deleteError: string | null = null;

  /** Silme onay modalının durumu */
  confirmOpen = false;
  confirmBusy = false;
  confirmUsageLoading = false;
  confirmUsage: ModelUsage | null = null;
  /** Onay bekleyen modelin adı */
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
   * Modeli pasif yapmadan önce nerelerde kullanıldığını (raporlar/dashboardlar) kontrol eder
   * ve onay modalını açar. Asıl pasifleştirme `onConfirmDelete()`'te, kullanıcı modalı onayladıktan
   * sonra yapılır.
   */
  onDeleteModel(typeName: string): void {
    this.deleteError = null;
    this.pendingTypeName = typeName;
    this.confirmUsage = null;
    this.confirmUsageLoading = true;
    this.confirmOpen = true;

    this.modelUsageService.getUsage(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: usage => {
        // Modal açıkken kullanıcı vazgeçmiş olabilir; o durumda sonucu yoksay.
        if (this.pendingTypeName === typeName) {
          this.confirmUsage = usage;
          this.confirmUsageLoading = false;
        }
      },
      error: () => {
        // Kullanım bilgisi alınamazsa silme akışını engellemiyoruz; boş kullanım gibi davran.
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
   * Kullanıcı modalı onayladı: önce (varsa) bağlı rapor/dashboardları, sonra modeli pasif alır.
   * PublishedTable/PublishedTableMember + ModelDefinition kayıtları Active=false olur,
   * derlenmiş tip assembly'den düşürülür. SQL tablosu ve içindeki kayıtlar hiçbir şekilde silinmez.
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
    // forkJoin'in her zaman aynı şekilde tip çıkarımı yapması için boşken bile en az 1 eleman verilir.
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
