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

  // Durum signal'lerde: OnPush altında HTTP callback'inden yapılan atamalar
  // aksi hâlde yeniden render tetiklemez.
  readonly report = signal<ReportDefinition | null>(null);
  readonly result = signal<ReportRunResult | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly exporting = signal<'excel' | 'pdf' | null>(null);
  readonly exportError = signal<string | null>(null);

  /** Grafik tipi 'table' değilse kullanıcı sonucu grafik veya tablo olarak görebilir. */
  readonly viewMode = signal<'chart' | 'table'>('chart');

  // ── Sayfalama (yalnız tablo görünümünde) ──────────────────────────────────
  readonly pageIndex = signal(1);
  readonly pageSize = signal(50);
  readonly pageSizeOptions = [25, 50, 100, 200];

  /**
   * Tablo görünümünde miyiz? Rapor 'table' tipindeyse her zaman; değilse kullanıcı
   * seçimine bağlı. Sayfalama YALNIZCA bu görünümde uygulanır — grafik ve KPI
   * tüm satırlar üzerinden hesaplandığı için sayfalanmış veriyle yanlış sonuç verirdi.
   */
  readonly isTableView = computed(() => {
    const chartType = this.report()?.chartType;
    return chartType === 'table' || this.viewMode() === 'table';
  });

  readonly totalPages = computed(() => {
    const total = this.result()?.total ?? 0;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  /** Rapor tanımındaki aggregate'lerden türeyen büyük-sayı kartları — tr-TR formatlı. */
  readonly kpiCards = computed<KpiCard[]>(() => {
    const report = this.report();
    const result = this.result();
    if (!report || !result) return [];

    // Sayfalanmış veri üzerinden toplam almak yanıltıcı olur; tablo görünümünde
    // yalnız o sayfa yüklüdür. KPI şeridi bu yüzden tablo görünümünde gizlenir.
    if (this.isTableView() && (result.total ?? result.rows.length) > result.rows.length) return [];

    return report.aggregates
      .map(agg => {
        const alias = aggregateAlias(agg);
        const column = result.columns.find(c => c.name === alias);
        if (!column) return null;

        const total = result.rows.reduce((sum, row) => sum + Number(row[alias] ?? 0), 0);
        // Başlık sunucudan ("Toplam Net Tutar"); eski sunucu göndermezse alias.
        return { label: column.label || alias, value: formatNumber(total, this.languageService.lang()) };
      })
      .filter((card): card is KpiCard => card !== null);
  });

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.loadDefinition();
  }

  /**
   * Rapor tanımını (ad + grafik tipi) çözer, ardından veriyi çeker.
   *
   * Eskiden list() ve run() forkJoin ile birlikte bekleniyordu: yalnızca bir AD için
   * çekilen tüm tanım listesi, asıl veri yanıtının render'ını da geciktiriyordu.
   * Artık liste önbelleklidir ve grafik tipini bilmek veriyi doğru modda (sayfalı /
   * sayfasız) çekmemizi sağlar.
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

    // Tablo görünümü sayfalanır; grafik görünümü yalnız çizilebilecek kadar satır ister
    // (KPI/radialBar tüm satırlardan hesapladığı için sunucu tavanıyla — 5000).
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
