import { ChangeDetectionStrategy, Component, computed, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ApexChartComponent } from '../shared/apex-chart/apex-chart.component';
import { ChartType, ReportColumnInfo } from '../../models/report.model';
import { ThemeService } from '../../services/theme.service';
import { LanguageService } from '../../services/language.service';
import { ChartTokenColors, readChartTokenColors } from './chart-colors';
import { ChartBuildOutput, buildChartOptions, buildKpiOutput, toApexOptions, toSparklineOptions } from './chart-mapping';
import { chartTypeMeta } from './chart-types';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { formatNumber } from '../../utils/locale-format';


/**
 * The SINGLE render point for all required chart types (column/bar/line/area/pie/donut/radialBar/kpi).
 * ChartType + data → mapped to ApexOptions via `buildChartOptions`/`buildKpiOutput` in
 * `chart-mapping.ts`; this component does no ad-hoc conversion. When the theme changes
 * (`ThemeService.theme`) the palette is re-read from the tokens with `getComputedStyle`.
 */
@Component({
    selector: 'app-chart',
    imports: [ApexChartComponent, TranslatePipe],
    templateUrl: './chart.component.html',
    styleUrls: ['./chart.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppChartComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);

  chartType = input.required<ChartType>();
  columns = input.required<ReportColumnInfo[]>();
  rows = input.required<Record<string, unknown>[]>();
  /** The parent component's async data-fetch state — the chart does not fetch data on its own. */
  loading = input<boolean>(false);
  /** Error message from the parent component (e.g. a widget the user has no access to on a dashboard). */
  error = input<string | null>(null);

  private readonly tokens = signal<ChartTokenColors | null>(null);

  /** Re-reads the tokens when the theme changes (light/dark) — the chart palette updates automatically. */
  private readonly syncTokens = effect(() => {
    this.themeService.theme();
    if (this.isBrowser) {
      this.tokens.set(readChartTokenColors());
    }
  });

  readonly build = computed<ChartBuildOutput | null>(() => {
    const tokens = this.tokens();
    if (!tokens || this.chartType() === 'table') return null;

    const mode = this.themeService.theme();
    const result = { columns: this.columns(), rows: this.rows() };
    // Language context: text + number/date format come from the same source.
    // Since lang() is a signal, the chart is rebuilt automatically when the language changes.
    const locale = {
      t: this.languageService.t.bind(this.languageService),
      lang: this.languageService.lang()
    };

    return this.chartType() === 'kpi'
      ? buildKpiOutput(result, tokens, mode, locale)
      : buildChartOptions(this.chartType(), result, tokens, mode, locale);
  });

  /** Single reference: the chart must not be redrawn unless `build` changes. */
  readonly apexOptions = computed(() => {
    const build = this.build();
    if (!build) return null;
    return this.chartType() === 'kpi' ? toSparklineOptions(build) : toApexOptions(build);
  });

  readonly typeLabel = computed(() => {
    const key = chartTypeMeta(this.chartType())?.labelKey;
    return key ? this.languageService.t(key) : this.chartType();
  });

  readonly ariaSummary = computed(() => {
    const b = this.build();
    if (!b || b.isEmpty) return this.languageService.t('chart.ariaNoData', { type: this.typeLabel() });
    return this.languageService.t('chart.ariaSummary', {
      type: this.typeLabel(),
      rows: this.rows().length,
      cols: this.columns().length
    });
  });

  readonly kpiValueFormatted = computed(() => {
    const kpi = this.build()?.kpi;
    return kpi ? formatNumber(kpi.value, this.languageService.lang()) : '';
  });
}
