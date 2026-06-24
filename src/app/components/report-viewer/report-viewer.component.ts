import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ReportService } from '../../services/report.service';
import { ReportDefinition, ReportRunResult } from '../../models/report.model';
import { AppChartComponent } from '../chart/chart.component';

@Component({
  selector: 'app-report-viewer',
  standalone: true,
  imports: [RouterLink, AppChartComponent],
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
