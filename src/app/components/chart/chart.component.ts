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
 * Tüm zorunlu grafik tiplerinin (column/bar/line/area/pie/donut/radialBar/kpi) TEK render
 * noktası. ChartType + veri → `chart-mapping.ts`'teki `buildChartOptions`/`buildKpiOutput`
 * üzerinden ApexOptions'a eşlenir; bu component ad-hoc dönüşüm yapmaz. Tema değişince
 * (`ThemeService.theme`) palet `getComputedStyle` ile token'lardan yeniden okunur.
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
  /** Üst component'in async veri çekme durumu — chart kendi adına ayrıca veri çekmez. */
  loading = input<boolean>(false);
  /** Üst component'ten gelen hata mesajı (örn. dashboard'da erişimi olmayan widget). */
  error = input<string | null>(null);

  private readonly tokens = signal<ChartTokenColors | null>(null);

  /** Tema değişince (light/dark) token'ları yeniden okur — grafik paleti otomatik güncellenir. */
  private readonly syncTokens = effect(() => {
    this.themeService.theme();
    if (this.isBrowser) {
      this.tokens.set(readChartTokenColors());
    }
  }, { allowSignalWrites: true });

  readonly build = computed<ChartBuildOutput | null>(() => {
    const tokens = this.tokens();
    if (!tokens || this.chartType() === 'table') return null;

    const mode = this.themeService.theme();
    const result = { columns: this.columns(), rows: this.rows() };
    // Dil bağlamı: metin + sayı/tarih biçimi aynı kaynaktan gelir.
    // lang() bir signal olduğu için dil değişince grafik otomatik yeniden kurulur.
    const locale = {
      t: this.languageService.t.bind(this.languageService),
      lang: this.languageService.lang()
    };

    return this.chartType() === 'kpi'
      ? buildKpiOutput(result, tokens, mode, locale)
      : buildChartOptions(this.chartType(), result, tokens, mode, locale);
  });

  /** Tek referans: `build` değişmedikçe grafik yeniden çizilmesin. */
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
