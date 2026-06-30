import { Component, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { from, concatMap, switchMap, throwError, of, catchError } from 'rxjs';
import { PublishedTableService, PublishedColumnSchema, PublishedTableSchema } from '../../services/published-table.service';
import { ModelNodeComponent } from '../model-node/model-node.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

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
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './table-detail.component.html',
  styleUrls: ['./table-detail.component.scss']
})
export class TableDetailComponent implements OnDestroy {
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

  private formChangeSub?: Subscription;

  /** Lookup kolon tipi için hedef model seçenekleri (kayıtlı tüm tablolar — taslak + yayınlanmış). */
  availableTables: string[] = [];
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

    this.loadAvailableTables();
  }

  ngOnDestroy(): void {
    this.formChangeSub?.unsubscribe();
  }

  // ─── Accessor'lar ───────────────────────────────────────────────────────────

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

  /** Lookup hedef seçimi için kayıtlı tüm tabloların adlarını yükler. */
  private loadAvailableTables(): void {
    this.publishedTableService.getAllTables().subscribe({
      next: res => {
        this.availableTables = res.success ? (res.data ?? []).map(t => t.tableName) : [];
      },
      error: () => { this.availableTables = []; }
    });
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
    this.publishedTableService.getSchema(targetTable).subscribe({
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
    this.formChangeSub = this.rootGroup.valueChanges.subscribe(() => {
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

    this.publishedTableService.getSchema(typeName).subscribe({
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
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
    ).subscribe({
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
        const nodeCount = nodes.length;
        this.submitMessage = nodeCount > 1
          ? this.languageService.t('table.detail.modelsSavedMulti', { count: nodeCount, names: nodes.map(n => n.entityName).join(', ') })
          : this.languageService.t('table.detail.modelSaved');
      }
    });
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
    ).subscribe({
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

    this.publishedTableService.publish(this.savedRootName).subscribe({
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
