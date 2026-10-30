import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, forwardRef, HostListener, Input, inject, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PublishedColumn, PublishedModelService } from '../../../services/published-model.service';
import { RecordMetadataService, TypeMeta } from '../../../services/record-metadata.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ModelLabelPipe } from '../../../pipes/model-label.pipe';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { RecordLayoutComponent } from '../record-layout/record-layout.component';
import { fieldValue, toInputValue } from '../../model-data/model-data.util';
import {
  StagedNode, DataRow, createStagedNode, childrenOf, upsertChild, removeChild,
  validatorsFor, fkColumnFor, normalizeRow
} from '../../model-detail/staged-tree.util';
import { markDirty } from '../../../utils/change-detection';
import { AutoValueFormBinding } from '../../../utils/auto-value/auto-value-form';
import { buildAutoValuePlan } from '../../../utils/auto-value/auto-value';
import { mustStayVisible } from '../../../utils/record-field/column-required';
import { FormLayout, ListLayout } from '../../../utils/screen-layout/screen-layout.model';
import { resolveListColumns } from '../../../utils/screen-layout/list-layout.resolve';
import { IconComponent } from '../icon/icon.component';

/** Alt model sekmesinin dialog içindeki görünüm durumu. */
interface ChildTabView {
  typeName: string;
  meta: TypeMeta | null;
  /** Sunucudaki kayıtlı alt satırlar bir kez çekildi mi (tembel yükleme bayrağı). */
  loaded: boolean;
  loading: boolean;
  error: string | null;
  /** Alt tipin yayınlanmış liste yerleşimi — varsa tablo kolonları ondan. */
  listLayout: ListLayout | null;
}

/**
 * RecordFormDialogComponent — bir dinamik kaydı büyük bir pop-up içinde düzenler
 * ve ALTINDA o modelin kendi alt modellerini sekme olarak gösterir.
 *
 * `forwardRef` ile ÖZYİNELEMELİDİR: bir alt model satırına tıklanınca aynı component
 * bir üst katmanda tekrar açılır (model-node ile aynı desen). Böylece kullanıcı
 * ana model → alt model → torun zincirini tek akışta kurabilir ve seçim/toplu silme
 * tasarımı her derinlikte aynı çalışır.
 *
 * KAYDETME SEMANTİĞİ: yeni kayıtlar belleğe alınır (`StagedNode`) ve ağaç ancak üst
 * modelde "Kaydet"e basıldığında gönderilir — hiçbir seviye "önce üstünü kaydet"
 * zorunluluğu taşımaz. Buna karşılık SUNUCUDA ZATEN VAR OLAN satırlar için iki işlem
 * anında yapılır: kayıtlı alt satırların LİSTELENMESİ ve SİLİNMESİ. Onlar için
 * "kaydete kadar bekle" semantiği anlamsızdır.
 */
