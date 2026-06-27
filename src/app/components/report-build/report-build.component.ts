import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublishedModelService, PublishedModel, PublishedColumn } from '../../services/published-model.service';
import { ReportService } from '../../services/report.service';
import {
  AggregateFunction,
  ChartType,
  ReportAggregate,
  ReportColumnInfo,
  ReportDefinition,
  ReportFilter,
  ReportOperator,
  ReportRunResult,
  ReportSort,
  SortDirection
} from '../../models/report.model';
import { AppChartComponent } from '../chart/chart.component';
import { CHART_TYPE_META, SINGLE_AGGREGATE_CHART_TYPES } from '../chart/chart-types';

const OPERATORS: { value: ReportOperator; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'ge', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'le', label: '≤' },
  { value: 'contains', label: 'içerir' },
  { value: 'startswith', label: 'ile başlar' }
];

const AGGREGATE_FUNCTIONS: { value: AggregateFunction; label: string }[] = [
  { value: 'SUM', label: 'Toplam (SUM)' },
  { value: 'COUNT', label: 'Sayı (COUNT)' },
  { value: 'AVG', label: 'Ortalama (AVG)' },
  { value: 'MIN', label: 'Minimum (MIN)' },
  { value: 'MAX', label: 'Maksimum (MAX)' }
];

const SORT_DIRECTIONS: { value: SortDirection; label: string }[] = [
  { value: 'ASC', label: 'Artan (A→Z, 0→9)' },
  { value: 'DESC', label: 'Azalan (Z→A, 9→0)' }
];

/** Sayısal kolon tipleri — önizleme verisi üretirken hangi kolonun seri/kategori olduğunu ayırt eder. */
function isNumericColumnType(type: string): boolean {
  return type === 'int' || type === 'float' || type === 'decimal';
}

/**
 * Metadata-driven rapor tasarımcısı: model seç → kolon/filtre/gruplama/aggregate/sıralama
 * tanımla → grafik tipi seç → kaydet. Sürüklenebilir bir tasarımcı değil, form tabanlıdır
 * (görev kapsamı: "Drag&drop ileride; şimdilik form tabanlı yeterli").
 *
 * Güvenlik: alan/operatör/aggregate/sıralama seçenekleri burada zaten whitelist'ten
 * (model kolonları + sabit listeler) üretilir; backend ReportingManager aynı whitelist'i
 * sunucu tarafında yeniden doğrular.
 */
@Component({
  selector: 'app-report-build',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, AppChartComponent],
  templateUrl: './report-build.component.html',
  styleUrls: ['./report-build.component.scss']
})
export class ReportBuildComponent implements OnInit {
  readonly operators = OPERATORS;
  readonly aggregateFunctions = AGGREGATE_FUNCTIONS;
  readonly sortDirections = SORT_DIRECTIONS;
  readonly chartTypes = CHART_TYPE_META;

  models: PublishedModel[] = [];
  availableColumns: PublishedColumn[] = [];

