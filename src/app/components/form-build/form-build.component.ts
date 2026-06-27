import { Component, OnDestroy } from '@angular/core';
import { ReactiveFormsModule, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, forkJoin } from 'rxjs';
import { from, concatMap, switchMap, throwError, of, catchError } from 'rxjs';
import { PublishedTableService, PublishedColumnSchema, PublishedTableSchema } from '../../services/published-table.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { ModelUsageService, ModelUsage } from '../../services/model-usage.service';
import { ReportService } from '../../services/report.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationService } from '../../services/notification.service';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { ModelNodeComponent, MAX_DEPTH } from '../model-node/model-node.component';

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
  }[];
}

@Component({
  selector: 'app-form-build',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, ModelNodeComponent, ConfirmDialogComponent],
  templateUrl: './form-build.component.html',
  styleUrls: ['./form-build.component.scss']
})
export class FormBuildComponent implements OnDestroy {
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

  /**
   * Düzenleme modu (route'ta :typeName varsa): mevcut bir model/taslak açılıp
   * kolon ekleme/silme yapılabilir. Model adı (entityName) bu modda salt-okunur
   * (yeniden adlandırma kapsam dışı — sil+ekle ile yapılabilir).
   */
  isEditMode = false;
  editTypeName: string | null = null;
  isLoadingSchema = false;
  loadError: string | null = null;

  /** Düzenleme modunda diff için: yüklenen şemadaki kolon adları */
  private originalColumnNames = new Set<string>();

  private formChangeSub?: Subscription;

  // ─── Liste ekranı (route'ta :typeName yokken): yayınlanmış modeller + sil ──

  /** Oluşturma formunu göster/gizle — liste ekranında "+ Yeni Tablo Oluştur" ile açılır. */
  showCreateForm = false;

  models: PublishedModel[] = [];
  loadingModels = false;
  listError: string | null = null;

  /** typeName → siliniyor mu (pasifleştirme isteği devam ediyor) */
  isDeleting: Record<string, boolean> = {};
  deleteError: string | null = null;

  /** Silme onay modalının durumu */
  confirmOpen = false;
  confirmBusy = false;
  confirmUsageLoading = false;
  confirmUsage: ModelUsage | null = null;
  /** Onay bekleyen modelin adı */
  pendingTypeName: string | null = null;

  constructor(
    private fb: FormBuilder,
    private _publishedTableService: PublishedTableService,
    private publishedModel: PublishedModelService,
    private modelUsageService: ModelUsageService,
    private reportService: ReportService,
    private dashboardService: DashboardService,
    private notification: NotificationService,
    private _router: Router,
    private _route: ActivatedRoute
  ) {
    const typeName = this._route.snapshot.paramMap.get('typeName');

    if (typeName) {
      // Düzenleme modu — boş bir yer tutucu ile başla, şema yüklenince değiştirilir
      this.isEditMode = true;
      this.editTypeName = typeName;
      this.rootGroup = ModelNodeComponent.buildModelGroupStatic(this.fb, typeName);
      this.trackFormChanges();
      this.loadForEdit(typeName);
    } else {
      // Oluşturma modu — kök düğüm FormGroup'u oluştur
      this.rootGroup = ModelNodeComponent.buildModelGroupStatic(this.fb, 'MyEntity');
      this.trackFormChanges();
      // Liste ekranı: yayınlanmış modelleri göster (düzenlemek/silmek için)
      this.loadModels();
    }
  }

