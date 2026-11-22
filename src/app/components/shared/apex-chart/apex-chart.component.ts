import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, effect, inject, input } from '@angular/core';
import type ApexCharts from 'apexcharts';

/**
 * Thin wrapper around ApexCharts. ng-apexcharts is not used: its versions supporting Angular 21+
 * require a commercial (OEM) license for embedded products. The same condition applies to apexcharts 5.1+,
 * so package.json pins the exact version 4.7.0 (MIT); do not upgrade.
 *
 * The library loads with the first chart and stays in its own chunk.
 */
@Component({
  selector: 'app-apex-chart',
  template: '',
  styles: ':host { display: block; }',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApexChartComponent {
  readonly options = input.required<ApexCharts.ApexOptions>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private chart: ApexCharts | null = null;

  /** A new option arriving or destruction while the library loads cancels the stale render. */
  private drawId = 0;

  constructor() {
    effect(() => {
      const options = this.options();
      // The chart's animation and mouse events must not trigger change detection.
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
