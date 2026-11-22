import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';

import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, debounceTime } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PublishedModelService, PublishedModel, PublishedColumn } from '../../services/published-model.service';
import { ReportService } from '../../services/report.service';
import { ResponseModel } from '../../models/responseModel';
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
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { aggregateAlias, reportColumnLabel } from '../../utils/report-column-label';
import { IconComponent } from '../shared/icon/icon.component';

/** `labelKey` — translated in the template with `| t` (see report.i18n.ts 'report.operator.*'). */
const OPERATORS: { value: ReportOperator; labelKey: string }[] = [
  { value: 'eq', labelKey: 'report.operator.eq' },
  { value: 'ne', labelKey: 'report.operator.ne' },
  { value: 'gt', labelKey: 'report.operator.gt' },
  { value: 'ge', labelKey: 'report.operator.ge' },
  { value: 'lt', labelKey: 'report.operator.lt' },
  { value: 'le', labelKey: 'report.operator.le' },
  { value: 'contains', labelKey: 'report.operator.contains' },
  { value: 'startswith', labelKey: 'report.operator.startswith' }
];

/** `labelKey` — translated in the template with `| t` (see report.i18n.ts 'report.aggregate.*'). */
const AGGREGATE_FUNCTIONS: { value: AggregateFunction; labelKey: string }[] = [
  { value: 'SUM', labelKey: 'report.aggregate.sum' },
  { value: 'COUNT', labelKey: 'report.aggregate.count' },
  { value: 'AVG', labelKey: 'report.aggregate.avg' },
  { value: 'MIN', labelKey: 'report.aggregate.min' },
  { value: 'MAX', labelKey: 'report.aggregate.max' }
];

/** `labelKey` — translated in the template with `| t` (see report.i18n.ts 'report.sort.*'). */
const SORT_DIRECTIONS: { value: SortDirection; labelKey: string }[] = [
  { value: 'ASC', labelKey: 'report.sort.asc' },
  { value: 'DESC', labelKey: 'report.sort.desc' }
];

/** Numeric column types — when generating preview data, tells which column is a series/category. */
function isNumericColumnType(type: string): boolean {
  return type === 'int' || type === 'long' || type === 'short' || type === 'byte'
      || type === 'float' || type === 'double' || type === 'decimal';
}

/** Date/time column types — for date formatting and chart category axes in the preview. */
function isDateColumnType(type: string): boolean {
  return type === 'datetime' || type === 'dateonly' || type === 'timeonly';
}

/**
 * Metadata-driven report designer: pick a model → define columns/filters/grouping/aggregates/sorting
 * → pick a chart type → save. Not a drag-and-drop designer, it is form based
 * (task scope: "Drag&drop later; form based is enough for now").
 *
 * Security: field/operator/aggregate/sort options are already generated here from a whitelist
 * (model columns + fixed lists); the backend ReportingManager revalidates the same whitelist
 * on the server side.
 */
