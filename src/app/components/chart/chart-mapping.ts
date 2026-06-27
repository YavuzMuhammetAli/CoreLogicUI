import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexNoData,
  ApexPlotOptions,
  ApexResponsive,
  ApexStroke,
  ApexTheme,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis
} from 'ng-apexcharts';
import { ChartType, ReportColumnInfo, ReportRunResult } from '../../models/report.model';
import { ChartTokenColors, buildSeriesPalette } from './chart-colors';

/** ApexCharts'ın gerçekten çizdiği tip — `kpi`/`table` apx-chart kullanmaz (host render eder). */
export type ApexRenderType = 'bar' | 'line' | 'area' | 'pie' | 'donut' | 'radialBar';

export interface KpiResult {
  label: string;
  value: number;
}

/**
 * `buildChartOptions` tüm grafik tiplerinin TEK giriş noktasıdır — her ChartType + RunResult
 * çifti buradan bir ApexOptions parça kümesine eşlenir. chart.component bunun dışında hiçbir
 * ad-hoc dönüşüm yapmaz.
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
  /** Sadece chartType === 'kpi' için doldurulur. */
  kpi: KpiResult | null;
  /** Veri MAX_*_POINTS sınırına göre kırpıldıysa kullanıcıya gösterilecek bilgi notu. */
  note: string | null;
}

const trNumber = new Intl.NumberFormat('tr-TR');
const trDate = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' });

/**
 * Backend `/Report/run` sorgusunda satır limiti yok (bkz. ReportingManager.ExecuteQuery) —
 * gruplama/aggregate olmadan kurulan bir grafik modeldeki TÜM satırları döndürebilir.
 * ApexCharts binlerce noktayı senkron çizmeye çalışınca tarayıcı kilitlenir (rapor
 * görüntülemede "site donuyor" hatası). Bu yüzden çizim öncesi satır sayısı güvenli bir
 * üst sınıra kırpılır; tam veri Tablo görünümünde ve export'ta hâlâ mevcuttur.
 */
const MAX_BAR_POINTS = 50;
const MAX_LINE_POINTS = 200;

function capRows(rows: Record<string, unknown>[], cap: number): { rows: Record<string, unknown>[]; note: string | null } {
  if (rows.length <= cap) return { rows, note: null };
  return {
    rows: rows.slice(0, cap),
    note: `${trNumber.format(rows.length)} kayıttan ilk ${trNumber.format(cap)} gösteriliyor — tüm veri için Tablo görünümünü veya gruplama/aggregate kullanın.`
  };
}

function isNumericType(type: string): boolean {
  return type === 'int' || type === 'float' || type === 'decimal';
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCategory(value: unknown, columnType: string): string {
  if (value === null || value === undefined) return '';
  if (columnType === 'datetime') {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) return trDate.format(d);
  }
  return String(value);
}

