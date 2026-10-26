/**
 * Tasarım token'larını (CSS custom property) ApexCharts'ın anlayacağı çözümlenmiş renk
 * string'lerine ("rgb(...)") köprüler. Hiçbir hex burada hard-code edilmez — her değer
 * çalışma anında `:root`/`:root[data-theme="dark"]`'tan okunur, böylece açık/koyu tema
 * değişince grafik paleti otomatik güncellenir.
 *
 * `color-mix(...)` gibi fonksiyon içeren token'lar (örn. --accent-hover) `getPropertyValue`
 * ile okunduğunda ham/çözümlenmemiş string döner; bunun önüne geçmek için görünmez bir
 * `<span>` üzerinde gerçek bir CSS özelliğine (`color`) atanıp tarayıcının hesapladığı
 * nihai `rgb(...)` değeri okunur.
 */
export interface ChartTokenColors {
  accent: string;
  accentHover: string;
  accentActive: string;
  success: string;
  warn: string;
  danger: string;
  meta: string;
  fg: string;
  fg2: string;
  muted: string;
  border: string;
  borderSoft: string;
  surface: string;
}

const TOKEN_VARS: Record<keyof ChartTokenColors, string> = {
  accent: '--accent',
  accentHover: '--accent-hover',
  accentActive: '--accent-active',
  success: '--success',
  warn: '--warn',
  danger: '--danger',
  meta: '--meta',
  fg: '--fg',
  fg2: '--fg-2',
  muted: '--muted',
  border: '--border',
  borderSoft: '--border-soft',
  surface: '--surface'
};

/** Bir CSS custom property'sinin nihai çözümlenmiş rengini döndürür (yalnızca tarayıcıda çağrılmalı). */
function resolveCssVarColor(varName: string): string {
  const probe = document.createElement('span');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.color = `var(${varName})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}

/** Son çözümlenen palet ve ait olduğu tema — bkz. readChartTokenColors. */
let cached: { theme: string; colors: ChartTokenColors } | null = null;

/**
 * Aktif temadaki tüm grafik renk token'larını çözümler. Yalnızca tarayıcıda çağır.
 *
 * Her token bir `getComputedStyle` (zorunlu stil hesabı) demek; dashboard'da her widget bunu
 * 13 kez yapıyordu. Değerler yalnız tema değişince değiştiği için sonuç `data-theme`'e göre
 * saklanır — tema değişince ilk okuma yeniden çözümler.
 */
export function readChartTokenColors(): ChartTokenColors {
  const theme = document.documentElement.getAttribute('data-theme') ?? '';
  if (cached?.theme === theme) return { ...cached.colors };

  const result = {} as ChartTokenColors;
  for (const [key, varName] of Object.entries(TOKEN_VARS) as [keyof ChartTokenColors, string][]) {
    result[key] = resolveCssVarColor(varName);
  }
  cached = { theme, colors: result };
  return { ...result };
}

/**
 * Kategorik seri paleti — tüm grafiklerde tutarlı, token'lardan türeyen sıra.
 * Not (a11y): renk burada tek ayırt edici sinyal değildir; her grafikte legend/dataLabels
 * her zaman açık tutulur (bkz. chart-mapping.ts).
 */
export function buildSeriesPalette(tokens: ChartTokenColors): string[] {
  return [
    tokens.accent,
    tokens.success,
    tokens.warn,
    tokens.danger,
    tokens.accentHover,
    tokens.meta,
    tokens.accentActive
  ];
}
