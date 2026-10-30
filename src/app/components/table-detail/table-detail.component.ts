import '../../i18n/lazy/datatype-help'; // help.* sözlüğü bu parçayla iner
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, ViewChild, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ReactiveFormsModule, AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { from, concatMap, switchMap, throwError, of, catchError } from 'rxjs';
import {
  AddMemberRequest, PublishedTableService, PublishedColumnSchema, PublishedTableRow, PublishedTableSchema
} from '../../services/published-table.service';
import { RecordMetadataService } from '../../services/record-metadata.service';
import {
  AUTO_VALUE_TRIGGERS, AutoValueColumn, AutoValueTrigger, RuleIssue, buildAutoValuePlan
} from '../../utils/auto-value/auto-value';
import { parseExpression, usesSequence } from '../../utils/auto-value/expression';
import { PublishedModelService } from '../../services/published-model.service';
import { ModelNodeComponent, MAX_DEPTH } from '../model-node/model-node.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HelpHintComponent } from '../shared/help-hint/help-hint.component';
import { DatatypeHelpComponent } from '../shared/datatype-help/datatype-help.component';
import { HelpTopicId } from '../shared/datatype-help/datatype-help.data';
import { RegexPreset } from '../shared/datatype-help/regex-presets';
import { RelationshipType } from '../../models/relationship.model';
import { RelationshipsTabComponent } from './relationships/relationships-tab.component';
import { markDirty } from '../../utils/change-detection';
import {
  FILE_TYPE_GROUPS, FileTypeGroup, MIN_FILE_LIMIT_MB, fileLimitMbValidator, formatFileSize, isFileType, joinFileGroups,
  kbToMb, maxFileKbFor, maxFileMbFor, parseFileGroups
} from '../../utils/file-size';
import {
  MetadataColumn, NUMERIC_COLUMN_TYPES, autoValueKey, isTextColumn, metadataKey, normalizeColumnRules, requiredChangeAllowed,
  schemaMetadataKey, toMemberMetadataUpdate
} from '../../utils/column-rules';
import {
  IDENTIFIER_MAX_LENGTH, IdentifierContext, IdentifierKind, LABEL_MAX_LENGTH, LabelNameSync,
  identifierErrorMessage, identifierValidator, revalidateIdentifiers, sanitizeIdentifierInputEvent
} from '../../utils/identifier';
import { IconComponent } from '../shared/icon/icon.component';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';
import { ModelIconPickerComponent } from '../shared/model-icon/model-icon-picker.component';
import { NotificationService } from '../../services/notification.service';

/** Ekrandaki sekmeler. */
type TabId = 'columns' | 'subModels' | 'relationships';

/** /Published/getAll satırı — model ağacını (parent/derinlik) kurmak için. */
type TableRow = PublishedTableRow;

/** Kayıtlı bir kolonun düzenleme modundaki diff temeli. */
interface ColumnDisplayMeta {
  /** Kayıtlı tip — kilitli; yine de değişmişse kayıt durur (sessizce atılmaz). */
  dataType: string;
  /**
   * Etiket, açıklama, zorunluluk ve kurallar — değişirse updateMemberMetadata ile tek istekte
   * yazılır. Önceden yalnız etiket/açıklama yazılıyor, zorunluluk ve kurallar sessizce atılıyordu.
   */
  metadataKey: string;
  /** Otomatik değer kuralı (tetik|formül|salt okunur) — değişirse setMemberAutoValue ile yazılır. */
  autoValueKey: string;
  /** Kayıtlı enum değerleri ve zorunluluk — popup'taki uyarılar için. */
  enumValues: string;
  isRequired: boolean;
}

/** Formdaki (kaydedilmiş) sütunun diff temeli. */
function columnMetaOf(c: MetadataColumn & { enumValues?: string | null }): ColumnDisplayMeta {
  return {
    dataType: c.dataType,
    metadataKey: metadataKey(c),
    autoValueKey: autoValueKey(c),
    enumValues: c.enumValues ?? '',
    isRequired: !c.isNullable
  };
}

/** Kaydetme akışında kullanılan düzleştirilmiş düğüm verisi */
interface TreeNode {
  entityName: string;
  /** Kullanıcı dostu model adı (PublishedTable.Label). */
  label: string | null;
  parentName: string | null;
  columns: {
    columnName: string;
    dataType: string;
    isNullable: boolean;
    minLength?: number | null;
    maxLength?: number | null;
    min?: number | null;
    max?: number | null;
    regex?: string;
    regexMessage?: string;
    enumValues?: string;
    lookupTargetTable?: string;
    lookupDisplayColumn?: string;
    label?: string;
    description?: string;
    autoValueTrigger?: string;
    autoValueExpression?: string;
    isReadOnly?: boolean;
  }[];
}

type TreeColumn = TreeNode['columns'][number];

/** Tasarımcı sütun değerini otomatik değer planlayıcısının girdisine çevirir. */
function toAutoValueColumn(c: {
  columnName: string; dataType: string;
  autoValueTrigger?: string | null; autoValueExpression?: string | null; isReadOnly?: boolean | null;
}): AutoValueColumn {
  return {
    name: c.columnName,
    dataType: c.dataType,
    autoValueTrigger: c.autoValueTrigger,
    autoValueExpression: c.autoValueExpression,
    isReadOnly: c.isReadOnly
  };
}

/** Taslak sütunun henüz adı yokken planlayıcıda kullanılan yer tutucu ad. */
const DRAFT_COLUMN = '__draft__';

/** "Tarih + sıra no" şablonu — ör. 25092026-001; sayaç her gün sıfırlanır. */
const SEQUENCE_TEMPLATE = "TODAY('ddMMyyyy') & '-' & SEQ(3, TODAY('ddMMyyyy'))";

/**
 * TableDetailComponent — bir tablonun (modelin) oluşturma/düzenleme ekranı.
 * `/build/new` (yeni) ve `/build/:typeName` (düzenleme) bu component'i kullanır
 * (bkz. model-detail/role-detail ile aynı "new sabit segment, data.mode" deseni).
 *
 * Sütunlar, model-detail'deki alt-model sekmesi görünümüyle aynı dilde
 * ("Sütunlar" paneli + veri tablosu) gösterilir; ekleme/düzenleme bir popup
 * (modal) üzerinden yapılır ve değişiklik yalnızca bellekte (FormArray) tutulur —
 * üst-sağdaki "Kaydet"e basılana kadar backend'e gitmez.
 *
 * İç içe gerçek alt modeller (subModels) bu ekranda yüzeye çıkarılmaz; veri
 * akışı (flattenTree/saveNode$) geriye dönük uyumluluk için korunur.
 */
