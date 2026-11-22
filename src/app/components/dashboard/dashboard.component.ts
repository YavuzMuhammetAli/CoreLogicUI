import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { DashboardService } from '../../services/dashboard.service';
import { ReportService } from '../../services/report.service';
import { DashboardRunResult, DashboardWidget, DashboardWidgetResult } from '../../models/dashboard.model';
import { AppChartComponent } from '../chart/chart.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

/** Widget result + report name for rendering (dashboard.get carries only reportDefinitionId). */
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
   * Design height of the table widget (px): grid row 64px + row gap 24px
   * (see .widget-grid). While chart cards grow with their content, the table card stays
   * fixed at this height; overflowing rows scroll inside the card.
   */
  tableMaxHeight(widget: DashboardWidget): number {
    return widget.h * 64 + (widget.h - 1) * 24;
  }

  ngOnInit(): void {
    // The component is not recreated when switching between dashboards from the sidebar;
    // the paramMap subscription reloads the data on every :id change.
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

    // listCached(): report definitions are needed only to resolve the NAME in the
    // widget header. The whole list used to be refetched on every dashboard switch;
    // now it is cached with shareReplay.
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

        // Sort in design order (row first, then column). On desktop the position is already
        // given by grid-column/row; but on narrow screens widgets flow top-down in DOM order
        // and the array is the order in which reports were checked in the designer — dragging
        // does not change it. Without sorting, the top KPIs could end up at the bottom on phones.
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
