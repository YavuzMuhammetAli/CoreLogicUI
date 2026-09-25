/**
 * Yapay Zeka önerilerini (G4) mevcut servislerin payload'larına çeviren saf
 * fonksiyonlar.
 *
 * Orkestrasyondan ayrı tutulur çünkü buradaki hatalar en pahalı olanlardır:
 * yanlış sıra (alt model önce), ters çevrilmemiş isNullable, ya da ada göre
 * çözülememiş bir rapor referansı sessizce bozuk bir model üretir. Saf
 * oldukları için `ai-import.mapper.spec.ts` ile doğrudan test edilirler
 * (`cron-builder.ts` / `entity-graph.layout.ts` deseni).
 */

import {
  AiDashboardPayload,
  AiModelPayload,
  AiProposedColumn,
  AiProposedRelationship,
  AiReportPayload
} from '../models/ai.model';
import { DashboardWidget } from '../models/dashboard.model';
import {
  AggregateFunction,
  ChartType,
  ReportAggregate,
  ReportDefinition,
  ReportFilter,
  ReportOperator,
  ReportSort,
  SortDirection
} from '../models/report.model';
import { RelationshipType, RelationshipUpsert } from '../models/relationship.model';
import { COLUMN_NAME_PATTERN, MODEL_NAME_PATTERN } from './identifier';

/** Backend tool şemasıyla aynı beyaz listeler — istemci tarafı ikinci savunma hattı. */
const DATA_TYPES = new Set([
  'string', 'int', 'long', 'short', 'byte', 'decimal', 'double', 'float',
  'boolean', 'datetime', 'timeonly', 'dateonly', 'guid',
  'lookup', 'enum', 'image', 'file'
]);

const CHART_TYPES = new Set<ChartType>([
  'table', 'column', 'bar', 'line', 'area', 'pie', 'donut', 'radialBar', 'kpi'
]);

const OPERATORS = new Set<ReportOperator>([
  'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'contains', 'startswith'
]);

const AGGREGATES = new Set<AggregateFunction>(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX']);


/** Dashboard grid genişliği (dashboard-build.component.ts:20 ile aynı). */
const GRID_COLS = 12;

/** Tek bir modelin (kök ya da alt) aktarılacak hali. */
export interface ImportNode {
  entityName: string;
  /** null ise kök model. */
  parentName: string | null;
  columns: AiProposedColumn[];
}

/** Öneri JSON'unu çözer; bozuksa null. */
export function parseProposalPayload<T>(payloadJson: string): T | null {
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    return null;
  }
}

/**
 * Model önerisini parent-first düğüm listesine çevirir.
 *
 * Sıra bağlayıcıdır: `addTable` alt modeli kaydederken `parentTableName`
 * üzerinden ana tabloyu arar, dolayısıyla ana model ÖNCE var olmalıdır.
 */
export function flattenModelPayload(payload: AiModelPayload): ImportNode[] {
  const nodes: ImportNode[] = [
    { entityName: payload.entityName, parentName: null, columns: payload.columns ?? [] }
  ];

  for (const sub of payload.subModels ?? []) {
    nodes.push({
      entityName: sub.entityName,
      parentName: payload.entityName,
      columns: sub.columns ?? []
    });
  }

  return nodes;
}

/**
 * Model önerisini aktarmadan önce doğrular. Hata varsa kullanıcıya gösterilecek
 * metni döner; sorun yoksa null.
 *
 * Backend zaten doğruluyor, ama oradan dönen mesaj "addMember failed" gibi ham
 * olur ve hangi kolonun bozuk olduğunu söylemez.
 */
export function validateModelPayload(payload: AiModelPayload | null): string | null {
  if (!payload) return 'payload';
  if (!MODEL_NAME_PATTERN.test(payload.entityName ?? '')) return `ad:${payload.entityName}`;
  if (!payload.columns?.length) return 'kolon-yok';

  for (const node of flattenModelPayload(payload)) {
    if (!MODEL_NAME_PATTERN.test(node.entityName)) return `ad:${node.entityName}`;

    for (const column of node.columns) {
      if (!COLUMN_NAME_PATTERN.test(column.columnName ?? '')) return `kolon:${column.columnName}`;
      if (!DATA_TYPES.has(column.dataType)) return `tip:${column.dataType}`;
      if (column.dataType === 'enum' && !column.enumValues?.trim()) return `enum:${column.columnName}`;
      if (column.dataType === 'lookup' && !column.lookupTargetTable?.trim()) {
        return `lookup:${column.columnName}`;
      }
    }
  }

  return null;
}