  editingId: number | null = null;
  loadingModels = false;
  loadingExisting = false;
  saving = false;
  loadError: string | null = null;
  submitError: string | null = null;

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private publishedModelService: PublishedModelService,
    private reportService: ReportService,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      id: [0],
      name: ['', Validators.required],
      modelName: ['', Validators.required],
      chartType: ['table' as ChartType, Validators.required],
      selectedColumns: this.fb.array<FormControl<boolean>>([]),
      groupBy: this.fb.array<FormControl<boolean>>([]),
      filters: this.fb.array<FormGroup>([]),
      aggregates: this.fb.array<FormGroup>([]),
      sortBy: this.fb.array<FormGroup>([])
    });
  }

  ngOnInit(): void {
    this.loadingModels = true;
    this.publishedModelService.getModels().subscribe({
      next: res => {
        this.loadingModels = false;
        if (res.success) {
          this.models = res.data ?? [];
        } else {
          this.loadError = res.message ?? 'Modeller yüklenemedi.';
        }
        this.maybeLoadExisting();
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadingModels = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });

    this.form.get('modelName')!.valueChanges.subscribe((modelName: string) => {
      this.applyModel(modelName, null);
    });

    // Canlı Önizleme yalnızca form GERÇEKTEN değiştiğinde yeniden hesaplanır — sayfadaki
    // ilgisiz tıklamalar `form.valueChanges`'i tetiklemediği için grafik gereksiz yeniden
    // render olmaz (bkz. plan: "Canlı Önizleme her tıklamada yeniden oluşuyor" hatası).
    this.form.valueChanges.subscribe(() => this.refreshPreview());
    this.refreshPreview();
  }

  // ── Form alanları getter'ları ───────────────────────────────────────────

  get f() {
    return this.form.controls;
  }

  get selectedColumnsArray(): FormArray {
    return this.form.get('selectedColumns') as FormArray;
  }

  get groupByArray(): FormArray {
    return this.form.get('groupBy') as FormArray;
  }

  get filtersArray(): FormArray {
    return this.form.get('filters') as FormArray;
  }

  get aggregatesArray(): FormArray {
    return this.form.get('aggregates') as FormArray;
  }

  get sortByArray(): FormArray {
    return this.form.get('sortBy') as FormArray;
  }

  /**
   * Sıralama alanı seçenekleri: gruplama/aggregate varsa çıkış şeması
   * (grupla­ma alanları + aggregate alias'ları); yoksa seçilen/tüm kolonlar.
   * ReportingManager.BuildProjection ile simetrik olmalıdır.
   */
  get outputFieldOptions(): string[] {
    const groupByFields = this.checkedColumnNames(this.groupByArray);
    const aggregates = this.aggregatesArray.value as ReportAggregate[];

    if (groupByFields.length > 0 || aggregates.length > 0) {
      const aggNames = aggregates
        .filter(a => a.function)
        .map(a => `${a.function}_${a.field || 'All'}`);
      return [...groupByFields, ...aggNames];
    }

    const selected = this.checkedColumnNames(this.selectedColumnsArray);
    return selected.length > 0 ? selected : this.availableColumns.map(c => c.columnName);
  }

  isNumericColumn(columnName: string): boolean {
    const col = this.availableColumns.find(c => c.columnName === columnName);
    return col?.dataType === 'int' || col?.dataType === 'float' || col?.dataType === 'decimal';
  }

  // ── Grafik tipi seçici ───────────────────────────────────────────────────

  selectChartType(value: ChartType): void {
    this.form.get('chartType')!.setValue(value);
  }

  /** Donut/pasta/radyal/KPI gibi tipler tek aggregate bekler — birden çoksa kullanıcıyı uyar. */
  get showSingleAggregateWarning(): boolean {
    const chartType = this.form.value.chartType as ChartType;
    return SINGLE_AGGREGATE_CHART_TYPES.includes(chartType) && this.aggregatesArray.length > 1;
  }

  /**
   * Builder'daki seçimlerden (groupBy/aggregate/selectedColumns) sentetik bir önizleme
   * sonucu üretir — `/Report/run`'a gitmez, seçili grafik tipinin anında nasıl görüneceğini
   * gösterir. Gerçek veri değildir.
   *
   * Signal olarak tutulur ve yalnızca `form.valueChanges`'ten (yani gerçek bir form
   * değişikliğinden) güncellenir — bir getter olsaydı her change detection turunda (sayfadaki
   * HERHANGİ bir tıklamada) yeni dizi/nesne referansları üretip `app-chart`'ı gereksiz yere
   * yeniden render ettirirdi.
   */
  readonly previewResult = signal<ReportRunResult>({ columns: [], rows: [] });

  /** Örnek tabloda "üstü çizili" (devre dışı) işaretlenmiş satırların indeksleri — yalnızca görsel, sentetik veriye uygulanır. */
  readonly struckPreviewRows = signal<Set<number>>(new Set());

  private refreshPreview(): void {
    this.previewResult.set(this.buildPreviewResult());
    // Veri şekli değişmiş olabilir (model/kolon değişti) — eski satır indeksleri geçersiz olur.
    this.struckPreviewRows.set(new Set());
  }

  toggleStruckPreviewRow(index: number): void {
    this.struckPreviewRows.update(set => {
      const next = new Set(set);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  private buildPreviewResult(): ReportRunResult {
    const groupByNames = this.checkedColumnNames(this.groupByArray);
    const aggregates = (this.aggregatesArray.value as ReportAggregate[]).filter(a => a.function);
    const selected = this.checkedColumnNames(this.selectedColumnsArray);

    let columns: ReportColumnInfo[];
    if (groupByNames.length > 0 || aggregates.length > 0) {
      const groupCols = groupByNames.map(name => ({ name, type: this.columnDataType(name) }));
      const aggCols = aggregates.map(a => ({ name: `${a.function}_${a.field || 'All'}`, type: 'int' }));
      columns = [...groupCols, ...aggCols];
    } else if (selected.length > 0) {
      columns = selected.map(name => ({ name, type: this.columnDataType(name) }));
    } else {
      columns = this.availableColumns.slice(0, 4).map(c => ({ name: c.columnName, type: c.dataType }));
    }

    if (columns.length === 0) return { columns: [], rows: [] };

    // İlk kolon sayısalsa grafik kategori ekseni bulamaz — sentetik bir kategori kolonu ekle.
    if (isNumericColumnType(columns[0].type)) {
      columns = [{ name: 'Kategori', type: 'string' }, ...columns];
    }

    const rowCount = 5;
    const rows: Record<string, unknown>[] = Array.from({ length: rowCount }, (_, i) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, ci) => {
        if (isNumericColumnType(col.type)) {
          row[col.name] = Math.round(20 + (i + 1) * 11 + ci * 7);
        } else if (col.type === 'datetime') {
          row[col.name] = new Date(2025, 0, 1 + i * 7).toISOString();
        } else {
          row[col.name] = ci === 0 ? `Kategori ${i + 1}` : `Değer ${i + 1}`;
        }
      });
      return row;
    });

    return { columns, rows };
  }

  private columnDataType(columnName: string): string {
    return this.availableColumns.find(c => c.columnName === columnName)?.dataType ?? 'string';
  }

  // ── Filtre satırları ─────────────────────────────────────────────────────

  addFilter(): void {
    this.filtersArray.push(this.newFilterGroup());
  }

  removeFilter(index: number): void {
    this.filtersArray.removeAt(index);
  }

  private newFilterGroup(filter?: ReportFilter): FormGroup {
    return this.fb.group({
      field: [filter?.field ?? '', Validators.required],
      operator: [filter?.operator ?? ('eq' as ReportOperator), Validators.required],
      value: [filter?.value ?? '']
    });
  }

  // ── Aggregate satırları ──────────────────────────────────────────────────

  addAggregate(): void {
    this.aggregatesArray.push(this.newAggregateGroup());
  }

  removeAggregate(index: number): void {
    this.aggregatesArray.removeAt(index);
  }

  private newAggregateGroup(agg?: ReportAggregate): FormGroup {
    return this.fb.group({
      field: [agg?.field ?? ''],
      function: [agg?.function ?? ('COUNT' as AggregateFunction), Validators.required]
    });
  }

  // ── Sıralama satırları ───────────────────────────────────────────────────

  addSort(): void {
    this.sortByArray.push(this.newSortGroup());
  }

  removeSort(index: number): void {
    this.sortByArray.removeAt(index);
  }

  private newSortGroup(sort?: ReportSort): FormGroup {
    return this.fb.group({
      field: [sort?.field ?? '', Validators.required],
      direction: [sort?.direction ?? ('ASC' as SortDirection), Validators.required]
    });
  }

  // ── Model değişimi → kolon checkbox'larını yeniden kur ──────────────────

  private applyModel(modelName: string, existing: ReportDefinition | null): void {
    const model = this.models.find(m => m.typeName === modelName);
    this.availableColumns = model?.columns ?? [];

    const selectedColumns = this.fb.array(
      this.availableColumns.map(c =>
        this.fb.control(existing?.selectedColumns?.includes(c.columnName) ?? false)
      )
    );
    const groupBy = this.fb.array(
      this.availableColumns.map(c =>
        this.fb.control(existing?.groupBy?.includes(c.columnName) ?? false)
      )
    );
    this.form.setControl('selectedColumns', selectedColumns);
    this.form.setControl('groupBy', groupBy);

    this.form.setControl('filters', this.fb.array((existing?.filters ?? []).map(f => this.newFilterGroup(f))));
    this.form.setControl('aggregates', this.fb.array((existing?.aggregates ?? []).map(a => this.newAggregateGroup(a))));
    this.form.setControl('sortBy', this.fb.array((existing?.sortBy ?? []).map(s => this.newSortGroup(s))));
  }

  private checkedColumnNames(formArray: FormArray): string[] {
    return this.availableColumns
      .filter((_, i) => formArray.at(i)?.value === true)
      .map(c => c.columnName);
  }

  // ── Düzenleme modu: mevcut raporu yükle ──────────────────────────────────

  private maybeLoadExisting(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) return;

    this.editingId = Number(idParam);
    this.loadingExisting = true;
    this.reportService.list().subscribe({
      next: res => {
        this.loadingExisting = false;
        const existing = (res.data ?? []).find(r => r.id === this.editingId);
        if (!existing) {
          this.loadError = 'Rapor bulunamadı veya erişim yetkiniz yok.';
          return;
        }
        this.populateForm(existing);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadingExisting = false;
        this.loadError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  private populateForm(report: ReportDefinition): void {
    this.form.patchValue(
      { id: report.id, name: report.name, modelName: report.modelName, chartType: report.chartType },
      { emitEvent: false }
    );
    this.applyModel(report.modelName, report);
  }

  // ── Kaydet ───────────────────────────────────────────────────────────────

  onSubmit(): void {
    this.submitError = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const aggregates = this.aggregatesArray.value as ReportAggregate[];
    const invalidAggregate = aggregates.find(a => a.function !== 'COUNT' && !a.field);
    if (invalidAggregate) {
      this.submitError = 'COUNT dışındaki aggregate fonksiyonları için bir alan seçilmelidir.';
      return;
    }

    const payload: Partial<ReportDefinition> = {
      id: this.editingId ?? 0,
      name: this.form.value.name,
      modelName: this.form.value.modelName,
      selectedColumns: this.checkedColumnNames(this.selectedColumnsArray),
      groupBy: this.checkedColumnNames(this.groupByArray),
      filters: this.filtersArray.value,
      aggregates,
      sortBy: this.sortByArray.value,
      chartType: this.form.value.chartType
    };

    this.saving = true;
    const request = this.editingId
      ? this.reportService.update(payload as ReportDefinition)
      : this.reportService.define(payload);

    request.subscribe({
      next: res => {
        this.saving = false;
        if (res.success) {
          this.router.navigate(['/reports']);
        } else {
          this.submitError = res.message ?? 'Rapor kaydedilemedi.';
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving = false;
        this.submitError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }
}