@Component({
    selector: 'app-table-detail',
    imports: [
        CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
        ModelNodeComponent, HelpHintComponent, DatatypeHelpComponent,
        RelationshipsTabComponent, IconComponent, ModelIconComponent, ModelIconPickerComponent
    ],
    templateUrl: './table-detail.component.html',
    styleUrls: ['./table-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableDetailComponent implements OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly notifications = inject(NotificationService);

  /**
   * Model ikonu (PublishedTable.Icon, migrasyon 025). Şemaya dokunmaz: henüz kaydedilmemiş modelde
   * addTable ile, kayıtlı modelde seçildiği anda setTableIcon ile yazılır; Yayınla da seçtirir.
   */
  modelIcon: string | null = null;
  /** Sunucudaki ikon — yalnız değiştiyse yazılır. */
  private originalIcon: string | null = null;
  /** Açık ikon seçicinin kipi; null = kapalı. */
  iconPickerMode: 'publish' | 'select' | null = null;
  iconSaving = false;

  /** Kök model FormGroup — entityName + columns + subModels */
  rootGroup: FormGroup;

  // Geri bildirim mesajları
  submitMessage: string | null = null;
  submitSuccess: boolean | null = null;

  // Adım bazlı yükleme bayrakları
  isSaving = false;
  isPublishing = false;

  /**
   * Kaydetme durumu — zorunlu iş kuralı:
   *   "Kaydedilmemiş model yayınlanamaz."
   *   Herhangi bir form düzenlemesi bu bayrağı sıfırlar.
   */
  isSaved = false;
  savedRootName: string | null = null;

  /** Yeni mi (route data: { mode: 'new' }) yoksa mevcut bir modeli düzenleme mi. */
  isNew = false;
  editTypeName: string | null = null;
  isLoadingSchema = false;
  loadError: string | null = null;

  /** Düzenleme modunda diff için: yüklenen şemadaki kolon adları */
  private originalColumnNames = new Set<string>();

  /** Düzenleme modunda diff için: kayıtlı model etiketi ve kolonların etiket/açıklaması. */
  private originalLabel: string | null = null;
  private originalColumnMeta = new Map<string, ColumnDisplayMeta>();

  /**
   * Bu model bir alt modelse üst modelin adı — `{Parent}Id` FK kolonu sistem tarafından
   * üretildiği için aynı adla kolon açılamaz. Kök modelde ve oluşturma modunda null.
   */
  private ownParentName: string | null = null;

  // ─── Etiket → ad senkronu ───────────────────────────────────────────────────

  readonly IDENTIFIER_MAX_LENGTH = IDENTIFIER_MAX_LENGTH;
  readonly LABEL_MAX_LENGTH = LABEL_MAX_LENGTH;
  readonly identifierErrorMessage = identifierErrorMessage;
  readonly isFileType = isFileType;
  readonly FILE_TYPE_GROUPS = FILE_TYPE_GROUPS;
  readonly isTextColumn = isTextColumn;
  readonly maxFileMbFor = maxFileMbFor;
  readonly MIN_FILE_LIMIT_MB = MIN_FILE_LIMIT_MB;

  /** Model etiketi → tablo adı. rootGroup her yeniden kurulduğunda tazelenir. */
  private rootNameSync?: LabelNameSync;
  /** Sütun popup'ında etiket → alan adı. Popup kapanınca bırakılır. */
  private draftNameSync?: LabelNameSync;

  /** Adres çubuğunu sayfa yeniden yüklemeden güncellemek için (oluşturma → düzenleme geçişi). */
  private readonly location = inject(Location);

  private formChangeSub?: Subscription;
  private paramSub?: Subscription;

  /** Lookup kolon tipi için hedef model seçenekleri (kayıtlı tüm tablolar — taslak + yayınlanmış). */
  availableTables: string[] = [];

  // ─── Alt Modeller sekmesi ───────────────────────────────────────────────────

  /** /Published/getAll ham satırları — alt model ağacı, tablo ID'si ve derinlik buradan türetilir. */
  private allTables: TableRow[] = [];

  /** Bu modelin KAYITLI alt modelleri. Her biri kendi /build/:typeName ekranından düzenlenir. */
  subModelRows: TableRow[] = [];

  /** Bu modelin ağaçtaki derinliği (kök = 1). Kayıtlı değilse kök varsayılır. */
  ownTableDepth = 1;
  /** lookupTargetTable → hedef tablonun kolon adları (display kolonu seçimi için, lazy yüklenir). */
  lookupColumnsByTable: Partial<Record<string, string[]>> = {};
  private lookupColumnsLoading = new Set<string>();

  // ─── Sütun popup'ı ──────────────────────────────────────────────────────────

  columnModalOpen = false;
  /** null = yeni sütun ekleniyor; sayı ise o index'teki sütun düzenleniyor. */
  editingColumnIndex: number | null = null;
  columnDraft: FormGroup;

  /** Dropdown seçenekleri — value backend'e gönderilen anahtar, label kullanıcıya gösterilen ad. */
  primitiveTypes: { value: string; label: string }[] = [
    { value: 'string',   label: 'String' },
    { value: 'text',     label: 'Text' },
    { value: 'int',      label: 'Int' },
    { value: 'long',     label: 'Long' },
    { value: 'short',    label: 'Short' },
    { value: 'byte',     label: 'Byte' },
    { value: 'decimal',  label: 'Decimal' },
    { value: 'double',   label: 'Double' },
    { value: 'float',    label: 'Float' },
    { value: 'boolean',  label: 'Bool' },
    { value: 'datetime', label: 'DateTime' },
    { value: 'timeonly', label: 'TimeOnly' },
    { value: 'dateonly', label: 'DateOnly' },
    { value: 'guid',     label: 'Guid' }
  ];

  referenceTypes: { value: string; label: string }[] = [
    { value: 'lookup', label: 'Lookup' },
    { value: 'enum',   label: 'Enum' },
    { value: 'image',  label: 'Image' },
    { value: 'file',   label: 'File' }
  ];

  /** Sayısal kural alanlarının (Min/Max) gösterileceği tipler. */
  private readonly numericTypes = new Set(['int', 'long', 'short', 'byte', 'decimal', 'double', 'float']);

  // ─── Veri tipi / kural kılavuzu ─────────────────────────────────────────────

  /**
   * Kılavuz diyaloğu — sütun popup'ındaki "Veri Tipi", ilişki popup'ındaki
   * "İlişki Tipi" ve sekme araç çubuklarındaki "i" düğmeleriyle açılır.
   * Diğer popup'ların ÜSTÜNDE açılır; kendi ESC/backdrop yönetimi vardır.
   */
  helpOpen = signal(false);
  helpTopic = signal<HelpTopicId>('string');

  // ─── G1: İlişkiler sekmesi ──────────────────────────────────────────────────
  //
  // İlişkilerin tüm yaşam döngüsü RelationshipsTabComponent'tedir. Burada
  // yalnızca sekmeye geçirilen bağlam ve sekme çubuğundaki rozet için gereken
  // özet durum tutulur.

  private readonly publishedModelService = inject(PublishedModelService);
  /** Kural kaydından sonra açık kayıt formlarının eski kuralı kullanmaması için. */
  private readonly recordMetadata = inject(RecordMetadataService);

  @ViewChild(RelationshipsTabComponent) private relationshipsTab?: RelationshipsTabComponent;

  /** Aktif sekme — "Sütunlar", "Alt Modeller" veya "İlişkiler". */
  activeTab = signal<TabId>('columns');

  /**
   * Kaynak modelin PublishedTable.ID değeri. İlişki endpoint'lerinin route
   * parametresidir. Yeni model modunda ilk kayıt tamamlanana kadar null'dır.
   */
  relationshipTableId: number | null = null;

  /** Autocomplete kaynağı — yalnızca YAYINLANMIŞ modeller (taslaklar hariç). */
  publishedModelNames: string[] = [];

  /** Sekme rozeti: ilişki sayısı ve graph geçerliliği (sekmeden gelir). */
  relationshipCount = 0;
  relationshipsValid = true;

  constructor(
    private fb: FormBuilder,
    private publishedTableService: PublishedTableService,
    private router: Router,
    private route: ActivatedRoute,
    private languageService: LanguageService
  ) {
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    this.columnDraft = this.buildColumnDraft();

    if (this.isNew) {
      // Oluşturma modu — ad ve etiket boş başlar; ad, etiket yazıldıkça üretilir
      this.rootGroup = this.buildRootGroup('', '');
      this.trackFormChanges();
    } else {
      // Düzenleme modu — boş bir yer tutucu ile başla, şema yüklenince değiştirilir
      this.editTypeName = this.route.snapshot.paramMap.get('typeName');
      this.rootGroup = this.buildRootGroup(this.editTypeName ?? '', '');
      this.trackFormChanges();
      if (this.editTypeName) {
        this.loadForEdit(this.editTypeName);
      }
    }

    // Tek istek: lookup hedefleri + alt model ağacı + ilişki tablo ID'si.
    this.loadTables();
    this.loadPublishedModelNames();

    // /build/:typeName → /build/:typeName geçişinde (alt model satırına tıklama)
    // Angular component'i yeniden oluşturmaz; parametre akışı dinlenir.
    this.paramSub = this.route.paramMap.pipe(markDirty(this.cdr)).subscribe(params => {
      const typeName = params.get('typeName');
      if (!typeName || typeName === this.editTypeName) return;
      this.reinitForEdit(typeName);
    });
  }

  ngOnDestroy(): void {
    this.formChangeSub?.unsubscribe();
    this.paramSub?.unsubscribe();
    this.rootNameSync?.unsubscribe();
    this.draftNameSync?.unsubscribe();
  }

  // ─── Form kurulumu ──────────────────────────────────────────────────────────

  /**
   * Kök model FormGroup'u. Oluşturma, düzenleme ve alt modele geçiş aynı fabrikadan
   * geçer — doğrulayıcılar tek yerde durur.
   *
   * Model adı mevcut tablolarla çakışmamalı; düzenleme modunda ad kilitli
   * (disabled) olduğundan doğrulanmaz, kontrol yalnızca oluşturmada anlamlıdır.
   */
  private buildRootGroup(entityName: string, label: string, columns: FormGroup[] = []): FormGroup {
    return this.fb.group({
      label:      [label, [Validators.required, Validators.maxLength(LABEL_MAX_LENGTH)]],
      entityName: [entityName, [
        Validators.required,
        identifierValidator('model', () => ({ taken: this.isNew ? this.availableTables : [] }))
      ]],
      columns:    this.fb.array(columns),
      subModels:  this.fb.array([])
    });
  }

  /** Sütun popup'ının taslağı — ağaca bağlı olmadığı için bağlam dışarıdan verilir. */
  private buildColumnDraft(): FormGroup {
    return ModelNodeComponent.buildColumnGroupStatic(this.fb, () => this.columnDraftContext());
  }

  /** Popup'taki sütunun çakışmaması gerekenler: diğer sütunlar, model adı, üst FK kolonu. */
  private columnDraftContext(): IdentifierContext {
    // Taslak constructor'da rootGroup'tan önce kurulur ve doğrulayıcı hemen koşar.
    if (!this.rootGroup) return {};
    return {
      taken: this.columns.controls
        .filter((_, i) => i !== this.editingColumnIndex)
        .map(c => c.get('columnName')!.value),
      modelName: this.entityNameCtrl.value,
      parentName: this.ownParentName
    };
  }

  /** Ad alanına yazılırken Türkçe karakter/boşluk anında temizlenir. */
  onNameInput(event: Event, control: AbstractControl, kind: IdentifierKind): void {
    sanitizeIdentifierInputEvent(event, control, kind);
  }

  /** Tablo adındaki "↺ Etiketten üret". */
  regenerateEntityName(): void {
    this.rootNameSync?.regenerate();
  }

  /** Sütun popup'ındaki "↺ Etiketten üret". */
  regenerateColumnName(): void {
    this.draftNameSync?.regenerate();
  }

  /** Popup'ta düzenlenen sütun veritabanında kayıtlı mı (kayıtlıysa adı kilitlidir). */
  get isEditingPersistedColumn(): boolean {
    return this.columnDraft.get('columnName')!.disabled;
  }

  /** Düzenlenen model yayında mı (derlenmiş sınıf + SQL tablosu var mı). */
  get isModelPublished(): boolean {
    return !!this.editTypeName && this.publishedModelNames.includes(this.editTypeName);
  }

  /** Popup'taki kayıtlı sütunun kayıtlı meta verisi (yeni sütunda null). */
  private get draftOriginalMeta(): ColumnDisplayMeta | null {
    if (!this.isEditingPersistedColumn) return null;
    return this.originalColumnMeta.get(this.columnDraft.getRawValue().columnName) ?? null;
  }

  /** Zorunluluk kutusu yayınlanmış modelde değer tipi olduğu için kilitli mi. */
  get draftRequiredLocked(): boolean {
    return this.isEditingPersistedColumn && this.columnDraft.get('isNullable')!.disabled;
  }

  /** Yayındaki modelde isteğe bağlı alan zorunlu yapılıyor — boş eski kayıtlar düzenlenirken takılır. */
  get draftRequiredTightened(): boolean {
    const original = this.draftOriginalMeta;
    return !!original && this.isModelPublished && !original.isRequired && !this.columnDraft.getRawValue().isNullable;
  }

  /** Enum değeri kaldırılıyor — o değeri taşıyan kayıtlar bir sonraki düzenlemede geçersiz olur. */
  get draftEnumShrinks(): boolean {
    const original = this.draftOriginalMeta;
    if (!original || original.dataType !== 'enum') return false;
    const next = new Set(String(this.columnDraft.getRawValue().enumValues ?? '').split('|').map(s => s.trim()).filter(Boolean));
    return original.enumValues.split('|').map(s => s.trim()).filter(Boolean).some(v => !next.has(v));
  }

  /** Ekran tasarımı yalnız yayınlanmış modelde anlamlı: kayıt ekranları derlenmiş tipi çizer. */
  get screenDesignTypeName(): string | null {
    const name = this.editTypeName;
    return name && this.publishedModelNames.includes(name) ? name : null;
  }

  /** Başlıkta gösterilecek ad: kayıtlı etiket, yoksa tablo adı. */
  get displayModelName(): string {
    return (this.originalLabel ?? '').trim() || this.editTypeName || '';
  }

  // ─── G1: Sekme yönetimi ─────────────────────────────────────────────────────

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  // ─── Alt Modeller sekmesi ───────────────────────────────────────────────────

  /** Bu oturumda eklenen (henüz kaydedilmemiş) alt model FormGroup'ları. */
  get subModels(): FormArray {
    return this.rootGroup.get('subModels') as FormArray;
  }

  getSubModelGroup(index: number): FormGroup {
    return this.subModels.at(index) as FormGroup;
  }

  /**
   * Yeni bir alt model taslağı ekler. Kaydetme, kök modelle birlikte "Kaydet"
   * butonundan yapılır (flattenTree → saveNode$ → addTable(parentTableName)).
   */
  addSubModel(): void {
    if (!this.canAddSubModel) return;
    this.subModels.push(ModelNodeComponent.buildModelGroupStatic(this.fb));
  }

  removeSubModel(index: number): void {
    this.subModels.removeAt(index);
  }

  /** Şablonda [onRemoveSelf]="removeSubModelFn($index)" olarak bağlanır. */
  removeSubModelFn(index: number): () => void {
    return () => this.removeSubModel(index);
  }

  /**
   * Alt model eklenebilir mi: model ağacı en fazla MAX_DEPTH seviyedir
   * (backend PublishedTableManager.Add, Depth > 4 kaydını reddeder).
   */
  get canAddSubModel(): boolean {
    return this.ownTableDepth < MAX_DEPTH;
  }

  /** Sekme rozeti: kayıtlı + kaydedilmemiş alt model sayısı. */
  get subModelCount(): number {
    return this.subModelRows.length + this.subModels.length;
  }

  /** Kayıtlı bir alt modeli kendi düzenleme ekranında açar. */
  openSubModel(typeName: string): void {
    this.router.navigate(['/build', typeName]);
  }

  /**
   * Aynı route'ta yalnızca parametre değiştiğinde (alt modelden alt modele geçiş)
   * Angular component'i YENİDEN OLUŞTURMAZ — route'u yeniden kullanır. Ekran
   * kurulumu constructor'da snapshot ile yapıldığı için burada elle yenilenir.
   */
  private reinitForEdit(typeName: string): void {
    this.isNew        = false;
    this.editTypeName = typeName;

    // Kaydetme/yayınlama durumunu sıfırla — yeni modelin kendi durumu geçerlidir.
    this.isSaved             = false;
    this.savedRootName       = null;
    this.submitMessage       = null;
    this.submitSuccess       = null;
    this.loadError           = null;
    // İlişki durumu sekmenin kendisindedir; ID'yi null'layıp sekmeyi boşaltmak
    // yeterlidir — yeni tablo ID'si çözüldüğünde sekme listeyi kendi yükler.
    this.relationshipTableId = null;
    this.relationshipCount   = 0;
    this.relationshipsValid  = true;
    this.relationshipsTab?.reset();
    this.subModelRows        = [];
    this.originalColumnNames = new Set<string>();
    this.originalColumnMeta  = new Map<string, ColumnDisplayMeta>();
    this.originalLabel       = null;
    this.modelIcon           = null;
    this.originalIcon        = null;
    this.iconPickerMode      = null;
    this.ownParentName       = null;
    this.activeTab.set('columns');

    this.rootGroup = this.buildRootGroup(typeName, '');
    this.trackFormChanges();

    this.loadForEdit(typeName);
    this.loadTables();
  }

  // ─── G1: İlişki verisi yükleme ──────────────────────────────────────────────

  /** Autocomplete için yalnızca yayınlanmış model adlarını yükler. */
  private loadPublishedModelNames(): void {
    this.publishedModelService.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.publishedModelNames = res.success ? (res.data ?? []).map(m => m.typeName) : [];
      },
      error: () => { this.publishedModelNames = []; }
    });
  }

  /**
   * Kayıtlı tüm tabloları TEK istekte okur ve üç şeyi birden besler:
   *   1. availableTables  → lookup kolonlarının hedef listesi
   *   2. subModelRows / ownTableDepth → "Alt Modeller" sekmesi
   *   3. relationshipTableId → ilişki endpoint'lerinin route parametresi
   *
   * Model henüz kaydedilmemişse (oluşturma modu) 2 ve 3 boş kalır; ilk kayıttan
   * sonra yeniden çağrılır.
   */
  private loadTables(): void {
    this.publishedTableService.getAllTables().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.allTables = res.success ? (res.data ?? []) : [];
        this.availableTables = this.allTables.map(t => t.tableName);
        this.refreshOwnTableContext();
      },
      error: () => {
        this.allTables = [];
        this.availableTables = [];
        this.subModelRows = [];
      }
    });
  }

  /**
   * Yüklenen tablo listesinden bu modelin satırını bulur; alt modellerini,
   * derinliğini ve ilişki tablo ID'sini türetir.
   */
  private refreshOwnTableContext(): void {
    const typeName = this.editTypeName;
    if (!typeName) {
      this.subModelRows = [];
      this.ownTableDepth = 1;
      return;
    }

    const own = this.allTables.find(
      t => t.tableName.toLowerCase() === typeName.toLowerCase());

    if (!own) {
      this.subModelRows = [];
      this.ownTableDepth = 1;
      return;
    }

    this.ownTableDepth = own.depth || 1;
    this.subModelRows = this.allTables
      .filter(t => t.parentTableId === own.id)
      .sort((a, b) => a.tableName.localeCompare(b.tableName, 'tr'));

    // İlişki tablo ID'si Input olarak sekmeye iner; sekme kendi verisini yükler.
    this.relationshipTableId = own.id;
  }

  /**
   * İlişkiler anında kalıcılaşır; kolon formunda bekleyen değişiklik YOKSA
   * modeli yayınlanabilir sayar. Kolon düzenlemesi varsa kullanıcı yine
   * "Kaydet"e basmalıdır — kaydedilmemiş kolonlar yayınlanmasın diye.
   */
  markRelationshipsPersisted(): void {
    if (this.isNew || this.rootGroup.dirty) return;

    this.isSaved = true;
    this.savedRootName = this.editTypeName;
  }
  // ─── Accessor'lar ───────────────────────────────────────────────────────────

  /** Bu ekranda düzenlenen modelin adı — ilişkiler sekmesine geçirilir. */
  get currentModelName(): string {
    return this.isNew
      ? (this.entityNameCtrl.value as string)
      : (this.editTypeName ?? '');
  }

  /** İlişkiler sekmesinden gelen özet — sekme çubuğundaki rozeti besler. */
  onRelationshipStatus(status: { count: number; isValid: boolean }): void {
    this.relationshipCount = status.count;
    this.relationshipsValid = status.isValid;
    markDirty(this.cdr);
  }

  get entityNameCtrl() {
    return this.rootGroup.get('entityName')!;
  }

  get columns(): FormArray {
    return this.rootGroup.get('columns') as FormArray;
  }

  getColumnGroup(index: number): FormGroup {
    return this.columns.at(index) as FormGroup;
  }

  /** Bir kolonun sayısal Min/Max kural alanlarının gösterilip gösterilmeyeceği. */
  isNumericType(dataType: string): boolean {
    return this.numericTypes.has(dataType);
  }

  /** Bir tip değerinin kullanıcıya gösterilecek etiketini döner. */
  typeLabel(value: string): string {
    return [...this.primitiveTypes, ...this.referenceTypes].find(t => t.value === value)?.label ?? value;
  }

  /** Dosya kolonunda izinli tür seçili mi (seçim taslakta `enumValues` alanında durur). */
  isFileGroupSelected(group: FileTypeGroup): boolean {
    return parseFileGroups(this.columnDraft.get('enumValues')!.value).includes(group);
  }

  toggleFileGroup(group: FileTypeGroup, checked: boolean): void {
    const control = this.columnDraft.get('enumValues')!;
    const others = parseFileGroups(control.value).filter(g => g !== group);
    control.setValue(joinFileGroups(checked ? [...others, group] : others));
    control.markAsDirty();
  }

  /** Bir sütun satırı için kısa kural özeti (tablo görünümünde gösterilir). */
  ruleSummary(col: AbstractControl): string {
    // Yalnız sütunun tipine ait kurallar gösterilir (formda eski tipin değeri kalmış olabilir).
    const v = normalizeColumnRules((col as FormGroup).getRawValue());
    const parts: string[] = [];

    if (isFileType(v.dataType)) {
      // Sınır girilmediyse de platform tavanı geçerli — kullanıcı bunu görmeli.
      const limitKb = v.maxLength ?? maxFileKbFor(v.dataType);
      parts.push(this.languageService.t(
        v.maxLength != null ? 'table.detail.ruleMaxFileSize' : 'table.detail.ruleMaxFileSizeDefault',
        { value: formatFileSize(limitKb * 1024, this.languageService.lang()) }));
      if (v.dataType === 'file') {
        parts.push(...parseFileGroups(v.enumValues).map(g => this.languageService.t('table.detail.fileType.' + g)));
      }
      return parts.join(', ');
    }

    if (v.minLength != null) parts.push(this.languageService.t('table.detail.ruleMinLength', { value: v.minLength }));
    if (v.maxLength != null) parts.push(this.languageService.t('table.detail.ruleMaxLength', { value: v.maxLength }));
    if (NUMERIC_COLUMN_TYPES.has(v.dataType)) {
      if (v.min != null)     parts.push(this.languageService.t('table.detail.ruleMin', { value: v.min }));
      if (v.max != null)     parts.push(this.languageService.t('table.detail.ruleMax', { value: v.max }));
    }
    if (v.regex)             parts.push('regex');
    if (v.enumValues)        parts.push(v.enumValues);
    if (v.lookupTargetTable) parts.push(`→ ${v.lookupTargetTable}`);
    if (v.autoValueTrigger) {
      parts.push(this.languageService.t('table.detail.ruleAutoValue', {
        trigger: this.languageService.t('table.detail.autoValue.trigger.' + v.autoValueTrigger)
      }));
    }
    return parts.join(', ') || this.languageService.t('table.detail.ruleNone');
  }

  /**
   * Kullanıcı popup'ta bir lookup hedef tablosu seçtiğinde, "display kolonu" dropdown'unu
   * doldurmak için hedef tablonun şemasını okur (her hedef için bir kez, cache'lenir).
   */
  onLookupTargetChange(targetTable: string): void {
    if (!targetTable || this.lookupColumnsByTable[targetTable] || this.lookupColumnsLoading.has(targetTable)) {
      return;
    }
    this.lookupColumnsLoading.add(targetTable);
    this.publishedTableService.getSchema(targetTable).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.lookupColumnsLoading.delete(targetTable);
        if (res.success && res.data) {
          this.lookupColumnsByTable[targetTable] = res.data.columns.map(c => c.name);
        }
      },
      error: () => this.lookupColumnsLoading.delete(targetTable)
    });
  }

  /** Herhangi bir form değişikliği kayıt durumunu geçersiz kılar — rootGroup her değiştiğinde yeniden çağrılır. */
  private trackFormChanges(): void {
    // Etiket → tablo adı senkronu da yeni rootGroup'a bağlanır.
    this.rootNameSync?.unsubscribe();
    this.rootNameSync = new LabelNameSync(
      this.rootGroup.get('label')!, this.entityNameCtrl, 'model',
      () => ({ taken: this.isNew ? this.availableTables : [] }));

    this.formChangeSub?.unsubscribe();
    this.formChangeSub = this.rootGroup.valueChanges.pipe(markDirty(this.cdr)).subscribe(() => {
      if (this.isSaved) {
        this.isSaved = false;
        this.savedRootName = null;
      }
    });
  }

  // ─── Düzenleme modu: mevcut şemayı yükle ──────────────────────────────────

  /**
   * Mevcut tablo şemasını okuyup formu doldurur. Yalnızca kendi kolonları
   * yüklenir — alt modeller bu ekranda gösterilmez/düzenlenmez (her alt model
   * kendi /build/:typeName sayfasından düzenlenir). Bu ekranda yeni alt model
   * eklemek hâlâ mümkündür (normal oluşturma akışıyla aynı, veri akışında korunur).
   */
  private loadForEdit(typeName: string): void {
    this.isLoadingSchema = true;
    this.loadError = null;

    this.publishedTableService.getSchema(typeName).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.isLoadingSchema = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('table.detail.schemaReadFailed', { name: typeName });
          return;
        }

        const schema = res.data;
        this.originalColumnNames = new Set(schema.columns.map(c => c.name));
        this.originalColumnMeta = new Map(schema.columns.map(c => [
          c.name, {
            dataType: c.dataType,
            metadataKey: schemaMetadataKey(c),
            autoValueKey: autoValueKey(c),
            enumValues: c.enumValues ?? '',
            isRequired: c.isRequired
          } satisfies ColumnDisplayMeta
        ]));
        this.ownParentName = schema.parentTableName ?? null;
        // Etiketi olmayan eski modellerde etiket tablo adıyla önden doldurulur (zorunlu alan);
        // diff temeli de aynı değer olduğu için kullanıcı değiştirmedikçe yazılmaz.
        this.originalLabel = schema.label?.trim() || schema.tableName;
        this.modelIcon = this.originalIcon = schema.icon?.trim() || null;
        this.rootGroup = this.buildGroupFromSchema(schema, this.originalLabel);
        this.rootGroup.get('entityName')?.disable();
        this.trackFormChanges();
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isLoadingSchema = false;
        this.loadError = err?.error?.message ?? err?.message ?? this.languageService.t('table.detail.schemaServerError');
      }
    });
  }

  /** Okunan şemadan kök düğüm FormGroup'u kurar (mevcut kolonlarla doldurulmuş, alt model yok). */
  private buildGroupFromSchema(schema: PublishedTableSchema, label: string): FormGroup {
    return this.buildRootGroup(
      schema.tableName,
      label,
      schema.columns.map(c => this.buildColumnGroupFromSchema(c)));
  }

  /**
   * Okunan bir kolon kaydından FormGroup kurar (model-node'un sütun FormGroup yapısıyla aynı).
   *
   * Kayıtlı kolonun adı zaten veritabanında — yeni ad kurallarıyla yeniden doğrulanmaz
   * (eski bir ad kuralı karşılamıyorsa model hiç kaydedilemez hale gelirdi). Adı
   * değiştirilemez; popup'ta kilitli açılır.
   */
  private buildColumnGroupFromSchema(col: PublishedColumnSchema): FormGroup {
    return this.fb.group({
      columnName:          [col.name, Validators.required],
      dataType:            [col.dataType],
      isNullable:          [!col.isRequired],
      minLength:           [col.minLength ?? null],
      maxLength:           [col.maxLength ?? null],
      min:                 [col.min ?? null],
      max:                 [col.max ?? null],
      regex:               [col.regex ?? ''],
      regexMessage:        [col.regexMessage ?? ''],
      enumValues:          [col.enumValues ?? ''],
      lookupTargetTable:   [col.lookupTargetTable ?? ''],
      lookupDisplayColumn: [col.lookupDisplayColumn ?? ''],
      label:               [col.label ?? ''],
      description:         [col.description ?? ''],
      // image/file: saklanan KB sınırı forma MB olarak gelir (normalizeColumnRules geri çevirir).
      maxFileSizeMb:       [
        isFileType(col.dataType) ? kbToMb(col.maxLength) : null,
        fileLimitMbValidator
      ],
      autoValueTrigger:    [col.autoValueTrigger ?? ''],
      autoValueExpression: [col.autoValueExpression ?? ''],
      isReadOnly:          [!!col.isReadOnly]
    });
  }

  // ─── Sütun popup'ı ──────────────────────────────────────────────────────────

  openAddColumnModal(): void {
    this.editingColumnIndex = null;
    this.columnDraft = this.buildColumnDraft();
    this.bindDraftNameSync();
    this.columnModalOpen = true;
  }

  openEditColumnModal(index: number): void {
    this.editingColumnIndex = index;
    this.columnDraft = this.buildColumnDraft();
    const source = this.getColumnGroup(index).getRawValue();
    this.columnDraft.patchValue(source);

    // Etiket artık zorunlu — etiketi olmayan eski sütunda ad önden doldurulur.
    if (!source.label?.trim()) {
      this.columnDraft.get('label')!.setValue(source.columnName);
    }

    // Kayıtlı sütunun adı kilitli: onSaveEdit diff'i ada göre çalışır; yeniden
    // adlandırma "eskisini pasifle + yenisini ekle" demek olur ve veri eski kolonda kalır.
    // Tip ve lookup hedefi de kilitli: değişimleri derlenen sınıfı ve tabloyu değiştirir
    // (yalnız meta veri düzenlenir). Değer tipinde zorunluluk yayınlanmış modelde kilitli.
    if (this.originalColumnNames.has(source.columnName)) {
      this.columnDraft.get('columnName')!.disable();
      this.columnDraft.get('dataType')!.disable();
      this.columnDraft.get('lookupTargetTable')!.disable();
      if (!requiredChangeAllowed(source.dataType, this.isModelPublished)) {
        this.columnDraft.get('isNullable')!.disable();
      }
    }

    const targetTable = this.columnDraft.get('lookupTargetTable')?.value;
    if (targetTable) {
      this.onLookupTargetChange(targetTable);
    }
    this.bindDraftNameSync();
    this.columnModalOpen = true;
  }

  private bindDraftNameSync(): void {
    this.draftNameSync?.unsubscribe();
    this.draftNameSync = new LabelNameSync(
      this.columnDraft.get('label')!, this.columnDraft.get('columnName')!, 'column',
      () => this.columnDraftContext());
  }

  /** Popup'taki sütunu doğrular, geçerliyse ekler/günceller ve popup'ı kapatır. */
  saveColumnModal(): void {
    // Çakışma kontrolü kardeşlere bağlı; popup açıkken değişmiş olabilirler.
    this.columnDraft.get('columnName')!.updateValueAndValidity();
    this.columnDraft.get('maxFileSizeMb')!.updateValueAndValidity();
    if (this.columnDraft.invalid || this.draftAutoValueError) {
      this.columnDraft.markAllAsTouched();
      return;
    }

    // Kurallar tipe göre ayıklanır (tip değişince eski tipin kuralı kalmasın).
    const value = normalizeColumnRules(this.columnDraft.getRawValue());
    if (this.editingColumnIndex === null) {
      const group = ModelNodeComponent.buildColumnGroupStatic(this.fb);
      group.patchValue(value);
      this.columns.push(group);
    } else {
      this.getColumnGroup(this.editingColumnIndex).patchValue(value);
    }

    this.closeColumnModal();
  }

  closeColumnModal(): void {
    this.draftNameSync?.unsubscribe();
    this.draftNameSync = undefined;
    this.columnModalOpen = false;
    this.editingColumnIndex = null;
  }

  onColumnModalBackdropClick(): void {
    this.closeColumnModal();
  }

  // ─── Sütun popup'ı: otomatik değer ──────────────────────────────────────────

  readonly autoValueTriggers = AUTO_VALUE_TRIGGERS;

  /** Formülde kullanılabilen fonksiyonlar — tıklanınca "AD()" eklenir. */
  readonly autoValueFunctions = ['IF', 'ROUND', 'CONCAT', 'COALESCE', 'TODAY', 'NOW', 'ADD_DAYS', 'FORMAT_DATE', 'SEQ'];

  /** Formülde referans verilebilecek diğer sütunlar (dosya sütunları hariç). */
  get autoValueFieldOptions(): { name: string; label: string }[] {
    return (this.columns.getRawValue() as TreeColumn[])
      .filter((c, i) => i !== this.editingColumnIndex && c.columnName?.trim() && !isFileType(c.dataType))
      .map(c => ({ name: c.columnName, label: c.label?.trim() || c.columnName }));
  }

  /**
   * Taslak sütunun formül sorunu (yoksa null). Tablonun diğer kurallarıyla birlikte
   * planlanır — döngü ancak böyle görünür.
   */
  get draftAutoValueError(): string | null {
    const draft = this.columnDraft.getRawValue() as TreeColumn;
    if (!draft.autoValueTrigger) return null;

    const name = draft.columnName?.trim() || DRAFT_COLUMN;
    const others = (this.columns.getRawValue() as TreeColumn[])
      .filter((c, i) => i !== this.editingColumnIndex && c.columnName?.trim());
    const plan = buildAutoValuePlan([...others, { ...draft, columnName: name }].map(toAutoValueColumn));
    const issue = plan.issues.find(i => i.column === name);
    return issue ? this.autoValueIssueText(issue) : null;
  }

  /** `save` tetiği ve SEQ() salt okunurluğu zorunlu kılar (bkz. normalizeColumnRules). */
  get draftReadOnlyForced(): boolean {
    const trigger = this.columnDraft.get('autoValueTrigger')!.value;
    if (trigger === 'save') return true;
    const expression: string = this.columnDraft.get('autoValueExpression')!.value ?? '';
    try {
      return !!expression.trim() && usesSequence(parseExpression(expression));
    } catch {
      return false;
    }
  }

  /** İmlecin olduğu yere bir parça ekler; fonksiyonlarda imleç parantezin içine konur. */
  insertAutoValueToken(input: HTMLTextAreaElement, token: string, caretBack = 0): void {
    const ctrl = this.columnDraft.get('autoValueExpression')!;
    const value: string = ctrl.value ?? '';
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    ctrl.setValue(value.slice(0, start) + token + value.slice(end));
    ctrl.markAsTouched();
    const caret = start + token.length - caretBack;
    input.focus();
    input.setSelectionRange(caret, caret);
  }

  /** "Tarih + sıra no" şablonu: yeni kayıtta tarih + günlük sayaç, ör. 25092026-001. */
  applySequenceTemplate(): void {
    this.columnDraft.patchValue({
      autoValueTrigger: 'create',
      autoValueExpression: SEQUENCE_TEMPLATE,
      isReadOnly: true
    });
  }

  /** Planlayıcı sorununu okunur metne çevirir. */
  autoValueIssueText(issue: RuleIssue): string {
    const t = (key: string, params?: Record<string, string | number>) =>
      this.languageService.t('table.detail.autoValue.' + key, params);
    switch (issue.code) {
      case 'parse':
        return t('err.parse', {
          reason: t('parse.' + issue.detail, { arg: issue.arg }),
          pos: issue.pos >= 0 ? issue.pos + 1 : 1
        });
      case 'unknownField':
      case 'sequenceRef':
        return t('err.' + issue.code, { field: issue.detail });
      case 'cycle':
        return t('err.cycle', { path: issue.detail.split(DRAFT_COLUMN).join(t('thisColumn')) });
      default:
        return t('err.' + issue.code);
    }
  }

  // ─── Kılavuz diyaloğu ───────────────────────────────────────────────────────

  /** Sütun popup'ındaki "Veri Tipi" yanındaki "i" — seçili tipin kılavuzunu açar. */
  openTypeHelp(): void {
    this.openHelp(this.columnDraft.get('dataType')!.value || 'string');
  }

  /**
   * İlişki popup'ındaki "İlişki Tipi" yanındaki "i" — seçili ilişki tipinin
   * kılavuzunu açar.
   *
   * RelationshipType SAYISAL bir enum'dur ve `<select>` değeri string olarak
   * ('1'..'5') gelir; konu anahtarı ise tip ADIYLA kurulur ('rel:OneToOne').
   * Bu yüzden enum'un ters eşlemesi üzerinden ada çevrilir.
   */
  openRelationshipTypeHelp(type: RelationshipType): void {
    const name = RelationshipType[type];
    this.openHelp(name ? `rel:${name}` : 'relationships');
  }

  /** Sekme araç çubuklarındaki "Nasıl çalışır?" — kavram kılavuzunu açar. */
  openHelp(topic: HelpTopicId): void {
    this.helpTopic.set(topic);
    this.helpOpen.set(true);
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  /**
   * Kılavuzdaki hazır regex deseninde "Kullan"a basıldığında deseni sütun
   * taslağına yazar. Hata mesajı yalnızca boşsa doldurulur — kullanıcının
   * kendi yazdığı mesaj ezilmez.
   */
  onHelpPattern(preset: RegexPreset): void {
    this.columnDraft.get('regex')!.setValue(preset.pattern);
    const messageCtrl = this.columnDraft.get('regexMessage')!;
    if (!messageCtrl.value?.trim()) {
      messageCtrl.setValue(this.languageService.t(`help.regex.presetMsg.${preset.key}`));
    }
    this.closeHelp();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Kılavuz diyaloğu kendi ESC işleyicisinde stopPropagation yapar; yine de
    // savunmacı olarak burada da alttaki popup'ların kapanmasını engelliyoruz.
    if (this.helpOpen()) return;

    // En üstteki diyalogdan başlayarak kapat. İlişki diyalogları sekmenin
    // içindedir; kapatacak bir şey varsa sekme true döner.
    if (this.relationshipsTab?.handleEscape()) return;

    if (this.columnModalOpen) {
      this.closeColumnModal();
    }
  }

  removeColumn(index: number): void {
    this.columns.removeAt(index);
  }

  // ─── Yardımcı: ağacı BFS ile düzleştir ────────────────────────────────────

  /**
   * FormGroup ağacını parent-first sırada düz bir TreeNode listesine çevirir.
   * Yalnızca geçerli (columnName dolu) sütunları dahil eder.
   */
  private flattenTree(group: FormGroup, parentName: string | null): TreeNode[] {
    const result: TreeNode[] = [];
    const entityName: string = group.get('entityName')?.value ?? '';
    const label: string | null = group.get('label')?.value?.trim() || null;
    const columnsArr = group.get('columns') as FormArray;
    const subModelsArr = group.get('subModels') as FormArray;

    // Kurallar tipe göre ayıklanır; image/file'da MB girişi maxLength'e (KB) çevrilir.
    const cols = (columnsArr?.value ?? [])
      .filter((c: any) => c.columnName?.trim())
      .map((c: any) => normalizeColumnRules(c));

    result.push({ entityName, label, parentName, columns: cols });

    // Alt modelleri BFS sırasında ekle (parent her zaman önce)
    for (let i = 0; i < (subModelsArr?.length ?? 0); i++) {
      const subGroup = subModelsArr.at(i) as FormGroup;
      result.push(...this.flattenTree(subGroup, entityName));
    }

    return result;
  }

  // ─── Yardımcı: yeni bir düğümü kaydet (dup kontrol → addTable → addMember'lar) ──

  /** Tek bir YENİ düğümü kaydeder: dup kontrolü yapar, addTable + her kolon için addMember çağırır. */
  private saveNode$(node: TreeNode): Observable<unknown> {
    return this.publishedTableService.getSchema(node.entityName).pipe(
      catchError((err: { status?: number }) => {
        if (err?.status === 400 || err?.status === 404) {
          return of({ success: false as const, message: 'bulunamadı', data: null as any });
        }
        return throwError(() => new Error(this.languageService.t('table.detail.checkServerError')));
      }),
      switchMap(checkRes => {
        if (checkRes.success) {
          return throwError(() => new Error(
            this.languageService.t('table.detail.duplicateModelName', { name: node.entityName })
          ));
        }
        // addTable — alt model ise parentTableName gönderilir
        return this.publishedTableService.addTable({
          tableName:       node.entityName,
          label:           node.label,
          // İkon yalnız kök modelde seçilir (başlıktaki düğme).
          icon:            node.parentName ? null : this.modelIcon,
          description:     `${node.entityName} dinamik modeli`,
          version:         1,
          parentTableName: node.parentName ?? undefined
        });
      }),
      switchMap(res =>
        res.success
          ? of(res)
          : throwError(() => new Error(res.message ?? this.languageService.t('table.detail.tableMetaSaveFailed')))
      ),
      // Her kolon için addMember
      switchMap(() =>
        from(node.columns).pipe(
          concatMap(col =>
            this.publishedTableService.addMember(this.memberRequest(node.entityName, col)).pipe(
              switchMap(r =>
                r.success
                  ? of(r)
                  : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.memberSaveFailed', { name: col.columnName })))
              )
            )
          ),
          concatMap(() => of(null))
        )
      )
    );
  }

  /**
   * Kaydetmeden önce tüm ağaçtaki adları yeniden doğrular (kardeş çakışmaları bir ad
   * değişince diğerlerinde kendiliğinden tazelenmez). Geçersizse hataları görünür
   * yapar ve kullanıcıya nerede olduğunu söyler — hatalı ad backend'e hiç gitmez.
   */
  private ensureFormValid(): boolean {
    revalidateIdentifiers(this.rootGroup);
    if (this.rootGroup.valid) return this.ensureAutoValuesValid();

    this.rootGroup.markAllAsTouched();
    this.submitSuccess = false;
    this.submitMessage = this.languageService.t('table.detail.formInvalid');
    // Hata kaydedilmemiş bir alt model taslağındaysa o sekme görünür olsun.
    if (this.subModels.invalid && this.rootGroup.get('label')!.valid && this.entityNameCtrl.valid) {
      this.activeTab.set('subModels');
    }
    return false;
  }

  /**
   * Sütunların otomatik değer kurallarını birlikte denetler (döngü yalnız tüm tabloya
   * bakınca görünür). Sunucu aynı denetimi yapar; burada yakalamak kullanıcıyı yarım
   * kalmış bir kayıttan korur — ilk hatalı kolon adıyla birlikte gösterilir.
   */
  private ensureAutoValuesValid(): boolean {
    const plan = buildAutoValuePlan(
      (this.columns.getRawValue() as TreeColumn[])
        .filter(c => c.columnName?.trim())
        .map(c => toAutoValueColumn(normalizeColumnRules(c))));
    const issue = plan.issues[0];
    if (!issue) return true;

    this.submitSuccess = false;
    this.submitMessage = this.languageService.t('table.detail.autoValue.saveBlocked', {
      name: issue.column,
      reason: this.autoValueIssueText(issue)
    });
    return false;
  }

  /** Bir sütunu addMember isteğine çevirir (oluşturma ve düzenleme akışları ortak). */
  private memberRequest(typeName: string, col: TreeColumn): AddMemberRequest {
    return {
      typeName,
      memberName: col.columnName,
      memberType: col.dataType,
      isRequired: !col.isNullable,
      minLength: col.minLength ?? null,
      maxLength: col.maxLength ?? null,
      min: col.min ?? null,
      max: col.max ?? null,
      regex: col.regex || null,
      regexMessage: col.regexMessage || null,
      enumValues: col.enumValues || null,
      lookupTargetTable: col.lookupTargetTable || null,
      lookupDisplayColumn: col.lookupDisplayColumn || null,
      label: col.label || null,
      description: col.description || null,
      autoValueTrigger: (col.autoValueTrigger || null) as AutoValueTrigger | null,
      autoValueExpression: col.autoValueExpression || null,
      isReadOnly: !!col.isReadOnly
    };
  }

  // ─── ADIM 1: KAYDET (oluşturma modu) ──────────────────────────────────────

  /**
   * Tüm model ağacını (kök + alt modeller) parent-first sırada kaydeder.
   * Her düğüm: addTable + her kolon için addMember.
   * Başarı sonrası isSaved = true olur ve Yayınla butonu aktifleşir.
   */
  onSave(): void {
    if (this.isSaving || this.isPublishing || !this.ensureFormValid()) return;

    const nodes = this.flattenTree(this.rootGroup, null);
    if (nodes.length === 0) return;

    if (nodes[0].columns.length === 0) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.atLeastOneColumn');
      return;
    }

    const rootName = nodes[0].entityName;

    this.isSaving = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    // Her düğüm için sırayla: dup kontrol → addTable → addMember'lar
    from(nodes).pipe(
      concatMap(node => this.saveNode$(node))
    ).pipe(markDirty(this.cdr)).subscribe({
      next: () => {},
      error: (err: Error) => {
        this.isSaving = false;
        this.isSaved = false;
        this.savedRootName = null;
        this.submitSuccess = false;
        this.submitMessage = err.message ?? this.languageService.t('table.detail.saveServerError');
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;

        // G1: Model artık kayıtlı — bellekte bekleyen ilişkiler sunucuya gönderilir.
        this.relationshipsTab?.flush(rootName);

        const nodeCount = nodes.length;
        this.submitMessage = nodeCount > 1
          ? this.languageService.t('table.detail.modelsSavedMulti', { count: nodeCount, names: nodes.map(n => n.entityName).join(', ') })
          : this.languageService.t('table.detail.modelSaved');

        // Model artık veritabanında var — ekran düzenleme moduna geçer.
        this.enterEditModeAfterCreate(rootName, nodes[0]);
      }
    });
  }

  /**
   * Oluşturma modunda ilk başarılı kayıttan sonra ekranı düzenleme moduna çevirir.
   *
   * Bu geçiş olmadan ikinci "Kaydet" yine oluşturma akışını çalıştırır ve
   * saveNode$'ın dup kontrolü "bu adda bir model zaten mevcut" hatası verir —
   * oysa kullanıcı aynı modelin içindedir ve güncelleme yapmak istemektedir.
   *
   * Sayfa yeniden yüklenmez: form durumu, ilişki sekmesi ve isSaved bayrağı korunur
   * (bayrak korunmalı ki "Yayınla" butonu aktif kalsın — bu yüzden tüm form
   * mutasyonları emitEvent:false ile yapılır, aksi halde trackFormChanges sıfırlar).
   */
  private enterEditModeAfterCreate(rootName: string, savedRoot: TreeNode): void {
    this.isNew = false;
    this.editTypeName = rootName;

    // Düzenleme modu kuralı: kök model adı değiştirilemez (loadForEdit ile aynı).
    this.rootGroup.get('entityName')?.disable({ emitEvent: false });

    // Diff temeli: bu kayıtla birlikte sunucuda oluşan kolonlar ve etiketler.
    this.originalColumnNames = new Set(savedRoot.columns.map(c => c.columnName));
    this.originalColumnMeta = new Map(savedRoot.columns.map(c => [
      c.columnName, columnMetaOf(c)
    ]));
    this.originalLabel = savedRoot.label;
    // addTable ikonu birlikte yazdı (025'siz tenant'ta sunucu atlar; ikon varsayılan kalır).
    this.originalIcon = this.modelIcon;

    // Kaydedilen alt modeller artık taslak değildir; formdan düşürülür ve
    // "Alt Modeller" sekmesindeki kayıtlı listeye geçerler (loadTables).
    this.subModels.clear({ emitEvent: false });

    // Adres çubuğu gerçek duruma uyar: sayfa yenilenirse düzenleme ekranı açılır.
    this.location.replaceState(`/build/${rootName}`);

    // Kayıtlı alt model listesi, tablo ID'si ve lookup hedefleri tazelenir.
    this.loadTables();
  }

  // ─── ADIM 1: KAYDET (düzenleme modu) ──────────────────────────────────────

  /**
   * Düzenleme modunda kaydet: kök modelin kolonlarını orijinal şema ile
   * karşılaştırır (diff) — yeni kolon adları addMember, kaybolan kolon adları
   * removeMember (soft-delete, SQL kolonu DROP edilmez) ile gönderilir.
   * Bu oturumda eklenen tamamen yeni alt modeller normal oluşturma akışıyla
   * (addTable + addMember) kaydedilir. Model adı (kök) bu modda değiştirilemez.
   */
  onSaveEdit(): void {
    if (this.isSaving || this.isPublishing || !this.editTypeName || !this.ensureFormValid()) return;

    const rootName = this.editTypeName;
    const nodes = this.flattenTree(this.rootGroup, null);
    const rootNode = nodes[0];
    const newChildNodes = nodes.slice(1); // bu oturumda eklenen yeni alt modeller

    if (rootNode.columns.length === 0) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.atLeastOneColumn');
      return;
    }

    const currentColumnNames = new Set(rootNode.columns.map(c => c.columnName));
    const addedColumns = rootNode.columns.filter(c => !this.originalColumnNames.has(c.columnName));
    const removedColumnNames = [...this.originalColumnNames].filter(name => !currentColumnNames.has(name));

    // Kayıtlı kolonun tipi kilitli; yine de değişmişse (eski bir taslak, elle müdahale)
    // değişiklik sessizce atılmaz — kayıt hiç başlamadan durur.
    const typeChanged = rootNode.columns.find(c => {
      const original = this.originalColumnMeta.get(c.columnName);
      return !!original && original.dataType !== c.dataType;
    });
    if (typeChanged) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.typeChangeBlocked', { name: typeChanged.columnName });
      return;
    }

    const ops: Array<() => Observable<unknown>> = [];

    // 1. Kaldırılan kolonları pasifle (soft-delete — SQL kolonu DROP edilmez)
    removedColumnNames.forEach(name => ops.push(() =>
      this.publishedTableService.removeMember(rootName, name).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnDeactivateFailed', { name }))))
      )
    ));

    // 2. Eklenen yeni kolonları kaydet
    addedColumns.forEach(col => ops.push(() =>
      this.publishedTableService.addMember(this.memberRequest(rootName, col)).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnAddFailed', { name: col.columnName }))))
      )
    ));

    // 3. Model etiketi değiştiyse yalnız etiketi yaz
    const newLabel = rootNode.label ?? '';
    if (newLabel !== (this.originalLabel ?? '')) {
      ops.push(() => this.publishedTableService.setTableLabel(rootName, newLabel).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.labelUpdateFailed'))))
      ));
    }

    // 4. Kayıtlı kolonların meta verisi: etiket, açıklama, zorunluluk, kurallar ve dosya boyutu
    //    sınırı — tek istekte (ad/tip kilitli; şema değişmez, yayın gerekmez).
    const metadataChanged = rootNode.columns.filter(c => {
      const original = this.originalColumnMeta.get(c.columnName);
      return !!original && metadataKey(c) !== original.metadataKey;
    });
    metadataChanged.forEach(col => ops.push(() =>
      this.publishedTableService.updateMemberMetadata(toMemberMetadataUpdate(rootName, col)).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnMetadataUpdateFailed', { name: col.columnName }))))
      )
    ));

    // 5b. Kayıtlı kolonların otomatik değer kuralı değiştiyse yaz (şema değişmez, yayın gerekmez)
    const autoValueChanged = rootNode.columns.filter(c => {
      const original = this.originalColumnMeta.get(c.columnName);
      return !!original && autoValueKey(c) !== original.autoValueKey;
    });
    autoValueChanged.forEach(col => ops.push(() =>
      this.publishedTableService.setMemberAutoValue({
        typeName: rootName,
        memberName: col.columnName,
        trigger: (col.autoValueTrigger || null) as AutoValueTrigger | null,
        expression: col.autoValueExpression || null,
        isReadOnly: !!col.isReadOnly
      }).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.autoValue.updateFailed', { name: col.columnName }))))
      )
    ));

    // 6. Bu oturumda eklenen tamamen yeni alt modeller — normal oluşturma akışı
    newChildNodes.forEach(node => ops.push(() => this.saveNode$(node)));

    this.isSaving = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    if (ops.length === 0) {
      this.isSaving = false;
      this.isSaved = true;
      this.savedRootName = rootName;
      this.submitSuccess = true;
      this.submitMessage = this.languageService.t('table.detail.noChanges');
      return;
    }

    from(ops).pipe(
      concatMap(op => op())
    ).pipe(markDirty(this.cdr)).subscribe({
      next: () => {},
      error: (err: Error) => {
        this.isSaving = false;
        this.isSaved = false;
        this.savedRootName = null;
        this.submitSuccess = false;
        this.submitMessage = err.message ?? this.languageService.t('table.detail.saveServerError');
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;
        this.submitMessage = this.languageService.t('table.detail.changesSaved');

        // Diff temelini tazele: bu kayıttan sonra eklenen kolonlar artık "mevcut"tur
        // ve bu oturumda oluşturulan alt modeller artık "yeni" değildir. Tazelenmezse
        // ikinci "Kaydet" aynı kolonları/alt modelleri yeniden eklemeye çalışır.
        this.originalColumnNames = new Set(rootNode.columns.map(c => c.columnName));
        this.originalColumnMeta = new Map(rootNode.columns.map(c => [
          c.columnName, columnMetaOf(c)
        ]));
        this.originalLabel = rootNode.label;
        this.subModels.clear({ emitEvent: false });
        this.recordMetadata.invalidate(rootName);

        // Yeni alt modeller kayıtlı listeye geçsin (ve lookup hedefi olabilsin).
        if (newChildNodes.length > 0)
          this.loadTables();
      }
    });
  }

  // ─── ADIM 2: YAYINLA ──────────────────────────────────────────────────────

  /**
   * Yayınla: önce model ikonu seçtirilir (kayıtlı ikon seçili gelir, seçmek opsiyonel),
   * onaylanınca {@link onIconConfirmed} → {@link publish}.
   */
  onPublish(): void {
    if (!this.isSaved || !this.savedRootName) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.saveModelFirst');
      return;
    }

    if (this.isPublishing || this.isSaving) return;
    this.iconPickerMode = 'publish';
  }

  /** Başlıktaki ikon düğmesi — yeniden yayınlamadan değiştirir. */
  openIconPicker(): void {
    if (!this.isPublishing && !this.isSaving) this.iconPickerMode = 'select';
  }

  /** Seçici onayı. Yayın kipinde ikon (değiştiyse) yazılır ve yayın başlar. */
  onIconConfirmed(icon: string | null): void {
    const mode = this.iconPickerMode;
    const typeName = this.editTypeName ?? this.savedRootName;

    if (mode === 'publish') {
      this.iconPickerMode = null;
      this.modelIcon = icon;
      this.publish(typeName && icon !== this.originalIcon ? typeName : null);
      return;
    }

    // Henüz kaydedilmemiş model: ikon addTable ile birlikte gider.
    if (!typeName) {
      this.modelIcon = icon;
      this.iconPickerMode = null;
      return;
    }
    if (icon === this.originalIcon) {
      this.iconPickerMode = null;
      return;
    }

    this.iconSaving = true;
    this.publishedTableService.setTableIcon(typeName, icon).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.iconSaving = false;
        this.iconPickerMode = null;
        if (res.success) {
          this.modelIcon = this.originalIcon = icon;
        } else {
          this.submitSuccess = false;
          this.submitMessage = this.languageService.t('model.icon.saveFailed', { message: res.message ?? '' });
        }
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.iconSaving = false;
        this.iconPickerMode = null;
        this.submitSuccess = false;
        this.submitMessage = this.languageService.t('model.icon.saveFailed', {
          message: err?.error?.message ?? err?.message ?? ''
        });
      }
    });
  }

  /**
   * Kaydedilmiş ağacı backend'e yayınlatır.
   * Backend kök adından tüm ağacı BFS ile çekip parent-first derler ve SQL tabloları oluşturur.
   *
   * `iconFor` doluysa önce o modelin ikonu yazılır. İkon opsiyoneldir: yazılamazsa (ör. tenant
   * migrasyonu 025 yok) uyarı gösterilir, yayın yine yapılır.
   */
  private publish(iconFor: string | null): void {
    if (!this.savedRootName) return;
    const rootName = this.savedRootName;
    const icon = this.modelIcon;

    this.isPublishing = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    const writeIcon$ = iconFor
      ? this.publishedTableService.setTableIcon(iconFor, icon).pipe(
          catchError((err: { error?: { message?: string }; message?: string }) =>
            of({ success: false, message: err?.error?.message ?? err?.message ?? '' })),
          switchMap(res => {
            if (res.success) this.originalIcon = icon;
            else this.notifications.warn(this.languageService.t('model.icon.saveFailed', { message: res.message ?? '' }));
            return of(null);
          }))
      : of(null);

    writeIcon$.pipe(
      concatMap(() => this.publishedTableService.publish(rootName)),
      markDirty(this.cdr)
    ).subscribe({
      next: res => {
        this.isPublishing = false;
        if (res.success) {
          this.submitSuccess = true;
          this.submitMessage = res.message ?? this.languageService.t('table.detail.publishSuccess');
          this.router.navigate(['/models']);
        } else {
          this.submitSuccess = false;
          this.submitMessage = res.message ?? this.languageService.t('table.detail.publishFailed');
        }
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isPublishing = false;
        this.submitSuccess = false;
        this.submitMessage = err?.error?.message ?? err?.message ?? this.languageService.t('table.detail.publishServerError');
      }
    });
  }
}
