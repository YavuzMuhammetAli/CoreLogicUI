/**
 * Pure functions that convert AI proposals (G4) into the payloads of the existing
 * services.
 *
 * Kept separate from orchestration because mistakes here are the most expensive:
 * the wrong order (sub-model first), an un-inverted isNullable, or a report reference
 * that could not be resolved by name silently produces a broken model. Being pure,
 * they are tested directly by `ai-import.mapper.spec.ts`
 * (the `cron-builder.ts` / `entity-graph.layout.ts` pattern).
 */

import {
  AiDashboardPayload,
  AiModelChangePayload,
  AiModelPayload,
  AiProposedColumn,
  AiProposedRelationship,
  AiReportPayload
} from '../models/ai.model';
import { PublishedTableSchema } from '../services/published-table.service';
import { MemberMetadataUpdate, normalizeColumnRules, toMemberMetadataUpdate } from './column-rules';
import { kbToMb } from './file-size';
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

/** Same whitelists as the backend tool schema — a second, client-side line of defence. */
const DATA_TYPES = new Set([
  'string', 'int', 'long', 'short', 'byte', 'decimal', 'double', 'float',
  'boolean', 'datetime', 'timeonly', 'dateonly', 'guid',
  'lookup', 'enum', 'image', 'file', 'text'
]);

const CHART_TYPES = new Set<ChartType>([
  'table', 'column', 'bar', 'line', 'area', 'pie', 'donut', 'radialBar', 'kpi'
]);

const OPERATORS = new Set<ReportOperator>([
  'eq', 'ne', 'gt', 'ge', 'lt', 'le', 'contains', 'startswith'
]);

const AGGREGATES = new Set<AggregateFunction>(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX']);


/** Dashboard grid width (same as dashboard-build.component.ts:20). */
const GRID_COLS = 12;

/** The importable form of a single model (root or sub). */
export interface ImportNode {
  entityName: string;
  /** Null for the root model. */
  parentName: string | null;
  columns: AiProposedColumn[];
}

/** Parses the proposal JSON; null if corrupt. */
export function parseProposalPayload<T>(payloadJson: string): T | null {
  try {
    return JSON.parse(payloadJson) as T;
  } catch {
    return null;
  }
}

/**
 * Converts a model proposal into a parent-first node list.
 *
 * The order is binding: when saving a sub-model `addTable` looks up the parent table via
 * `parentTableName`, so the parent model must exist FIRST.
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
 * Validates a model proposal before importing. On error returns the text to show
 * the user; null if there is no problem.
 *
 * The backend validates too, but its message is raw, like "addMember failed",
 * and does not say which column is broken.
 */
export function validateModelPayload(payload: AiModelPayload | null): string | null {
  if (!payload) return 'payload';
  if (!MODEL_NAME_PATTERN.test(payload.entityName ?? '')) return `name:${payload.entityName}`;
  if (!payload.columns?.length) return 'no-columns';

  for (const node of flattenModelPayload(payload)) {
    if (!MODEL_NAME_PATTERN.test(node.entityName)) return `name:${node.entityName}`;

    for (const column of node.columns) {
      const problem = validateProposedColumn(column);
      if (problem) return problem;
    }
  }

  return null;
}

/** Validation of a single proposed column — shared by new-model and change proposals. */
function validateProposedColumn(column: AiProposedColumn): string | null {
  if (!COLUMN_NAME_PATTERN.test(column.columnName ?? '')) return `column:${column.columnName}`;
  if (!DATA_TYPES.has(column.dataType)) return `type:${column.dataType}`;
  if (column.dataType === 'enum' && !column.enumValues?.trim()) return `enum:${column.columnName}`;
  if (column.dataType === 'lookup' && !column.lookupTargetTable?.trim()) {
    return `lookup:${column.columnName}`;
  }
  return null;
}

/**
 * Validates a change proposal before importing (the checks possible without the saved schema).
 * That the columns actually exist is checked against the schema in `toMemberMetadataUpdates`.
 */
export function validateModelChangePayload(payload: AiModelChangePayload | null): string | null {
  if (!payload?.entityName?.trim()) return 'payload';
  const alters = payload.alterColumns ?? [];
  const adds = payload.addColumns ?? [];
  if (alters.length === 0 && adds.length === 0) return 'no-changes';

  for (const column of adds) {
    const problem = validateProposedColumn(column);
    if (problem) return problem;
  }
  return null;
}

export interface MetadataMergeResult {
  updates: MemberMetadataUpdate[];
  /** The first problem (e.g. `column-missing:Name`); if set, no update must be applied. */
  error: string | null;
}

/**
 * Merges a change proposal with the saved schema and turns it into `updateMemberMetadata` bodies.
 *
 * The endpoint does a FULL replacement (an empty rule is removed); the proposal carries only changed fields.
 * Without merging here, every rule the proposal does not mention would be silently deleted.
 * Rules are filtered by type (`toMemberMetadataUpdate`) — no regex is sent for a numeric column.
 */
export function toMemberMetadataUpdates(
  schema: PublishedTableSchema,
  payload: AiModelChangePayload
): MetadataMergeResult {
  const byName = new Map(schema.columns.map(c => [c.name.toLowerCase(), c]));
  const updates: MemberMetadataUpdate[] = [];

  for (const change of payload.alterColumns ?? []) {
    const current = byName.get((change.columnName ?? '').toLowerCase());
    if (!current) return { updates: [], error: `column-missing:${change.columnName}` };

    const isRequired = change.isNullable === undefined || change.isNullable === null
      ? current.isRequired
      : !change.isNullable;
    const maxLength = change.maxLength ?? current.maxLength;

    updates.push(toMemberMetadataUpdate(schema.tableName, normalizeColumnRules({
      columnName: current.name,
      dataType: current.dataType,
      isNullable: !isRequired,
      label: change.label ?? current.label,
      description: change.description ?? current.description,
      minLength: change.minLength ?? current.minLength,
      maxLength,
      min: change.min ?? current.min,
      max: change.max ?? current.max,
      regex: change.regex ?? current.regex,
      regexMessage: change.regexMessage ?? current.regexMessage,
      enumValues: change.enumValues ?? current.enumValues,
      lookupTargetTable: current.lookupTargetTable,
      lookupDisplayColumn: change.lookupDisplayColumn ?? current.lookupDisplayColumn,
      // Keep a file column's stored KB limit as is: when the MB field is derived from the same value
      // normalizeColumnRules passes the KB through without rounding (leaving it empty would delete the limit).
      maxFileSizeMb: kbToMb(maxLength)
    })));
  }

  return { updates, error: null };
}

/**
 * Converts a relationship proposal into a `RelationshipService.add` body.
 * `depth` and `relationshipId` are NOT sent by the client — the backend computes them.
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

/** Converts a report proposal into a `ReportService.define` body. */
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
        // The backend expects every filter value as a string.
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
  /** Reports whose name could not be resolved — if none resolve, the import counts as failed. */
  unresolved: string[];
}

/**
 * Converts the report NAMES in a dashboard proposal into IDs.
 *
 * When the proposal is produced the reports have no IDs yet; mapping is only possible after the
 * reports are defined. That is why the dashboard import always comes
 * AFTER the report import.
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

    // Clamp to grid bounds: the model is instructed to follow the x+w<=12 rule
    // but it is not guaranteed, and an overflowing widget would break the layout.
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
