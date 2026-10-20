import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
import { PermissionService } from '../../services/permission.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { RecordMetadataService } from '../../services/record-metadata.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { RecordFormDialogComponent } from '../shared/record-form-dialog/record-form-dialog.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { RecordLayoutComponent } from '../shared/record-layout/record-layout.component';
import { WorkflowPanelComponent } from '../shared/workflow-panel/workflow-panel.component';
import { TaskActionDialogComponent, TaskActionResult } from '../shared/task-action-dialog/task-action-dialog.component';
import { WorkflowViewDialogComponent } from '../shared/workflow-view-dialog/workflow-view-dialog.component';
import { WorkflowInstanceService, WorkflowTaskService } from '../../services/workflow-task.service';
import { NotificationService } from '../../services/notification.service';
import { MyRecordTask, RecordWorkflowState, StartableWorkflow, WorkflowInstance } from '../../models/workflow.model';
import { buildRecordValues, lockedColumns, missingRequired } from './workflow-lock.util';
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
  isImage,
  imageSrc,
  isBase64Value,
  downloadFile,
  sanitizePayload,
  fieldValue,
  toInputValue
} from '../model-data/model-data.util';
import { markDirty } from '../../utils/change-detection';
import { AutoValueFormBinding } from '../../utils/auto-value/auto-value-form';
import { buildAutoValuePlan } from '../../utils/auto-value/auto-value';
import { mustStayVisible } from '../../utils/record-field/column-required';
import { FormLayout, ListLayout } from '../../utils/screen-layout/screen-layout.model';
import { resolveListColumns } from '../../utils/screen-layout/list-layout.resolve';

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
  /** Alt modelin yayınlanmış liste yerleşimi (ekran tasarımı) — varsa kolon sırası ondan. */
  listLayout: ListLayout | null;
}

