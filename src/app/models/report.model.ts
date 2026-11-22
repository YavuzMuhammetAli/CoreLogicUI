/**
 * Metadata-driven report models — match the backend Entities.DTOs.Reporting.*.
 * A report is not code but a metadata record in this structure.
 */

/**
 * Chart types usable in ReportDefinition — mapped to ApexCharts.
 * On the backend this field is a free string (NVARCHAR(50), no whitelist) — the ones listed here
 * are only the mandatory set the frontend can draw; adding a new type needs no backend change.
 */
export type ChartType =
  | 'table'
  | 'column'
  | 'bar'
  | 'line'
  | 'area'
  | 'pie'
  | 'donut'
  | 'radialBar'
  | 'kpi';

/** Must match the backend whitelist one to one (ReportingManager.AllowedOperators). */
export type ReportOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'contains' | 'startswith';

/** Must match the backend whitelist one to one (ReportingManager.AllowedAggregateFunctions). */
export type AggregateFunction = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';

export type SortDirection = 'ASC' | 'DESC';

export interface ReportFilter {
  field: string;
  operator: ReportOperator;
  value?: string;
}

export interface ReportAggregate {
  field: string;
  function: AggregateFunction;
}

export interface ReportSort {
  field: string;
  direction: SortDirection;
}

/** Matches ReportDefinitionDto — sent to define/update, the shape returned from list/run. */
export interface ReportDefinition {
  id: number;
  name: string;
  modelName: string;
  selectedColumns: string[];
  filters: ReportFilter[];
  groupBy: string[];
  aggregates: ReportAggregate[];
  sortBy: ReportSort[];
  chartType: ChartType;
}

export interface ReportColumnInfo {
  /** Row key: column name or aggregate alias (`SUM_NetAmount`, `COUNT_All`). */
  name: string;
  /** form-build CSHARP_TYPE_MAP keys: string|int|float|decimal|datetime|boolean */
  type: string;
  /**
   * Header: the column's schema label or "Toplam Net Tutar" / "Kayıt sayısı" (produced on the server
   * in the request language; Excel/PDF use it too). If empty, `name` is shown.
   */
  label?: string | null;
}

/**
 * Matches ReportRunResultDto — the /Report/run response.
 *
 * The paging fields are OPTIONAL: the server always sends them, but the same structure is
 * also used for the synthetic preview in the report builder and the chart component — there
 * is no server metadata there, and none is needed.
 */
export interface ReportRunResult {
  columns: ReportColumnInfo[];
  rows: Record<string, unknown>[];

  /** TOTAL row count after filtering/grouping (independent of paging). */
  total?: number;
  /** 1-based page number. */
  page?: number;
  /** Row cap in this response; the applied safety cap when no paging was requested. */
  pageSize?: number;
  /**
   * true if no paging was requested but the result hit the server cap (5000) and was truncated.
   * The user is shown an "export for the full data" warning.
   */
  truncated?: boolean;
}