@Component({
    selector: 'app-record-form-dialog',
    imports: [
        CommonModule,
        ReactiveFormsModule,
        TranslatePipe,
        ModelLabelPipe,
        ConfirmDialogComponent,
        RecordLayoutComponent,
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        forwardRef(() => RecordFormDialogComponent), IconComponent
    ],
    templateUrl: './record-form-dialog.component.html',
    styleUrls: ['./record-form-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecordFormDialogComponent implements OnInit, OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly metadata = inject(RecordMetadataService);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly languageService = inject(LanguageService);
  private readonly fb = inject(FormBuilder);

  /** Düzenlenen düğüm. Yeni kayıt için boş `values` ile oluşturulmuş olmalıdır. */
  @Input({ required: true }) node!: StagedNode;

  /** İç içe seviye (kök dialog = 1). z-index ve derinlik sınırı için. */
  @Input() depth = 1;

  /** Mevcut bir kaydın düzenlenmesi mi (başlık metni için). */
  @Input() isEdit = false;

  /**
   * Bu tipin ÜST kayda bağlandığı FK kolonunun adı (örn. `SiparisId`). Formda gizlenir
   * ve kaydetme anında sunucu tarafından atanır. Verilmezse hiçbir kolon FK sayılmaz.
   */
  @Input() fkColumn: string | null = null;

  /** Kaydedilmiş bir satırın salt-okunur FK bilgisi (başlıkta rozet olarak gösterilir). */
  @Input() fkHint: string | null = null;

  /** Kullanıcı "Kaydet" dedi — düğüm güncellenmiş hâliyle döner (HTTP yapılmadı). */
  @Output() saved = new EventEmitter<StagedNode>();
  @Output() cancelled = new EventEmitter<void>();

  /** Alt model ağacının en fazla derinliği — şema tarafındaki MAX_DEPTH ile aynı. */
  readonly maxDepth = 4;

  meta: TypeMeta | null = null;
  loading = true;
  form: FormGroup | null = null;
  /** Forma bağlı otomatik değer kuralları (kural yoksa null). */
  autoValues: AutoValueFormBinding | null = null;

  /** Bu tipin yayınlanmış form yerleşimi (ekran tasarımı); null → varsayılan görünüm. */
  formLayout: FormLayout | null = null;
  /** Formda çizilen kolonlar — FK ve ID hariç (bir kez hesaplanır). */
  editable: PublishedColumn[] = [];
  /** Pop-up'ta hiç çizilmeyen kolonlar: ID ve üst kayda bağlayan FK. */
  excludedColumns: ReadonlySet<string> = new Set();
  /** Tasarımda gizli olsa da çizilmesi gereken zorunlu kolonlar. */
  forcedColumns: ReadonlySet<string> = new Set();

  /** Kaydet geçersiz formda durunca hatalı alanı (kapalı sekme/bölüm dahil) gösterir. */
  @ViewChild(RecordLayoutComponent) private recordLayout?: RecordLayoutComponent;

  childTabs: ChildTabView[] = [];
  activeChildTab = '';

  /** Bu dialogun üstünde açık olan iç içe dialog (alt model kaydı). */
  nestedOpen = false;
  nestedNode: StagedNode | null = null;
  nestedTypeName = '';
  nestedIsEdit = false;

  /** altTipAdı → seçili satırların geçici localId'leri (toplu silme için). */
  selected: Record<string, Set<number>> = {};
  /** altTipAdı → silinemeyen satırların hata özeti. */
  bulkErrors: Record<string, string[]> = {};
  /** altTipAdı → son toplu silme denemesindeki kayıt sayısı. */
  bulkTotals: Record<string, number> = {};
  /** Onay diyaloğunun hedef alt tipi; null ise kapalı. */
  bulkTypeName: string | null = null;
  bulkBusy = false;

  // Util delegasyonları (şablondan çağrılır)
  childrenOf = childrenOf;

  ngOnInit(): void {
    forkJoin({
      meta: this.metadata.meta$(this.node.typeName),
      layout: this.metadata.formLayout$(this.node.typeName)
    }).pipe(markDirty(this.cdr)).subscribe(({ meta, layout }) => {
      this.meta = meta;
      this.formLayout = layout;
      this.editable = this.editableColumns(meta);
      this.excludedColumns = new Set(['ID', 'Id', ...(this.fkColumn ? [this.fkColumn] : [])]);
      this.forcedColumns = new Set(this.editable
        .filter(c => mustStayVisible(c, meta.rules.get(c.columnName)))
        .map(c => c.columnName));
      this.form = this.buildForm(meta);
      this.bindAutoValues(meta, this.form);
      this.childTabs = meta.childTypeNames.map(typeName => ({
        typeName, meta: null, loaded: false, loading: false, error: null, listLayout: null
      }));
      // Alt tabloların kolonları alt tipin liste yerleşimini izler (okunamazsa varsayılan).
      for (const tab of this.childTabs) {
        this.metadata.listLayout$(tab.typeName).pipe(markDirty(this.cdr)).subscribe(l => { tab.listLayout = l; });
      }
      this.activeChildTab = this.childTabs[0]?.typeName ?? '';
      this.loading = false;
      // Kayıtlı bir kaydı düzenliyorsak ilk sekmenin mevcut alt satırlarını çek.
      this.ensureChildRowsLoaded(this.activeChildTab);
    });
  }

  // ─── Form ───────────────────────────────────────────────────────────────────

  /**
   * Formu şema kurallarıyla birlikte kurar — regex/uzunluk/aralık burada bağlanır,
   * böylece hatalar sunucuya gitmeden alanın altında görünür.
   */
  private buildForm(meta: TypeMeta): FormGroup {
    const controls: Record<string, unknown> = {};
    for (const col of this.editableColumns(meta)) {
      // Düğüm kaydedilmiş bir sunucu satırından gelmiş olabilir (camelCase anahtarlar);
      // casing-bağımsız oku, aksi halde alanlar boş açılır.
      // Ham ISO tarih değeri doğrudan bağlanırsa datetime-local kutusu onu sessizce
      // atar ve alan BOŞ açılır; kullanıcı dokununca tarayıcı o anki zamanı yazar.
      const value = toInputValue(col.dataType, fieldValue(this.node.values, col.columnName)) ?? '';
      controls[col.columnName] = [value, validatorsFor(col, meta.rules.get(col.columnName))];
    }
    return this.fb.group(controls);
  }

  /**
   * Otomatik değer kurallarını forma bağlar. Açılış kuralları yalnız henüz sunucuya
   * yazılmamış (yeni) satırda çalışır; FK kolonu formda olmadığı için plana girmez.
   */
  private bindAutoValues(meta: TypeMeta, form: FormGroup): void {
    this.autoValues?.stop();
    const plan = buildAutoValuePlan(this.editableColumns(meta).map(col => {
      const rule = meta.rules.get(col.columnName);
      return {
        name: col.columnName,
        dataType: col.dataType,
        autoValueTrigger: rule?.autoValueTrigger,
        autoValueExpression: rule?.autoValueExpression,
        isReadOnly: rule?.isReadOnly
      };
    }));
    this.autoValues = plan.rules.length > 0
      ? new AutoValueFormBinding(form, plan, this.node.savedId === null).start()
      : null;
  }

  ngOnDestroy(): void {
    this.autoValues?.stop();
  }

  /** FK kolonu formda gösterilmez — kaydetme anında otomatik atanır. */
  editableColumns(meta: TypeMeta): PublishedColumn[] {
    return meta.columns.filter(c => !this.isFkColumn(c.columnName));
  }

  /**
   * Yalnızca birincil anahtar ve GERÇEK FK kolonu gizlenir.
   *
   * Eskiden `Id` ile biten her kolon FK sanılıp gizleniyordu; `TcId` / `VergiNoId`
   * gibi iş kolonları bu yüzden formda hiç görünmüyor ve hiç kaydedilmiyordu.
   * FK adı tahmin edilmez — `fkColumn` Input'u ile kesin olarak verilir.
   */
  private isFkColumn(columnName: string): boolean {
    if (columnName === 'ID' || columnName === 'Id') return true;
    return !!this.fkColumn && columnName === this.fkColumn;
  }

  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  // Lookup seçenekleri artık burada yüklenmiyor: app-lookup-picker kendi verisini
  // tembel çeker (50'şer) ve aramayı sunucuda yapar. Eskiden hedef tablonun TÜM
  // satırları önden yükleniyordu.

  // ─── Alt model sekmeleri ────────────────────────────────────────────────────

  setChildTab(typeName: string): void {
    this.activeChildTab = typeName;
    this.ensureChildRowsLoaded(typeName);
  }

  /** Bu dialogda alt model sekmeleri gösterilsin mi (derinlik sınırı). */
  get canShowChildren(): boolean {
    return this.depth < this.maxDepth && this.childTabs.length > 0;
  }

  tabView(typeName: string): ChildTabView | undefined {
    return this.childTabs.find(t => t.typeName === typeName);
  }

  /**
   * Sunucudaki kayıtlı alt satırları BİR KEZ çeker ve ağaca `StagedNode` olarak yazar.
   *
   * Böylece tablo, durum rozeti ve düzenleme akışı bellekteki satırlarla aynı kodu
   * kullanır; `upsertChild` `localId` ile tekilleştirdiği için tekrar çağrı çift satır
   * üretmez. Yalnızca aktif sekme için çalışır — derin ağaçlarda gereksiz istek olmaz.
   *
   * `toTreeDto` bu düğümleri `existingId` ile gönderir: sunucu onları yeniden EKLEMEZ,
   * yalnızca altlarına eklenen yeni torunlara FK hedefi olurlar.
   */
  private ensureChildRowsLoaded(typeName: string): void {
    if (!typeName || this.node.savedId === null) return;   // yeni kayıt: çekilecek satır yok
    const tab = this.tabView(typeName);
    if (!tab || tab.loaded || tab.loading) return;

    const parentId = this.node.savedId;
    tab.loading = true;
    tab.error = null;

    forkJoin({
      meta: this.metadata.meta$(typeName),
      res: this.publishedModel.getAll(typeName, fkColumnFor(this.node.typeName), parentId)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ meta, res }) => {
        tab.loading = false;
        tab.meta = meta;
        if (!res.success) {
          tab.error = res.message ?? this.languageService.t('record.childRowsLoadFailed');
          return;
        }
        tab.loaded = true;
        for (const row of (res.data ?? []) as DataRow[]) {
          const id = Number(fieldValue(row, 'ID') ?? 0);
          if (!id) continue;
          const child = createStagedNode(typeName, normalizeRow(meta.columns, row));
          child.savedId = id;
          upsertChild(this.node, typeName, child);
        }
      },
      error: () => {
        tab.loading = false;
        tab.error = this.languageService.t('record.childRowsLoadFailed');
      }
    });
  }

  childRows(typeName: string): StagedNode[] {
    return childrenOf(this.node, typeName);
  }

  /** Alt model satırlarının tabloda gösterilecek kolonları (meta yüklenmemişse boş). */
  childColumns(typeName: string): PublishedColumn[] {
    const tab = this.childTabs.find(t => t.typeName === typeName);
    if (!tab) return [];
    if (!tab.meta) {
      this.metadata.meta$(typeName).pipe(markDirty(this.cdr)).subscribe(m => { tab.meta = m; });
      return [];
    }
    // Alt tipin FK'sı bu düğümün tipine işaret eder; iş kolonları ad kalıbıyla elenmez.
    const childFk = fkColumnFor(this.node.typeName);
    const columns = tab.meta.columns.filter(c => c.columnName !== 'ID' && c.columnName !== childFk);
    // Liste yerleşimi varsa onun sırası (pop-up dar olduğu için en fazla 6 kolon); yoksa ilk 4.
    return tab.listLayout
      ? resolveListColumns(tab.listLayout, columns, null).slice(0, 6).map(r => r.column)
      : columns.slice(0, 4);
  }

  /** Alt kolonun FK adı — özyinelemeli dialog'a geçirilir. */
  childFkColumn(): string {
    return fkColumnFor(this.node.typeName);
  }

  childCell(row: StagedNode, columnName: string): string {
    const v = fieldValue(row.values, columnName);
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  openNestedAdd(typeName: string): void {
    this.nestedTypeName = typeName;
    this.nestedNode = createStagedNode(typeName, {});
    this.nestedIsEdit = false;
    this.nestedOpen = true;
  }

  openNestedEdit(typeName: string, row: StagedNode): void {
    this.nestedTypeName = typeName;
    this.nestedNode = row;
    this.nestedIsEdit = true;
    this.nestedOpen = true;
  }

  onNestedSaved(child: StagedNode): void {
    upsertChild(this.node, this.nestedTypeName, child);
    this.closeNested();
  }

  closeNested(): void {
    this.nestedOpen = false;
    this.nestedNode = null;
    this.nestedTypeName = '';
  }

  // ─── Alt satır seçimi ───────────────────────────────────────────────────────

  private selectionOf(typeName: string): Set<number> {
    return (this.selected[typeName] ??= new Set<number>());
  }

  isRowSelected(typeName: string, row: StagedNode): boolean {
    return this.selectionOf(typeName).has(row.localId);
  }

  toggleRow(typeName: string, row: StagedNode): void {
    const sel = this.selectionOf(typeName);
    if (sel.has(row.localId)) sel.delete(row.localId);
    else sel.add(row.localId);
  }

  selectedCount(typeName: string): number {
    return this.selectionOf(typeName).size;
  }

  allRowsSelected(typeName: string): boolean {
    const rows = this.childRows(typeName);
    const sel = this.selectionOf(typeName);
    return rows.length > 0 && rows.every(r => sel.has(r.localId));
  }

  someRowsSelected(typeName: string): boolean {
    return this.selectedCount(typeName) > 0 && !this.allRowsSelected(typeName);
  }

  toggleAllRows(typeName: string): void {
    const sel = this.selectionOf(typeName);
    if (this.allRowsSelected(typeName)) sel.clear();
    else this.childRows(typeName).forEach(r => sel.add(r.localId));
  }

  errorsOf(typeName: string): string[] {
    return this.bulkErrors[typeName] ?? [];
  }

  totalOf(typeName: string): number {
    return this.bulkTotals[typeName] ?? 0;
  }

  // ─── Alt satırların toplu silinmesi ─────────────────────────────────────────

  openBulkDelete(typeName: string): void {
    if (this.selectedCount(typeName) === 0) return;
    this.bulkTypeName = typeName;
  }

  cancelBulkDelete(): void {
    if (this.bulkBusy) return;
    this.bulkTypeName = null;
  }

  get bulkDeleteMessage(): string {
    if (!this.bulkTypeName) return '';
    return this.languageService.t('record.bulkDeleteMessage', {
      count: this.selectedCount(this.bulkTypeName)
    });
  }

  /** Onay diyaloğu bu dialogun ÜSTÜNDE durmalı — kendi overlay'i 1000 + depth*10. */
  get confirmZIndex(): number {
    return this.overlayZIndex + 5;
  }

  /**
   * Seçili alt satırları siler. Karışık seçim tek akışta yürür:
   * bellekteki satırlar yalnızca ağaçtan çıkarılır, KAYITLI olanlar sunucudan silinir
   * (onlar zaten var; "üstteki Kaydet'e kadar bekle" semantiği anlamsız).
   *
   * Kısmi hata kabul edilir: silinenler listeden düşer, silinemeyenler SEÇİLİ KALIR ve
   * hataları tablonun üstünde özetlenir.
   */
  confirmBulkDelete(): void {
    const typeName = this.bulkTypeName;
    if (!typeName || this.bulkBusy) return;

    const sel = this.selectionOf(typeName);
    const rows = this.childRows(typeName).filter(r => sel.has(r.localId));
    const staged = rows.filter(r => r.savedId === null);
    const savedRows = rows.filter(r => r.savedId !== null);

    // Bellekteki satırlar için istek yok — doğrudan ağaçtan düşerler.
    for (const row of staged) removeChild(this.node, typeName, row.localId);

    if (savedRows.length === 0) {
      sel.clear();
      this.bulkErrors[typeName] = [];
      this.bulkTypeName = null;
      return;
    }

    this.bulkBusy = true;
    this.bulkTotals[typeName] = rows.length;

    forkJoin(
      savedRows.map(row =>
        this.publishedModel.delete(typeName, row.savedId!).pipe(
          map(res => ({ row, ok: res.success, message: res.message })),
          catchError(err => of({
            row,
            ok: false,
            message: (err?.error?.message ?? this.languageService.t('record.childRowsLoadFailed')) as string
          }))
        )
      )
    ).pipe(markDirty(this.cdr)).subscribe(results => {
      this.bulkBusy = false;
      this.bulkTypeName = null;

      sel.clear();
      const failed: string[] = [];
      for (const r of results) {
        if (r.ok) {
          removeChild(this.node, typeName, r.row.localId);
        } else {
          sel.add(r.row.localId);            // sorunlu satır seçili kalsın
          failed.push(`ID:${r.row.savedId} — ${r.message}`);
        }
      }
      this.bulkErrors[typeName] = failed;
    });
  }

  // ─── Kaydet / kapat ─────────────────────────────────────────────────────────

  /** Formu doğrular ve düğümü belleğe yazar — kaydın kendisi için HTTP YAPILMAZ. */
  submit(): void {
    if (!this.form) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.recordLayout?.revealFirstInvalid();
      return;
    }
    this.autoValues?.runSave();
    // getRawValue: salt okunur (disabled) otomatik alanlar da düğüme yazılsın.
    this.node.values = { ...this.node.values, ...this.form.getRawValue() };
    // Değerler düzeltildi; önceki kaydetme hatası artık geçersiz.
    this.node.error = null;
    // Kayıtlı bir düğümse `addTree` onu güncelleyemez; ayrıca `update()` gerekiyor.
    this.node.dirty = true;
    this.saved.emit(this.node);
  }

  cancel(): void {
    this.cancelled.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.cancel();
  }

  /**
   * ESC yalnızca EN ÜSTTEKİ dialogu kapatır. Tüm katmanlar `document` üzerinde
   * dinlediği için `stopPropagation` yetmez — aynı hedefteki diğer dinleyicileri
   * yalnızca `stopImmediatePropagation` durdurur.
   */
  @HostListener('document:keydown.escape', ['$event'])
  onEscape(event: Event): void {
    if (this.nestedOpen) return;        // üstteki katman kendisi ilgilenecek
    event.stopImmediatePropagation();
    this.cancel();
  }

  /** İç içe katmanlar üst üste binmeli — her seviye bir öncekinin üstünde. */
  get overlayZIndex(): number {
    return 1000 + this.depth * 10;
  }
}
