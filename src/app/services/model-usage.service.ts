import { Injectable } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ReportService } from './report.service';
import { DashboardService } from './dashboard.service';
import { ReportDefinition } from '../models/report.model';
import { DashboardDefinition } from '../models/dashboard.model';

/**
 * Summarizes where a model is used within the application.
 * Currently reports and dashboards are covered; if a new feature later
 * (e.g. automation, notification rule) references a model, it is enough to add a new
 * source here — the model deletion flow is fed from this service
 * as a single point.
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
   * Which reports and dashboards use the given model (typeName).
   * The dashboard link is indirect: widget.reportDefinitionId → report → modelName.
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
