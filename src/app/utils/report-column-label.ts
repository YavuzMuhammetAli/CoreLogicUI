import { AggregateFunction, ReportAggregate } from '../models/report.model';

/**
 * Header of a report result column — PURE, no DOM.
 *
 * In a run report the header comes from the server (`ReportColumnInfo.label`, backend
 * `ReportingManager.ApplyColumnLabels`). This helper is only for the report BUILDER's synthetic
 * preview and the sort list; the texts must stay the same as backend `Messages.ReportColumn*`
 * (see report.i18n.ts 'report.columnLabel.*').
 */

const AGGREGATE_LABEL_KEYS: Record<AggregateFunction, string> = {
  SUM: 'report.columnLabel.sum',
  COUNT: 'report.columnLabel.count',
  AVG: 'report.columnLabel.avg',
  MIN: 'report.columnLabel.min',
  MAX: 'report.columnLabel.max'
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The server-side alias rule (ReportingManager.BuildProjection): `{FUNCTION}_{Field|All}`. */
export function aggregateAlias(agg: Pick<ReportAggregate, 'function' | 'field'>): string {
  return `${agg.function}_${agg.field || 'All'}`;
}

/**
 * If `name` is an aggregate alias: "Toplam {field label}" (Total) / "Kayıt sayısı" (record count); if a plain
 * column, the column's label; otherwise the name itself. COUNT is independent of the field (the server
 * calls `Count()`) — `COUNT_ID` is also "Kayıt sayısı".
 */
export function reportColumnLabel(
  name: string,
  columns: ReadonlyArray<{ columnName: string; label?: string | null }>,
  aggregates: ReadonlyArray<Pick<ReportAggregate, 'function' | 'field'>>,
  t: Translate
): string {
  const fieldLabel = (field: string) =>
    columns.find(c => c.columnName === field)?.label?.trim() || field;

  const agg = aggregates.find(a => a.function && aggregateAlias(a) === name);
  if (agg) {
    const key = AGGREGATE_LABEL_KEYS[agg.function];
    if (key) return agg.function === 'COUNT' ? t(key) : t(key, { field: fieldLabel(agg.field) });
  }

  return fieldLabel(name);
}
