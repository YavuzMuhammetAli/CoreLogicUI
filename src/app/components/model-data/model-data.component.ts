import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublishedModelService, PublishedModel, PublishedColumn, PagedData } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { PublishedTableService, ModelVersion } from '../../services/published-table.service';
import { ModelColumnSettingService, ModelColumnSettingDto } from '../../services/model-column-setting.service';
import { ColumnVisibilityComponent, ColumnVisibilityItem } from '../shared/column-visibility/column-visibility.component';
import {
  isImage,
  imageSrc,
  isBase64Value,
  cellValue,
  rowVal,
  downloadFile
} from './model-data.util';

type DataRow = Record<string, unknown>;

@Component({
  selector: 'app-model-data',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ColumnVisibilityComponent],
  templateUrl: './model-data.component.html',
  styleUrls: ['./model-data.component.scss']
})
export class ModelDataComponent implements OnInit {
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

  // Silme durumu
  deletingId: number | null = null;

  // Sürüm paneli durumu
  versions = signal<ModelVersion[]>([]);
  showVersionPanel = signal(false);

  // Assembly yüklenmemiş hatası için tek-seferlik retry bayrağı
  private rowsRetried = false;

  // Admin tarafından yönetilen kolon görünürlüğü — null = ayar yok, tüm kolonlar görünür
  visibleColumnNames: string[] | null = null;
  savingColumnVisibility = false;

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
    this.route.paramMap.subscribe(params => {
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
    this.deletingId = null;
    this.rowsRetried = false;
    this.showVersionPanel.set(false);
    this.versions.set([]);
    this.pageIndex = 1;
    this.total     = 0;
    this.visibleColumnNames = null;
  }

  get columns(): PublishedColumn[] {
    return this.model?.columns ?? [];
  }

  /** Görünür kolonlar — ayar yoksa şema kolonlarının tümü */
  get displayColumns(): PublishedColumn[] {
    if (!this.visibleColumnNames) return this.columns;
    const visible = new Set(this.visibleColumnNames);
    return this.columns.filter(c => visible.has(c.columnName));
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
    this.modelColumnSetting.get(typeName, 'list').subscribe({
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
    this.modelColumnSetting.set(dto).subscribe({
      next: res => {
        this.savingColumnVisibility = false;
        if (res.success) this.visibleColumnNames = names;
      },
      error: () => { this.savingColumnVisibility = false; }
    });
  }

  /** Model meta verisini backend'den çek, ardından satırları yükle */
  private loadModelMeta(): void {
    this.publishedModel.getModels().subscribe({
      next: res => {
        if (res.success) {
          this.model = (res.data ?? []).find(m => m.typeName === this.typeName);
        }
        this.loadRows();
      },
      error: () => this.loadRows()
    });
  }

  /** Geçerli sayfanın kayıtlarını yükle */
  loadRows(): void {
    this.loadingRows = true;
    this.loadError = null;

    this.publishedModel.getAllPaged(this.typeName, this.pageIndex, this.pageSize).subscribe({
      next: res => {
        if (res.success) {
          this.loadingRows = false;
          const paged: PagedData<Record<string, unknown>> = res.data;
          this.rows  = (paged?.items ?? []) as DataRow[];
          this.total = paged?.total ?? 0;
          this.rowsRetried = false;
        } else if (!this.rowsRetried && res.message?.includes('Assembly')) {
          // Backend yeniden başlatıldıysa assembly null olur; bir kez yükleyip tekrar dene.
          this.rowsRetried = true;
          this.publishModel.loadAssembly().subscribe({
            next: () => {
              // Assembly yeniden yüklendi; model meta'sını da taze çek
              this.publishedModel.getModels().subscribe({
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
              this.loadError = 'Model backend\'de yüklü değil. "Tablo Oluştur"dan yeniden yayınlayın.';
            }
          });
        } else {
          this.loadingRows = false;
          this.loadError = res.message?.includes('Assembly')
            ? 'Model backend\'de yüklü değil. "Tablo Oluştur"dan yeniden yayınlayın.'
            : res.message;
        }
      },
      error: err => {
        this.loadingRows = false;
        this.loadError = err?.error?.message ?? 'Veriler yüklenemedi.';
      }
    });
  }

  /** Tablo başlıklarını belirle (ID + görünür schema sütunları) */
  get tableHeaders(): string[] {
    return ['ID', ...this.displayColumns.map(c => c.columnName)];
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
    const pages = this.totalPages;
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

    const half = 2;
    let start = Math.max(1, this.pageIndex - half);
    let end   = Math.min(pages, this.pageIndex + half);

    if (this.pageIndex - half < 1) end   = Math.min(pages, 5);
    if (this.pageIndex + half > pages) start = Math.max(1, pages - 4);

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages || p === this.pageIndex) return;
    this.pageIndex = p;
    this.loadRows();
  }

  prevPage(): void { this.goToPage(this.pageIndex - 1); }
  nextPage(): void { this.goToPage(this.pageIndex + 1); }

  changePageSize(size: number): void {
    this.pageSize  = size;
    this.pageIndex = 1;
    this.loadRows();
  }

  /** Kayıt sil */
  deleteRow(row: DataRow): void {
    const id = Number(row['ID'] ?? row['id']);
    if (!id || !confirm(`ID:${id} kaydını silmek istediğinize emin misiniz?`)) return;

    this.deletingId = id;
    this.publishedModel.delete(this.typeName, id).subscribe({
      next: res => {
        this.deletingId = null;
        if (res.success) {
          // Sayfada tek kayıt kaldıysa ve sayfa > 1 ise önceki sayfaya dön
          if (this.rows.length === 1 && this.pageIndex > 1) {
            this.pageIndex--;
          }
          this.loadRows();
        }
      },
      error: () => {
        this.deletingId = null;
      }
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

  /** Sürüm geçmişini backend'den yükler */
  loadVersions(): void {
    this.publishedTableService.getVersions(this.typeName).subscribe({
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

  /** Onay alındıktan sonra rollback isteği gönderir; başarıda veri + sürümleri yeniler */
  doRollback(version: number): void {
    if (!confirm(`v${version} versiyonuna geri almak istediğinize emin misiniz?`)) return;

    this.publishedTableService.rollback(this.typeName, version).subscribe({
      next: res => {
        if (res.success) {
          this.loadRows();
          this.loadVersions();
        }
      },
      error: () => { /* sessizce geç */ }
    });
  }
}
