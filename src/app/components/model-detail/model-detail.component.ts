import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { PublishedModelService, PublishedModel, PublishedColumn } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import {
  inputTypeFor,
  isImage,
  imageSrc,
  isBase64Value,
  downloadFile
} from '../model-data/model-data.util';

type DataRow = Record<string, unknown>;

/** Bir alt model sekmesinin tüm durumu */
interface TabState {
  typeName: string;
  columns: PublishedColumn[];
  fkColumn: string;

  rows: DataRow[];
  loading: boolean;
  error: string | null;

  searchTerm: string;
  sortCol: string;
  sortDir: 'asc' | 'desc';

  formMode: 'none' | 'add' | 'edit';
  editingRow: DataRow | null;
  form: FormGroup | null;
  formLoading: boolean;
  formMsg: string | null;
  formOk: boolean | null;
  fileNames: Record<string, string>;
}

@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './model-detail.component.html',
  styleUrls: ['./model-detail.component.scss']
})
export class ModelDetailComponent implements OnInit, OnDestroy {
  typeName = '';
  recordId = 0;

  // Üst kayıt
  record: DataRow | null = null;
  model: PublishedModel | null = null;
  loadingRecord = false;
  recordError: string | null = null;

  // Üst kayıt düzenleme (inline, modal değil)
  showEditForm = false;
  editForm: FormGroup | null = null;
  editLoading = false;
  editMsg: string | null = null;
  editOk: boolean | null = null;
  private editFileNames: Record<string, string> = {};

