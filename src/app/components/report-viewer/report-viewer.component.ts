import { Component, OnInit, computed, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ReportService } from '../../services/report.service';
import { AggregateFunction, ReportDefinition, ReportRunResult } from '../../models/report.model';
import { AppChartComponent } from '../chart/chart.component';

const trNumber = new Intl.NumberFormat('tr-TR');

/** Aggregate fonksiyonlarının KPI kartı başlığında kullanılan Türkçe karşılıkları. */
const AGGREGATE_LABELS: Record<AggregateFunction, string> = {
  SUM: 'Toplam',
  COUNT: 'Sayı',
  AVG: 'Ortalama',
  MIN: 'Minimum',
  MAX: 'Maksimum'
};

export interface KpiCard {
  label: string;
  value: string;
}

@Component({
  selector: 'app-report-viewer',
  standalone: true,
  imports: [RouterLink, AppChartComponent, NgTemplateOutlet],
  templateUrl: './report-viewer.component.html',
  styleUrls: ['./report-viewer.component.scss']
})
export class ReportViewerComponent implements OnInit {
  id = 0;
  report: ReportDefinition | null = null;
  result: ReportRunResult | null = null;

  loading = false;
  loadError: string | null = null;
  exporting: 'excel' | 'pdf' | null = null;
  exportError: string | null = null;

  /** Grafik tipi 'table' değilse kullanıcı sonucu grafik veya tablo olarak görebilir. */
  readonly viewMode = signal<'chart' | 'table'>('chart');

  /** Rapor tanımındaki aggregate'lerden türeyen büyük-sayı kartları — tr-TR formatlı. */
  readonly kpiCards = computed<KpiCard[]>(() => {
    const report = this.report;
    const result = this.result;
    if (!report || !result) return [];

    return report.aggregates
      .map(agg => {
        const alias = `${agg.function}_${agg.field || 'All'}`;
        const hasColumn = result.columns.some(c => c.name === alias);
        if (!hasColumn) return null;

        const total = result.rows.reduce((sum, row) => sum + Number(row[alias] ?? 0), 0);
        const label = agg.field ? `${AGGREGATE_LABELS[agg.function]} · ${agg.field}` : AGGREGATE_LABELS[agg.function];
        return { label, value: trNumber.format(total) };
      })
      .filter((card): card is KpiCard => card !== null);
  });

  constructor(
    private route: ActivatedRoute,
    private reportService: ReportService
  ) {}

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;

    forkJoin([this.reportService.list(), this.reportService.run(this.id)]).subscribe({
      next: ([listRes, runRes]) => {
        this.loading = false;

        if (listRes.success) {
          this.report = (listRes.data ?? []).find(r => r.id === this.id) ?? null;
        }

        if (runRes.success) {
          this.result = runRes.data;
        } else {
          this.loadError = runRes.message ?? 'Rapor çalıştırılamadı.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  exportExcel(): void {
    this.exportError = null;
    this.exporting = 'excel';
    this.reportService.exportExcel(this.id).subscribe({
      next: blob => {
        this.exporting = null;
        this.downloadBlob(blob, `rapor-${this.id}.xlsx`);
      },
      error: () => {
        this.exporting = null;
        this.exportError = 'Excel export başarısız oldu.';
      }
    });
  }

  exportPdf(): void {
    this.exportError = null;
    this.exporting = 'pdf';
    this.reportService.exportPdf(this.id).subscribe({
      next: blob => {
        this.exporting = null;
        this.downloadBlob(blob, `rapor-${this.id}.pdf`);
      },
      error: () => {
        this.exporting = null;
        this.exportError = 'PDF export başarısız oldu.';
      }
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}
