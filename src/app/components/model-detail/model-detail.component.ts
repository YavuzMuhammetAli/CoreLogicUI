import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PublishedModelService, PublishedModel, PublishedColumn } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import {
  inputTypeFor,
  isImage,
  imageSrc,
  isBase64Value,
  downloadFile,
  sanitizePayload,
  fieldValue
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

  // Admin tarafından yönetilen tablo kolon görünürlüğü — null = ayar yok, tümü görünür.
  // Alt modelin kendi liste sayfasıyla ('list' viewType) AYNI ayarı paylaşır.
  visibleColumnNames: string[] | null;
  savingColumnVisibility: boolean;
}

@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ColumnVisibilityComponent],
  templateUrl: './model-detail.component.html',
  styleUrls: ['./model-detail.component.scss']
})
export class ModelDetailComponent implements OnInit, OnDestroy {
  typeName = '';
  recordId = 0;
  /** Yeni kayıt ekleme modu (route data: { mode: 'new' }) */
  isNew = false;

  // Üst kayıt
  record: DataRow | null = null;
  model: PublishedModel | null = null;
  loadingRecord = false;
  recordError: string | null = null;

  // Üst kayıt silme durumu
  deleting = false;

  // Üst kayıt düzenleme / yeni kayıt formu (inline, modal değil)
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

  /** Yeni kayıt akışında birden fazla child satırı biriktirmek için sayaç */
  private localIdSeq = 0;

  /** Toplu kayıt sonrası kaydedilemeyenlerin listesi (edit instance'ta gösterilir) */
  childSaveErrors: string[] = [];

