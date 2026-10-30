import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApexChartComponent } from './apex-chart.component';

/** Gerçek ApexCharts ile: çizer, seçenek değişince yeniden çizer, yok edilince temizler. */
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
    expect(condition()).withContext('süre doldu').toBeTrue();
  }

  beforeEach(() => {
    fixture = TestBed.createComponent(ApexChartComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });

  afterEach(() => host.remove());

  it('grafiği çizer', async () => {
    fixture.componentRef.setInput('options', options('ilk'));
    fixture.detectChanges();

    await until(() => !!host.querySelector('.apexcharts-canvas svg'));
  });

  it('seçenek değişince tek grafik kalır', async () => {
    fixture.componentRef.setInput('options', options('ilk'));
    fixture.detectChanges();
    await until(() => !!host.querySelector('.apexcharts-canvas'));

    fixture.componentRef.setInput('options', options('ikinci'));
    fixture.detectChanges();
    await until(() => host.querySelector('.apexcharts-series')?.getAttribute('seriesName') === 'ikinci');

    expect(host.querySelectorAll('.apexcharts-canvas').length).toBe(1);
  });

  it('kütüphane yüklenirken gelen son seçenek kazanır', async () => {
    fixture.componentRef.setInput('options', options('eski'));
    fixture.detectChanges();
    fixture.componentRef.setInput('options', options('yeni'));
    fixture.detectChanges();

    await until(() => host.querySelector('.apexcharts-series')?.getAttribute('seriesName') === 'yeni');
    expect(host.querySelectorAll('.apexcharts-canvas').length).toBe(1);
  });

  it('yok edilince grafiği temizler', async () => {
    fixture.componentRef.setInput('options', options('ilk'));
    fixture.detectChanges();
    await until(() => !!host.querySelector('.apexcharts-canvas svg'));

    fixture.destroy();

    expect(host.querySelector('.apexcharts-canvas svg')).toBeNull();
  });
});
