/**
 * Bridges design tokens (CSS custom properties) to resolved colour strings ("rgb(...)") that
 * ApexCharts understands. No hex is hard-coded here — every value is read at runtime
 * from `:root`/`:root[data-theme="dark"]`, so the chart palette updates automatically when the
 * light/dark theme changes.
 *
 * Tokens containing functions such as `color-mix(...)` (e.g. --accent-hover) return a raw/unresolved
 * string when read with `getPropertyValue`; to avoid this they are assigned to a real CSS property
 * (`color`) on an invisible `<span>` and the final `rgb(...)` value computed by the browser
 * is read.
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

/** Returns the final resolved colour of a CSS custom property (call only in the browser). */
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

/** The last resolved palette and the theme it belongs to — see readChartTokenColors. */
let cached: { theme: string; colors: ChartTokenColors } | null = null;

/**
 * Resolves all chart colour tokens in the active theme. Call only in the browser.
 *
 * Each token means one `getComputedStyle` (a forced style computation); on a dashboard every widget did this
 * 13 times. Since the values only change when the theme changes, the result is cached per `data-theme`
 * — after a theme change the first read resolves again.
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
 * Categorical series palette — consistent across all charts, an order derived from tokens.
 * Note (a11y): colour is not the only distinguishing signal here; legend/dataLabels are
 * always kept on in every chart (see chart-mapping.ts).
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
