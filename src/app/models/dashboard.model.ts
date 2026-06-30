import { ChartType, ReportRunResult } from './report.model';

/** DashboardWidgetDto ile eşleşir — bir rapora + grid konumuna işaret eder. */
export interface DashboardWidget {
  reportDefinitionId: number;
  chartType: ChartType;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** DashboardDefinitionDto ile eşleşir — define gönderilir. */
export interface DashboardDefinition {
  id: number;
  name: string;
  widgets: DashboardWidget[];
  /** Admin tarafından "navigasyonda göster" işaretlenmiş mi? Yalnızca admin set edebilir (backend zorunlu kılar). */
  showInNav?: boolean;
}

/** DashboardWidgetResultDto ile eşleşir — yetkisiz/silinmiş rapor widget listesinde yer almaz. */
export interface DashboardWidgetResult {
  widget: DashboardWidget;
  result: ReportRunResult | null;
}

/** DashboardRunResultDto ile eşleşir — /Dashboard/get yanıtı. */
export interface DashboardRunResult {
  id: number;
  name: string;
  widgets: DashboardWidgetResult[];
}
