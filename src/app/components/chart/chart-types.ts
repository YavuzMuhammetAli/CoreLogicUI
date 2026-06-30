import { ChartType } from '../../models/report.model';

/**
 * Grafik tipi seçici (report-build, dashboard-build) için paylaşılan metadata.
 * `svg` alanı inline SVG mini-önizlemedir (raster ikon DEĞİL) — `currentColor` kullanır,
 * böylece seçili/hover durumunda CSS ile renklendirilebilir. Layout sidebar ikonlarıyla
 * aynı çizim dili: `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="2"`.
 */
export interface ChartTypeMeta {
  value: ChartType;
  /** i18n anahtarı — şablonlarda `| t` ile çevrilir (bkz. report.i18n.ts 'chart.type.*.label'). */
  labelKey: string;
  /** i18n anahtarı — şablonlarda `| t` ile çevrilir (bkz. report.i18n.ts 'chart.type.*.hint'). */
  hintKey: string;
  /** ApexCharts'ın render ettiği gerçek tip ('kpi'/'table' için apx-chart kullanılmaz). */
  svg: string;
}

export const CHART_TYPE_META: ChartTypeMeta[] = [
  {
    value: 'column',
    labelKey: 'chart.type.column.label',
    hintKey: 'chart.type.column.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="14" width="4" height="6"/></svg>`
  },
  {
    value: 'bar',
    labelKey: 'chart.type.bar.label',
    hintKey: 'chart.type.bar.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="4"/><rect x="3" y="10" width="10" height="4"/><rect x="3" y="16" width="17" height="4"/></svg>`
  },
  {
    value: 'line',
    labelKey: 'chart.type.line.label',
    hintKey: 'chart.type.line.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 8 11 12 14 20 5"/></svg>`
  },
  {
    value: 'area',
    labelKey: 'chart.type.area.label',
    hintKey: 'chart.type.area.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 17 8 11 12 14 20 5 20 20 3 20" fill="currentColor" fill-opacity="0.22" stroke="none"/><polyline points="3 17 8 11 12 14 20 5"/></svg>`
  },
  {
    value: 'pie',
    labelKey: 'chart.type.pie.label',
    hintKey: 'chart.type.pie.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l7.79-4.5A9 9 0 0 0 12 3Z" fill="currentColor" stroke="none"/></svg>`
  },
  {
    value: 'donut',
    labelKey: 'chart.type.donut.label',
    hintKey: 'chart.type.donut.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5"><circle cx="12" cy="12" r="7"/><path d="M12 5a7 7 0 0 1 6.06 10.5" stroke-width="5" stroke-linecap="round" opacity="0.55"/></svg>`
  },
  {
    value: 'radialBar',
    labelKey: 'chart.type.radialBar.label',
    hintKey: 'chart.type.radialBar.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-4" stroke-linecap="round"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>`
  },
  {
    value: 'kpi',
    labelKey: 'chart.type.kpi.label',
    hintKey: 'chart.type.kpi.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 14l3-3 3 3 4-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    value: 'table',
    labelKey: 'chart.type.table.label',
    hintKey: 'chart.type.table.hint',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>`
  }
];

export function chartTypeMeta(value: ChartType): ChartTypeMeta | undefined {
  return CHART_TYPE_META.find(m => m.value === value);
}

/** Tek aggregate gerektiren tipler — birden çok aggregate seçiliyse builder'da uyarı gösterilir. */
export const SINGLE_AGGREGATE_CHART_TYPES: ChartType[] = ['pie', 'donut', 'radialBar', 'kpi'];
