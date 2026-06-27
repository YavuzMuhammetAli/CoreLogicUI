import { ChartType } from '../../models/report.model';

/**
 * Grafik tipi seçici (report-build, dashboard-build) için paylaşılan metadata.
 * `svg` alanı inline SVG mini-önizlemedir (raster ikon DEĞİL) — `currentColor` kullanır,
 * böylece seçili/hover durumunda CSS ile renklendirilebilir. Layout sidebar ikonlarıyla
 * aynı çizim dili: `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width="2"`.
 */
export interface ChartTypeMeta {
  value: ChartType;
  label: string;
  hint: string;
  /** ApexCharts'ın render ettiği gerçek tip ('kpi'/'table' için apx-chart kullanılmaz). */
  svg: string;
}

export const CHART_TYPE_META: ChartTypeMeta[] = [
  {
    value: 'column',
    label: 'Sütun',
    hint: 'Kategoriler arasında karşılaştırma — dikey çubuklar.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="17" y="14" width="4" height="6"/></svg>`
  },
  {
    value: 'bar',
    label: 'Çubuk',
    hint: 'Çok kategori, uzun etiketler için yatay karşılaştırma.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="14" height="4"/><rect x="3" y="10" width="10" height="4"/><rect x="3" y="16" width="17" height="4"/></svg>`
  },
  {
    value: 'line',
    label: 'Çizgi',
    hint: 'Zaman içindeki eğilim — sıralı kategoriler.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 17 8 11 12 14 20 5"/></svg>`
  },
  {
    value: 'area',
    label: 'Alan',
    hint: 'Dolgulu çizgi — eğilimi hacim hissiyle göster.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 17 8 11 12 14 20 5 20 20 3 20" fill="currentColor" fill-opacity="0.22" stroke="none"/><polyline points="3 17 8 11 12 14 20 5"/></svg>`
  },
  {
    value: 'pie',
    label: 'Pasta',
    hint: 'Tek aggregate, bütünün parçaları (az kategori).',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l7.79-4.5A9 9 0 0 0 12 3Z" fill="currentColor" stroke="none"/></svg>`
  },
  {
    value: 'donut',
    label: 'Donut',
    hint: 'Pasta gibi, ortada toplam etiketiyle.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="5"><circle cx="12" cy="12" r="7"/><path d="M12 5a7 7 0 0 1 6.06 10.5" stroke-width="5" stroke-linecap="round" opacity="0.55"/></svg>`
  },
  {
    value: 'radialBar',
    label: 'Radyal (Gösterge)',
    hint: 'Tek bir oranı/yüzdeyi gösterge gibi vurgula.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 16a8 8 0 0 1 16 0"/><path d="M12 16l4-4" stroke-linecap="round"/><circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none"/></svg>`
  },
  {
    value: 'kpi',
    label: 'KPI Kartı',
    hint: 'Tek büyük sayı — en önemli metriği öne çıkar.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 14l3-3 3 3 4-6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  },
  {
    value: 'table',
    label: 'Tablo',
    hint: 'Ham veri — satır/kolon listesi.',
    svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/></svg>`
  }
];

export function chartTypeMeta(value: ChartType): ChartTypeMeta | undefined {
  return CHART_TYPE_META.find(m => m.value === value);
}

/** Tek aggregate gerektiren tipler — birden çok aggregate seçiliyse builder'da uyarı gösterilir. */
export const SINGLE_AGGREGATE_CHART_TYPES: ChartType[] = ['pie', 'donut', 'radialBar', 'kpi'];
