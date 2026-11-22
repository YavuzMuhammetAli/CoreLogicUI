import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { ReportDefinition } from '../../models/report.model';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../pipes/model-label.pipe';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
    selector: 'app-report-list',
    imports: [RouterLink, TranslatePipe, ModelLabelPipe, IconComponent],
    templateUrl: './report-list.component.html',
    styleUrls: ['./report-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportListComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);

  reports: ReportDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  constructor(
    private reportService: ReportService,
    private permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** The "Silinmiş Raporlar" (Deleted reports) button is shown only to admins. */
  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.reportService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.reports = res.data ?? [];
        } else {
          this.loadError = res.message ?? this.languageService.t('report.list.loadFailed');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('report.list.serverError');
      }
    });
  }
}