@Component({
    selector: 'app-report-build',
    imports: [ReactiveFormsModule, RouterLink, AppChartComponent, TranslatePipe, IconComponent],
    templateUrl: './report-build.component.html',
    styleUrls: ['./report-build.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReportBuildComponent implements OnInit {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  private readonly languageService = inject(LanguageService);

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
    this.publishedModelService.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loadingModels = false;
        if (res.success) {
          this.models = res.data ?? [];
        } else {
          this.loadError = res.message ?? this.languageService.t('report.build.modelsLoadFailed');
        }
        this.maybeLoadExisting();
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadingModels = false;
        this.loadError = err?.error?.message ?? this.languageService.t('report.build.serverError');
      }
    });

    this.form.get('modelName')!.valueChanges.pipe(markDirty(this.cdr)).subscribe((modelName: string) => {
      this.applyModel(modelName, null);
    });

    // Live Preview is recomputed only when the form REALLY changes — since unrelated
    // clicks on the page don't trigger `form.valueChanges`, the chart doesn't re-render
    // needlessly (see plan: the "Live Preview is rebuilt on every click" bug).
    // While typing (report name, filter value) we wait 300 ms so the chart isn't redrawn on every
    // keystroke; changes to fields that don't affect the preview are filtered out in refreshPreview.
    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef), markDirty(this.cdr))
      .subscribe(() => this.refreshPreview());
    this.refreshPreview();
  }

  // ── Form field getters ──────────────────────────────────────────────────

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
   * Sort field options: if there is grouping/aggregation, the output schema
   * (grouping fields + aggregate aliases); otherwise the selected/all columns.
   * Must stay symmetric with ReportingManager.BuildProjection.
   */
  get outputFieldOptions(): string[] {
    const groupByFields = this.checkedColumnNames(this.groupByArray);
    const aggregates = this.aggregatesArray.value as ReportAggregate[];

    if (groupByFields.length > 0 || aggregates.length > 0) {
      const aggNames = aggregates
        .filter(a => a.function)
        .map(a => aggregateAlias(a));
      return [...groupByFields, ...aggNames];
    }

    const selected = this.checkedColumnNames(this.selectedColumnsArray);
    return selected.length > 0 ? selected : this.availableColumns.map(c => c.columnName);
  }

  /** Header shown in the sort list — the column label or "Toplam Net Tutar" (Total net amount). */
  fieldLabel(field: string): string {
    return reportColumnLabel(
      field, this.availableColumns, this.aggregatesArray.value as ReportAggregate[],
      (key, params) => this.languageService.t(key, params));
  }

  isNumericColumn(columnName: string): boolean {
    const col = this.availableColumns.find(c => c.columnName === columnName);
    return !!col && isNumericColumnType(col.dataType);
  }

  // ── Chart type picker ────────────────────────────────────────────────────

  selectChartType(value: ChartType): void {
    this.form.get('chartType')!.setValue(value);
  }

  /** Types like donut/pie/radial/KPI expect a single aggregate — warn the user if there are several. */
  get showSingleAggregateWarning(): boolean {
    const chartType = this.form.value.chartType as ChartType;
    return SINGLE_AGGREGATE_CHART_TYPES.includes(chartType) && this.aggregatesArray.length > 1;
  }

  /**
   * Produces a synthetic preview result from the builder's selections (groupBy/aggregate/selectedColumns)
   * — it doesn't call `/Report/run`, it shows how the selected chart type will look right away.
   * It is not real data.
   *
   * Kept as a signal and updated only from `form.valueChanges` (i.e. a real form
   * change) — if it were a getter, every change detection round (ANY click on the
   * page) would produce new array/object references and needlessly re-render
   * `app-chart`.
   */
  readonly previewResult = signal<ReportRunResult>({ columns: [], rows: [] });

  /** Indexes of rows marked "strike-through" (disabled) in the sample table — visual only, applied to synthetic data. */
  readonly struckPreviewRows = signal<Set<number>>(new Set());

  /** Signature of the last preview — to avoid republishing the same result and redrawing the chart for nothing. */
  private previewSignature = '';

  private refreshPreview(): void {
    const next = this.buildPreviewResult();
    // The preview is affected only by grouping/aggregate/column selection and the model; when the name, description,
    // filter or sort changes the result is the same and redrawing app-chart is unnecessary.
    const signature = JSON.stringify(next);
    if (signature === this.previewSignature) return;
    this.previewSignature = signature;
    this.previewResult.set(next);
    // The data shape may have changed (model/columns changed) — old row indexes become invalid.
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
      const aggCols = aggregates.map(a => ({ name: aggregateAlias(a), type: 'int' }));
      columns = [...groupCols, ...aggCols];
    } else if (selected.length > 0) {
      columns = selected.map(name => ({ name, type: this.columnDataType(name) }));
    } else {
      columns = this.availableColumns.slice(0, 4).map(c => ({ name: c.columnName, type: c.dataType }));
    }

    if (columns.length === 0) return { columns: [], rows: [] };

    // Make headers look the same as in the executed report (there the server generates them).
    columns = columns.map(col => ({ ...col, label: this.fieldLabel(col.name) }));

    // If the first column is numeric the chart can't find a category axis — add a synthetic category column.
    const categoryLabel = this.languageService.t('report.build.previewCategory');
    if (isNumericColumnType(columns[0].type)) {
      columns = [{ name: categoryLabel, type: 'string' }, ...columns];
    }

    const valueLabel = this.languageService.t('report.build.previewValue');
    const rowCount = 5;
    const rows: Record<string, unknown>[] = Array.from({ length: rowCount }, (_, i) => {
      const row: Record<string, unknown> = {};
      columns.forEach((col, ci) => {
        if (isNumericColumnType(col.type)) {
          row[col.name] = Math.round(20 + (i + 1) * 11 + ci * 7);
        } else if (isDateColumnType(col.type)) {
          row[col.name] = new Date(2025, 0, 1 + i * 7).toISOString();
        } else {
          row[col.name] = ci === 0 ? `${categoryLabel} ${i + 1}` : `${valueLabel} ${i + 1}`;
        }
      });
      return row;
    });

    return { columns, rows };
  }

  private columnDataType(columnName: string): string {
    return this.availableColumns.find(c => c.columnName === columnName)?.dataType ?? 'string';
  }

  // ── Filter rows ──────────────────────────────────────────────────────────

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

  // ── Aggregate rows ───────────────────────────────────────────────────────

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

  // ── Sort rows ────────────────────────────────────────────────────────────

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

  // ── Model change → rebuild column checkboxes ────────────────────────────

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

  // ── Edit mode: load the existing report ──────────────────────────────────

  private maybeLoadExisting(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) return;

    this.editingId = Number(idParam);
    this.loadingExisting = true;
    this.reportService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loadingExisting = false;
        const existing = (res.data ?? []).find(r => r.id === this.editingId);
        if (!existing) {
          this.loadError = this.languageService.t('report.build.notFoundOrNoAccess');
          return;
        }
        this.populateForm(existing);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loadingExisting = false;
        this.loadError = err?.error?.message ?? this.languageService.t('report.build.serverError');
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

  // ── Save ─────────────────────────────────────────────────────────────────

  /**
   * Validates the aggregate functions (all except COUNT require a field).
   * Returns the error message if invalid; null if valid.
   */
  private validateAggregates(aggregates: ReportAggregate[]): string | null {
    const invalidAggregate = aggregates.find(a => a.function !== 'COUNT' && !a.field);
    return invalidAggregate ? this.languageService.t('report.build.aggregateFieldRequired') : null;
  }

  /** Builds the report definition DTO to send to the backend from form values — shared path for save and SQL preview. */
  private buildPayload(): Partial<ReportDefinition> {
    return {
      id: this.editingId ?? 0,
      name: this.form.value.name,
      modelName: this.form.value.modelName,
      selectedColumns: this.checkedColumnNames(this.selectedColumnsArray),
      groupBy: this.checkedColumnNames(this.groupByArray),
      filters: this.filtersArray.value,
      aggregates: this.aggregatesArray.value as ReportAggregate[],
      sortBy: this.sortByArray.value,
      chartType: this.form.value.chartType
    };
  }

  onSubmit(): void {
    this.submitError = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const payload = this.buildPayload();
    const aggregateError = this.validateAggregates(payload.aggregates as ReportAggregate[]);
    if (aggregateError) {
      this.submitError = aggregateError;
      return;
    }

    this.saving = true;
    // define() returns DataResponseModel<number>, update() returns ResponseModel; since this
    // screen doesn't use the ID it is narrowed to the common base type (otherwise the union
    // type breaks .pipe() resolution).
    const request: Observable<ResponseModel> = this.editingId
      ? this.reportService.update(payload as ReportDefinition)
      : this.reportService.define(payload);

    request.pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) {
          this.router.navigate(['/reports']);
        } else {
          this.submitError = res.message ?? this.languageService.t('report.build.saveFailed');
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('report.build.serverError');
      }
    });
  }

  // ── SQL preview ──────────────────────────────────────────────────────────

  readonly sqlPreview = signal('');
  readonly sqlPreviewLoading = signal(false);
  readonly sqlPreviewError = signal<string | null>(null);

  /** Fetches the SQL the backend would generate for the current form selections — doesn't run it, only shows it. */
  previewSql(): void {
    this.sqlPreviewError.set(null);

    if (!this.form.value.modelName) {
      this.sqlPreviewError.set(this.languageService.t('report.build.sqlPreviewSelectModelFirst'));
      return;
    }

    const payload = this.buildPayload();
    const aggregateError = this.validateAggregates(payload.aggregates as ReportAggregate[]);
    if (aggregateError) {
      this.sqlPreviewError.set(aggregateError);
      return;
    }

    this.sqlPreviewLoading.set(true);
    this.sqlPreview.set('');

    this.reportService.previewSql(payload).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.sqlPreviewLoading.set(false);
        if (res.success) {
          this.sqlPreview.set(res.data ?? '');
        } else {
          this.sqlPreviewError.set(res.message ?? this.languageService.t('report.build.sqlPreviewFailed'));
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.sqlPreviewLoading.set(false);
        this.sqlPreviewError.set(err?.error?.message ?? this.languageService.t('report.build.serverError'));
      }
    });
  }
}
