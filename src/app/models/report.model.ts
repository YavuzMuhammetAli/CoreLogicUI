/**
 * Metadata-driven rapor modelleri — backend Entities.DTOs.Reporting.* ile eşleşir.
 * Bir rapor kod değil, bu yapıdaki bir metadata kaydıdır.
 */

/**
 * ReportDefinition'da kullanılabilecek grafik tipleri — ApexCharts ile eşlenir.
 * Backend'de bu alan serbest string (NVARCHAR(50), whitelist yok) — burada listelenenler
 * yalnızca frontend'in çizebildiği zorunlu set; yeni tip eklemek backend değişikliği gerektirmez.
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

/**
 * ReportRunResultDto ile eşleşir — /Report/run yanıtı.
 *
 * Sayfalama alanları OPSİYONELDİR: sunucu bunları her zaman gönderir, ancak aynı yapı
 * rapor oluşturucudaki sentetik önizleme ve grafik bileşeni için de kullanılır — oralarda
 * sunucu metadata'sı yoktur ve olması da gerekmez.
 */
export interface ReportRunResult {
  columns: ReportColumnInfo[];
  rows: Record<string, unknown>[];

  /** Filtre/gruplama sonrası TOPLAM satır sayısı (sayfalamadan bağımsız). */
  total?: number;
  /** 1-tabanlı sayfa no. */
  page?: number;
  /** Bu yanıttaki satır üst sınırı; sayfalama istenmediyse uygulanan güvenlik tavanı. */
  pageSize?: number;
  /**
   * Sayfalama istenmediği hâlde sonuç sunucu tavanına (5000) takılıp kırpıldıysa true.
   * Kullanıcıya "tam veri için dışa aktarın" uyarısı gösterilir.
   */
  truncated?: boolean;
}
