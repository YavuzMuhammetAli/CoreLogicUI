import { Component, Input, OnChanges } from '@angular/core';
import {
  ChartComponent as ApexChartComponent,
  ApexAxisChartSeries,
  ApexNonAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexLegend
} from 'ng-apexcharts';
import { ChartType, ReportColumnInfo } from '../../models/report.model';

/**
 * Rapor sonucunu (kolonlar + satırlar) seçilen ChartType'a göre ApexCharts grafiğine çevirir.
 * Kural: ilk kolon kategori/etiket ekseni; sayısal kolonlar seri olarak kullanılır
 * (ReportingManager.BuildProjection'ın ürettiği şema ile simetrik — aggregate alias'ları
 * da birer sayısal "kolon" olarak gelir).
 */
@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [ApexChartComponent],
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss']
})
export class AppChartComponent implements OnChanges {
  @Input({ required: true }) chartType: ChartType = 'bar';
  @Input({ required: true }) columns: ReportColumnInfo[] = [];
  @Input({ required: true }) rows: Record<string, unknown>[] = [];

  series: ApexAxisChartSeries | ApexNonAxisChartSeries = [];
  labels: string[] = [];
  chartOptions: ApexChart = { type: 'bar', height: 360 };
  xaxis: ApexXAxis = {};
  legend: ApexLegend = { position: 'bottom' };

  ngOnChanges(): void {
    this.build();
  }

  private isNumeric(type: string): boolean {
    return type === 'int' || type === 'float' || type === 'decimal';
  }

  private build(): void {
    if (this.columns.length === 0 || this.rows.length === 0) {
      this.series = [];
      this.labels = [];
      return;
    }

    const categoryCol = this.columns[0];
    const numericCols = this.columns.filter(c => this.isNumeric(c.type) && c.name !== categoryCol.name);
    const valueCols = numericCols.length > 0 ? numericCols : this.columns.slice(1);
    const categories = this.rows.map(r => String(r[categoryCol.name] ?? ''));

    if (this.chartType === 'pie') {
      const valueCol = valueCols[0];
      this.labels = categories;
      this.series = valueCol ? this.rows.map(r => Number(r[valueCol.name] ?? 0)) : [];
      this.chartOptions = { type: 'pie', height: 360 };
    } else {
      this.labels = [];
      this.series = valueCols.map(col => ({
        name: col.name,
        data: this.rows.map(r => Number(r[col.name] ?? 0))
      }));
      this.xaxis = { categories };
      this.chartOptions = {
        type: this.chartType === 'area' ? 'area' : this.chartType === 'line' ? 'line' : 'bar',
        height: 360
      };
    }
  }
}
