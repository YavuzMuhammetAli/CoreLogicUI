import { Injectable } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ReportService } from './report.service';
import { DashboardService } from './dashboard.service';
import { ReportDefinition } from '../models/report.model';
import { DashboardDefinition } from '../models/dashboard.model';

/**
 * Bir modelin uygulama içinde nerelerde kullanıldığını özetler.
 * Şimdilik raporlar ve dashboardlar kapsanıyor; ileride yeni bir özellik
 * (örn. otomasyon, bildirim kuralı) modele referans verirse buraya yeni bir
 * kaynak eklenmesi yeterlidir — model silme akışı bu serviste tek noktadan
 * besleniyor.
 */
export interface ModelUsage {
  reports: ReportDefinition[];
  dashboards: DashboardDefinition[];
  isEmpty: boolean;
}

@Injectable({ providedIn: 'root' })
export class ModelUsageService {
  constructor(
    private reportService: ReportService,
    private dashboardService: DashboardService
  ) {}

  /**
   * Verilen model (typeName) hangi raporlarda ve dashboardlarda kullanılıyor.
   * Dashboard bağlantısı dolaylıdır: widget.reportDefinitionId → rapor → modelName.
   */
  getUsage(typeName: string): Observable<ModelUsage> {
    return forkJoin([this.reportService.list(), this.dashboardService.list()]).pipe(
      map(([reportRes, dashboardRes]) => {
        const allReports = reportRes.success ? reportRes.data : [];
        const allDashboards = dashboardRes.success ? dashboardRes.data : [];

        const reports = allReports.filter(r => r.modelName === typeName);
        const reportIds = new Set(reports.map(r => r.id));

        const dashboards = allDashboards.filter(d =>
          d.widgets.some(w => reportIds.has(w.reportDefinitionId))
        );

        return {
          reports,
          dashboards,
          isEmpty: reports.length === 0 && dashboards.length === 0
        };
      })
    );
  }
}