  // Admin tarafından yönetilen üst form kolon görünürlüğü — null = ayar yok, tümü görünür
  visibleParentColumnNames: string[] | null = null;
  savingColumnVisibility = false;

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publishedModel: PublishedModelService,
    private publishModel: PublishModelService,
    private fb: FormBuilder,
    public permission: PermissionService,
    private modelColumnSetting: ModelColumnSettingService
  ) {}

  ngOnInit(): void {
    // Route data'dan modu bir kez belirle (snapshot; yeni ve düzenle route'ları farklı)
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    this.routeSub = this.route.paramMap.subscribe(params => {
      this.typeName = params.get('typeName') ?? '';
      this.recordId = Number(params.get('id') ?? 0);
      this.reset();
      this.loadAll();
      this.loadColumnVisibility();
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
    this.deleting = false;
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
    this.childSaveErrors = [];
    this.localIdSeq = 0;
    this.visibleParentColumnNames = null;
  }

  // ─── Veri yükleme ───────────────────────────────────────────────────────────

  private loadAll(): void {
    this.loadingRecord = true;

    if (this.isNew) {
      // Yeni kayıt modu: model şemasını yükle + alt sekmeleri hazırla
      this.publishedModel.getModels().subscribe({
        next: res => {
          this.loadingRecord = false;
          if (res.success) {
            this.allModels = res.data ?? [];
            this.model = this.allModels.find(m => m.typeName === this.typeName) ?? null;
          }
          if (this.model) {
            this.buildNewForm();
            // Şema mevcutsa alt sekmeleri de yükle (server'dan veri çekmeden)
            this.loadChildrenForNew();
          } else {
            this.recordError = `"${this.typeName}" modeli bulunamadı.`;
          }
        },
        error: err => {
          this.loadingRecord = false;
          const e = err as { error?: { message?: string }; message?: string };
          this.recordError = e?.error?.message ?? e?.message ?? 'Model şeması yüklenemedi.';
        }
      });
      return;
    }

    // Mevcut kayıt modu: model şeması + kayıt verisi
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
          // Kayıt geldi — doğrudan düzenleme formunu aç (salt-okunur modu yoktur)
          this.openEditMode();
        } else if (record.success && !record.data) {
          // Assembly yüklü değil — bir kez retry
          this.retryWithAssembly();
          return;
        } else {
          this.recordError = record.message ?? 'Kayıt bulunamadı.';
        }

        this.loadChildren();
        // Toplu kayıt akışından gelen kısmi hata mesajlarını oku
        const navState = this.router.lastSuccessfulNavigation?.extras?.state as Record<string, unknown> | null;
        const errors = navState?.['childSaveErrors'];
        if (Array.isArray(errors)) {
          this.childSaveErrors = errors as string[];
        }
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
            this.loadTabColumnVisibility(state);
          }
        }
      },
      error: () => { this.loadingChildren = false; }
    });
  }

  /**
   * Yeni kayıt modunda alt sekmeleri hazırlar — şema yükler, satır çekmez.
   * Kullanıcı burada staged satırlar biriktirir; kayıt anında FK atanır.
   */
  private loadChildrenForNew(): void {
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
            // Yeni kayıt modunda server'dan veri çekilmez; rows boş kalır
            this.tabStates.set(name, state);
            this.loadTabColumnVisibility(state);
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

  /**
   * Formda render edilecek kolonlar: admin ayarına göre filtrelenmiş, ancak zorunlu
   * (isNullable=false) kolonlar her zaman dahil edilir — aksi halde form geçersiz kalır
   * ve güncellemede gizli alan payload'dan düşüp null'lanabilir.
   * Not: editForm her zaman TÜM kolonlarla kurulur (openEditMode/buildNewForm); bu getter
   * sadece render'ı filtreler, form bütünlüğünü etkilemez.
   */
  get visibleParentColumns(): PublishedColumn[] {
    if (!this.visibleParentColumnNames) return this.parentColumns;
    const visible = new Set(this.visibleParentColumnNames);
    return this.parentColumns.filter(c => !c.isNullable || visible.has(c.columnName));
  }

  /** Kolon görünürlüğü popover'ı için kolon listesi — zorunlu alanlar gizlenemez */
  get parentColumnVisibilityItems(): ColumnVisibilityItem[] {
    return this.parentColumns.map(c => ({ name: c.columnName, required: !c.isNullable }));
  }

  /** Popover'ın o anki etkin seçimi — ayar yoksa tüm kolonlar işaretli gösterilir */
  get effectiveVisibleParentColumnNames(): string[] {
    return this.visibleParentColumnNames ?? this.parentColumns.map(c => c.columnName);
  }

  /** Admin tarafından kayıtlı detay-görünümü kolon ayarını yükler */
  private loadColumnVisibility(): void {
    const typeName = this.typeName;
    this.modelColumnSetting.get(typeName, 'detail').subscribe({
      next: res => {
        if (typeName !== this.typeName) return; // bu sırada başka modele geçilmiş olabilir
        this.visibleParentColumnNames = (res.success && res.data?.visibleColumns?.length)
          ? res.data.visibleColumns
          : null;
      },
      error: () => { /* ayar yüklenemezse tüm kolonlar görünür kalır */ }
    });
  }

  /** Admin kolon görünürlüğü ayarını kaydeder */
  onSaveColumnVisibility(names: string[]): void {
    this.savingColumnVisibility = true;
    const dto: ModelColumnSettingDto = { typeName: this.typeName, viewType: 'detail', visibleColumns: names };
    this.modelColumnSetting.set(dto).subscribe({
      next: res => {
        this.savingColumnVisibility = false;
        if (res.success) this.visibleParentColumnNames = names;
      },
      error: () => { this.savingColumnVisibility = false; }
    });
  }

  /** Kayıttan belirli kolona ait ham değeri döndürür */
  recordRaw(col: PublishedColumn): unknown {
    if (!this.record) return null;
    return fieldValue(this.record, col.columnName);
  }

  // ─── Üst kayıt formu ────────────────────────────────────────────────────────

  /** Mevcut kayıt ile düzenleme formunu oluştur */
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

  /** Yeni kayıt modu için boş form oluştur */
  private buildNewForm(): void {
    const controls: Record<string, unknown> = {};
    for (const col of this.parentColumns) {
      const validators = col.isNullable ? [] : [Validators.required];
      controls[col.columnName] = ['', validators];
    }
    this.editForm = this.fb.group(controls);
    this.editMsg = null;
    this.editOk = null;
    this.editFileNames = {};
    this.showEditForm = true;
  }

  submitEdit(): void {
    if (!this.editForm || this.editForm.invalid || this.editLoading) {
      this.editForm?.markAllAsTouched();
      return;
    }
    this.editLoading = true;
    this.editMsg = null;
    this.editOk = null;

    if (this.isNew) {
      // Yeni kayıt oluştur
      const jsonData: DataRow = sanitizePayload(this.parentColumns, this.editForm.value);
      this.publishedModel.add(this.typeName, jsonData).subscribe({
        next: res => {
          this.editLoading = false;
          this.editOk = res.success;
          this.editMsg = res.message;
          if (res.success) {
            // Oluşturulan kaydı bulmak için listeyi çek → en büyük ID heuristic
            this.publishedModel.getAll(this.typeName).subscribe({
              next: listRes => {
                const rows = (listRes.success ? (listRes.data ?? []) : []) as DataRow[];
                const maxId = rows.reduce((max, r) => {
                  const id = Number(fieldValue(r, 'ID') ?? 0);
                  return id > max ? id : max;
                }, 0);
                if (maxId > 0) {
                  // Biriken alt kayıtları kaydet, ardından düzenleme sayfasına geç
                  this.persistStagedChildren(maxId);
                } else {
                  this.router.navigate(['/models', this.typeName]);
                }
              },
              error: () => this.router.navigate(['/models', this.typeName])
            });
          }
        },
        error: err => {
          this.editLoading = false;
          this.editOk = false;
          const e = err as { error?: { message?: string }; message?: string };
          this.editMsg = e?.error?.message ?? e?.message ?? 'Kayıt oluşturulamadı.';
        }
      });
    } else {
      // Mevcut kaydı güncelle — sayfada kal, başarı mesajı göster
      const jsonData: DataRow = { ...sanitizePayload(this.parentColumns, this.editForm.value), ID: this.recordId };
      this.publishedModel.update(this.typeName, jsonData).subscribe({
        next: res => {
          this.editLoading = false;
          this.editOk = res.success;
          this.editMsg = res.message;
          if (res.success) {
            // Kaydı optimistik güncelle, sayfada kal
            this.record = { ...this.record, ...jsonData };
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
  }

  /** Üst kaydı sil — yalnızca mevcut kayıt modunda kullanılır */
  deleteRecord(): void {
    if (this.isNew || this.deleting) return;
    if (!confirm(`ID:${this.recordId} kaydını silmek istediğinize emin misiniz?`)) return;

    this.deleting = true;
    this.publishedModel.delete(this.typeName, this.recordId).subscribe({
      next: res => {
        this.deleting = false;
        if (res.success) {
          this.router.navigate(['/models', this.typeName]);
        }
      },
      error: () => {
        this.deleting = false;
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
      fileNames: {},
      visibleColumnNames: null,
      savingColumnVisibility: false
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

  /** FK kolonu dışındaki kolonlar — formlar (ekle/düzenle) bunu kullanır, ASLA filtrelenmez */
  visibleCols(state: TabState): PublishedColumn[] {
    return state.columns.filter(c => c.columnName !== state.fkColumn);
  }

  /**
   * Tabloda gösterilecek kolonlar: FK hariç + admin ayarına göre filtreli.
   * Form bütünlüğünü etkilememesi için `visibleCols`'tan ayrı tutulur — admin tablo
   * görünümünden bir kolonu gizlese de ekle/düzenle formunda o alan kaybolmaz.
   */
  displayCols(state: TabState): PublishedColumn[] {
    const cols = this.visibleCols(state);
    if (!state.visibleColumnNames) return cols;
    const visible = new Set(state.visibleColumnNames);
    return cols.filter(c => visible.has(c.columnName));
  }

  tableHeaders(state: TabState): string[] {
    return ['ID', ...this.displayCols(state).map(c => c.columnName)];
  }

  /** Kolon görünürlüğü popover'ı için kolon listesi — alt model tablosunda zorunlu zorlaması yok */
  tabColumnVisibilityItems(state: TabState): ColumnVisibilityItem[] {
    return this.visibleCols(state).map(c => ({ name: c.columnName, required: false }));
  }

  /** Popover'ın o anki etkin seçimi — ayar yoksa tüm kolonlar işaretli gösterilir */
  effectiveTabVisibleColumnNames(state: TabState): string[] {
    return state.visibleColumnNames ?? this.visibleCols(state).map(c => c.columnName);
  }

  /**
   * Alt modelin kendi liste sayfasıyla (`'list'` viewType) AYNI kolon ayarını yükler —
   * admin bir modelin kolonlarını bir kez seçer, model nerede listelenirse listelensin
   * (kendi liste sayfası + üst kaydın bu sekmesi) aynı görünür.
   */
  private loadTabColumnVisibility(state: TabState): void {
    this.modelColumnSetting.get(state.typeName, 'list').subscribe({
      next: res => {
        state.visibleColumnNames = (res.success && res.data?.visibleColumns?.length)
          ? res.data.visibleColumns
          : null;
      },
      error: () => { /* ayar yüklenemezse tüm kolonlar görünür kalır */ }
    });
  }

  /** Admin alt model tablosu için kolon görünürlüğü ayarını kaydeder ('list' ayarını günceller) */
  onSaveTabColumnVisibility(state: TabState, names: string[]): void {
    state.savingColumnVisibility = true;
    const dto: ModelColumnSettingDto = { typeName: state.typeName, viewType: 'list', visibleColumns: names };
    this.modelColumnSetting.set(dto).subscribe({
      next: res => {
        state.savingColumnVisibility = false;
        if (res.success) state.visibleColumnNames = names;
      },
      error: () => { state.savingColumnVisibility = false; }
    });
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
        this.displayCols(state).some(col => {
          const v = fieldValue(row, col.columnName);
          return v != null && String(v).toLowerCase().includes(term);
        }) ||
        String(fieldValue(row, 'ID') ?? '').includes(term)
      );
    }

    // Sıralama
    if (state.sortCol) {
      const col = state.sortCol;
      rows.sort((a, b) => {
        const av = fieldValue(a, col) ?? '';
        const bv = fieldValue(b, col) ?? '';
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
    return Number(fieldValue(row, 'ID') ?? 0);
  }

  cellVal(row: DataRow, col: string): string {
    const v = fieldValue(row, col);
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  strVal(row: DataRow, col: string): string {
    const v = fieldValue(row, col);
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
      const v = row ? (fieldValue(row, col.columnName) ?? '') : '';
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

    // Yeni kayıt modunda — bellekte biriktir, HTTP yapma
    if (this.isNew) {
      if (state.formMode === 'edit' && state.editingRow) {
        // Staged satırı güncelle
        const localId = state.editingRow['__localId'] as number;
        const idx = state.rows.findIndex(r => r['__localId'] === localId);
        if (idx >= 0) {
          state.rows[idx] = { ...state.form.value, __localId: localId };
        }
      } else {
        // Yeni staged satır ekle
        state.rows = [...state.rows, { ...state.form.value, __localId: ++this.localIdSeq }];
      }
      this.closeTabForm(state);
      return;
    }

    // Mevcut kayıt modu — backend'e gönder
    state.formLoading = true;
    state.formMsg = null;
    state.formOk = null;

    const jsonData: DataRow = { ...sanitizePayload(state.columns, state.form.value), [state.fkColumn]: this.recordId };

    if (state.formMode === 'edit' && state.editingRow) {
      jsonData['ID'] = fieldValue(state.editingRow, 'ID');
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

  /**
   * Yeni kayıt kaydedildikten sonra, bellekte biriken alt kayıtları sırayla backend'e gönderir.
   * Başarısız olanlar hata listesiyle edit sayfasına aktarılır.
   */
  private persistStagedChildren(parentId: number): void {
    // Tüm tab'lardan staged satırları topla
    const tasks: Array<{ typeName: string; fkColumn: string; row: DataRow; label: string }> = [];
    let taskIdx = 0;
    for (const [, state] of this.tabStates) {
      state.rows.forEach(row => {
        taskIdx++;
        // __localId'yi payload'dan çıkar, FK'yı ekle
        const { __localId, ...fields } = row as DataRow & { __localId?: unknown };
        const payload: DataRow = { ...sanitizePayload(state.columns, fields), [state.fkColumn]: parentId };
        tasks.push({ typeName: state.typeName, fkColumn: state.fkColumn, row: payload, label: `${state.typeName} #${taskIdx}` });
      });
    }

    if (tasks.length === 0) {
      // Biriken satır yok — doğrudan düzenleme sayfasına git
      this.router.navigate(['/models', this.typeName, parentId]);
      return;
    }

    // Her task için bir Observable oluştur; hata durumunda hata mesajıyla tamamlanır
    const saveObs = tasks.map(task =>
      this.publishedModel.add(task.typeName, task.row).pipe(
        map(res => ({ label: task.label, success: res.success, message: res.message })),
        catchError(err => {
          const e = err as { error?: { message?: string }; message?: string };
          const msg = e?.error?.message ?? e?.message ?? 'İşlem başarısız.';
          return of({ label: task.label, success: false, message: msg });
        })
      )
    );

    forkJoin(saveObs).subscribe(results => {
      const errors = results
        .filter(r => !r.success)
        .map(r => `${r.label}: ${r.message}`);

      if (errors.length > 0) {
        // Kısmi başarısızlık — edit sayfasına hata listesiyle git
        this.router.navigate(['/models', this.typeName, parentId], {
          state: { childSaveErrors: errors }
        });
      } else {
        // Tümü başarılı
        this.router.navigate(['/models', this.typeName, parentId]);
      }
    });
  }

  /** Yeni kayıt modunda biriken alt kayıt sayısı (Kaydet butonu etiketi için) */
  get stagedChildCount(): number {
    let total = 0;
    for (const [, state] of this.tabStates) {
      total += state.rows.length;
    }
    return total;
  }

  deleteTabRow(state: TabState, row: DataRow): void {
    // Yeni kayıt modunda — bellekten çıkar, HTTP yapma
    if (this.isNew) {
      if (!confirm('Bu biriktirilen satırı kaldırmak istediğinize emin misiniz?')) return;
      const localId = row['__localId'] as number;
      state.rows = state.rows.filter(r => r['__localId'] !== localId);
      return;
    }

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
