import type ApexCharts from 'apexcharts';
import { ChartType, ReportColumnInfo, ReportRunResult } from '../../models/report.model';
import { ChartTokenColors, buildSeriesPalette } from './chart-colors';
import { Lang } from '../../services/language.service';
import { formatNumber, formatDate } from '../../utils/locale-format';

/** The type ApexCharts actually draws — `table` is not drawn, `kpi` draws only a small sparkline. */
export type ApexRenderType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'radialBar';

/** The part of the options that goes to drawing. Types come from apexcharts' public declarations. */
export function toApexOptions(build: ChartBuildOutput): ApexCharts.ApexOptions {
  const {
    chart, series, labels, xaxis, yaxis, legend, colors, dataLabels, tooltip,
    fill, stroke, plotOptions, grid, theme, responsive, noData
  } = build;
  return {
    chart, series, labels, xaxis, yaxis, legend, colors, dataLabels, tooltip,
    fill, stroke, plotOptions, grid, theme, responsive, noData
  };
}

/** Small sparkline in the KPI card: no axes and no tooltip. */
export function toSparklineOptions(build: ChartBuildOutput): ApexCharts.ApexOptions {
  const { chart, series, colors, stroke, legend, dataLabels } = build;
  return { chart, series, colors, stroke, legend, dataLabels };
}

export interface KpiResult {
  label: string;
  value: number;
}

/**
 * `buildChartOptions` is the SINGLE entry point for all chart types — every ChartType + RunResult
 * pair is mapped from here to a set of ApexOptions parts. chart.component does no other
 * ad-hoc conversion.
 */
export interface ChartBuildOutput {
  apexType: ApexRenderType | null;
  isEmpty: boolean;
  chart: ApexChart;
  series: ApexAxisChartSeries | ApexNonAxisChartSeries;
  labels: string[];
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  legend: ApexLegend;
  colors: string[];
  dataLabels: ApexDataLabels;
  tooltip: ApexTooltip;
  fill: ApexFill;
  stroke: ApexStroke;
  plotOptions: ApexPlotOptions;
  grid: ApexGrid;
  theme: ApexTheme;
  responsive: ApexResponsive[];
  noData: ApexNoData;
  /** Filled only for chartType === 'kpi'. */
  kpi: KpiResult | null;
  /** Info note to show the user if the data was trimmed to the MAX_*_POINTS limit. */
  note: string | null;
}


/** Translation function signature — compatible with `LanguageService.t`. */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Language context of the chart setup.
 *
 * `t` and `lang` are REQUIRED. Previously `t` fell back to a default TR dictionary and
 * number/date formatters were built with a fixed `tr-TR`; when a caller forgot to pass
 * the language, Turkish text and Turkish number formatting leaked into EN mode.
 */
export interface ChartLocaleContext {
  t: TranslateFn;
  lang: Lang;
}

/** Number format for the active language (see utils/locale-format). */
const fmtNum = (locale: ChartLocaleContext, value: number): string =>
  formatNumber(value, locale.lang);

/** Date format for the active language. */
const fmtDate = (locale: ChartLocaleContext, value: Date): string =>
  formatDate(value, locale.lang);

/**
 * The backend `/Report/run` query has no row limit (see ReportingManager.ExecuteQuery) —
 * a chart built without grouping/aggregates can return ALL rows of the model.
 * When ApexCharts tries to draw thousands of points synchronously the browser freezes (the
 * "site freezes" bug in the report viewer). So before drawing the row count is trimmed to a safe
 * upper limit; the full data is still available in the Table view and in export.
 */
const MAX_BAR_POINTS = 50;
const MAX_LINE_POINTS = 200;

/**
 * Maximum number of rows the chart type can draw — no more than this is requested from the server (same as the backend's
 * DashboardManager.RowCapFor). null: no cap — kpi and radialBar compute totals/ratios from ALL
 * rows, trimming early would produce wrong numbers.
 */
