import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReportService } from '../../services/report.service';
import { ReportDefinition } from '../../models/report.model';

@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './report-list.component.html',
  styleUrls: ['./report-list.component.scss']
})
export class ReportListComponent implements OnInit {
  reports: ReportDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  constructor(private reportService: ReportService) {}

  ngOnInit(): void {
    this.load();
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
          this.loadError = res.message ?? 'Raporlar yüklenemedi.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }
}
