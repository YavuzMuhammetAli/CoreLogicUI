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
import { Lang } from '../../services/language.service';
import { formatNumber, formatDate } from '../../utils/locale-format';

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


/** Çeviri fonksiyonu imzası — `LanguageService.t` ile uyumlu. */
export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Grafik kurulumunun dil bağlamı.
 *
 * `t` ve `lang` ZORUNLUDUR. Önceden `t` varsayılan bir TR sözlüğe düşüyordu ve
 * sayı/tarih biçimlendiricileri `tr-TR` sabitiyle kuruluyordu; çağıran dili
 * geçirmeyi unuttuğunda EN modunda Türkçe metin ve Türkçe sayı biçimi sızıyordu.
 */
export interface ChartLocaleContext {
  t: TranslateFn;
  lang: Lang;
}

/** Aktif dile göre sayı biçimi (bkz. utils/locale-format). */
const fmtNum = (locale: ChartLocaleContext, value: number): string =>
  formatNumber(value, locale.lang);

/** Aktif dile göre tarih biçimi. */
const fmtDate = (locale: ChartLocaleContext, value: Date): string =>
  formatDate(value, locale.lang);

/**
 * Backend `/Report/run` sorgusunda satır limiti yok (bkz. ReportingManager.ExecuteQuery) —
 * gruplama/aggregate olmadan kurulan bir grafik modeldeki TÜM satırları döndürebilir.
 * ApexCharts binlerce noktayı senkron çizmeye çalışınca tarayıcı kilitlenir (rapor
 * görüntülemede "site donuyor" hatası). Bu yüzden çizim öncesi satır sayısı güvenli bir
 * üst sınıra kırpılır; tam veri Tablo görünümünde ve export'ta hâlâ mevcuttur.
 */
const MAX_BAR_POINTS = 50;
const MAX_LINE_POINTS = 200;

/**
 * Grafik türünün çizebileceği en fazla satır — sunucudan bundan fazlası istenmez (backend
 * DashboardManager.RowCapFor ile aynı). null: tavan yok — kpi ve radialBar TÜM satırlardan
 * toplam/oran hesaplar, erken kırpmak yanlış sayı üretir.
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

/** Seri/KPI adı: sunucunun başlığı ("Toplam Net Tutar"); yoksa satır anahtarı. */
function columnTitle(col: ReportColumnInfo): string {
  return col.label || col.name;
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

  // Backend /Report/run sorgusunda satır limiti yok — gruplama/aggregate olmadan kurulan bir
  // grafik tüm tablo satırlarını döndürebilir. ApexCharts binlerce noktayı senkron çizmeye
  // çalışınca tarayıcı kilitlenir; bu yüzden tip bazlı güvenli bir üst sınıra kırpılır.
  const isBarLike = chartType === 'pie' || chartType === 'donut' || chartType === 'column' || chartType === 'bar';
  const cap = isBarLike ? MAX_BAR_POINTS : MAX_LINE_POINTS;
  const { rows: plotRows, note } = chartType === 'radialBar' ? { rows, note: null } : capRows(rows, cap, locale);

  const categories = plotRows.map(r => formatCategory(r[categoryCol.name], categoryCol.type, locale));

  const base: ApexResponsive[] = [
    { breakpoint: 900, options: { chart: { height: 300 }, legend: { position: 'bottom' } } },
    { breakpoint: 768, options: { chart: { height: 260 }, legend: { fontSize: '11px' } } }
  ];

  /**
   * Eksenli grafiklerde (çizgi/alan/çubuk) yakınlaştırma ve araç çubuğu kapalı.
   * ApexCharts'ta zoom varsayılan AÇIK ve dokunmatikte 10px'lik sürüklemeyi zoom sayar:
   * sayfayı kaydırmak için grafiğe değen parmak grafiği 1-2 noktaya yakınlaştırıyordu,
   * geri dönüş de küçük bir ikondan ibaretti.
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
        // Dar ekranda çok kategorili legend pastayı ezmesin: yükseklik sınırlı, kendi içinde kayar.
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
      // Tek geçiş: ara dizi kurmadan hem toplam hem ilk değer hesaplanır.
      // Eskiden 100k satır için tam boy bir ara dizi ayrılıp yalnız tek bir yüzde
      // üretiliyordu (rows.map(...) + reduce). Radyal gösterge tavandan muaftır
      // çünkü oran TÜM satırların toplamına göre hesaplanmalıdır.
      let total = 0;
      for (const r of rows) total += toNumber(r[valueCol.name]);
      const firstValue = rows.length > 0 ? toNumber(rows[0][valueCol.name]) : 0;
      const rawValues = [firstValue];
      // Radyal gösterge tek oran gösterir: ilk kategorinin toplam içindeki payı (%).
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
      // Yatay çubukta her kategori bir satır: sabit yükseklikte 50 kategori ~4px'lik çubuklar
      // demekti. Yükseklik kategori sayısıyla büyür; dar ekranda y etiketleri daraltılır.
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
          // Yatay çubukta y ekseni kategori adlarıdır; uzun adlar dar ekranda grafiğin yarısını yemesin.
          labels: { style: { colors: tokens.muted }, formatter: (val: number) => fmtNum(locale, val), ...(horizontal ? { maxWidth: 120 } : {}) }
        }
      };
    }
  }
}

/** chartType === 'kpi' için: tek toplam değer + (birden çok satır varsa) sparkline serisi. */
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

  // Birden çok satır varsa küçük bir sparkline ile eğilimi göster. KPI toplamı (yukarıda)
  // her zaman TÜM satırlardan hesaplanır — yalnızca görsel sparkline noktaları kırpılır.
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