/**
 * İlişki önerisini `RelationshipService.add` gövdesine çevirir.
 * `depth` ve `relationshipId` istemciden GÖNDERİLMEZ — backend hesaplar.
 */
export function toRelationshipUpsert(
  relationship: AiProposedRelationship,
  order: number
): RelationshipUpsert {
  return {
    targetModel: relationship.targetModel,
    relationshipType: relationship.relationshipType as RelationshipType,
    propertyName: relationship.propertyName,
    inverseProperty: relationship.inverseProperty ?? null,
    foreignKeyName: null,
    joinTableName: null,
    cascadeDelete: !!relationship.cascadeDelete,
    required: !!relationship.required,
    order
  };
}

/** Rapor önerisini `ReportService.define` gövdesine çevirir. */
export function toReportDefinition(payload: AiReportPayload): Partial<ReportDefinition> {
  return {
    id: 0,
    name: payload.name,
    modelName: payload.modelName,
    selectedColumns: payload.selectedColumns ?? [],
    groupBy: payload.groupBy ?? [],
    filters: (payload.filters ?? [])
      .filter(f => OPERATORS.has(f.operator as ReportOperator))
      .map<ReportFilter>(f => ({
        field: f.field,
        operator: f.operator as ReportOperator,
        // Backend her filtre değerini string bekler.
        value: f.value == null ? '' : String(f.value)
      })),
    aggregates: (payload.aggregates ?? [])
      .filter(a => AGGREGATES.has(a.function as AggregateFunction))
      .map<ReportAggregate>(a => ({
        field: a.field,
        function: a.function as AggregateFunction
      })),
    sortBy: (payload.sortBy ?? []).map<ReportSort>(s => ({
      field: s.field,
      direction: (s.direction === 'DESC' ? 'DESC' : 'ASC') as SortDirection
    })),
    chartType: CHART_TYPES.has(payload.chartType as ChartType)
      ? (payload.chartType as ChartType)
      : 'table'
  };
}

export interface DashboardMappingResult {
  widgets: DashboardWidget[];
  /** Adı çözülemeyen raporlar — hepsi çözülemezse aktarım başarısız sayılır. */
  unresolved: string[];
}

/**
 * Dashboard önerisindeki rapor ADLARINI ID'ye çevirir.
 *
 * Öneri üretildiğinde raporların henüz ID'si yoktur; eşleme ancak raporlar
 * tanımlandıktan sonra yapılabilir. Bu yüzden dashboard aktarımı her zaman
 * rapor aktarımından SONRA gelir.
 */
export function toDashboardWidgets(
  payload: AiDashboardPayload,
  reportIdsByName: ReadonlyMap<string, number>
): DashboardMappingResult {
  const widgets: DashboardWidget[] = [];
  const unresolved: string[] = [];

  for (const widget of payload.widgets ?? []) {
    const reportId = reportIdsByName.get(widget.reportName.toLowerCase());
    if (reportId == null) {
      unresolved.push(widget.reportName);
      continue;
    }

    // Grid sınırlarını kırp: model x+w<=12 kuralına uyması için yönlendirilir
    // ama garanti edilmez, taşan widget yerleşimi bozardı.
    const w = clamp(widget.w, 2, GRID_COLS);
    const x = clamp(widget.x, 0, GRID_COLS - w);

    widgets.push({
      reportDefinitionId: reportId,
      chartType: CHART_TYPES.has(widget.chartType as ChartType)
        ? (widget.chartType as ChartType)
        : 'table',
      x,
      y: Math.max(0, widget.y ?? 0),
      w,
      h: Math.max(2, widget.h ?? 4)
    });
  }

  return { widgets, unresolved };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.trunc(value), min), max);
}