/** Palet, seri sayısından azsa baştan tekrarlanarak (cycle) genişletilir. */
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
  themeMode: 'light' | 'dark'
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
    noData: { text: 'Grafik için yeterli veri yok.', style: { color: tokens.muted } },
    kpi: null,
    note: null
  };

  if (columns.length === 0 || rows.length === 0) return empty;

  const categoryCol = columns[0];
  const valueCols = pickValueColumns(columns, categoryCol);
  if (valueCols.length === 0) return empty;

  // Backend /Report/run sorgusunda satır limiti yok — gruplama/aggregate olmadan kurulan bir
  // grafik tüm tablo satırlarını döndürebilir. ApexCharts binlerce noktayı senkron çizmeye
  // çalışınca tarayıcı kilitlenir; bu yüzden tip bazlı güvenli bir üst sınıra kırpılır.
  const isBarLike = chartType === 'pie' || chartType === 'donut' || chartType === 'column' || chartType === 'bar';
  const cap = isBarLike ? MAX_BAR_POINTS : MAX_LINE_POINTS;
  const { rows: plotRows, note } = chartType === 'radialBar' ? { rows, note: null } : capRows(rows, cap);

  const categories = plotRows.map(r => formatCategory(r[categoryCol.name], categoryCol.type));

  const base: ApexResponsive[] = [
    { breakpoint: 900, options: { chart: { height: 300 }, legend: { position: 'bottom' } } },
    { breakpoint: 768, options: { chart: { height: 260 }, legend: { fontSize: '11px' } } }
  ];

  const shared = {
    legend: { show: true, position: 'bottom' as const, labels: { colors: tokens.fg2 } },
    tooltip: { theme: themeMode, y: { formatter: (val: number) => trNumber.format(val) } },
    grid: { borderColor: tokens.borderSoft, strokeDashArray: 4 },
    theme: { mode: themeMode },
    responsive: base,
    noData: { text: 'Grafik için yeterli veri yok.', style: { color: tokens.muted } },
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
        series,
        labels: categories,
        colors,
        dataLabels: { enabled: true, formatter: (val: number) => `%${trNumber.format(Math.round(Number(val)))}` },
        plotOptions:
          chartType === 'donut'
            ? {
                pie: {
                  donut: {
                    labels: {
                      show: true,
                      name: { show: true, color: tokens.fg2 },
                      value: { show: true, color: tokens.fg, formatter: (val: string) => trNumber.format(Number(val)) },
                      total: {
                        show: true,
                        showAlways: true,
                        label: 'Toplam',
                        color: tokens.fg,
                        formatter: (w: { globals: { seriesTotals: number[] } }) =>
                          trNumber.format(w.globals.seriesTotals.reduce((a, b) => a + b, 0))
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
      const rawValues = rows.map(r => toNumber(r[valueCol.name]));
      const total = rawValues.reduce((a, b) => a + b, 0);
      // Radyal gösterge tek oran gösterir: ilk kategorinin toplam içindeki payı (%).
      const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((rawValues[0] / total) * 100))) : 0;
      return {
        ...empty,
        ...shared,
        apexType: 'radialBar',
        isEmpty: false,
        chart: { type: 'radialBar', height: 360, animations: { enabled: false } },
        series: [pct],
        labels: [categories[0] || valueCol.name],
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
                formatter: (val: number) => `%${trNumber.format(Math.round(val))}`
              }
            }
          }
        }
      };
    }

    case 'line':
    case 'area': {
      const series = valueCols.map(col => ({ name: col.name, data: plotRows.map(r => toNumber(r[col.name])) }));
      const colors = cyclePalette(palette, series.length);
      return {
        ...empty,
        ...shared,
        apexType: chartType,
        isEmpty: false,
        chart: { type: chartType, height: 360, animations: { enabled: false } },
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
          labels: { style: { colors: tokens.muted }, formatter: (val: number) => trNumber.format(val) }
        }
      };
    }

    case 'column':
    case 'bar':
    default: {
      const series = valueCols.map(col => ({ name: col.name, data: plotRows.map(r => toNumber(r[col.name])) }));
      const colors = cyclePalette(palette, series.length);
      return {
        ...empty,
        ...shared,
        apexType: 'bar',
        isEmpty: false,
        chart: { type: 'bar', height: 360, animations: { enabled: false } },
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
          labels: { style: { colors: tokens.muted }, formatter: (val: number) => trNumber.format(val) }
        }
      };
    }
  }
}

/** chartType === 'kpi' için: tek toplam değer + (birden çok satır varsa) sparkline serisi. */
export function buildKpiOutput(
  result: ReportRunResult,
  tokens: ChartTokenColors,
  themeMode: 'light' | 'dark'
): ChartBuildOutput {
  const base = buildChartOptions('bar', result, tokens, themeMode);
  const { columns, rows } = result;
  if (columns.length === 0 || rows.length === 0) return { ...base, apexType: null, kpi: null };

  const categoryCol = columns[0];
  const valueCols = pickValueColumns(columns, categoryCol);
  const valueCol = valueCols[0];
  if (!valueCol) return { ...base, apexType: null, isEmpty: true, kpi: null };

  const total = rows.reduce((sum, r) => sum + toNumber(r[valueCol.name]), 0);
  const kpi: KpiResult = { label: valueCol.name, value: total };

  if (rows.length <= 1) {
    return { ...base, apexType: null, isEmpty: false, kpi };
  }

  // Birden çok satır varsa küçük bir sparkline ile eğilimi göster. KPI toplamı (yukarıda)
  // her zaman TÜM satırlardan hesaplanır — yalnızca görsel sparkline noktaları kırpılır.
  const { rows: sparkRows, note: sparkNote } = capRows(rows, MAX_LINE_POINTS);
  const sparkSeries = [{ name: valueCol.name, data: sparkRows.map(r => toNumber(r[valueCol.name])) }];
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
