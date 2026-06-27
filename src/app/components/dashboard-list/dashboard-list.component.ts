import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardDefinition } from '../../models/dashboard.model';
import { PermissionService } from '../../services/permission.service';

@Component({
  selector: 'app-dashboard-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard-list.component.html',
  styleUrls: ['./dashboard-list.component.scss']
})
export class DashboardListComponent implements OnInit {
  dashboards: DashboardDefinition[] = [];
  loading = false;
  loadError: string | null = null;

  constructor(
    private dashboardService: DashboardService,
    private permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  /** "Silinmiş Dashboard'lar" butonu yalnızca admin'e gösterilir. */
  get isAdmin(): boolean {
    return this.permissionService.isAdmin();
  }

  load(): void {
    this.loading = true;
    this.loadError = null;
    this.dashboardService.list().subscribe({
      next: res => {
        this.loading = false;
        if (res.success) {
          this.dashboards = res.data ?? [];
        } else {
          this.loadError = res.message ?? 'Dashboard\'lar yüklenemedi.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }
}
