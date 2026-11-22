import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApexChartComponent } from './apex-chart.component';

/** With real ApexCharts: renders, re-renders when options change, cleans up on destroy. */
describe('ApexChartComponent', () => {
  let fixture: ComponentFixture<ApexChartComponent>;
  let host: HTMLElement;

  const options = (name: string) => ({
    chart: { type: 'bar' as const, height: 200, animations: { enabled: false } },
    series: [{ name, data: [1, 2, 3] }],
    xaxis: { categories: ['a', 'b', 'c'] }
  });

  async function until(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !condition(); i++) await new Promise(res => setTimeout(res, 10));
    expect(condition()).withContext('timed out').toBeTrue();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ApexChartComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  it('renders the chart', async () => {
    fixture.componentRef.setInput('options', options('ilk'));
    fixture.detectChanges();

    await until(() => !!host.querySelector('.apexcharts-canvas svg'));
  });

  it('keeps a single chart when options change', async () => {
    fixture.componentRef.setInput('options', options('ilk'));
    fixture.detectChanges();
    await until(() => !!host.querySelector('.apexcharts-canvas'));

    fixture.componentRef.setInput('options', options('ikinci'));
    fixture.detectChanges();
    await until(() => host.querySelector('.apexcharts-series')?.getAttribute('seriesName') === 'ikinci');

    expect(host.querySelectorAll('.apexcharts-canvas').length).toBe(1);
  });

  it('the last option arriving while the library loads wins', async () => {
    fixture.componentRef.setInput('options', options('eski'));
    fixture.detectChanges();
    fixture.componentRef.setInput('options', options('yeni'));
    fixture.detectChanges();

    await until(() => host.querySelector('.apexcharts-series')?.getAttribute('seriesName') === 'yeni');
    expect(host.querySelectorAll('.apexcharts-canvas').length).toBe(1);
  });

  it('cleans up the chart on destroy', async () => {
    fixture.componentRef.setInput('options', options('ilk'));
    fixture.detectChanges();
    await until(() => !!host.querySelector('.apexcharts-canvas svg'));

    fixture.destroy();

    expect(host.querySelector('.apexcharts-canvas svg')).toBeNull();
  });
});
