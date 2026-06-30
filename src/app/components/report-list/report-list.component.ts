import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { ReportDefinition } from '../../models/report.model';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './report-list.component.html',
  styleUrls: ['./report-list.component.scss']
})
export class ReportListComponent implements OnInit {
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

  /** "Silinmiş Raporlar" butonu yalnızca admin'e gösterilir. */
  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.reportService.list().subscribe({
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
