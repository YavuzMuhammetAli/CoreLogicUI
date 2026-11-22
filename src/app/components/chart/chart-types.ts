import { ChartType } from '../../models/report.model';
import type { IconName } from '../shared/icon/icons.generated';

/**
 * Shared metadata for the chart type picker (report-build, dashboard-build).
 * `icon` is a Material Symbols name, drawn with `<app-icon>`; the colour comes from `currentColor`,
 * so it can be coloured via CSS in selected/hover states.
 */
export interface ChartTypeMeta {
  value: ChartType;
  /** i18n key — translated in templates with `| t` (see report.i18n.ts 'chart.type.*.label'). */
  labelKey: string;
  /** i18n key — translated in templates with `| t` (see report.i18n.ts 'chart.type.*.hint'). */
  hintKey: string;
  icon: IconName;
}

export const CHART_TYPE_META: ChartTypeMeta[] = [
  {
    value: 'column',
    labelKey: 'chart.type.column.label',
    hintKey: 'chart.type.column.hint',
    icon: 'bar_chart'
  },
  {
    value: 'bar',
    labelKey: 'chart.type.bar.label',
    hintKey: 'chart.type.bar.hint',
    icon: 'align_horizontal_left'
  },
  {
    value: 'line',
    labelKey: 'chart.type.line.label',
    hintKey: 'chart.type.line.hint',
    icon: 'show_chart'
  },
  {
    value: 'area',
    labelKey: 'chart.type.area.label',
    hintKey: 'chart.type.area.hint',
    icon: 'area_chart'
  },
  {
    value: 'pie',
    labelKey: 'chart.type.pie.label',
    hintKey: 'chart.type.pie.hint',
    icon: 'pie_chart'
  },
  {
    value: 'donut',
    labelKey: 'chart.type.donut.label',
    hintKey: 'chart.type.donut.hint',
    icon: 'donut_large'
  },
  {
    value: 'radialBar',
    labelKey: 'chart.type.radialBar.label',
    hintKey: 'chart.type.radialBar.hint',
    icon: 'speed'
  },
  {
    value: 'kpi',
    labelKey: 'chart.type.kpi.label',
    hintKey: 'chart.type.kpi.hint',
    icon: 'trending_up'
  },
  {
    value: 'table',
    labelKey: 'chart.type.table.label',
    hintKey: 'chart.type.table.hint',
    icon: 'table'
  }
];

export function chartTypeMeta(value: ChartType): ChartTypeMeta | undefined {
  return CHART_TYPE_META.find(m => m.value === value);
}

/** Types requiring a single aggregate — the builder shows a warning if several aggregates are selected. */
export const SINGLE_AGGREGATE_CHART_TYPES: ChartType[] = ['pie', 'donut', 'radialBar', 'kpi'];