@Component({
  selector: 'app-model-detail',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, ColumnVisibilityComponent,
    TranslatePipe, RecordFormDialogComponent, ConfirmDialogComponent, RecordLayoutComponent,
    WorkflowPanelComponent, TaskActionDialogComponent, WorkflowViewDialogComponent
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
  private readonly taskService = inject(WorkflowTaskService);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly notification = inject(NotificationService);

  /** Kaydın altındaki süreç geçmişi paneli — adım/başlatma sonrası tazelenir. */
  @ViewChild('wfPanel') private wfPanel?: WorkflowPanelComponent;
  /** Üst formun yerleşimi — Kaydet geçersiz formda durunca hatalı alanı gösterir. */
  @ViewChild(RecordLayoutComponent) private recordLayout?: RecordLayoutComponent;

  // ─── Form tabanlı iş akışı ──────────────────────────────────────────────────
  //
  // Kaydedilmiş kayıtta sunucunun kilit kararı (recordState) tutulur: süreç
  // sürerken yalnız sırası gelen kişi, yalnız kendi adımının kolonlarını
  // düzenler. Kilit sunucuda da uygulanır; buradaki yalnızca ekrana yansıması.

  /** Kaydın süreç durumu; yeni kayıtta ya da modül kurulu değilse null. */
  wfState: RecordWorkflowState | null = null;
  /** Yeni kayıtta elle başlatılabilen akışlar (kayıtlıda wfState.startable). */
  private newStartable: StartableWorkflow[] = [];
  /** Süren akış işlemi — basılan butonda spinner: 'start:{code}' | 'approve:{id}' | 'reject:{id}'. */
  wfBusy: string | null = null;
  /** Kaydet başarıyla bitince başlatılacak akış kodu ("{Akış} Başlat"). */
  private pendingStart: string | null = null;
  /** Adım eylem diyaloğu (ek karar alanları / red açıklaması). */
  actionDialog: { task: MyRecordTask; decision: 'approve' | 'reject'; error: string | null } | null = null;
  /**
   * Kaydın kullanıcıya görünen en yeni süreci (sürüyor ya da bitmiş) — "Akışı
   * görüntüle" düğmesi. Süreç paneli yükler; görme kararı sunucuda
   * (Okuma + Akışı görüntüle izni, başlatan ya da görevli).
   */
  latestInstanceId: number | null = null;
  /** Açık "Akışı görüntüle" diyaloğunun süreci; null → kapalı. */
  viewInstanceId: number | null = null;

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

  // Alt modeller (sekmeler)
  childModelNames: string[] = [];
  activeTab = '';
  allModels: PublishedModel[] = [];
  tabStates = new Map<string, TabState>();
  loadingChildren = false;

  /** Üst modelin şema kuralları (regex/uzunluk/aralık) — istemci doğrulaması için. */
  private parentRules = new Map<string, PublishedColumnSchema>();

  /**
   * Üst forma bağlı otomatik değer kuralları. Form her yeniden kurulduğunda (kurallar
   * gelince, akış sonrası) eskisi bırakılıp yenisi bağlanır.
   */
  private autoValues: AutoValueFormBinding | null = null;

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

  // ─── Ekran tasarımı ─────────────────────────────────────────────────────────
  //
  // Yayınlanmış form yerleşimi varsa alanlar onun sekme/bölüm/ızgarasına çizilir ve
  // "Kolonlar" ayarının yerini alır. Yerleşim bileşenine giden kümeler alan olarak
  // tutulur (getter her turda yeni nesne üretip planı boşuna yeniden hesaplatırdı).

  /** Yayındaki form yerleşimi; null → varsayılan görünüm. */
  formLayout: FormLayout | null = null;
  /** Sırası gelen görevlinin dolduracağı kolonlar (gerçek kolon adlarıyla). */
  stepColumnSet: ReadonlySet<string> = new Set();
  /** Tasarımda gizli olsa da çizilmesi gereken kolonlar: zorunlular + adım kolonları. */
  forcedParentColumns: ReadonlySet<string> = new Set();

  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private publishedModel: PublishedModelService,
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
    this.autoValues?.stop();
  }

  // ─── Util delegasyonları ─────────────────────────────────────────────────────

  isImage        = isImage;
  imageSrc       = imageSrc;
  isBase64Value  = isBase64Value;

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
    this.childModelNames = [];
    this.activeTab = '';
    this.allModels = [];
    this.tabStates.clear();
    this.loadingChildren = false;
    this.childSaveErrors = [];
    this.parentRules = new Map();
    this.autoValues?.stop();
    this.autoValues = null;
    this.closeRecordDialog();
    this.visibleParentColumnNames = null;
    this.formLayout = null;
    this.stepColumnSet = new Set();
    this.forcedParentColumns = new Set();
    this.wfState = null;
    this.newStartable = [];
    this.wfBusy = null;
    this.pendingStart = null;
    this.actionDialog = null;
    this.latestInstanceId = null;
    this.viewInstanceId = null;
  }

  // ─── Veri yükleme ───────────────────────────────────────────────────────────

  private loadAll(): void {
    this.loadingRecord = true;

    if (this.isNew) {
      // Yeni kayıt modu: model şemasını yükle + alt sekmeleri hazırla
      // Yerleşim de ilk yüklemede okunur: aksi halde form önce varsayılan görünümle çizilip
      // ardından yerleşime "zıplardı".
      forkJoin({
        models: this.publishedModel.getModels(),
        layout: this.metadata.formLayout$(this.typeName)
      }).pipe(markDirty(this.cdr)).subscribe({
        next: ({ models: res, layout }) => {
          this.loadingRecord = false;
          this.formLayout = layout;
          if (res.success) {
            this.allModels = res.data ?? [];
            this.model = this.allModels.find(m => m.typeName === this.typeName) ?? null;
          }
          this.refreshLayoutInputs();
          if (this.model) {
            this.buildNewForm();
            // Şema mevcutsa alt sekmeleri de yükle (server'dan veri çekmeden)
            this.loadChildrenForNew();
            this.loadStartable();
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
      record: this.publishedModel.get(this.typeName, this.recordId),
      layout: this.metadata.formLayout$(this.typeName)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ models, record, layout }) => {
        this.loadingRecord = false;
        this.formLayout = layout;

        if (models.success) {
          this.allModels = models.data ?? [];
          this.model = this.allModels.find(m => m.typeName === this.typeName) ?? null;
        }
        this.refreshLayoutInputs();

        if (record.success && record.data) {
          this.record = record.data as DataRow;
          // Kayıt geldi — doğrudan düzenleme formunu aç (salt-okunur modu yoktur)
          this.openEditMode();
          this.loadWorkflowState();
        } else if (record.success && !record.data) {
          // Kayıt yok ya da kullanıcı göremez (yalnız-kendi-kayıtları kapsamı). Assembly
          // eksikliği burada değil, success=false + AssemblyNotLoaded olarak gelir — eskiden
          // burada loadAssembly yeniden denenirdi: admin'de sonsuz döngü, admin olmayanda
          // 403 → /models yönlendirmesi.
          this.recordError = this.languageService.t('model.detail.recordNotFound');
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

  private loadChildren(): void {
    this.loadingChildren = true;
    this.publishedModel.getChildModels(this.typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loadingChildren = false;
        // Okuma izni olmayan alt modelin sekmesi açılmaz: satırlarını çeken getall 403
        // döner ve kullanıcıyı kayıttan /models'e atardı. Admin'de filtre hep true.
        const readable = (res.success ? res.data ?? [] : [])
          .filter(name => this.permission.can(name, 'read'));
        if (readable.length) {
          this.childModelNames = readable;
          this.activeTab = readable[0];
          for (const name of readable) {
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
   * kolonlar her zaman dahil edilir — aksi halde form geçersiz kalır ve Kaydet, gizli
   * alandaki hata yüzünden sessizce hiçbir şey yapmaz. Zorunluluk şema kuralından okunur
   * (bkz. mustStayVisible): `isNullable` metin/dosya kolonlarında hep true gelir.
   * Not: editForm her zaman TÜM kolonlarla kurulur (openEditMode/buildNewForm); bu getter
   * sadece render'ı filtreler, form bütünlüğünü etkilemez.
   */
  get visibleParentColumns(): PublishedColumn[] {
    if (!this.visibleParentColumnNames) return this.parentColumns;
    const visible = new Set(this.visibleParentColumnNames);
    // Adımın doldurulacak kolonları da her zaman görünür: admin detay görünümünden
    // gizlemiş olsa bile görevli o alanı doldurmadan adımı ilerletemez.
    return this.parentColumns.filter(c =>
      mustStayVisible(c, this.parentRules.get(c.columnName)) || visible.has(c.columnName) || this.isStepColumn(c));
  }

  /** Kolon görünürlüğü popover'ı için kolon listesi — zorunlu alanlar gizlenemez */
  get parentColumnVisibilityItems(): ColumnVisibilityItem[] {
    return this.parentColumns.map(c => ({
      name: c.columnName,
      required: mustStayVisible(c, this.parentRules.get(c.columnName))
    }));
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
      this.refreshLayoutInputs();
      rebuild();
    });
  }

  /** Bir üst-kayıt kolonunun doğrulayıcıları — şema kuralı varsa ona göre. */
  private parentValidators(col: PublishedColumn) {
    return validatorsFor(col, this.parentRules.get(col.columnName));
  }

  // ─── Otomatik değer ─────────────────────────────────────────────────────────

  /** Kolonların otomatik değer kurallarını (şemadan) yeni kurulmuş forma bağlar. */
  private bindAutoValues(isNew: boolean): void {
    this.autoValues?.stop();
    this.autoValues = null;
    if (!this.editForm) return;

    const plan = buildAutoValuePlan(this.parentColumns.map(col => {
      const rule = this.parentRules.get(col.columnName);
      return {
        name: col.columnName,
        dataType: col.dataType,
        autoValueTrigger: rule?.autoValueTrigger,
        autoValueExpression: rule?.autoValueExpression,
        isReadOnly: rule?.isReadOnly
      };
    }));
    if (plan.rules.length === 0) return;
    this.autoValues = new AutoValueFormBinding(this.editForm, plan, isNew).start();
  }

  /**
   * Kayıttan sonra sunucunun hesapladığı değerleri (SEQ numarası, kaydederken çalışan
   * ve salt okunur kurallar) forma yansıtır. Kural yoksa istek atılmaz.
   * openEditMode mesajı sıfırladığı için kayıt sonucu mesajı korunur.
   */
  private reloadAfterAutoValues(): void {
    if (!this.autoValues || this.recordId <= 0) return;
    const typeName = this.typeName;
    const id = this.recordId;

    this.publishedModel.get(typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId || !res.success || !res.data) return;
        const { editMsg, editOk } = this;
        this.record = res.data as DataRow;
        this.openEditMode();
        this.editMsg = editMsg;
        this.editOk = editOk;
      },
      error: () => { /* okunamazsa formdaki (istemci) değerler kalır */ }
    });
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
      this.bindAutoValues(false);
      // Form kurallar gelince YENİDEN kuruluyor; kilit her kurulumda uygulanmalı,
      // yoksa ikinci kurulum disabled durumunu siler.
      this.applyWorkflowLock();
    };
    build();                          // kurallar gelene kadar form kullanılabilir kalsın
    this.loadParentRules(build);      // kurallar gelince doğrulayıcılarla yeniden kurulur
    this.editMsg = null;
    this.editOk = null;
    this.showEditForm = true;
  }

  /** Yeni kayıt modu için boş form oluştur */
  private buildNewForm(): void {
    const build = () => {
      // getRawValue: salt okunur (disabled) otomatik alanların değeri de taşınsın
      const previous = this.editForm?.getRawValue() ?? {};
      const controls: Record<string, unknown> = {};
      for (const col of this.parentColumns) {
        controls[col.columnName] = [previous[col.columnName] ?? '', this.parentValidators(col)];
      }
      this.editForm = this.fb.group(controls);
      // Açılış kuralları yalnız BOŞ alanlara yazar — kurallar gelip form yeniden
      // kurulduğunda kullanıcının o ana dek yazdıkları ezilmez.
      this.bindAutoValues(true);
    };
    build();
    this.loadParentRules(build);
    this.editMsg = null;
    this.editOk = null;
    this.showEditForm = true;
  }

  /** Üst modelin şema kuralları — yerleşim bileşenine geçirilir (referans kurallar gelince değişir). */
  get parentRuleMap(): ReadonlyMap<string, PublishedColumnSchema> {
    return this.parentRules;
  }

  /** Forma bağlı otomatik değer kuralları — yerleşim bileşenine geçirilir. */
  get autoValuesBinding(): AutoValueFormBinding | null {
    return this.autoValues;
  }

  /** Admin'e tasarımcı bağlantısı (yerleşim bileşenindeki "güncel değil" uyarısı); diğerlerine null. */
  get designLink(): string[] | null {
    return this.permission.isAdmin() ? ['/build', this.typeName, 'screen'] : null;
  }

  /**
   * Yerleşim bileşeninin kümelerini yeniden kurar: adım kolonları ve gizlenemeyecek kolonlar.
   * Kurallar, model ya da iş akışı durumu değiştiğinde çağrılır.
   */
  private refreshLayoutInputs(): void {
    const byLower = new Map(this.parentColumns.map(c => [c.columnName.toLowerCase(), c.columnName]));
    const steps = new Set<string>();
    for (const task of this.myStepTasks) {
      for (const field of task.recordFields) {
        const name = byLower.get(field.column.toLowerCase());
        if (name) steps.add(name);
      }
    }
    this.stepColumnSet = steps;

    const forced = new Set(steps);
    for (const col of this.parentColumns) {
      if (mustStayVisible(col, this.parentRules.get(col.columnName))) forced.add(col.columnName);
    }
    this.forcedParentColumns = forced;
  }

  /**
   * Kaydeder. `startCode` verilirse ("{Akış} Başlat") kayıt TAM başarıyla
   * yazıldıktan sonra o akış başlatılır; kayıt hatasında süreç başlamaz.
   */
  submitEdit(startCode?: string): void {
    if (!this.editForm || this.editForm.invalid || this.editLoading) {
      this.editForm?.markAllAsTouched();
      // Hatalı alan kapalı bir sekmede/bölümde olabilir — kullanıcı "hiçbir şey olmadı" sanmasın.
      if (this.editForm?.invalid && !this.editLoading) this.recordLayout?.revealFirstInvalid();
      return;
    }
    this.pendingStart = startCode ?? null;
    this.editLoading = true;
    this.editMsg = null;
    this.editOk = null;
    // "Kaydedilirken" kuralları — sunucu da yeniden hesaplar; bu yalnız anında gösterim.
    this.autoValues?.runSave();

    if (this.isNew) {
      // Yeni kayıt: ana kayıt + tüm bekleyen alt ağaç TEK istekte, TEK transaction'da.
      // Kök henüz yok → existingRootId null; sunucu ID'leri kendisi üretip döndürür.
      this.saveTree(null);
    } else {
      if (this.recordLockedForUser) {
        // Onay sürecindeki kayıt: yalnız adımın kolonları, görev yetkisiyle yazılır.
        this.saveStepFields();
        return;
      }

      // Mevcut kaydı güncelle — sayfada kal, başarı mesajı göster
      const jsonData: DataRow = { ...sanitizePayload(this.parentColumns, this.editForm.getRawValue()), ID: this.recordId };
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
          if (this.totalStagedCount > 0 && res.success) {
            this.saveTree(this.recordId);
          } else {
            this.editLoading = false;
            if (res.success) this.editForm?.markAsPristine();
            this.afterSave(res.success);
          }
        },
        error: err => {
          this.editLoading = false;
          this.pendingStart = null;
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
    this.record = { ...(this.editForm?.getRawValue() ?? {}), ID: newId } as DataRow;
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

  // ─── Sekme yönetimi ─────────────────────────────────────────────────────────

  setTab(name: string): void {
    this.activeTab = name;
  }

  /** Dar ekranda sekme çubuğu yatay kayar (kaydırma çubuğu gizli): seçilen sekme yarım görünmesin. */
  revealTab(event: Event): void {
    (event.currentTarget as HTMLElement | null)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  /** Sıradaki adımlardan biri süresini aştıysa şeritte "Gecikmiş" rozeti gösterilir. */
  get hasOverdueStep(): boolean {
    return this.myStepTasks.some(task => task.isOverdue);
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
      savingColumnVisibility: false,
      listLayout: null
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
    // Yayınlanmış liste yerleşimi varsa sıra ve görünürlük ondan (FK kolonu bu tabloda hiç yok).
    return resolveListColumns(state.listLayout, this.visibleCols(state), state.visibleColumnNames)
      .map(r => r.column);
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
    // Ekran tasarımındaki liste yerleşimi "Kolonlar" ayarının yerini alır (okunamazsa null).
    this.metadata.listLayout$(state.typeName).pipe(markDirty(this.cdr)).subscribe(layout => {
      state.listLayout = layout;
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
    // getRawValue: salt okunur (disabled) otomatik alanlar da gitsin; `.value` onları atar.
    const rootNode = createStagedNode(this.typeName, this.editForm?.getRawValue() ?? {});
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

      if (allOk) this.editForm?.markAsPristine();
      this.afterSave(allOk && !this.isNew);

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
  // ─── Form tabanlı iş akışı ──────────────────────────────────────────────────

  /** Yeni kayıtta başlatılabilir akışlar; modül kurulu değilse sessizce boş. */
  private loadStartable(): void {
    const typeName = this.typeName;
    this.instanceService.startable(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName === this.typeName) this.newStartable = res.success ? res.data ?? [] : [];
      },
      error: () => { this.newStartable = []; }
    });
  }

  /** Kaydın süreç durumu (kilit, adım butonları, başlatılabilir akışlar). */
  private loadWorkflowState(): void {
    const typeName = this.typeName;
    const id = this.recordId;
    if (!id) return;

    this.instanceService.recordState(typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId) return;
        this.wfState = res.success ? res.data : null;
        this.refreshLayoutInputs();
        this.applyWorkflowLock();
      },
      // Modül kurulu değil / yetki yok: akış opsiyonel, kayıt ekranı normal çalışır.
      error: () => {
        this.wfState = null;
        this.refreshLayoutInputs();
        this.applyWorkflowLock();
      }
    });
  }

  /** Sunucunun kilit kararını forma uygular (kilitli kolonlar disabled). */
  private applyWorkflowLock(): void {
    const form = this.editForm;
    if (!form) return;

    const locked = lockedColumns(this.parentColumns, this.wfState);
    for (const col of this.parentColumns) {
      const control = form.get(col.columnName);
      if (!control) continue;
      // Salt okunur otomatik alanlar kilitten bağımsız olarak hep kapalı kalır.
      if (locked.has(col.columnName) || this.autoValues?.isReadOnly(col.columnName)) {
        control.disable({ emitEvent: false });
      } else if (control.disabled) {
        control.enable({ emitEvent: false });
      }
    }
  }

  /** Başlıktaki "{Akış} Başlat" butonları — yeni kayıtta startable, kayıtlıda sunucu durumu. */
  get startableWorkflows(): StartableWorkflow[] {
    return this.isNew ? this.newStartable : this.wfState?.startable ?? [];
  }

  /** Kullanıcının bu kayıtta bekleyen adımları — Kaydet'in yanındaki butonlar. */
  get myStepTasks(): MyRecordTask[] {
    return this.wfState?.myTasks ?? [];
  }

  /** Kayıt süreçte ve kullanıcı kilidi aşamıyor (admin değil). */
  get recordLockedForUser(): boolean {
    return !!this.wfState?.isLocked && !this.wfState.canBypass;
  }

  /** Başlıktaki Kaydet görünür mü — kilitliyken yalnız admin ya da adım kolonu olan görevli. */
  get canSaveRecord(): boolean {
    if (!this.editForm) return false;
    if (this.isNew) return this.permission.can(this.typeName, 'create');
    if (this.wfState?.isLocked) return this.wfState.canBypass || this.wfState.editableColumns.length > 0;
    return this.permission.can(this.typeName, 'update');
  }

  /** Alt model sekmelerinde ekle/düzenle/sil — kilitli kayıtta yalnız admin. */
  canChild(typeName: string, action: 'create' | 'update' | 'delete'): boolean {
    return this.permission.can(typeName, action) && !this.recordLockedForUser;
  }

  /** Kolon, kullanıcının bekleyen adımlarından birinin kayıt alanı mı (vurgu + görünürlük). */
  isStepColumn(col: PublishedColumn): boolean {
    const name = col.columnName.toLowerCase();
    return this.myStepTasks.some(t => t.recordFields.some(f => f.column.toLowerCase() === name));
  }

  approveLabelOf(task: MyRecordTask): string {
    return task.approveLabel?.trim() || task.stepName;
  }

  rejectLabelOf(task: MyRecordTask): string {
    return task.rejectLabel?.trim() || this.languageService.t('task.detail.reject');
  }

  /** "{Akış} Başlat": gerekiyorsa önce kaydeder, sonra başlatır. */
  onStartWorkflow(code: string): void {
    if (this.wfBusy || this.editLoading) return;

    // Yeni kayıt önce oluşturulmalı; değişmiş kayıt önce kaydedilmeli (süreç
    // kaydın SON halini görmeli). Güncelleme yetkisi olmayan kayıt sahibi
    // kaydedemez ama başlatabilir — sunucu sahipliği ayrıca denetliyor.
    const mustSave = this.isNew
      || (this.canSaveRecord && (!!this.editForm?.dirty || this.totalStagedCount > 0));

    if (mustSave) {
      this.submitEdit(code);
    } else {
      this.startWorkflow(code);
    }
  }

  /** Kayıt işlemi bitti; bekleyen "{Akış} Başlat" varsa şimdi başlatılır. */
  private afterSave(ok: boolean): void {
    const code = this.pendingStart;
    this.pendingStart = null;

    if (ok && code && this.recordId > 0) {
      this.startWorkflow(code);            // sonrasında kayıt zaten yeniden okunur
      return;
    }
    if (ok && !this.wfState && this.recordId > 0) {
      // Yeni kayıt az önce oluştu: artık kaydedilmiş kaydın durumu (başlatılabilir
      // akışlar) okunabilir.
      this.loadWorkflowState();
    }
    if (ok) this.reloadAfterAutoValues();
  }

  private startWorkflow(code: string): void {
    this.wfBusy = 'start:' + code;

    this.instanceService.start({ entityType: this.typeName, entityId: this.recordId, code })
      .pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.wfBusy = null;
          if (res.success) {
            this.notification.success(res.message || this.languageService.t('workflow.panel.startSuccess'));
            this.refreshAfterWorkflow();
          } else {
            // Kayıt kaydedildi, süreç başlamadı — buton görünür kalır, tekrar denenebilir.
            this.notification.warn(this.languageService.t('workflow.record.savedButStartFailed', {
              message: res.message ?? ''
            }));
            this.loadWorkflowState();
          }
        },
        error: err => {
          this.wfBusy = null;
          this.notification.warn(this.languageService.t('workflow.record.savedButStartFailed', {
            message: this.errMsg(err)
          }));
          this.loadWorkflowState();
        }
      });
  }

  /** Onay sürecindeki kayıtta Kaydet: yalnız adım kolonları, adım ilerlemeden. */
  private saveStepFields(): void {
    const state = this.wfState;
    if (!this.editForm || !state) {
      this.editLoading = false;
      return;
    }

    const values = buildRecordValues(state.editableColumns, this.editForm.getRawValue(), this.parentColumns);
    // Adım kolonu olmayan hesaplanan alanlar gönderilmez; sunucu onları kendisi hesaplar.

    this.taskService.saveRecord({
      entityType: this.typeName,
      entityId: this.recordId,
      recordValuesJson: JSON.stringify(values)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.editLoading = false;
        this.pendingStart = null;
        this.editOk = res.success;
        this.editMsg = res.message;
        if (res.success) {
          this.record = { ...this.record, ...values };
          this.editForm?.markAsPristine();
          this.reloadAfterAutoValues();
        }
      },
      error: err => {
        this.editLoading = false;
        this.pendingStart = null;
        this.editOk = false;
        this.editMsg = this.errMsg(err);
      }
    });
  }

  /**
   * Adım butonu. İlerletmede önce adımın zorunlu kayıt alanları ve formun geçerliliği
   * denetlenir; ek karar alanı yoksa ARA DİYALOG OLMADAN gönderilir. Red her zaman
   * diyalog açar (açıklama yazılabilsin, kaydedilmemiş değişiklik uyarısı görünsün).
   */
  onStepAction(task: MyRecordTask, decision: 'approve' | 'reject'): void {
    if (this.wfBusy || this.editLoading) return;

    if (decision === 'approve') {
      const raw = (this.editForm?.getRawValue() ?? {}) as DataRow;
      const missing = missingRequired(task.recordFields, raw, this.parentColumns);

      if (missing.length > 0) {
        for (const name of missing) {
          const control = this.editForm?.get(name);
          control?.setErrors({ ...(control.errors ?? {}), required: true });
          control?.markAsTouched();
        }
        const labels = missing.map(name => {
          const col = this.parentColumns.find(c => c.columnName === name);
          return col ? this.colLabel(col) : name;
        });
        this.editOk = false;
        this.editMsg = this.languageService.t('workflow.record.requiredForStep', { fields: labels.join(', ') });
        this.recordLayout?.revealFirstInvalid();
        return;
      }

      if (this.editForm?.invalid) {
        this.editForm.markAllAsTouched();
        this.recordLayout?.revealFirstInvalid();
        return;
      }

      if (!task.hasExtraFields) {
        this.completeStep(task, 'approve', { comment: null, formDataJson: null });
        return;
      }
    }

    this.actionDialog = { task, decision, error: null };
  }

  onActionConfirmed(result: TaskActionResult): void {
    if (this.actionDialog) this.completeStep(this.actionDialog.task, this.actionDialog.decision, result);
  }

  closeActionDialog(): void {
    if (!this.wfBusy) this.actionDialog = null;
  }

  /** Süreç paneli yüklendi (ilk açılış ya da başlatma/karar sonrası tazeleme). */
  onWorkflowInstances(instances: WorkflowInstance[]): void {
    this.latestInstanceId = instances[0]?.id ?? null;
  }

  openWorkflowView(instanceId: number): void {
    this.viewInstanceId = instanceId;
  }

  closeWorkflowView(): void {
    this.viewInstanceId = null;
  }

  /** Diyalog başlığı/butonu — adımın ilgili etiketi. */
  get actionDialogLabel(): string {
    const dialog = this.actionDialog;
    if (!dialog) return '';
    return dialog.decision === 'approve' ? this.approveLabelOf(dialog.task) : this.rejectLabelOf(dialog.task);
  }

  /** Görevi kapatır; ilerletmede adımın kayıt alanları AYNI istekte (tek transaction) gider. */
  private completeStep(task: MyRecordTask, decision: 'approve' | 'reject', extra: TaskActionResult): void {
    this.wfBusy = decision + ':' + task.taskId;
    this.editMsg = null;

    // Red kayda yazmaz (sunucu da yazmıyor) — değer göndermek yanıltıcı olurdu.
    const recordValuesJson = decision === 'approve' && task.recordFields.length > 0
      ? JSON.stringify(buildRecordValues(
          task.recordFields.map(f => f.column),
          (this.editForm?.getRawValue() ?? {}) as DataRow,
          this.parentColumns))
      : null;

    this.taskService.complete({
      taskId: task.taskId,
      decision,
      comment: extra.comment,
      formDataJson: extra.formDataJson,
      recordValuesJson
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.wfBusy = null;
        if (res.success) {
          this.actionDialog = null;
          this.notification.success(res.message || this.languageService.t('workflow.record.stepDone'));
          this.refreshAfterWorkflow();
        } else {
          this.showStepError(res.message ?? this.languageService.t('task.detail.submitFailed'));
        }
      },
      error: err => {
        this.wfBusy = null;
        this.showStepError(this.errMsg(err));
      }
    });
  }

  private showStepError(message: string): void {
    if (this.actionDialog) {
      this.actionDialog = { ...this.actionDialog, error: message };
    } else {
      this.editOk = false;
      this.editMsg = message;
    }
  }

  /**
   * Başlatma/adım sonrası: kayıt (akış ve alanlar değişti), süreç durumu ve geçmiş
   * paneli yeniden okunur. Form kayıttan yeniden kurulur; kilit yeni duruma göre uygulanır.
   */
  private refreshAfterWorkflow(): void {
    const typeName = this.typeName;
    const id = this.recordId;

    this.loadWorkflowState();
    this.wfPanel?.load();

    this.publishedModel.get(typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName || id !== this.recordId) return;
        if (res.success && res.data) {
          this.record = res.data as DataRow;
          this.openEditMode();
        }
      },
      error: () => { /* kayıt okunamazsa mevcut form kalır; durum yine tazelendi */ }
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
