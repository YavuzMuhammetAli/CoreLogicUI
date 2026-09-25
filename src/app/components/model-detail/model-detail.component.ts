import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of, Observable, Subscription } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { DisplayRowsCache, selectDisplayRows } from './display-rows.util';
import { TreeStep, applyTreeResult, applyUpdateResults } from './tree-save.util';
import {
  PublishedModelService, PublishedModel, PublishedColumn, TreeSaveResult
} from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { RecordMetadataService } from '../../services/record-metadata.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { RecordFormDialogComponent } from '../shared/record-form-dialog/record-form-dialog.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { LookupPickerComponent } from '../shared/lookup-picker/lookup-picker.component';
import { WorkflowPanelComponent } from '../shared/workflow-panel/workflow-panel.component';
import { RecordTasksComponent } from '../shared/record-tasks/record-tasks.component';
import { LookupLabelService } from '../../services/lookup-label.service';
import {
  StagedNode,
  createStagedNode,
  normalizeRow,
  fkColumnFor,
  validatorsFor,
  toTreeDto,
  flattenNodes,
  dirtyNodes,
  hasInserts,
  hasErrors as treeHasErrors,
  pendingCount as treePendingCount
} from './staged-tree.util';
import {
  inputTypeFor,
  isImage,
  imageSrc,
  isBase64Value,
  downloadFile,
  sanitizePayload,
  fieldValue,
  parseEnumValues,
  toInputValue,
  stepFor
} from '../model-data/model-data.util';
import { markDirty } from '../../utils/change-detection';

type DataRow = Record<string, unknown>;

/** Bir alt model sekmesinin tüm durumu */
interface TabState {
  typeName: string;
  columns: PublishedColumn[];
  fkColumn: string;

  /** Sunucudan gelen KAYITLI satırlar (yalnızca mevcut kayıt modunda dolar). */
  rows: DataRow[];
  loading: boolean;
  error: string | null;

  /**
   * Henüz kaydedilmemiş VEYA kaydedilirken hata almış satırlar — kendi alt ağaçlarıyla.
   * Kaydetme hatasında bu liste ASLA temizlenmez; kullanıcı düzeltip tekrar dener.
   */
  staged: StagedNode[];

  searchTerm: string;
  sortCol: string;
  sortDir: 'asc' | 'desc';

  fileNames: Record<string, string>;

  /** Toplu silme için seçili KAYITLI satırların ID'leri. */
  selectedIds: Set<number>;
  /** Toplu kaldırma için seçili BEKLEYEN satırların geçici localId'leri. */
  selectedStaged: Set<number>;
  /** Toplu silmede silinemeyen satırların hata özeti (satırlar seçili kalır). */
  bulkErrors: string[];
  /** Son toplu silme denemesinde kaç kayıt gönderildi (özet metni için). */
  bulkTotal: number;

  /** getDisplayRows() sonucunun önbelleği (bkz. display-rows.util). */
  displayCache?: DisplayRowsCache;

  // Admin tarafından yönetilen tablo kolon görünürlüğü — null = ayar yok, tümü görünür.
  // Alt modelin kendi liste sayfasıyla ('list' viewType) AYNI ayarı paylaşır.
  visibleColumnNames: string[] | null;
  savingColumnVisibility: boolean;
}

