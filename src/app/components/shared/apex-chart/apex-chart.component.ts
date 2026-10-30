import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, effect, inject, input } from '@angular/core';
import type ApexCharts from 'apexcharts';

/**
 * ApexCharts'ın ince sarmalayıcısı. ng-apexcharts kullanılmaz: Angular 21+ destekleyen sürümleri
 * gömülü ürünlerde ticari lisans (OEM) ister. Aynı şart apexcharts 5.1+ için de geçerli olduğundan
 * package.json'da 4.7.0 (MIT) tam sürüm sabittir, yükseltilmez.
 *
 * Kütüphane ilk grafikte yüklenir ve kendi parçasında kalır.
 */
@Component({
  selector: 'app-apex-chart',
  standalone: true,
  template: '',
  styles: ':host { display: block; }',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApexChartComponent {
  readonly options = input.required<ApexCharts.ApexOptions>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private chart: ApexCharts | null = null;

  /** Kütüphane yüklenirken gelen yeni seçenek ya da yok edilme eski çizimi iptal eder. */
  private drawId = 0;

  constructor() {
    effect(() => {
      const options = this.options();
      // Grafiğin animasyon ve fare olayları change detection tetiklemesin.
      this.zone.runOutsideAngular(() => void this.draw(options));
    });

    inject(DestroyRef).onDestroy(() => {
      this.drawId++;
      this.chart?.destroy();
      this.chart = null;
    });
  }

  private async draw(options: ApexCharts.ApexOptions): Promise<void> {
    const drawId = ++this.drawId;
    const { default: ApexChartsClass } = await import('apexcharts');
    if (drawId !== this.drawId) return;

    this.chart?.destroy();
    this.chart = new ApexChartsClass(this.host.nativeElement, options);
    await this.chart.render();
  }
}
