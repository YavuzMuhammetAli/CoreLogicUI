import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, ViewChild, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ReactiveFormsModule, AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { from, concatMap, switchMap, throwError, of, catchError } from 'rxjs';
import { PublishedTableService, PublishedColumnSchema, PublishedTableSchema } from '../../services/published-table.service';
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

/** Ekrandaki sekmeler. */
type TabId = 'columns' | 'subModels' | 'relationships';

/** /Published/getAll satırı — model ağacını (parent/derinlik) kurmak için. */
interface TableRow {
  id: number;
  tableName: string;
  description: string;
  version: number;
  parentTableId: number | null;
  depth: number;
}

/** Kaydetme akışında kullanılan düzleştirilmiş düğüm verisi */
interface TreeNode {
  entityName: string;
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
  }[];
}

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
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    ModelNodeComponent, HelpHintComponent, DatatypeHelpComponent,
    RelationshipsTabComponent
  ],
  templateUrl: './table-detail.component.html',
  styleUrls: ['./table-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableDetailComponent implements OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

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
    this.columnDraft = ModelNodeComponent.buildColumnGroupStatic(this.fb);


    if (this.isNew) {
      // Oluşturma modu — boş kolon listesiyle başla, sütunlar popup'tan eklenir
      this.rootGroup = this.fb.group({
        entityName: ['MyEntity', [Validators.required, Validators.pattern(/^[A-Z][A-Za-z0-9]*$/)]],
        columns:    this.fb.array([]),
        subModels:  this.fb.array([])
      });
      this.trackFormChanges();
    } else {
      // Düzenleme modu — boş bir yer tutucu ile başla, şema yüklenince değiştirilir
      this.editTypeName = this.route.snapshot.paramMap.get('typeName');
      this.rootGroup = this.fb.group({
        entityName: [this.editTypeName, [Validators.required, Validators.pattern(/^[A-Z][A-Za-z0-9]*$/)]],
        columns:    this.fb.array([]),
        subModels:  this.fb.array([])
      });
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
    this.subModels.push(ModelNodeComponent.buildModelGroupStatic(this.fb, 'AltModel'));
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
    this.activeTab.set('columns');

    this.rootGroup = this.fb.group({
      entityName: [typeName, [Validators.required, Validators.pattern(/^[A-Z][A-Za-z0-9]*$/)]],
      columns:    this.fb.array([]),
      subModels:  this.fb.array([])
    });
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

  /** Bir sütun satırı için kısa kural özeti (tablo görünümünde gösterilir). */
  ruleSummary(col: AbstractControl): string {
    const v = (col as FormGroup).getRawValue();
    const parts: string[] = [];
    if (v.minLength != null) parts.push(this.languageService.t('table.detail.ruleMinLength', { value: v.minLength }));
    if (v.maxLength != null) parts.push(this.languageService.t('table.detail.ruleMaxLength', { value: v.maxLength }));
    if (v.min != null)       parts.push(this.languageService.t('table.detail.ruleMin', { value: v.min }));
    if (v.max != null)       parts.push(this.languageService.t('table.detail.ruleMax', { value: v.max }));
    if (v.regex)             parts.push('regex');
    if (v.enumValues)        parts.push(v.enumValues);
    if (v.lookupTargetTable) parts.push(`→ ${v.lookupTargetTable}`);
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
        this.rootGroup = this.buildGroupFromSchema(schema);
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
  private buildGroupFromSchema(schema: PublishedTableSchema): FormGroup {
    return this.fb.group({
      entityName: [
        schema.tableName,
        [Validators.required, Validators.pattern(/^[A-Z][A-Za-z0-9]*$/)]
      ],
      columns:   this.fb.array(schema.columns.map(c => this.buildColumnGroupFromSchema(c))),
      subModels: this.fb.array([])
    });
  }

  /** Okunan bir kolon kaydından FormGroup kurar (model-node'un sütun FormGroup yapısıyla aynı). */
  private buildColumnGroupFromSchema(col: PublishedColumnSchema): FormGroup {
    return this.fb.group({
      columnName:          [col.name, [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
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
      description:         [col.description ?? '']
    });
  }

  // ─── Sütun popup'ı ──────────────────────────────────────────────────────────

  openAddColumnModal(): void {
    this.editingColumnIndex = null;
    this.columnDraft = ModelNodeComponent.buildColumnGroupStatic(this.fb);
    this.columnModalOpen = true;
  }

  openEditColumnModal(index: number): void {
    this.editingColumnIndex = index;
    this.columnDraft = ModelNodeComponent.buildColumnGroupStatic(this.fb);
    this.columnDraft.patchValue(this.getColumnGroup(index).getRawValue());
    const targetTable = this.columnDraft.get('lookupTargetTable')?.value;
    if (targetTable) {
      this.onLookupTargetChange(targetTable);
    }
    this.columnModalOpen = true;
  }

  /** Popup'taki sütunu doğrular, geçerliyse ekler/günceller ve popup'ı kapatır. */
  saveColumnModal(): void {
    if (this.columnDraft.invalid) {
      this.columnDraft.markAllAsTouched();
      return;
    }

    const value = this.columnDraft.getRawValue();
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
    this.columnModalOpen = false;
    this.editingColumnIndex = null;
  }

  onColumnModalBackdropClick(): void {
    this.closeColumnModal();
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
    const columnsArr = group.get('columns') as FormArray;
    const subModelsArr = group.get('subModels') as FormArray;

    const cols = (columnsArr?.value ?? []).filter((c: any) => c.columnName?.trim());

    result.push({ entityName, parentName, columns: cols });

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
            this.publishedTableService.addMember(
              node.entityName,
              col.columnName,
              col.dataType,
              !col.isNullable,
              col.minLength ?? null,
              col.maxLength ?? null,
              col.min ?? null,
              col.max ?? null,
              col.regex || null,
              col.regexMessage || null,
              col.enumValues || null,
              col.lookupTargetTable || null,
              col.lookupDisplayColumn || null,
              col.label || null,
              col.description || null
            ).pipe(
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

  // ─── ADIM 1: KAYDET (oluşturma modu) ──────────────────────────────────────

  /**
   * Tüm model ağacını (kök + alt modeller) parent-first sırada kaydeder.
   * Her düğüm: addTable + her kolon için addMember.
   * Başarı sonrası isSaved = true olur ve Yayınla butonu aktifleşir.
   */
  onSave(): void {
    if (this.rootGroup.invalid || this.isSaving || this.isPublishing) {
      this.rootGroup.markAllAsTouched();
      return;
    }

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

    // Diff temeli: bu kayıtla birlikte sunucuda oluşan kolonlar.
    this.originalColumnNames = new Set(savedRoot.columns.map(c => c.columnName));

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
    if (this.rootGroup.invalid || this.isSaving || this.isPublishing || !this.editTypeName) {
      this.rootGroup.markAllAsTouched();
      return;
    }

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
      this.publishedTableService.addMember(
        rootName, col.columnName, col.dataType, !col.isNullable,
        col.minLength ?? null, col.maxLength ?? null, col.min ?? null, col.max ?? null,
        col.regex || null, col.regexMessage || null,
        col.enumValues || null, col.lookupTargetTable || null, col.lookupDisplayColumn || null,
        col.label || null, col.description || null
      ).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? this.languageService.t('table.detail.columnAddFailed', { name: col.columnName }))))
      )
    ));

    // 3. Bu oturumda eklenen tamamen yeni alt modeller — normal oluşturma akışı
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
        this.subModels.clear({ emitEvent: false });

        // Yeni alt modeller kayıtlı listeye geçsin (ve lookup hedefi olabilsin).
        if (newChildNodes.length > 0)
          this.loadTables();
      }
    });
  }

  // ─── ADIM 2: YAYINLA ──────────────────────────────────────────────────────

  /**
   * Kaydedilmiş ağacı backend'e yayınlatır.
   * Backend kök adından tüm ağacı BFS ile çekip parent-first derler ve SQL tabloları oluşturur.
   */
  onPublish(): void {
    if (!this.isSaved || !this.savedRootName) {
      this.submitSuccess = false;
      this.submitMessage = this.languageService.t('table.detail.saveModelFirst');
      return;
    }

    if (this.isPublishing || this.isSaving) return;

    this.isPublishing = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    this.publishedTableService.publish(this.savedRootName).pipe(markDirty(this.cdr)).subscribe({
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
