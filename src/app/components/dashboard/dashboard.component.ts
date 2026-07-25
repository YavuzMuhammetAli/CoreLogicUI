import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { DashboardService } from '../../services/dashboard.service';
import { ReportService } from '../../services/report.service';
import { DashboardRunResult, DashboardWidget, DashboardWidgetResult } from '../../models/dashboard.model';
import { AppChartComponent } from '../chart/chart.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Render için widget sonucu + rapor adı (dashboard.get yalnızca reportDefinitionId taşır). */
export interface DashboardWidgetView {
  result: DashboardWidgetResult;
  reportName: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, AppChartComponent, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly dashboardService = inject(DashboardService);
  private readonly reportService = inject(ReportService);
  private readonly languageService = inject(LanguageService);

  dashboard: DashboardRunResult | null = null;
  widgetViews: DashboardWidgetView[] = [];

  loading = false;
  loadError: string | null = null;

  private routeSub?: Subscription;

  /**
   * Tablo widget'ının tasarım yüksekliği (px): grid satırı 64px + satır arası boşluk 24px
   * (bkz. .widget-grid). Grafik kartları içeriğe göre büyürken tablo kartı bu yükseklikte
   * sabit kalır; taşan satırlar kartın içinde kaydırılır.
   */
  tableMaxHeight(widget: DashboardWidget): number {
    return widget.h * 64 + (widget.h - 1) * 24;
  }

  ngOnInit(): void {
    // Sidebar'dan dashboard'lar arası geçişte component yeniden oluşturulmaz;
    // paramMap aboneliği her :id değişiminde veriyi yeniden yükler.
    this.routeSub = this.route.paramMap.subscribe(params => {
      const id = Number(params.get('id'));
      this.load(id);
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private load(id: number): void {
    this.loading = true;
    this.loadError = null;
    this.dashboard = null;
    this.widgetViews = [];

    forkJoin([this.dashboardService.get(id), this.reportService.list()]).subscribe({
      next: ([dashRes, listRes]) => {
        this.loading = false;

        if (!dashRes.success) {
          this.loadError = dashRes.message ?? this.languageService.t('dashboard.view.loadError');
          return;
        }

        this.dashboard = dashRes.data;

        const reportNames = new Map<number, string>();
        if (listRes.success) {
          for (const r of listRes.data ?? []) reportNames.set(r.id, r.name);
        }

        this.widgetViews = this.dashboard.widgets.map(item => ({
          result: item,
          reportName: reportNames.get(item.widget.reportDefinitionId)
            ?? this.languageService.t('dashboard.view.reportFallbackName', { id: item.widget.reportDefinitionId })
        }));
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('dashboard.view.serverError');
      }
    });
  }
}
