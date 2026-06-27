import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';

interface DeletedReportEntry {
  id: number;
  name: string;
  modelName: string;
  chartType: string;
  restoring: boolean;
  restoreMessage: string | null;
  restoreSuccess: boolean | null;
}

/**
 * Pasiflenmiş (silinmiş) rapor tanımlarını listeler. Bir rapor doğrudan silindiğinde veya
 * bağlı olduğu model /models sayfasından silinince (cascade) burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir.
 */
@Component({
  selector: 'app-deleted-reports',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './deleted-reports.component.html',
  styleUrls: ['./deleted-reports.component.scss']
})
export class DeletedReportsComponent implements OnInit {
  reports: DeletedReportEntry[] = [];
  loading = false;
  loadError: string | null = null;

  constructor(private reportService: ReportService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.reports = [];

    this.reportService.listDeleted().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.loadError = res.message ?? 'Silinmiş raporlar yüklenemedi.';
          return;
        }

        this.reports = (res.data ?? []).map(r => ({
          id: r.id,
          name: r.name,
          modelName: r.modelName,
          chartType: r.chartType,
          restoring: false,
          restoreMessage: null,
          restoreSuccess: null
        }));
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  /** Pasiflenmiş raporu yeniden aktif yapar (Active=true). */
  restore(report: DeletedReportEntry): void {
    if (report.restoring) return;

    const confirmed = confirm(`'${report.name}' raporunu geri yüklemek istediğinize emin misiniz?`);
    if (!confirmed) return;

    report.restoring = true;
    report.restoreMessage = null;
    report.restoreSuccess = null;

    this.reportService.restore(report.id).subscribe({
      next: res => {
        report.restoring = false;
        report.restoreSuccess = res.success;
        report.restoreMessage = res.message ?? (res.success ? 'Rapor geri yüklendi.' : 'Geri yükleme başarısız.');

        if (res.success) {
          setTimeout(() => {
            this.reports = this.reports.filter(r => r.id !== report.id);
          }, 1500);
        }
      },
      error: err => {
        report.restoring = false;
        report.restoreSuccess = false;
        report.restoreMessage = err?.error?.message ?? 'Geri yükleme sırasında sunucu hatası oluştu.';
      }
    });
  }
}
