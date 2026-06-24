import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardRunResult } from '../../models/dashboard.model';
import { AppChartComponent } from '../chart/chart.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, AppChartComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  dashboard: DashboardRunResult | null = null;
  loading = false;
  loadError: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private dashboardService: DashboardService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.loading = true;
    this.dashboardService.get(id).subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.dashboard = res.data;
        } else {
          this.loadError = res.message ?? 'Dashboard yüklenemedi.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }
}
