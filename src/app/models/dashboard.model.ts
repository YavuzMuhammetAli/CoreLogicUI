import { ChartType, ReportRunResult } from './report.model';

/** Matches DashboardWidgetDto — points to a report + a grid position. */
export interface DashboardWidget {
  reportDefinitionId: number;
  chartType: ChartType;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Matches DashboardDefinitionDto — sent to define. */
export interface DashboardDefinition {
  id: number;
  name: string;
  widgets: DashboardWidget[];
  /** Has the admin marked it "show in navigation"? Only an admin can set it (enforced by the backend). */
  showInNav?: boolean;
}

/** Matches DashboardWidgetResultDto — an unauthorized/deleted report is not in the widget list. */
export interface DashboardWidgetResult {
  widget: DashboardWidget;
  result: ReportRunResult | null;
}

/** Matches DashboardRunResultDto — the /Dashboard/get response. */
export interface DashboardRunResult {
  id: number;
  name: string;
  widgets: DashboardWidgetResult[];
}
