import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { ReportDefinition, ReportRunResult } from '../../models/report.model';
import { AppChartComponent } from '../chart/chart.component';
import { chartRowCap } from '../chart/chart-mapping';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { formatNumber } from '../../utils/locale-format';
import { downloadBlob } from '../../utils/download';
import { aggregateAlias } from '../../utils/report-column-label';
import { IconComponent } from '../shared/icon/icon.component';

export interface KpiCard {
  label: string;
  value: string;
}

@Component({
    selector: 'app-report-viewer',
    imports: [RouterLink, AppChartComponent, NgTemplateOutlet, TranslatePipe, IconComponent],
    templateUrl: './report-viewer.component.html',
    styleUrls: ['./report-viewer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportViewerComponent implements OnInit {
  private readonly languageService = inject(LanguageService);
  private readonly route = inject(ActivatedRoute);
  private readonly reportService = inject(ReportService);

  id = 0;

  // State lives in signals: under OnPush, assignments made in an HTTP callback
  // wouldn't trigger a re-render otherwise.
  readonly report = signal<ReportDefinition | null>(null);
  readonly result = signal<ReportRunResult | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly exporting = signal<'excel' | 'pdf' | null>(null);
  readonly exportError = signal<string | null>(null);

  /** If the chart type isn't 'table', the user can view the result as a chart or a table. */
  readonly viewMode = signal<'chart' | 'table'>('chart');

  // ── Pagination (table view only) ──────────────────────────────────────────
  readonly pageIndex = signal(1);
  readonly pageSize = signal(50);
  readonly pageSizeOptions = [25, 50, 100, 200];

  /**
   * Are we in table view? Always if the report is of 'table' type; otherwise it depends
   * on the user's choice. Pagination is applied ONLY in this view — charts and KPIs
   * are computed over all rows, so paged data would give wrong results.
   */
  readonly isTableView = computed(() => {
    const chartType = this.report()?.chartType;
    return chartType === 'table' || this.viewMode() === 'table';
  });

  readonly totalPages = computed(() => {
    const total = this.result()?.total ?? 0;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  /** Big-number cards derived from the aggregates in the report definition — tr-TR formatted. */
  readonly kpiCards = computed<KpiCard[]>(() => {
    const report = this.report();
    const result = this.result();
    if (!report || !result) return [];

    // Summing over paged data would be misleading; in table view only that page
    // is loaded. That's why the KPI strip is hidden in table view.
    if (this.isTableView() && (result.total ?? result.rows.length) > result.rows.length) return [];

    return report.aggregates
      .map(agg => {
        const alias = aggregateAlias(agg);
        const column = result.columns.find(c => c.name === alias);
        if (!column) return null;

        const total = result.rows.reduce((sum, row) => sum + Number(row[alias] ?? 0), 0);
        // Header comes from the server ("Toplam Net Tutar"); alias if an old server doesn't send it.
        return { label: column.label || alias, value: formatNumber(total, this.languageService.lang()) };
      })
      .filter((card): card is KpiCard => card !== null);
  });

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.loadDefinition();
  }

  /**
   * Resolves the report definition (name + chart type), then fetches the data.
   *
   * list() and run() used to be awaited together with forkJoin: the whole definition list,
   * fetched just for a NAME, also delayed rendering of the actual data response.
   * Now the list is cached, and knowing the chart type lets us fetch the data in the right
   * mode (paged / unpaged).
   */
  private loadDefinition(): void {
    this.loading.set(true);
    this.loadError.set(null);

    this.reportService.listCached().subscribe({
      next: res => {
        if (res.success) {
          this.report.set((res.data ?? []).find(r => r.id === this.id) ?? null);
        }
        this.loadData();
      },
      error: () => this.loadData()
    });
  }

  loadData(): void {
    this.loading.set(true);
    this.loadError.set(null);

    // The table view is paged; the chart view requests only as many rows as can be drawn
    // (with the server cap — 5000 — since KPI/radialBar compute over all rows).
    const paged = this.isTableView();
    const req = paged
      ? this.reportService.run(this.id, this.pageIndex(), this.pageSize())
      : this.reportService.run(this.id, undefined, undefined, chartRowCap(this.report()?.chartType));

    req.subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success) {
          this.result.set(res.data);
        } else {
          this.loadError.set(res.message ?? this.languageService.t('report.viewer.runFailed'));
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? this.languageService.t('report.viewer.serverError'));
      }
    });
  }

  setViewMode(mode: 'chart' | 'table'): void {
    if (this.viewMode() === mode) return;
    this.viewMode.set(mode);
    this.pageIndex.set(1);
    this.loadData();
  }

  goToPage(page: number): void {
    const target = Math.min(Math.max(1, page), this.totalPages());
    if (target === this.pageIndex()) return;
    this.pageIndex.set(target);
    this.loadData();
  }

  onPageSizeChange(value: string): void {
    this.pageSize.set(Number(value));
    this.pageIndex.set(1);
    this.loadData();
  }

  exportExcel(): void {
    this.exportError.set(null);
    this.exporting.set('excel');
    this.reportService.exportExcel(this.id).subscribe({
      next: blob => {
        this.exporting.set(null);
        downloadBlob(blob, `rapor-${this.id}.xlsx`);
      },
      error: () => {
        this.exporting.set(null);
        this.exportError.set(this.languageService.t('report.viewer.excelExportFailed'));
      }
    });
  }

  exportPdf(): void {
    this.exportError.set(null);
    this.exporting.set('pdf');
    this.reportService.exportPdf(this.id).subscribe({
      next: blob => {
        this.exporting.set(null);
        downloadBlob(blob, `rapor-${this.id}.pdf`);
      },
      error: () => {
        this.exporting.set(null);
        this.exportError.set(this.languageService.t('report.viewer.pdfExportFailed'));
      }
    });
  }

}
