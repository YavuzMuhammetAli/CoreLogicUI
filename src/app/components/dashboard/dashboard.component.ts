import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
    imports: [AppChartComponent, TranslatePipe],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly dashboardService = inject(DashboardService);
  private readonly reportService = inject(ReportService);
  private readonly languageService = inject(LanguageService);

  readonly dashboard = signal<DashboardRunResult | null>(null);
  readonly widgetViews = signal<DashboardWidgetView[]>([]);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

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
    this.loading.set(true);
    this.loadError.set(null);
    this.dashboard.set(null);
    this.widgetViews.set([]);

    // listCached(): rapor tanımları yalnızca widget başlığındaki ADI çözmek için
    // gerekiyor. Eskiden her dashboard geçişinde tüm liste yeniden çekiliyordu;
    // artık shareReplay ile önbellekli.
    forkJoin([this.dashboardService.get(id), this.reportService.listCached()]).subscribe({
      next: ([dashRes, listRes]) => {
        this.loading.set(false);

        if (!dashRes.success) {
          this.loadError.set(dashRes.message ?? this.languageService.t('dashboard.view.loadError'));
          return;
        }

        const dash = dashRes.data;
        this.dashboard.set(dash);

        const reportNames = new Map<number, string>();
        if (listRes.success) {
          for (const r of listRes.data ?? []) reportNames.set(r.id, r.name);
        }

        // Tasarımdaki sıraya (önce satır, sonra sütun) diz. Masaüstünde konum zaten
        // grid-column/row ile verilir; ama dar ekranda widget'lar alt alta DOM sırasıyla
        // akar ve dizi, raporların tasarımcıda işaretlenme sırasıdır — sürükleme onu
        // değiştirmez. Sıralanmasaydı en üstteki KPI'lar telefonda en alta düşebilirdi.
        const ordered = [...dash.widgets].sort((a, b) =>
          a.widget.y - b.widget.y || a.widget.x - b.widget.x);

        this.widgetViews.set(ordered.map(item => ({
          result: item,
          reportName: reportNames.get(item.widget.reportDefinitionId)
            ?? this.languageService.t('dashboard.view.reportFallbackName', { id: item.widget.reportDefinitionId })
        })));
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? this.languageService.t('dashboard.view.serverError'));
      }
    });
  }
}
