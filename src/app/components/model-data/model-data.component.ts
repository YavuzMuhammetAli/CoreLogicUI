import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { PublishedModelService, PublishedModel, PublishedColumn, PagedData } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { PublishedTableService, ModelVersion } from '../../services/published-table.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import {
  isImage,
  imageSrc,
  isBase64Value,
  cellValue,
  rowVal,
  downloadFile
} from './model-data.util';
import { markDirty } from '../../utils/change-detection';
import { RecordMetadataService } from '../../services/record-metadata.service';
import { ListLayout } from '../../utils/screen-layout/screen-layout.model';
import { ResolvedListColumn, resolveListColumns } from '../../utils/screen-layout/list-layout.resolve';
import { pageWindow } from '../../utils/pagination';

type DataRow = Record<string, unknown>;

@Component({
  selector: 'app-model-data',
  standalone: true,
  imports: [
    CommonModule, RouterLink, DatePipe, ColumnVisibilityComponent,
    ConfirmDialogComponent, TranslatePipe
  ],
  templateUrl: './model-data.component.html',
  styleUrls: ['./model-data.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelDataComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);
  private readonly metadata = inject(RecordMetadataService);

  /** Sabit genişlikli tabloda genişliği verilmemiş kolonun ve sabit kolonların genişliği (px). */
  static readonly AUTO_COLUMN_PX = 160;
  static readonly ID_COLUMN_PX = 80;
  static readonly SELECT_COLUMN_PX = 44;
  static readonly STATUS_COLUMN_PX = 160;

  typeName = '';
  model: PublishedModel | undefined;

  // Grid durumu
  rows: DataRow[] = [];
  loadingRows = false;
  loadError: string | null = null;

  // Sayfalama durumu
  pageIndex = 1;
  pageSize  = 20;
  total     = 0;
  readonly pageSizeOptions = [20, 50, 100];

  // Sürüm paneli durumu
  versions = signal<ModelVersion[]>([]);
  showVersionPanel = signal(false);

  // Assembly yüklenmemiş hatası için tek-seferlik retry bayrağı
  private rowsRetried = false;

  // Admin tarafından yönetilen kolon görünürlüğü — null = ayar yok, tüm kolonlar görünür
  visibleColumnNames: string[] | null = null;
  savingColumnVisibility = false;

  /**
   * Yayınlanmış liste yerleşimi (ekran tasarımı). Varsa kolon sırası ve genişlikleri ondan
   * gelir ve "Kolonlar" ayarının yerini alır; yoksa null.
   */
  listLayout: ListLayout | null = null;

  // Toplu silme durumu
  /**
   * Seçili satırların ID'leri. Sayfalama SUNUCU taraflı olduğu için seçim sayfalar
   * arasında TAŞINMAZ — görünmeyen satırların silinmesi kullanıcı için sürpriz olur.
   */
  selectedIds = new Set<number>();
  /** Silinemeyen satırların hata özeti (satırlar seçili kalır). */
  bulkErrors: string[] = [];
  /** Son denemede kaç kayıt gönderildi (özet metni için). */
  bulkTotal = 0;
  readonly confirmOpen = signal(false);
  readonly bulkBusy = signal(false);

  constructor(
    private route: ActivatedRoute,
    private publishedModel: PublishedModelService,
    private publishModel: PublishModelService,
    public permissionService: PermissionService,
    public publishedTableService: PublishedTableService,
    private modelColumnSetting: ModelColumnSettingService
  ) {}

  ngOnInit(): void {
    // snapshot yerine paramMap observable'ına abone ol;
    // aynı component örneği farklı modeller için yeniden kullanıldığında
    // (Angular route-reuse) her parametre değişiminde tetiklenir.
    this.route.paramMap.pipe(markDirty(this.cdr)).subscribe(params => {
      this.typeName = params.get('typeName') ?? '';
      this.resetState();
      this.loadModelMeta();
      this.loadColumnVisibility();
    });
  }

  /** Yeni modele geçerken önceki modelin durumunu temizle */
  private resetState(): void {
    this.model = undefined;
    this.rows = [];
    this.loadError = null;
    this.loadingRows = true; // meta yüklenene kadar "bulunamadı" paneli gösterilmez
    this.rowsRetried = false;
    this.showVersionPanel.set(false);
    this.versions.set([]);
    this.pageIndex = 1;
    this.total     = 0;
    this.visibleColumnNames = null;
    this.listLayout = null;
    this.clearSelection();
  }

  /** Seçimi ve önceki toplu silme özetini sıfırlar. */
  private clearSelection(): void {
    this.selectedIds = new Set<number>();
    this.bulkErrors = [];
    this.bulkTotal = 0;
  }

  get columns(): PublishedColumn[] {
    return this.model?.columns ?? [];
  }

  /** Görünür kolonlar ve genişlikleri — liste yerleşimi, yoksa "Kolonlar" ayarı, o da yoksa hepsi. */
  get resolvedColumns(): ResolvedListColumn[] {
    return resolveListColumns(this.listLayout, this.columns, this.visibleColumnNames);
  }

  /** Görünür kolonlar — ayar yoksa şema kolonlarının tümü */
  get displayColumns(): PublishedColumn[] {
    return this.resolvedColumns.map(r => r.column);
  }

  /**
   * Liste yerleşiminde kolon genişlikleri `<colgroup>` ile verilir ve tablo sabit düzende
   * çizilir (aksi halde tarayıcı genişliği içeriğe göre yeniden dağıtır). Sıra: seçim kutusu,
   * ID, yerleşimin kolonları, iş akışı durumu.
   */
  get columnWidths(): number[] {
    const widths: number[] = [];
    if (this.permissionService.can(this.typeName, 'delete')) widths.push(ModelDataComponent.SELECT_COLUMN_PX);
    widths.push(ModelDataComponent.ID_COLUMN_PX);
    for (const c of this.resolvedColumns) widths.push(c.width ?? ModelDataComponent.AUTO_COLUMN_PX);
    if (this.hasWorkflowStatus) widths.push(ModelDataComponent.STATUS_COLUMN_PX);
    return widths;
  }

  get tableWidth(): number {
    return this.columnWidths.reduce((sum, w) => sum + w, 0);
  }

  /** Kolon görünürlüğü popover'ı için kolon listesi (liste görünümünde zorunlu kolon yok) */
  get columnVisibilityItems(): ColumnVisibilityItem[] {
    return this.columns.map(c => ({ name: c.columnName, required: false }));
  }

  /** Popover'ın o anki etkin seçimi — ayar yoksa tüm kolonlar işaretli gösterilir */
  get effectiveVisibleColumnNames(): string[] {
    return this.visibleColumnNames ?? this.columns.map(c => c.columnName);
  }

  /** Admin tarafından kayıtlı liste-görünümü kolon ayarını yükler */
  private loadColumnVisibility(): void {
    const typeName = this.typeName;
    this.modelColumnSetting.get(typeName, 'list').pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (typeName !== this.typeName) return; // bu sırada başka modele geçilmiş olabilir
        this.visibleColumnNames = (res.success && res.data?.visibleColumns?.length)
          ? res.data.visibleColumns
          : null;
      },
      error: () => { /* ayar yüklenemezse tüm kolonlar görünür kalır */ }
    });
  }

  /** Admin kolon görünürlüğü ayarını kaydeder */
  onSaveColumnVisibility(names: string[]): void {
    this.savingColumnVisibility = true;
    const dto: ModelColumnSettingDto = { typeName: this.typeName, viewType: 'list', visibleColumns: names };
    this.modelColumnSetting.set(dto).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.savingColumnVisibility = false;
        if (res.success) this.visibleColumnNames = names;
      },
      error: () => { this.savingColumnVisibility = false; }
    });
  }

  /** Model meta verisini backend'den çek, ardından satırları yükle */
  private loadModelMeta(): void {
    // Liste yerleşimi kolonlarla birlikte okunur — tablo önce varsayılan kolonlarla çizilip "zıplamasın".
    forkJoin({
      models: this.publishedModel.getModels(),
      layout: this.metadata.listLayout$(this.typeName)
    }).pipe(markDirty(this.cdr)).subscribe({
      next: ({ models: res, layout }) => {
        if (res.success) {
          this.model = (res.data ?? []).find(m => m.typeName === this.typeName);
        }
        this.listLayout = layout;
        this.loadRows();
      },
      error: () => this.loadRows()
    });
  }

  /** Geçerli sayfanın kayıtlarını yükle */
  loadRows(): void {
    this.loadingRows = true;
    this.loadError = null;

    this.publishedModel.getAllPaged(this.typeName, this.pageIndex, this.pageSize).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          this.loadingRows = false;
          const paged: PagedData<Record<string, unknown>> = res.data;
          this.rows  = (paged?.items ?? []) as DataRow[];
          this.total = paged?.total ?? 0;
          this.rowsRetried = false;
        } else if (!this.rowsRetried && res.message?.includes('Assembly') && this.permissionService.isAdmin()) {
          // Backend yeniden başlatıldıysa assembly null olur; bir kez yükleyip tekrar dene.
          // loadAssembly admin'e özel — admin olmayan kullanıcı doğrudan hata mesajını görür.
          this.rowsRetried = true;
          this.publishModel.loadAssembly().pipe(markDirty(this.cdr)).subscribe({
            next: () => {
              // Assembly yeniden yüklendi; model meta'sını da taze çek
              this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
                next: metaRes => {
                  if (metaRes.success)
                    this.model = (metaRes.data ?? []).find(m => m.typeName === this.typeName);
                  this.loadRows();
                },
                error: () => this.loadRows()
              });
            },
            error: () => {
              this.loadingRows = false;
              this.loadError = this.languageService.t('model.data.assemblyNotLoaded');
            }
          });
        } else {
          this.loadingRows = false;
          this.loadError = res.message?.includes('Assembly')
            ? this.languageService.t('model.data.assemblyNotLoaded')
            : res.message;
        }
      },
      error: err => {
        this.loadingRows = false;
        this.loadError = err?.error?.message ?? this.languageService.t('model.data.loadFailed');
      }
    });
  }

  /** Başlıkta gösterilecek model adı — model etiketi (ör. "Teklif"), yoksa tablo adı. */
  get modelTitle(): string {
    return this.model?.label?.trim() || this.typeName;
  }

  /** UI'da gösterilecek etiket — admin Label tanımlamışsa onu, yoksa ham columnName'i döner. */
  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  /**
   * Tablo başlıklarını belirle (ID + görünür schema sütunları).
   * key: veri/lookup anahtarı (ham columnName) — hücre değeri bu anahtarla okunur.
   * label: kullanıcıya gösterilen metin (admin Label tanımlamışsa onu kullanır).
   */
  get tableHeaders(): { key: string; label: string }[] {
    return [
      { key: 'ID', label: 'ID' },
      ...this.displayColumns.map(c => ({ key: c.columnName, label: this.colLabel(c) }))
    ];
  }

  // ─── Sayfalama ─────────────────────────────────────────────────────────────────

  /** Toplam sayfa sayısı */
  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize) || 1;
  }

  /** Footer'da "X–Y / N kayıt" gösterimi için sayfa başlangıcı */
  get pageRangeStart(): number {
    return this.total === 0 ? 0 : (this.pageIndex - 1) * this.pageSize + 1;
  }

  /** Footer'da "X–Y / N kayıt" gösterimi için sayfa sonu */
  get pageRangeEnd(): number {
    return Math.min(this.pageIndex * this.pageSize, this.total);
  }

  /**
   * Sayfa numarası butonları için görünür aralık — en fazla 5 sayfa.
   * Sayfa değiştikçe pencere ortanır (ilk/son sayfa ile ellipsis gösterilir).
   */
  get visiblePages(): number[] {
    return pageWindow(this.pageIndex, this.totalPages);
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages || p === this.pageIndex) return;
    this.pageIndex = p;
    this.clearSelection();     // seçim sayfalar arasında taşınmaz
    this.loadRows();
  }

  prevPage(): void { this.goToPage(this.pageIndex - 1); }
  nextPage(): void { this.goToPage(this.pageIndex + 1); }

  changePageSize(size: number): void {
    this.pageSize  = size;
    this.pageIndex = 1;
    this.clearSelection();
    this.loadRows();
  }

  // ─── Satır seçimi ve toplu silme ───────────────────────────────────────────

  isRowSelected(row: DataRow): boolean {
    return this.selectedIds.has(this.rowId(row));
  }

  toggleRow(row: DataRow): void {
    const id = this.rowId(row);
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
  }

  get selectedCount(): number {
    return this.selectedIds.size;
  }

  get allRowsSelected(): boolean {
    return this.rows.length > 0 && this.rows.every(r => this.selectedIds.has(this.rowId(r)));
  }

  get someRowsSelected(): boolean {
    return this.selectedIds.size > 0 && !this.allRowsSelected;
  }

  toggleAllRows(): void {
    if (this.allRowsSelected) this.selectedIds.clear();
    else this.rows.forEach(r => this.selectedIds.add(this.rowId(r)));
  }

  get bulkDeleteMessage(): string {
    return this.languageService.t('model.data.bulkDeleteMessage', { count: this.selectedCount });
  }

  openBulkDelete(): void {
    if (this.selectedCount === 0) return;
    this.confirmOpen.set(true);
  }

  cancelBulkDelete(): void {
    if (this.bulkBusy()) return;
    this.confirmOpen.set(false);
  }

  /**
   * Seçili kayıtları siler. Sunucuda toplu silme ucu YOKTUR; her kayıt tek tek silinir.
   * Kısmi başarı kabul edilir: silinenler listeden düşer, silinemeyenler SEÇİLİ KALIR ve
   * hataları özetlenir — kullanıcı yalnızca sorunlu satırlarla ilgilenir.
   */
  confirmBulkDelete(): void {
    const ids = [...this.selectedIds];
    if (ids.length === 0) { this.confirmOpen.set(false); return; }

    this.bulkBusy.set(true);
    this.bulkErrors = [];
    this.bulkTotal = ids.length;

    forkJoin(
      ids.map(id =>
        this.publishedModel.delete(this.typeName, id).pipe(
          map(res => ({ id, ok: res.success, message: res.message })),
          catchError(err => of({
            id,
            ok: false,
            message: (err?.error?.message ?? this.languageService.t('model.data.loadFailed')) as string
          }))
        )
      )
    ).pipe(markDirty(this.cdr)).subscribe(results => {
      this.bulkBusy.set(false);
      this.confirmOpen.set(false);

      const failed = results.filter(r => !r.ok);
      this.selectedIds = new Set(failed.map(r => r.id));
      this.bulkErrors = failed.map(r => `ID:${r.id} — ${r.message}`);

      // Son sayfadaki tüm kayıtlar silindiyse bir önceki sayfaya çekil.
      if (failed.length < ids.length && this.pageIndex > 1 && ids.length >= this.rows.length) {
        this.pageIndex = Math.max(1, this.pageIndex - 1);
      }
      this.loadRows();
    });
  }

  // ─── Util delegasyonları — template'te doğrudan çağrılabilmesi için ────────────

  isImage       = isImage;
  imageSrc      = imageSrc;
  isBase64Value = isBase64Value;
  cellValue     = cellValue;
  rowVal        = rowVal;

  downloadFile(b64: string, colName: string): void {
    // Dosya adı bu ekranda bilinmiyor; util uzantıyı MIME'den tahmin eder
    downloadFile(b64, colName, {});
  }

  rowId(row: DataRow): number {
    return Number(row['ID'] ?? row['id'] ?? 0);
  }

  /**
   * H: Kaydın açık iş akışındaki durumu.
   *
   * WorkflowStatus DbBaseObject'ten gelen bir SİSTEM kolonudur; kullanıcı
   * kolonları arasında (tableHeaders) yer almaz ama satır verisinde taşınır.
   * Sunucu camelCase döndüğü için iki yazım da denenir.
   */
  workflowStatusOf(row: DataRow): string {
    const value = row['workflowStatus'] ?? row['WorkflowStatus'];
    return typeof value === 'string' ? value.trim() : '';
  }

  /**
   * Süreç kolonu yalnızca en az bir satırda durum varsa çizilir.
   *
   * Akış kullanmayan modellerde kolonu her zaman göstermek, sürekli boş bir
   * sütun bırakırdı; kolon listesi zaten admin tarafından yönetiliyor ve
   * gereksiz genişlik pahalı.
   */
  get hasWorkflowStatus(): boolean {
    return this.rows.some(row => this.workflowStatusOf(row) !== '');
  }

  /** Sürüm geçmişini backend'den yükler */
  loadVersions(): void {
    this.publishedTableService.getVersions(this.typeName).pipe(markDirty(this.cdr)).subscribe({
      next: r => {
        if (r.success) {
          this.versions.set(r.data ?? []);
        }
      },
      error: () => { /* sessizce geç */ }
    });
  }

  /** Sürüm panelini aç/kapat; açılırken veriyi yükle */
  toggleVersionPanel(): void {
    this.showVersionPanel.update(v => !v);
    if (this.showVersionPanel()) {
      this.loadVersions();
    }
  }

  /** Onay bekleyen sürüm; null ise diyalog kapalıdır. */
  pendingRollbackVersion: number | null = null;
  isRollingBack = false;

  askRollback(version: number): void {
    this.pendingRollbackVersion = version;
  }

  cancelRollback(): void {
    this.pendingRollbackVersion = null;
  }

  /** Onay alındıktan sonra rollback isteği gönderir; başarıda veri + sürümleri yeniler */
  confirmRollback(): void {
    const version = this.pendingRollbackVersion;
    if (version === null) return;

    this.pendingRollbackVersion = null;
    this.isRollingBack = true;

    this.publishedTableService.rollback(this.typeName, version).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.isRollingBack = false;
        if (res.success) {
          this.loadRows();
          this.loadVersions();
        }
      },
      error: () => { this.isRollingBack = false; }
    });
  }
}
