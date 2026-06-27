import { Component, PLATFORM_ID, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChartComponent as ApexChartComponent } from 'ng-apexcharts';
import { ChartType, ReportColumnInfo } from '../../models/report.model';
import { ThemeService } from '../../services/theme.service';
import { ChartTokenColors, readChartTokenColors } from './chart-colors';
import { ChartBuildOutput, buildChartOptions, buildKpiOutput } from './chart-mapping';
import { chartTypeMeta } from './chart-types';

const trNumber = new Intl.NumberFormat('tr-TR');

/**
 * Tüm zorunlu grafik tiplerinin (column/bar/line/area/pie/donut/radialBar/kpi) TEK render
 * noktası. ChartType + veri → `chart-mapping.ts`'teki `buildChartOptions`/`buildKpiOutput`
 * üzerinden ApexOptions'a eşlenir; bu component ad-hoc dönüşüm yapmaz. Tema değişince
 * (`ThemeService.theme`) palet `getComputedStyle` ile token'lardan yeniden okunur.
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [ApexChartComponent],
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss']
})
export class AppChartComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly themeService = inject(ThemeService);

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

    return this.chartType() === 'kpi'
      ? buildKpiOutput(result, tokens, mode)
      : buildChartOptions(this.chartType(), result, tokens, mode);
  });

  readonly typeLabel = computed(() => chartTypeMeta(this.chartType())?.label ?? this.chartType());

  readonly ariaSummary = computed(() => {
    const b = this.build();
    if (!b || b.isEmpty) return `${this.typeLabel()} grafiği — veri yok.`;
    return `${this.typeLabel()} grafiği — ${this.rows().length} kayıt, ${this.columns().length} kolon.`;
  });

  readonly kpiValueFormatted = computed(() => {
    const kpi = this.build()?.kpi;
    return kpi ? trNumber.format(kpi.value) : '';
  });
}
