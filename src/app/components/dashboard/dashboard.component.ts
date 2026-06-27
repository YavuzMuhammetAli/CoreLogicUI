import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DashboardService } from '../../services/dashboard.service';
import { ReportService } from '../../services/report.service';
import { DashboardRunResult, DashboardWidgetResult } from '../../models/dashboard.model';
import { AppChartComponent } from '../chart/chart.component';

/** Render için widget sonucu + rapor adı (dashboard.get yalnızca reportDefinitionId taşır). */
export interface DashboardWidgetView {
  result: DashboardWidgetResult;
  reportName: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, AppChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly dashboardService = inject(DashboardService);
  private readonly reportService = inject(ReportService);

  dashboard: DashboardRunResult | null = null;
  widgetViews: DashboardWidgetView[] = [];

  loading = false;
  loadError: string | null = null;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading = true;

    forkJoin([this.dashboardService.get(id), this.reportService.list()]).subscribe({
      next: ([dashRes, listRes]) => {
        this.loading = false;

        if (!dashRes.success) {
          this.loadError = dashRes.message ?? 'Dashboard yüklenemedi.';
          return;
        }

        this.dashboard = dashRes.data;

        const reportNames = new Map<number, string>();
        if (listRes.success) {
          for (const r of listRes.data ?? []) reportNames.set(r.id, r.name);
        }

        this.widgetViews = this.dashboard.widgets.map(item => ({
          result: item,
          reportName: reportNames.get(item.widget.reportDefinitionId) ?? `Rapor #${item.widget.reportDefinitionId}`
        }));
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }
}