  // Alt modeller (sekmeler)
  childModelNames: string[] = [];
  activeTab = '';
  allModels: PublishedModel[] = [];
  tabStates = new Map<string, TabState>();
  loadingChildren = false;

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publishedModel: PublishedModelService,
    private publishModel: PublishModelService,
    private fb: FormBuilder,
    public permission: PermissionService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe(params => {
      this.typeName = params.get('typeName') ?? '';
      this.recordId = Number(params.get('id') ?? 0);
      this.reset();
      this.loadAll();
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  // ─── Util delegasyonları ─────────────────────────────────────────────────────

  inputTypeFor  = inputTypeFor;
  isImage       = isImage;
  imageSrc      = imageSrc;
  isBase64Value = isBase64Value;

  downloadParentFile(b64: string, colName: string): void {
    downloadFile(b64, colName, this.editFileNames);
  }

  downloadTabFile(b64: string, colName: string, state: TabState): void {
    downloadFile(b64, colName, state.fileNames);
  }

  // ─── Sıfırlama ──────────────────────────────────────────────────────────────

  private reset(): void {
    this.record = null;
    this.model = null;
    this.loadingRecord = false;
    this.recordError = null;
    this.showEditForm = false;
    this.editForm = null;
    this.editMsg = null;
    this.editOk = null;
    this.editFileNames = {};
    this.childModelNames = [];
    this.activeTab = '';
    this.allModels = [];
    this.tabStates.clear();
    this.loadingChildren = false;
  }

  // ─── Veri yükleme ───────────────────────────────────────────────────────────

  private loadAll(): void {
    this.loadingRecord = true;

    forkJoin({
      models: this.publishedModel.getModels(),
      record: this.publishedModel.get(this.typeName, this.recordId)
    }).subscribe({
      next: ({ models, record }) => {
        this.loadingRecord = false;

        if (models.success) {
          this.allModels = models.data ?? [];
          this.model = this.allModels.find(m => m.typeName === this.typeName) ?? null;
        }

        if (record.success && record.data) {
          this.record = record.data as DataRow;
        } else if (record.success && !record.data) {
          // Assembly yüklü değil — bir kez retry
          this.retryWithAssembly();
          return;
        } else {
          this.recordError = record.message ?? 'Kayıt bulunamadı.';
        }

        this.loadChildren();
      },
      error: err => {
        this.loadingRecord = false;
        const e = err as { error?: { message?: string }; message?: string };
        this.recordError = e?.error?.message ?? e?.message ?? 'Kayıt yüklenemedi.';
      }
    });
  }

  private retryWithAssembly(): void {
    this.publishModel.loadAssembly().subscribe({
      next: () => this.loadAll(),
      error: () => {
        this.loadingRecord = false;
        this.recordError = 'Model backend\'de yüklü değil. "Tablo Oluştur"dan yeniden yayınlayın.';
      }
    });
  }

  private loadChildren(): void {
    this.loadingChildren = true;
    this.publishedModel.getChildModels(this.typeName).subscribe({
      next: res => {
        this.loadingChildren = false;
        if (res.success && res.data?.length) {
          this.childModelNames = res.data;
          this.activeTab = res.data[0];
          for (const name of res.data) {
            const meta = this.allModels.find(m => m.typeName === name);
            const state = this.buildTabState(name, meta?.columns ?? []);
            this.tabStates.set(name, state);
            this.loadTabRows(state);
          }
        }
      },
      error: () => { this.loadingChildren = false; }
    });
  }

  // ─── Üst kayıt alanları ─────────────────────────────────────────────────────

  /** Üst kayda ait tüm kolonlar */
  get parentColumns(): PublishedColumn[] {
    return this.model?.columns ?? [];
  }

  /** Kayıttan belirli kolona ait ham değeri döndürür */
  recordRaw(col: PublishedColumn): unknown {
    if (!this.record) return null;
    return this.record[col.columnName] ?? this.record[col.columnName.toLowerCase()];
  }

  /** Görüntüleme için biçimlendirilmiş değer */
  displayValue(col: PublishedColumn): string {
    const v = this.recordRaw(col);
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'Evet' : 'Hayır';
    if (col.dataType === 'datetime' && typeof v === 'string') {
      try { return new Date(v).toLocaleString('tr-TR'); } catch { /* skip */ }
    }
    return String(v);
  }

  /** Ham string değer (base64/resim kontrolü için) */
  recordStr(col: PublishedColumn): string {
    const v = this.recordRaw(col);
    return typeof v === 'string' ? v : '';
  }

  // ─── Üst kayıt düzenleme ────────────────────────────────────────────────────

  openEditMode(): void {
    if (!this.model || !this.record) return;
    const controls: Record<string, unknown> = {};
    for (const col of this.parentColumns) {
      const v = this.recordRaw(col) ?? '';
      const validators = col.isNullable ? [] : [Validators.required];
      controls[col.columnName] = [v, validators];
    }
    this.editForm = this.fb.group(controls);
    this.editMsg = null;
    this.editOk = null;
    this.editFileNames = {};
    this.showEditForm = true;
  }

  cancelEdit(): void {
    this.showEditForm = false;
    this.editForm = null;
    this.editMsg = null;
    this.editOk = null;
  }

  submitEdit(): void {
    if (!this.editForm || this.editForm.invalid || this.editLoading) {
      this.editForm?.markAllAsTouched();
      return;
    }
    this.editLoading = true;
    this.editMsg = null;
    this.editOk = null;

    const jsonData: DataRow = { ...this.editForm.value, ID: this.recordId };

    this.publishedModel.update(this.typeName, jsonData).subscribe({
      next: res => {
        this.editLoading = false;
        this.editOk = res.success;
        this.editMsg = res.message;
        if (res.success) {
          this.record = { ...this.record, ...this.editForm!.value, ID: this.recordId };
          setTimeout(() => this.cancelEdit(), 1200);
        }
      },
      error: err => {
        this.editLoading = false;
        this.editOk = false;
        const e = err as { error?: { message?: string }; message?: string };
        this.editMsg = e?.error?.message ?? e?.message ?? 'Güncelleme başarısız.';
      }
    });
  }

  onEditFileSelected(event: Event, colName: string): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.editFileNames[colName] = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1] ?? reader.result as string;
      this.editForm?.get(colName)?.setValue(b64);
    };
    reader.readAsDataURL(file);
  }

  getEditControl(col: string) {
    return this.editForm?.get(col)!;
  }

  // ─── Sekme yönetimi ─────────────────────────────────────────────────────────

  setTab(name: string): void {
    this.activeTab = name;
  }

  tabState(name: string): TabState | undefined {
    return this.tabStates.get(name);
  }

  tabRowCount(name: string): number {
    return this.tabStates.get(name)?.rows.length ?? 0;
  }

  // ─── Sekme verisi ────────────────────────────────────────────────────────────

  private buildTabState(typeName: string, columns: PublishedColumn[]): TabState {
    return {
      typeName,
      columns,
      fkColumn: this.typeName + 'Id',
      rows: [],
      loading: false,
      error: null,
      searchTerm: '',
      sortCol: 'ID',
      sortDir: 'asc',
      formMode: 'none',
      editingRow: null,
      form: null,
      formLoading: false,
      formMsg: null,
      formOk: null,
      fileNames: {}
    };
  }

  loadTabRows(state: TabState): void {
    state.loading = true;
    state.error = null;
    this.publishedModel.getAll(state.typeName, state.fkColumn, this.recordId).subscribe({
      next: res => {
        state.loading = false;
        state.rows = res.success ? (res.data ?? []) as DataRow[] : [];
        if (!res.success) state.error = res.message ?? 'Kayıtlar alınamadı.';
      },
      error: err => {
        state.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        state.error = e?.error?.message ?? e?.message ?? 'Kayıtlar yüklenemedi.';
      }
    });
  }

  // ─── Sekme filtreleme ve sıralama ────────────────────────────────────────────

  /** FK kolonu dışındaki kolonlar */
  visibleCols(state: TabState): PublishedColumn[] {
    return state.columns.filter(c => c.columnName !== state.fkColumn);
  }

  tableHeaders(state: TabState): string[] {
    return ['ID', ...this.visibleCols(state).map(c => c.columnName)];
  }

  toggleSort(state: TabState, col: string): void {
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }
  }

  getDisplayRows(state: TabState): DataRow[] {
    let rows = [...state.rows];

    // Arama filtresi
    const term = state.searchTerm.trim().toLowerCase();
    if (term) {
      rows = rows.filter(row =>
        this.visibleCols(state).some(col => {
          const v = row[col.columnName] ?? row[col.columnName.toLowerCase()];
          return v != null && String(v).toLowerCase().includes(term);
        }) ||
        String(row['ID'] ?? row['id'] ?? '').includes(term)
      );
    }

    // Sıralama
    if (state.sortCol) {
      const col = state.sortCol;
      rows.sort((a, b) => {
        const av = a[col] ?? a[col.toLowerCase()] ?? '';
        const bv = b[col] ?? b[col.toLowerCase()] ?? '';
        const an = Number(av), bn = Number(bv);
        let cmp = !isNaN(an) && !isNaN(bn)
          ? an - bn
          : String(av).localeCompare(String(bv), 'tr', { numeric: true });
        return state.sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return rows;
  }

  rowId(row: DataRow): number {
    return Number(row['ID'] ?? row['id'] ?? 0);
  }

  cellVal(row: DataRow, col: string): string {
    const v = row[col] ?? row[col.toLowerCase()];
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  strVal(row: DataRow, col: string): string {
    const v = row[col] ?? row[col.toLowerCase()];
    return typeof v === 'string' ? v : '';
  }

  // ─── Sekme form yönetimi ─────────────────────────────────────────────────────

  openTabAddForm(state: TabState): void {
    state.editingRow = null;
    state.form = this.buildTabForm(state, null);
    state.formMode = 'add';
    state.formMsg = null;
    state.formOk = null;
    state.fileNames = {};
  }

  openTabEditForm(state: TabState, row: DataRow): void {
    state.editingRow = row;
    state.form = this.buildTabForm(state, row);
    state.formMode = 'edit';
    state.formMsg = null;
    state.formOk = null;
    state.fileNames = {};
  }

  closeTabForm(state: TabState): void {
    state.formMode = 'none';
    state.editingRow = null;
    state.form = null;
    state.formMsg = null;
    state.formOk = null;
  }

  private buildTabForm(state: TabState, row: DataRow | null): FormGroup {
    const controls: Record<string, unknown> = {};
    for (const col of this.visibleCols(state)) {
      const v = row ? (row[col.columnName] ?? row[col.columnName.toLowerCase()] ?? '') : '';
      const validators = col.isNullable ? [] : [Validators.required];
      controls[col.columnName] = [v, validators];
    }
    return this.fb.group(controls);
  }

  submitTabForm(state: TabState): void {
    if (!state.form || state.form.invalid || state.formLoading) {
      state.form?.markAllAsTouched();
      return;
    }
    state.formLoading = true;
    state.formMsg = null;
    state.formOk = null;

    const jsonData: DataRow = { ...state.form.value, [state.fkColumn]: this.recordId };

    if (state.formMode === 'edit' && state.editingRow) {
      jsonData['ID'] = state.editingRow['ID'] ?? state.editingRow['id'];
      this.publishedModel.update(state.typeName, jsonData).subscribe({
        next: res => this.handleTabFormRes(state, res),
        error: err => this.handleTabFormErr(state, err)
      });
    } else {
      this.publishedModel.add(state.typeName, jsonData).subscribe({
        next: res => this.handleTabFormRes(state, res),
        error: err => this.handleTabFormErr(state, err)
      });
    }
  }

  private handleTabFormRes(state: TabState, res: { success: boolean; message: string }): void {
    state.formLoading = false;
    state.formOk = res.success;
    state.formMsg = res.message;
    if (res.success) {
      this.loadTabRows(state);
      setTimeout(() => this.closeTabForm(state), 1200);
    }
  }

  private handleTabFormErr(state: TabState, err: unknown): void {
    state.formLoading = false;
    state.formOk = false;
    const e = err as { error?: { message?: string }; message?: string };
    state.formMsg = e?.error?.message ?? e?.message ?? 'İşlem başarısız.';
  }

  deleteTabRow(state: TabState, row: DataRow): void {
    const id = this.rowId(row);
    if (!id || !confirm(`ID:${id} kaydını silmek istediğinize emin misiniz?`)) return;
    this.publishedModel.delete(state.typeName, id).subscribe({
      next: res => { if (res.success) this.loadTabRows(state); },
      error: () => { /* sessizce geç */ }
    });
  }

  onTabFileSelected(event: Event, colName: string, state: TabState): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    state.fileNames[colName] = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1] ?? reader.result as string;
      state.form?.get(colName)?.setValue(b64);
    };
    reader.readAsDataURL(file);
  }

  getTabControl(state: TabState, col: string) {
    return state.form!.get(col)!;
  }
}