export function chartRowCap(chartType: string | null | undefined): number | null {
  switch (chartType) {
    case 'pie': case 'donut': case 'column': case 'bar': return MAX_BAR_POINTS;
    case 'line': case 'area': return MAX_LINE_POINTS;
    default: return null;
  }
}

function capRows(rows: Record<string, unknown>[], cap: number, locale: ChartLocaleContext): { rows: Record<string, unknown>[]; note: string | null } {
  if (rows.length <= cap) return { rows, note: null };
  return {
    rows: rows.slice(0, cap),
    note: locale.t('chart.capNote', { total: fmtNum(locale, rows.length), cap: fmtNum(locale, cap) })
  };
}

function isNumericType(type: string): boolean {
  return type === 'int' || type === 'long' || type === 'short' || type === 'byte'
      || type === 'float' || type === 'double' || type === 'decimal';
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCategory(value: unknown, columnType: string, locale: ChartLocaleContext): string {
  if (value === null || value === undefined) return '';
  if (columnType === 'datetime' || columnType === 'dateonly') {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return fmtDate(locale, d);
  }
  return String(value);
}

/** Series/KPI name: the server's header ("Toplam Net Tutar"); otherwise the row key. */
function columnTitle(col: ReportColumnInfo): string {
  return col.label || col.name;
}

/** If the palette is shorter than the series count, it is extended by repeating from the start (cycle). */
function cyclePalette(palette: string[], count: number): string[] {
  if (palette.length === 0 || count <= 0) return [];
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

function pickValueColumns(columns: ReportColumnInfo[], categoryCol: ReportColumnInfo): ReportColumnInfo[] {
  const numeric = columns.filter(c => isNumericType(c.type) && c.name !== categoryCol.name);
  return numeric.length > 0 ? numeric : columns.slice(1);
}

export function buildChartOptions(
  chartType: ChartType,
  result: ReportRunResult,
  tokens: ChartTokenColors,
  themeMode: 'light' | 'dark',
  locale: ChartLocaleContext
): ChartBuildOutput {
  const palette = buildSeriesPalette(tokens);
  const { columns, rows } = result;

  const empty: ChartBuildOutput = {
    apexType: null,
    isEmpty: true,
    chart: { type: 'bar', height: 320 },
    series: [],
    labels: [],
    xaxis: {},
    yaxis: {},
    legend: { show: true, position: 'bottom', labels: { colors: tokens.fg2 } },
    colors: palette,
    dataLabels: { enabled: false },
    tooltip: {},
    fill: {},
    stroke: {},
    plotOptions: {},
    grid: { borderColor: tokens.borderSoft, strokeDashArray: 4 },
    theme: { mode: themeMode },
    responsive: [],
    noData: { text: locale.t('chart.noDataForChart'), style: { color: tokens.muted } },
    kpi: null,
    note: null
  };

  if (columns.length === 0 || rows.length === 0) return empty;

  const categoryCol = columns[0];
  const valueCols = pickValueColumns(columns, categoryCol);
  if (valueCols.length === 0) return empty;

  // The backend /Report/run query has no row limit — a chart built without grouping/aggregates
  // can return all table rows. When ApexCharts tries to draw thousands of points synchronously
  // the browser freezes; so it is trimmed to a safe per-type upper limit.
  const isBarLike = chartType === 'pie' || chartType === 'donut' || chartType === 'column' || chartType === 'bar';
  const cap = isBarLike ? MAX_BAR_POINTS : MAX_LINE_POINTS;
  const { rows: plotRows, note } = chartType === 'radialBar' ? { rows, note: null } : capRows(rows, cap, locale);

  const categories = plotRows.map(r => formatCategory(r[categoryCol.name], categoryCol.type, locale));

  const base: ApexResponsive[] = [
    { breakpoint: 900, options: { chart: { height: 300 }, legend: { position: 'bottom' } } },
    { breakpoint: 768, options: { chart: { height: 260 }, legend: { fontSize: '11px' } } }
  ];

  /**
   * Zoom and toolbar are off on axis charts (line/area/bar).
   * In ApexCharts zoom is ON by default and on touch it counts a 10px drag as a zoom:
   * a finger touching the chart to scroll the page zoomed the chart into 1-2 points,
   * and the only way back was a tiny icon.
   */
  const noZoom = { zoom: { enabled: false }, toolbar: { show: false } };

  const shared = {
    legend: { show: true, position: 'bottom' as const, labels: { colors: tokens.fg2 } },
    tooltip: { theme: themeMode, y: { formatter: (val: number) => fmtNum(locale, val) } },
    grid: { borderColor: tokens.borderSoft, strokeDashArray: 4 },
    theme: { mode: themeMode },
    responsive: base,
    noData: { text: locale.t('chart.noDataForChart'), style: { color: tokens.muted } },
    note
  };

  switch (chartType) {
    case 'pie':
    case 'donut': {
      const valueCol = valueCols[0];
      const series = plotRows.map(r => toNumber(r[valueCol.name]));
      const colors = cyclePalette(palette, series.length);
      return {
        ...empty,
        ...shared,
        apexType: chartType,
        isEmpty: false,
        chart: { type: chartType, height: 360, animations: { enabled: false } },
        // On narrow screens a many-category legend must not squash the pie: height is limited, it scrolls internally.
        responsive: [
          base[0],
          { breakpoint: 768, options: { chart: { height: 320 }, legend: { fontSize: '11px', height: 64 } } }
        ],
        series,
        labels: categories,
        colors,
        dataLabels: { enabled: true, formatter: (val: number) => `%${fmtNum(locale, Math.round(Number(val)))}` },
        plotOptions:
          chartType === 'donut'
            ? {
                pie: {
                  donut: {
                    labels: {
                      show: true,
                      name: { show: true, color: tokens.fg2 },
                      value: { show: true, color: tokens.fg, formatter: (val: string) => fmtNum(locale, Number(val)) },
                      total: {
                        show: true,
                        showAlways: true,
                        label: locale.t('chart.total'),
                        color: tokens.fg,
                        formatter: (w: { globals: { seriesTotals: number[] } }) =>
                          fmtNum(locale, w.globals.seriesTotals.reduce((a, b) => a + b, 0))
                      }
                    }
                  }
                }
              }
            : {}
      };
    }

    case 'radialBar': {
      const valueCol = valueCols[0];
      // Single pass: both the total and the first value are computed without building an intermediate array.
      // Previously, for 100k rows a full-size intermediate array was allocated just to produce a single
      // percentage (rows.map(...) + reduce). The radial gauge is exempt from the cap
      // because the ratio must be computed against the total of ALL rows.
      let total = 0;
      for (const r of rows) total += toNumber(r[valueCol.name]);
      const firstValue = rows.length > 0 ? toNumber(rows[0][valueCol.name]) : 0;
      const rawValues = [firstValue];
      // The radial gauge shows a single ratio: the first category's share of the total (%).
      const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((rawValues[0] / total) * 100))) : 0;
      return {
        ...empty,
        ...shared,
        apexType: 'radialBar',
        isEmpty: false,
        chart: { type: 'radialBar', height: 360, animations: { enabled: false } },
        series: [pct],
        labels: [categories[0] || columnTitle(valueCol)],
        colors: [palette[0]],
        dataLabels: { enabled: true },
        plotOptions: {
          radialBar: {
            hollow: { size: '60%' },
            dataLabels: {
              show: true,
              name: { show: true, color: tokens.fg2 },
              value: {
                show: true,
                color: tokens.fg,
                formatter: (val: number) => `%${fmtNum(locale, Math.round(val))}`
              }
            }
          }
        }
      };
    }

    case 'line':
    case 'area': {
      const series = valueCols.map(col => ({ name: columnTitle(col), data: plotRows.map(r => toNumber(r[col.name])) }));
      const colors = cyclePalette(palette, series.length);
      return {
        ...empty,
        ...shared,
        apexType: chartType,
        isEmpty: false,
        chart: { type: chartType, height: 360, animations: { enabled: false }, ...noZoom },
        series,
        colors,
        stroke: { curve: 'smooth', width: 3 },
        fill:
          chartType === 'area'
            ? { type: 'gradient', gradient: { opacityFrom: 0.35, opacityTo: 0.05 } }
            : { type: 'solid' },
        dataLabels: { enabled: false },
        xaxis: {
          categories,
          labels: { style: { colors: tokens.muted } },
          axisBorder: { color: tokens.border },
          axisTicks: { color: tokens.border }
        },
        yaxis: {
          labels: { style: { colors: tokens.muted }, formatter: (val: number) => fmtNum(locale, val) }
        }
      };
    }

    case 'column':
    case 'bar':
    default: {
      const series = valueCols.map(col => ({ name: columnTitle(col), data: plotRows.map(r => toNumber(r[col.name])) }));
      const colors = cyclePalette(palette, series.length);
      // On a horizontal bar each category is a row: at a fixed height 50 categories meant ~4px
      // bars. Height grows with the category count; on narrow screens the y labels are narrowed.
      const horizontal = chartType === 'bar';
      const barHeight = (min: number) => horizontal ? Math.max(min, categories.length * 24 + 60) : min;
      return {
        ...empty,
        ...shared,
        apexType: 'bar',
        isEmpty: false,
        chart: { type: 'bar', height: barHeight(360), animations: { enabled: false }, ...noZoom },
        responsive: [
          { breakpoint: 900, options: { chart: { height: barHeight(300) }, legend: { position: 'bottom' } } },
          {
            breakpoint: 768,
            options: { chart: { height: barHeight(260) }, legend: { fontSize: '11px' } }
          }
        ],
        series,
        colors,
        dataLabels: { enabled: false },
        plotOptions: { bar: { horizontal: chartType === 'bar', borderRadius: 4, columnWidth: '55%' } },
        xaxis: {
          categories,
          labels: { style: { colors: tokens.muted } },
          axisBorder: { color: tokens.border },
          axisTicks: { color: tokens.border }
        },
        yaxis: {
          // On a horizontal bar the y axis holds the category names; long names must not eat half the chart on narrow screens.
          labels: { style: { colors: tokens.muted }, formatter: (val: number) => fmtNum(locale, val), ...(horizontal ? { maxWidth: 120 } : {}) }
        }
      };
    }
  }
}