@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, ColumnVisibilityComponent,
    TranslatePipe, RecordFormDialogComponent, ConfirmDialogComponent, LookupPickerComponent,
    WorkflowPanelComponent, RecordTasksComponent
  ],
  templateUrl: './model-detail.component.html',
  styleUrls: ['./model-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelDetailComponent implements OnInit, OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);
  private readonly metadata = inject(RecordMetadataService);
  /** Tablo hücrelerindeki lookup FK id'lerini toplu şekilde etikete çevirir. */
  private readonly lookupLabels = inject(LookupLabelService);
  /** Adres çubuğunu sayfa yeniden yüklemeden güncellemek için (yeni → düzenleme geçişi). */
  private readonly location = inject(Location);

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

  /** Üst modelin şema kuralları (regex/uzunluk/aralık) — istemci doğrulaması için. */
  private parentRules = new Map<string, PublishedColumnSchema>();

  /** Toplu kayıt sonrası kaydedilemeyenlerin listesi (satırlar ekranda KALIR, bu yalnızca özet) */
  childSaveErrors: string[] = [];

  // ─── Kayıt pop-up'ı (alt model ekle/düzenle) ────────────────────────────────

  dialogOpen = false;
  dialogNode: StagedNode | null = null;
  dialogTabName = '';
  dialogIsEdit = false;
  /** Açık dialogdaki tipin FK kolonu — formda gizlenmesi gereken tek `...Id` alanı. */
  dialogFkColumn: string | null = null;
  /** Düzenlenen satır sunucuda kayıtlıysa ID'si; null ise bellekte bekleyen bir satır. */
  private dialogSavedId: number | null = null;

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
    this.routeSub = this.route.paramMap.pipe(markDirty(this.cdr)).subscribe(params => {
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

  inputTypeFor   = inputTypeFor;
  isImage        = isImage;
  imageSrc       = imageSrc;
  isBase64Value  = isBase64Value;
  parseEnumValues = parseEnumValues;
  stepFor        = stepFor;

  // ─── Lookup etiketleri (tablo hücreleri için) ───────────────────────────────
  //
  // Dropdown artık tembel yükleniyor (app-lookup-picker), yani hedef tablonun tam
  // listesi hiçbir yerde tutulmuyor. Hücrelerde etiket gösterebilmek için görünen
  // satırlardaki benzersiz FK id'leri toplanıp kolon başına TEK istekle çözülür.

  /** Görünen satırlardaki lookup id'lerinin etiketlerini (eksik olanları) çözer. */
  private resolveLookupLabels(columns: PublishedColumn[], rows: DataRow[]): void {
    if (rows.length === 0) return;

    for (const col of columns) {
      if (col.dataType !== 'lookup' || !col.lookupTargetTable) continue;

      const ids = rows
        .map(r => Number(fieldValue(r, col.columnName)))
        .filter(n => Number.isFinite(n) && n > 0);

      if (ids.length === 0) continue;

      this.lookupLabels
        .ensure(col.lookupTargetTable, col.lookupDisplayColumn, ids)
        .pipe(markDirty(this.cdr))
        .subscribe();
    }
  }

  /** Tablo hücresinde lookup FK ID'sini etikete çevirir (çözülmemişse ham ID gösterilir). */
  lookupCellLabel(col: PublishedColumn, value: unknown): string {
    if (value == null || value === '') return '—';
    const target = col.lookupTargetTable;
    if (!target) return String(value);
    return this.lookupLabels.label(target, col.lookupDisplayColumn, Number(value)) ?? String(value);
  }

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
    this.parentRules = new Map();
    this.closeRecordDialog();
    this.visibleParentColumnNames = null;
  }

  // ─── Veri yükleme ───────────────────────────────────────────────────────────

  private loadAll(): void {
    this.loadingRecord = true;

    if (this.isNew) {
      // Yeni kayıt modu: model şemasını yükle + alt sekmeleri hazırla
      this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
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
            this.recordError = this.languageService.t('model.detail.modelNotFound', { typeName: this.typeName });
          }
        },
        error: err => {
          this.loadingRecord = false;
          const e = err as { error?: { message?: string }; message?: string };
          this.recordError = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.schemaLoadFailed');
        }
      });
      return;
    }

    // Mevcut kayıt modu: model şeması + kayıt verisi
    forkJoin({
      models: this.publishedModel.getModels(),
      record: this.publishedModel.get(this.typeName, this.recordId)
    }).pipe(markDirty(this.cdr)).subscribe({
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
          this.recordError = record.message ?? this.languageService.t('model.detail.recordNotFound');
        }

        this.loadChildren();
        // Not: kısmi kayıt hataları artık route state'i ile taşınmıyor — kaydedilemeyen
        // satırlar sayfadan hiç ayrılmadan `state.staged` içinde yerinde kalıyor.
      },
      error: err => {
        this.loadingRecord = false;
        const e = err as { error?: { message?: string }; message?: string };
        this.recordError = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.recordLoadFailed');
      }
    });
  }

  private retryWithAssembly(): void {
    this.publishModel.loadAssembly().pipe(markDirty(this.cdr)).subscribe({
      next: () => this.loadAll(),
      error: () => {
        this.loadingRecord = false;
        this.recordError = this.languageService.t('model.detail.assemblyNotLoaded');
      }
    });
  }

  private loadChildren(): void {
    this.loadingChildren = true;
    this.publishedModel.getChildModels(this.typeName).pipe(markDirty(this.cdr)).subscribe({
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
    this.publishedModel.getChildModels(this.typeName).pipe(markDirty(this.cdr)).subscribe({
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
    this.modelColumnSetting.get(typeName, 'detail').pipe(markDirty(this.cdr)).subscribe({
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
    this.modelColumnSetting.set(dto).pipe(markDirty(this.cdr)).subscribe({
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

  /** UI'da gösterilecek etiket — admin Label tanımlamışsa onu, yoksa ham columnName'i döner. */
  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  // ─── Üst kayıt formu ────────────────────────────────────────────────────────

  /**
   * Üst modelin şema kurallarını (regex/uzunluk/aralık) yükler ve formu yeniden kurar.
   * Kurallar backend `ValidateDynamicEntity` ile AYNI kaynaktan gelir — böylece
   * kullanıcı hataları sunucuya gitmeden alanın altında görür.
   */
  private loadParentRules(rebuild: () => void): void {
    this.metadata.rules$(this.typeName).pipe(markDirty(this.cdr)).subscribe(rules => {
      this.parentRules = rules;
      rebuild();
    });
  }

  /** Bir üst-kayıt kolonunun doğrulayıcıları — şema kuralı varsa ona göre. */
  private parentValidators(col: PublishedColumn) {
    return validatorsFor(col, this.parentRules.get(col.columnName));
  }

  /** Mevcut kayıt ile düzenleme formunu oluştur */
  openEditMode(): void {
    if (!this.model || !this.record) return;
    const build = () => {
      const controls: Record<string, unknown> = {};
      for (const col of this.parentColumns) {
        // Ham ISO tarih değeri doğrudan bağlanırsa datetime-local kutusu onu sessizce
        // atar ve alan BOŞ açılır; kullanıcı dokununca tarayıcı o anki zamanı yazar.
        const v = toInputValue(col.dataType, this.recordRaw(col)) ?? '';
        controls[col.columnName] = [v, this.parentValidators(col)];
      }
      this.editForm = this.fb.group(controls);
    };
    build();                          // kurallar gelene kadar form kullanılabilir kalsın
    this.loadParentRules(build);      // kurallar gelince doğrulayıcılarla yeniden kurulur
    this.editMsg = null;
    this.editOk = null;
    this.editFileNames = {};
    this.showEditForm = true;
  }

  /** Yeni kayıt modu için boş form oluştur */
  private buildNewForm(): void {
    const build = () => {
      const previous = this.editForm?.value ?? {};
      const controls: Record<string, unknown> = {};
      for (const col of this.parentColumns) {
        controls[col.columnName] = [previous[col.columnName] ?? '', this.parentValidators(col)];
      }
      this.editForm = this.fb.group(controls);
    };
    build();
    this.loadParentRules(build);
    this.editMsg = null;
    this.editOk = null;
    this.editFileNames = {};
    this.showEditForm = true;
  }

  /**
   * Bir üst-form alanının gösterilecek hata metni. `pattern` hatasında kolonun
   * kendi "Regex Mesajı" tercih edilir — kullanıcıya en anlamlı açıklama odur.
   */
  parentFieldError(col: PublishedColumn): string | null {
    const c = this.editForm?.get(col.columnName);
    if (!c || !c.touched || !c.errors) return null;
    const label = this.colLabel(col);
    const rule = this.parentRules.get(col.columnName);

    if (c.errors['required']) return this.languageService.t('model.detail.fieldRequired', { label });
    if (c.errors['pattern']) {
      return rule?.regexMessage?.trim() || this.languageService.t('model.detail.fieldPattern', { label });
    }
    if (c.errors['minlength']) return this.languageService.t('model.detail.fieldMinLength', { label, min: rule?.minLength ?? 0 });
    if (c.errors['maxlength']) return this.languageService.t('model.detail.fieldMaxLength', { label, max: rule?.maxLength ?? 0 });
    if (c.errors['min']) return this.languageService.t('model.detail.fieldMin', { label, min: rule?.min ?? 0 });
    if (c.errors['max']) return this.languageService.t('model.detail.fieldMax', { label, max: rule?.max ?? 0 });
    return null;
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
      // Yeni kayıt: ana kayıt + tüm bekleyen alt ağaç TEK istekte, TEK transaction'da.
      // Kök henüz yok → existingRootId null; sunucu ID'leri kendisi üretip döndürür.
      this.saveTree(null);
    } else {
      // Mevcut kaydı güncelle — sayfada kal, başarı mesajı göster
      const jsonData: DataRow = { ...sanitizePayload(this.parentColumns, this.editForm.value), ID: this.recordId };
      this.publishedModel.update(this.typeName, jsonData).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.editOk = res.success;
          this.editMsg = res.message;
          if (res.success) {
            // Kaydı optimistik güncelle, sayfada kal
            this.record = { ...this.record, ...jsonData };
          }
          // Bekleyen alt kayıt varsa aynı "Kaydet" onları da gönderir. Kök zaten var:
          // existingRootId ile geçilir, böylece ana kayıt İKİNCİ KEZ OLUŞTURULMAZ.
          if (this.totalStagedCount > 0) {
            this.saveTree(this.recordId);
          } else {
            this.editLoading = false;
          }
        },
        error: err => {
          this.editLoading = false;
          this.editOk = false;
          const e = err as { error?: { message?: string }; message?: string };
          this.editMsg = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.updateFailed');
        }
      });
    }
  }

  /**
   * Sayfayı yeniden yüklemeden "yeni kayıt" modundan "düzenleme" moduna geçirir.
   *
   * Route değiştirilirse component yeniden kurulur ve bellekteki staged ağaç yok olur —
   * kullanıcının kaybettiği veri tam olarak buydu. Bu yüzden yalnızca adres çubuğu
   * güncellenir (table-detail'deki oluşturma → düzenleme geçişiyle aynı desen).
   */
  private switchToEditMode(newId: number): void {
    this.isNew = false;
    this.recordId = newId;
    this.record = { ...(this.editForm?.value ?? {}), ID: newId } as DataRow;
    this.location.replaceState(`/models/${this.typeName}/${newId}`);
  }

  /** Onay bekleyen üst-kayıt silme; true ise diyalog açıktır. */
  deleteRecordConfirmOpen = false;

  /** Üst kaydı sil — yalnızca mevcut kayıt modunda kullanılır */
  askDeleteRecord(): void {
    if (this.isNew || this.deleting) return;
    this.deleteRecordConfirmOpen = true;
  }

  cancelDeleteRecord(): void {
    this.deleteRecordConfirmOpen = false;
  }

  confirmDeleteRecord(): void {
    if (this.isNew || this.deleting) return;

    this.deleteRecordConfirmOpen = false;
    this.deleting = true;
    this.publishedModel.delete(this.typeName, this.recordId).pipe(markDirty(this.cdr)).subscribe({
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
      fkColumn: fkColumnFor(this.typeName),
      rows: [],
      loading: false,
      error: null,
      staged: [],
      searchTerm: '',
      sortCol: 'ID',
      sortDir: 'asc',
      fileNames: {},
      selectedIds: new Set<number>(),
      selectedStaged: new Set<number>(),
      bulkErrors: [],
      bulkTotal: 0,
      visibleColumnNames: null,
      savingColumnVisibility: false
    };
  }

  /**
   * Sunucudaki KAYITLI satırları tazeler.
   *
   * `state.staged` (bekleyen/hatalı satırlar) burada ASLA temizlenmez — eskiden
   * sunucu yanıtı tüm satırları eziyor ve kaydedilemeyen kayıt ekrandan siliniyordu.
   */
  loadTabRows(state: TabState): void {
    if (this.isNew || !this.recordId) return;   // henüz üst kayıt yok, çekilecek satır da yok
    state.loading = true;
    state.error = null;
    this.publishedModel.getAll(state.typeName, state.fkColumn, this.recordId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        state.loading = false;
        state.rows = res.success ? (res.data ?? []) as DataRow[] : [];
        // Satırlar geldi: bu sayfadaki lookup FK'lerinin etiketlerini kolon başına
        // tek istekte çöz (dropdown artık tam listeyi tutmuyor).
        this.resolveLookupLabels(state.columns, state.rows);
        // Artık var olmayan satırların ID'leri seçili kalmasın.
        const ids = new Set(state.rows.map(r => this.rowId(r)));
        state.selectedIds = new Set([...state.selectedIds].filter(id => ids.has(id)));
        if (!res.success) state.error = res.message ?? this.languageService.t('model.detail.recordsFetchFailed');
      },
      error: err => {
        state.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        state.error = e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.recordsLoadFailed');
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

  /** Tablo başlıkları — key veri/sıralama anahtarı (ham columnName), label görünen metin. */
  tableHeaders(state: TabState): { key: string; label: string }[] {
    return [
      { key: 'ID', label: 'ID' },
      ...this.displayCols(state).map(c => ({ key: c.columnName, label: this.colLabel(c) }))
    ];
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
    this.modelColumnSetting.get(state.typeName, 'list').pipe(markDirty(this.cdr)).subscribe({
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
    this.modelColumnSetting.set(dto).pipe(markDirty(this.cdr)).subscribe({
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

  /**
   * Filtrelenmiş + sıralanmış satırlar. Hesap saf bir fonksiyonda
   * (display-rows.util) durur; burada yalnızca önbellek saklanır.
   */
  getDisplayRows(state: TabState): DataRow[] {
    state.displayCache = selectDisplayRows(
      {
        rows: state.rows,
        searchTerm: state.searchTerm,
        sortCol: state.sortCol,
        sortDir: state.sortDir,
        searchableColumns: this.displayCols(state).map(c => c.columnName),
        locale: this.languageService.lang()
      },
      state.displayCache
    );

    return state.displayCache.result;
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

  /** Tablo hücresi için görüntülenecek değer — lookup kolonları FK ID yerine display değerini gösterir. */
  tabCellDisplay(state: TabState, row: DataRow, columnName: string): string {
    const col = state.columns.find(c => c.columnName === columnName);
    if (col?.dataType === 'lookup') {
      return this.lookupCellLabel(col, fieldValue(row, columnName));
    }
    return this.cellVal(row, columnName);
  }

  strVal(row: DataRow, col: string): string {
    const v = fieldValue(row, col);
    return typeof v === 'string' ? v : '';
  }

  // ─── Satır seçimi (kayıtlı satırlar) ────────────────────────────────────────
  // Seçim, arama filtresinden geçen GÖRÜNEN satırlar üzerinden yürür: kullanıcı
  // "tümünü seç" derken ekranda gördüğünü kasteder, gizli satırları değil.

  isRowSelected(state: TabState, row: DataRow): boolean {
    return state.selectedIds.has(this.rowId(row));
  }

  toggleRow(state: TabState, row: DataRow): void {
    const id = this.rowId(row);
    if (state.selectedIds.has(id)) state.selectedIds.delete(id);
    else state.selectedIds.add(id);
  }

  selectedCount(state: TabState): number {
    return state.selectedIds.size;
  }

  allRowsSelected(state: TabState): boolean {
    const rows = this.getDisplayRows(state);
    return rows.length > 0 && rows.every(r => state.selectedIds.has(this.rowId(r)));
  }

  someRowsSelected(state: TabState): boolean {
    return state.selectedIds.size > 0 && !this.allRowsSelected(state);
  }

  toggleAllRows(state: TabState): void {
    const rows = this.getDisplayRows(state);
    if (this.allRowsSelected(state)) {
      for (const r of rows) state.selectedIds.delete(this.rowId(r));
    } else {
      for (const r of rows) state.selectedIds.add(this.rowId(r));
    }
  }

  // ─── Satır seçimi (bekleyen satırlar) ───────────────────────────────────────

  isStagedSelected(state: TabState, node: StagedNode): boolean {
    return state.selectedStaged.has(node.localId);
  }

  toggleStaged(state: TabState, node: StagedNode): void {
    if (state.selectedStaged.has(node.localId)) state.selectedStaged.delete(node.localId);
    else state.selectedStaged.add(node.localId);
  }

  selectedStagedCount(state: TabState): number {
    return state.selectedStaged.size;
  }

  allStagedSelected(state: TabState): boolean {
    return state.staged.length > 0 && state.staged.every(n => state.selectedStaged.has(n.localId));
  }

  someStagedSelected(state: TabState): boolean {
    return state.selectedStaged.size > 0 && !this.allStagedSelected(state);
  }

  toggleAllStaged(state: TabState): void {
    if (this.allStagedSelected(state)) state.selectedStaged.clear();
    else state.staged.forEach(n => state.selectedStaged.add(n.localId));
  }

  // ─── Toplu silme / kaldırma ─────────────────────────────────────────────────

  /** Onay diyaloğunun hedefi; null ise diyalog kapalı. */
  bulkState: TabState | null = null;
  /** 'saved' = sunucudan sil, 'staged' = bellekten kaldır. */
  bulkMode: 'saved' | 'staged' = 'saved';
  bulkBusy = false;

  openBulkDelete(state: TabState): void {
    this.bulkState = state;
    this.bulkMode = 'saved';
  }

  openBulkRemoveStaged(state: TabState): void {
    this.bulkState = state;
    this.bulkMode = 'staged';
  }

  cancelBulk(): void {
    if (this.bulkBusy) return;
    this.bulkState = null;
  }

  get bulkTitle(): string {
    return this.languageService.t(
      this.bulkMode === 'staged' ? 'model.detail.bulkRemoveStagedTitle' : 'model.detail.bulkDeleteTitle'
    );
  }

  get bulkMessage(): string {
    if (!this.bulkState) return '';
    const count = this.bulkMode === 'staged'
      ? this.selectedStagedCount(this.bulkState)
      : this.selectedCount(this.bulkState);
    return this.languageService.t(
      this.bulkMode === 'staged' ? 'model.detail.bulkRemoveStagedMessage' : 'model.detail.bulkDeleteMessage',
      { count }
    );
  }

  /**
   * Onaylanan toplu işlemi uygular.
   *
   * Sunucuda toplu silme ucu YOKTUR; her kayıt tek tek silinir. Kısmi başarı kabul edilir:
   * silinenler listeden düşer, silinemeyenler SEÇİLİ KALIR ve hataları özetlenir — böylece
   * kullanıcı yalnızca sorunlu satırlarla ilgilenir.
   */
  confirmBulk(): void {
    const state = this.bulkState;
    if (!state || this.bulkBusy) return;

    if (this.bulkMode === 'staged') {
      state.staged = state.staged.filter(n => !state.selectedStaged.has(n.localId));
      state.selectedStaged.clear();
      this.bulkState = null;
      return;
    }

    const ids = [...state.selectedIds];
    if (ids.length === 0) { this.bulkState = null; return; }

    this.bulkBusy = true;
    state.bulkErrors = [];
    state.bulkTotal = ids.length;

    forkJoin(
      ids.map(id =>
        this.publishedModel.delete(state.typeName, id).pipe(
          map(res => ({ id, ok: res.success, message: res.message })),
          catchError(err => of({ id, ok: false, message: this.errMsg(err) }))
        )
      )
    ).pipe(markDirty(this.cdr)).subscribe(results => {
      this.bulkBusy = false;
      this.bulkState = null;

      const failed = results.filter(r => !r.ok);
      state.selectedIds = new Set(failed.map(r => r.id));
      state.bulkErrors = failed.map(r => `ID:${r.id} — ${r.message}`);

      this.lookupLabels.invalidate(state.typeName);
      this.loadTabRows(state);
    });
  }

  // ─── Kayıt pop-up'ı (alt model ekle/düzenle) ───────────────────────────────
  // Satır içi form kaldırıldı: ekleme/düzenleme artık app-record-form-dialog ile
  // yapılır ve o dialog kendi alt modellerini de iç içe gösterir.

  /** Alt modele yeni kayıt — bellekte bekleyen bir düğüm açar, HTTP yapılmaz. */
  openChildAdd(state: TabState): void {
    this.dialogTabName = state.typeName;
    this.dialogNode = createStagedNode(state.typeName, {});
    this.dialogIsEdit = false;
    this.dialogSavedId = null;
    this.dialogFkColumn = state.fkColumn;
    this.dialogOpen = true;
  }

  /** Bekleyen (kaydedilmemiş veya hata almış) bir satırı düzenler. */
  openStagedEdit(state: TabState, node: StagedNode): void {
    this.dialogTabName = state.typeName;
    this.dialogNode = node;
    this.dialogIsEdit = true;
    this.dialogSavedId = node.savedId;
    this.dialogFkColumn = state.fkColumn;
    this.dialogOpen = true;
  }

  /** Sunucuda KAYITLI bir satırı düzenler — pop-up kapanınca doğrudan update edilir. */
  openSavedEdit(state: TabState, row: DataRow): void {
    const id = this.rowId(row);
    // Sunucu satırı camelCase gelir; şema adlarına indirgenmeden forma da payload'a da
    // güvenle verilemez (bkz. normalizeRow doc'u).
    const node = createStagedNode(state.typeName, normalizeRow(state.columns, row));
    node.savedId = id;
    this.dialogTabName = state.typeName;
    this.dialogNode = node;
    this.dialogIsEdit = true;
    this.dialogSavedId = id;
    this.dialogFkColumn = state.fkColumn;
    this.dialogOpen = true;
  }

  /**
   * Pop-up "Tamam" dedi. Kayıtlı bir satır düzenlendiyse hemen `update` edilir;
   * bekleyen bir satırsa yalnızca belleğe yazılır — ağaç, üst modelde "Kaydet"e
   * basılana kadar sunucuya gitmez.
   */
  onRecordDialogSaved(node: StagedNode): void {
    const state = this.tabStates.get(this.dialogTabName);
    if (!state) { this.closeRecordDialog(); return; }

    if (this.dialogSavedId !== null) {
      const payload: DataRow = {
        ...sanitizePayload(state.columns, node.values),
        [state.fkColumn]: this.recordId,
        ID: this.dialogSavedId
      };
      const savedId = this.dialogSavedId;
      this.publishedModel.update(state.typeName, payload).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          if (res.success) {
            node.error = null;
            node.dirty = false;
            this.saveNewDescendants(state, node, savedId);
          } else {
            // Güncelleme reddedildi — satırı bekleyen listesine al ki değerler kaybolmasın.
            node.error = res.message;
            this.addStaged(state, node);
          }
        },
        error: err => {
          node.error = this.errMsg(err);
          this.addStaged(state, node);
        }
      });
      this.closeRecordDialog();
      return;
    }

    this.addStaged(state, node);
    this.closeRecordDialog();
  }

  /**
   * Kayıtlı bir satır güncellendikten sonra, pop-up'ta ona EKLENEN yeni torun kayıtlarını
   * yazar. `toTreeDto` `existingId` dolu olduğunda kökü yeniden EKLEMEZ, yalnızca
   * çocukları mevcut kaydın altına bağlar. Torun yoksa istek gönderilmez.
   */
  private saveNewDescendants(state: TabState, node: StagedNode, savedId: number): void {
    // Kökün kendisi az önce `update` edildi; burada yalnızca torunlar kalır.
    node.dirty = false;
    const hasNewChildren = [...node.children.values()].some(list => list.some(n => n.savedId === null));
    const updates = dirtyNodes(node);

    if (!hasNewChildren && updates.length === 0) {
      this.loadTabRows(state);
      return;
    }

    const requests: Observable<TreeStep>[] = [];
    if (hasNewChildren) {
      const dto = toTreeDto(node, t => this.columnsOf(t), savedId);
      requests.push(
        this.publishedModel.addTree(dto).pipe(
          map(res => ({ kind: 'tree', ok: res.success, message: res.message, data: res.data } as TreeStep)),
          catchError(err => of({ kind: 'tree', ok: false, message: this.errMsg(err) } as TreeStep))
        )
      );
    }
    requests.push(...this.updateRequests(updates));

    forkJoin(requests).pipe(markDirty(this.cdr)).subscribe(steps => {
      for (const step of steps) {
        if (step.kind === 'update' && step.node && step.ok) {
          step.node.error = null;
          step.node.dirty = false;
        }
      }
      const failed = steps.find(s => !s.ok);
      if (failed) {
        // Yazılamadı — satırı bekleyen listesine al ki girilenler kaybolmasın.
        node.error = failed.message;
        this.addStaged(state, node);
      }
      this.loadTabRows(state);
    });
  }

  /** Düğümü sekmenin bekleyen listesine ekler veya günceller. */
  private addStaged(state: TabState, node: StagedNode): void {
    const idx = state.staged.findIndex(n => n.localId === node.localId);
    if (idx >= 0) state.staged = state.staged.map(n => (n.localId === node.localId ? node : n));
    else state.staged = [...state.staged, node];
  }

  closeRecordDialog(): void {
    this.dialogOpen = false;
    this.dialogNode = null;
    this.dialogTabName = '';
    this.dialogIsEdit = false;
    this.dialogSavedId = null;
    this.dialogFkColumn = null;
  }

  /**
   * "Kaydet"e basılınca sunucuya YAZILACAK satır sayısı — buton etiketi ve
   * `submitEdit`'in `saveTree` çağırıp çağırmayacağı bu değere bakar.
   *
   * Yalnızca eklenecekleri saymak yetmez: kaydedilmiş ama değiştirilmiş (dirty) bir satır
   * da yazılacaktır. Eskiden sayılmadığı için, tek bekleyen satır o olduğunda "Kaydet"
   * hiçbir istek göndermiyordu.
   */
  get totalStagedCount(): number {
    let total = 0;
    for (const [, state] of this.tabStates) {
      for (const node of state.staged) {
        for (const n of flattenNodes(node)) {
          if (n.savedId === null || n.dirty) total++;
        }
      }
    }
    return total;
  }

  /** Herhangi bir sekmede kaydetme hatası olan satır var mı. */
  get hasStagedErrors(): boolean {
    for (const [, state] of this.tabStates) {
      for (const node of state.staged) {
        if (node.error || treeHasErrors(node)) return true;
      }
    }
    return false;
  }

  // ─── Bekleyen ağacın toplu kaydedilmesi ────────────────────────────────────

  /**
   * Ana kaydı ve bekleyen tüm alt ağacı TEK istekte gönderir.
   *
   * Sunucu hepsini TEK transaction içinde yazar ve her düğümün GERÇEK ID'sini
   * (EF identity) döndürür — istemci hiçbir ID tahmin etmez. Eskiden kayıt
   * eklendikten sonra liste çekilip `max(ID)` alınıyordu; eşzamanlı kullanıcılarda
   * bu, alt kayıtların YABANCI bir üst kayda bağlanmasına yol açabiliyordu.
   *
   * Semantik "hepsi ya da hiçbiri": bir alan bile geçersizse hiçbir kayıt oluşmaz
   * ve hataların tamamı birden döner; bekleyen satırlar ekranda kalır.
   *
   * @param existingRootId Doluysa kök yeniden EKLENMEZ (mevcut kayda alt kayıt ekleme).
   */
  private saveTree(existingRootId: number | null): void {
    const rootNode = createStagedNode(this.typeName, this.editForm?.value ?? {});
    for (const [childTypeName, state] of this.tabStates) {
      if (state.staged.length > 0) rootNode.children.set(childTypeName, state.staged);
    }

    // Kök burada hiç `dirty` olmaz (yeni oluşturuldu) — üst form kendi `update`'ini
    // `submitEdit` içinde zaten göndermiştir; buradaki update'ler yalnızca alt ağaç içindir.
    const updates = dirtyNodes(rootNode);

    // Ağaç isteği yalnızca gerçekten EKLENECEK bir şey varsa gönderilir; aksi halde
    // sunucu tüm düğümleri `existingId` yüzünden atlayacağı için boşa istek olur.
    const treeNeeded = existingRootId === null || hasInserts(rootNode);

    const requests: Observable<TreeStep>[] = [];
    if (treeNeeded) {
      const dto = toTreeDto(rootNode, t => this.columnsOf(t), existingRootId);
      requests.push(
        this.publishedModel.addTree(dto).pipe(
          map(res => ({ kind: 'tree', ok: res.success, message: res.message, data: res.data } as TreeStep)),
          catchError(err => {
            const body = (err as { error?: { data?: TreeSaveResult; message?: string } })?.error;
            return of({ kind: 'tree', ok: false, message: this.errMsg(err), data: body?.data } as TreeStep);
          })
        )
      );
    }
    requests.push(...this.updateRequests(updates));

    if (requests.length === 0) {
      this.editLoading = false;
      return;
    }

    forkJoin(requests).pipe(markDirty(this.cdr)).subscribe(steps => {
      this.editLoading = false;

      const tree = steps.find(s => s.kind === 'tree');
      // Ağaç adımı yoksa önceki turun hataları taşınmasın diye liste sıfırlanır.
      this.childSaveErrors = tree
        ? applyTreeResult(rootNode, tree.data ?? { savedIds: {}, errors: {} })
        : [];

      const { errors } = applyUpdateResults(steps);
      this.childSaveErrors = [...this.childSaveErrors, ...errors];

      const allOk = steps.every(s => s.ok);
      this.editOk = allOk;
      // Ağaç adımı varsa onun mesajı; yoksa yalnızca hata durumunda yaz — aksi halde üst
      // kaydın kendi "güncellendi" mesajı (submitEdit'te set edilir) ezilmemeli.
      if (tree) this.editMsg = tree.message;
      else if (!allOk) this.editMsg = errors[0] ?? this.editMsg;

      // Kökün gerçek ID'si sunucudan geldi → yerinde düzenleme moduna geç.
      if (tree?.ok) {
        const rootId = existingRootId ?? tree.data?.savedIds?.[String(rootNode.localId)];
        if (rootId && this.isNew) this.switchToEditMode(rootId);
      }

      // Yazılan satırlar bekleyen listesinden düşer; yazılamayanlar HATASIYLA KALIR —
      // kullanıcı düzeltip tekrar deneyebilsin diye asla sessizce silinmezler.
      for (const [, state] of this.tabStates) {
        if (state.staged.length === 0) continue;
        const remaining = state.staged.filter(n => n.savedId === null || n.error);
        if (remaining.length === state.staged.length) continue;
        state.staged = remaining;
        this.lookupLabels.invalidate(state.typeName);
        this.loadTabRows(state);
      }
    });
  }

  /**
   * Kaydedilmiş ve değiştirilmiş düğümler için `update()` istekleri üretir.
   *
   * `addTree` mevcut bir kaydı GÜNCELLEYEMEZ — `existingId` dolu düğümü atlar — bu yüzden
   * kullanıcının kayıtlı bir satırda yaptığı düzeltme ancak buradan sunucuya ulaşır.
   */
  private updateRequests(nodes: StagedNode[]): Observable<TreeStep>[] {
    return nodes.map(node => {
      const payload: DataRow = {
        ...sanitizePayload(this.columnsOf(node.typeName), node.values),
        ID: node.savedId
      };
      return this.publishedModel.update(node.typeName, payload).pipe(
        map(res => ({ kind: 'update', ok: res.success, message: res.message, node } as TreeStep)),
        catchError(err => of({ kind: 'update', ok: false, message: this.errMsg(err), node } as TreeStep))
      );
    });
  }
  /** Bir tipin kolonları (payload temizliği için). */
  private columnsOf(typeName: string): PublishedColumn[] {
    return this.allModels.find(m => m.typeName === typeName)?.columns ?? [];
  }

  private errMsg(err: unknown): string {
    const e = err as { error?: { message?: string }; message?: string };
    return e?.error?.message ?? e?.message ?? this.languageService.t('model.detail.operationFailed');
  }

  /** Bekleyen bir satırın tabloda gösterilecek hücre değeri. */
  stagedCell(node: StagedNode, columnName: string): string {
    const v = fieldValue(node.values, columnName);
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  /** Bekleyen bir satırın kendi alt ağacındaki toplam kayıt sayısı (rozet için). */
  stagedChildTotal(node: StagedNode): number {
    return treePendingCount(node);
  }
}
