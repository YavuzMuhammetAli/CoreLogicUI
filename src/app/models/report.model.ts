/**
 * Metadata-driven rapor modelleri — backend Entities.DTOs.Reporting.* ile eşleşir.
 * Bir rapor kod değil, bu yapıdaki bir metadata kaydıdır.
 */

/** ReportDefinition'da kullanılabilecek grafik tipleri — ApexCharts ile eşlenir. */
export type ChartType = 'table' | 'bar' | 'line' | 'pie' | 'area';

/** Backend whitelist'iyle birebir eşleşmeli (ReportingManager.AllowedOperators). */
export type ReportOperator = 'eq' | 'ne' | 'gt' | 'ge' | 'lt' | 'le' | 'contains' | 'startswith';

/** Backend whitelist'iyle birebir eşleşmeli (ReportingManager.AllowedAggregateFunctions). */
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

/** ReportDefinitionDto ile eşleşir — define/update gönderilir, list/run'dan dönen şekil. */
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
  name: string;
  /** form-build CSHARP_TYPE_MAP anahtarları: string|int|float|decimal|datetime|boolean */
  type: string;
}

/** ReportRunResultDto ile eşleşir — /Report/run yanıtı. */
export interface ReportRunResult {
  columns: ReportColumnInfo[];
  rows: Record<string, unknown>[];
}