  // ─── Liste ekranı yardımcıları ────────────────────────────────────────────

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
  }

  private loadModels(): void {
    this.loadingModels = true;
    this.listError = null;

    this.publishedModel.getModels().subscribe({
      next: res => {
        this.loadingModels = false;
        if (!res.success) {
          this.listError = res.message ?? 'Modeller yüklenemedi.';
          return;
        }
        this.models = res.data ?? [];
      },
      error: err => {
        this.loadingModels = false;
        this.listError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  /**
   * Modeli pasif yapmadan önce nerelerde kullanıldığını (raporlar/dashboardlar) kontrol eder
   * ve onay modalını açar. Asıl pasifleştirme `onConfirmDelete()`'te, kullanıcı modalı onayladıktan
   * sonra yapılır.
   */
  onDeleteModel(typeName: string): void {
    this.deleteError = null;
    this.pendingTypeName = typeName;
    this.confirmUsage = null;
    this.confirmUsageLoading = true;
    this.confirmOpen = true;

    this.modelUsageService.getUsage(typeName).subscribe({
      next: usage => {
        // Modal açıkken kullanıcı vazgeçmiş olabilir; o durumda sonucu yoksay.
        if (this.pendingTypeName === typeName) {
          this.confirmUsage = usage;
          this.confirmUsageLoading = false;
        }
      },
      error: () => {
        // Kullanım bilgisi alınamazsa silme akışını engellemiyoruz; boş kullanım gibi davran.
        if (this.pendingTypeName === typeName) {
          this.confirmUsage = { reports: [], dashboards: [], isEmpty: true };
          this.confirmUsageLoading = false;
        }
      }
    });
  }

  onCancelDelete(): void {
    if (this.confirmBusy) return;
    this.confirmOpen = false;
    this.pendingTypeName = null;
    this.confirmUsage = null;
    this.confirmUsageLoading = false;
  }

  /**
   * Kullanıcı modalı onayladı: önce (varsa) bağlı rapor/dashboardları, sonra modeli pasif alır.
   * PublishedTable/PublishedTableMember + ModelDefinition kayıtları Active=false olur,
   * derlenmiş tip assembly'den düşürülür. SQL tablosu ve içindeki kayıtlar hiçbir şekilde silinmez.
   */
  onConfirmDelete(): void {
    const typeName = this.pendingTypeName;
    if (!typeName) return;

    this.confirmBusy = true;
    this.isDeleting[typeName] = true;
    this.deleteError = null;

    const usage = this.confirmUsage;
    const cascadeCalls = [
      ...(usage?.reports.map(r => this.reportService.delete(r.id).pipe(catchError(() => of(null)))) ?? []),
      ...(usage?.dashboards.map(d => this.dashboardService.delete(d.id).pipe(catchError(() => of(null)))) ?? [])
    ];
    // forkJoin'in her zaman aynı şekilde tip çıkarımı yapması için boşken bile en az 1 eleman verilir.
    if (cascadeCalls.length === 0) {
      cascadeCalls.push(of(null));
    }

    forkJoin(cascadeCalls).subscribe({
      next: () => this.deleteModelAndClose(typeName),
      error: () => this.deleteModelAndClose(typeName)
    });
  }

  private deleteModelAndClose(typeName: string): void {
    this._publishedTableService.deleteModel(typeName).subscribe({
      next: res => {
        this.confirmBusy = false;
        this.isDeleting[typeName] = false;
        this.confirmOpen = false;
        this.pendingTypeName = null;
        this.confirmUsage = null;

        if (res.success) {
          this.models = this.models.filter(m => m.typeName !== typeName);
          this.notification.success(`'${typeName}' modeli pasif alındı.`);
        } else {
          this.deleteError = res.message ?? `'${typeName}' pasif yapılamadı.`;
        }
      },
      error: err => {
        this.confirmBusy = false;
        this.isDeleting[typeName] = false;
        this.confirmOpen = false;
        this.pendingTypeName = null;
        this.confirmUsage = null;
        this.deleteError = err?.error?.message ?? 'Sunucu bağlantı hatası.';
      }
    });
  }

  ngOnDestroy(): void {
    this.formChangeSub?.unsubscribe();
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
   * eklemek hâlâ mümkündür (normal oluşturma akışıyla aynı).
   */
  private loadForEdit(typeName: string): void {
    this.isLoadingSchema = true;
    this.loadError = null;

    this._publishedTableService.getSchema(typeName).subscribe({
      next: res => {
        this.isLoadingSchema = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? `'${typeName}' şeması okunamadı.`;
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
        this.loadError = err?.error?.message ?? err?.message ?? 'Şema okunurken sunucu hatası oluştu.';
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
      columnName:   [col.name, [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      dataType:     [col.dataType],
      isNullable:   [!col.isRequired],
      minLength:    [col.minLength ?? null],
      maxLength:    [col.maxLength ?? null],
      min:          [col.min ?? null],
      max:          [col.max ?? null],
      regex:        [col.regex ?? ''],
      regexMessage: [col.regexMessage ?? '']
    });
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
    return this._publishedTableService.getSchema(node.entityName).pipe(
      catchError((err: { status?: number }) => {
        if (err?.status === 400 || err?.status === 404) {
          return of({ success: false as const, message: 'bulunamadı', data: null as any });
        }
        return throwError(() => new Error('Kontrol sırasında sunucu hatası oluştu.'));
      }),
      switchMap(checkRes => {
        if (checkRes.success) {
          return throwError(() => new Error(
            `"${node.entityName}" adında kayıtlı bir model zaten mevcut. Farklı bir ad seçin.`
          ));
        }
        // addTable — alt model ise parentTableName gönderilir
        return this._publishedTableService.addTable({
          tableName:       node.entityName,
          description:     `${node.entityName} dinamik modeli`,
          version:         1,
          parentTableName: node.parentName ?? undefined
        });
      }),
      switchMap(res =>
        res.success
          ? of(res)
          : throwError(() => new Error(res.message ?? 'Tablo metadata kaydı başarısız.'))
      ),
      // Her kolon için addMember
      switchMap(() =>
        from(node.columns).pipe(
          concatMap(col =>
            this._publishedTableService.addMember(
              node.entityName,
              col.columnName,
              col.dataType,
              !col.isNullable,
              col.minLength ?? null,
              col.maxLength ?? null,
              col.min ?? null,
              col.max ?? null,
              col.regex || null,
              col.regexMessage || null
            ).pipe(
              switchMap(r =>
                r.success
                  ? of(r)
                  : throwError(() => new Error(r.message ?? `'${col.columnName}' üye kaydı başarısız.`))
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
        this.submitMessage = err.message ?? 'Kayıt sırasında sunucu hatası oluştu.';
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;
        const nodeCount = nodes.length;
        this.submitMessage = nodeCount > 1
          ? `${nodeCount} model (${nodes.map(n => n.entityName).join(', ')}) kaydedildi. Yayınlamak için "Yayınla"ya basın.`
          : `Model kaydedildi. Yayınlamak için "Yayınla"ya basın.`;
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

    const currentColumnNames = new Set(rootNode.columns.map(c => c.columnName));
    const addedColumns = rootNode.columns.filter(c => !this.originalColumnNames.has(c.columnName));
    const removedColumnNames = [...this.originalColumnNames].filter(name => !currentColumnNames.has(name));

    const ops: Array<() => Observable<unknown>> = [];

    // 1. Kaldırılan kolonları pasifle (soft-delete — SQL kolonu DROP edilmez)
    removedColumnNames.forEach(name => ops.push(() =>
      this._publishedTableService.removeMember(rootName, name).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? `'${name}' kolonu pasiflenemedi.`)))
      )
    ));

    // 2. Eklenen yeni kolonları kaydet
    addedColumns.forEach(col => ops.push(() =>
      this._publishedTableService.addMember(
        rootName, col.columnName, col.dataType, !col.isNullable,
        col.minLength ?? null, col.maxLength ?? null, col.min ?? null, col.max ?? null,
        col.regex || null, col.regexMessage || null
      ).pipe(
        switchMap(r => r.success
          ? of(r)
          : throwError(() => new Error(r.message ?? `'${col.columnName}' kolonu eklenemedi.`)))
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
      this.submitMessage = 'Değişiklik bulunmuyor. Doğrudan yayınlayabilirsiniz.';
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
        this.submitMessage = err.message ?? 'Kayıt sırasında sunucu hatası oluştu.';
      },
      complete: () => {
        this.isSaving = false;
        this.isSaved = true;
        this.savedRootName = rootName;
        this.submitSuccess = true;
        this.submitMessage = 'Değişiklikler kaydedildi. Yayınlamak için "Yayınla"ya basın.';
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
      this.submitMessage = 'Önce modeli kaydedin. Kaydedilmemiş model yayınlanamaz.';
      return;
    }

    if (this.isPublishing || this.isSaving) return;

    this.isPublishing = true;
    this.submitMessage = null;
    this.submitSuccess = null;

    this._publishedTableService.publish(this.savedRootName).subscribe({
      next: res => {
        this.isPublishing = false;
        if (res.success) {
          this.submitSuccess = true;
          this.submitMessage = res.message ?? 'Model(ler) başarıyla yayınlandı.';
          this._router.navigate(['/models']);
        } else {
          this.submitSuccess = false;
          this.submitMessage = res.message ?? 'Yayınlama başarısız.';
        }
      },
      error: (err: { error?: { message?: string }; message?: string }) => {
        this.isPublishing = false;
        this.submitSuccess = false;
        this.submitMessage = err?.error?.message ?? err?.message ?? 'Yayınlama sırasında sunucu hatası oluştu.';
      }
    });
  }
}
