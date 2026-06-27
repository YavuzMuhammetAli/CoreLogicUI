import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';

interface DeletedDashboardEntry {
  id: number;
  name: string;
  widgetCount: number;
  restoring: boolean;
  restoreMessage: string | null;
  restoreSuccess: boolean | null;
}

/**
 * Pasiflenmiş (silinmiş) dashboard tanımlarını listeler. Bir dashboard doğrudan silindiğinde
 * veya bağlı olduğu model /models sayfasından silinince (cascade) burada görünür ve
 * Geri Yükle ile tekrar aktif hale getirilebilir.
 */
@Component({
  selector: 'app-deleted-dashboards',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './deleted-dashboards.component.html',
  styleUrls: ['./deleted-dashboards.component.scss']
})
export class DeletedDashboardsComponent implements OnInit {
  dashboards: DeletedDashboardEntry[] = [];
  loading = false;
  loadError: string | null = null;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.dashboards = [];

    this.dashboardService.listDeleted().subscribe({
      next: res => {
        this.loading = false;
        if (!res.success) {
          this.loadError = res.message ?? 'Silinmiş dashboard\'lar yüklenemedi.';
          return;
        }

        this.dashboards = (res.data ?? []).map(d => ({
          id: d.id,
          name: d.name,
          widgetCount: d.widgets?.length ?? 0,
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

  /** Pasiflenmiş dashboard'u yeniden aktif yapar (Active=true). */
  restore(dashboard: DeletedDashboardEntry): void {
    if (dashboard.restoring) return;

    const confirmed = confirm(`'${dashboard.name}' dashboard'unu geri yüklemek istediğinize emin misiniz?`);
    if (!confirmed) return;

    dashboard.restoring = true;
    dashboard.restoreMessage = null;
    dashboard.restoreSuccess = null;

    this.dashboardService.restore(dashboard.id).subscribe({
      next: res => {
        dashboard.restoring = false;
        dashboard.restoreSuccess = res.success;
        dashboard.restoreMessage = res.message ?? (res.success ? 'Dashboard geri yüklendi.' : 'Geri yükleme başarısız.');

        if (res.success) {
          setTimeout(() => {
            this.dashboards = this.dashboards.filter(d => d.id !== dashboard.id);
          }, 1500);
        }
      },
      error: err => {
        dashboard.restoring = false;
        dashboard.restoreSuccess = false;
        dashboard.restoreMessage = err?.error?.message ?? 'Geri yükleme sırasında sunucu hatası oluştu.';
      }
    });
  }
}