/** For chartType === 'kpi': a single total value + (if there are several rows) a sparkline series. */
export function buildKpiOutput(
  result: ReportRunResult,
  tokens: ChartTokenColors,
  themeMode: 'light' | 'dark',
  locale: ChartLocaleContext
): ChartBuildOutput {
  const base = buildChartOptions('bar', result, tokens, themeMode, locale);
  const { columns, rows } = result;
  if (columns.length === 0 || rows.length === 0) return { ...base, apexType: null, kpi: null };

  const categoryCol = columns[0];
  const valueCols = pickValueColumns(columns, categoryCol);
  const valueCol = valueCols[0];
  if (!valueCol) return { ...base, apexType: null, isEmpty: true, kpi: null };

  const total = rows.reduce((sum, r) => sum + toNumber(r[valueCol.name]), 0);
  const kpi: KpiResult = { label: columnTitle(valueCol), value: total };

  if (rows.length <= 1) {
    return { ...base, apexType: null, isEmpty: false, kpi };
  }

  // If there are several rows, show the trend with a small sparkline. The KPI total (above)
  // is always computed from ALL rows — only the visual sparkline points are trimmed.
  const { rows: sparkRows, note: sparkNote } = capRows(rows, MAX_LINE_POINTS, locale);
  const sparkSeries = [{ name: columnTitle(valueCol), data: sparkRows.map(r => toNumber(r[valueCol.name])) }];
  return {
    ...base,
    note: sparkNote,
    apexType: 'line',
    isEmpty: false,
    chart: { type: 'line', height: 80, sparkline: { enabled: true }, animations: { enabled: false } },
    series: sparkSeries,
    colors: [tokens.accent],
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    legend: { show: false },
    kpi
  };
}
