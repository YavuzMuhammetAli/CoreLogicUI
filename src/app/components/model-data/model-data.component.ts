import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PublishedModelService, PublishedModel, PublishedColumn } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { PublishedTableService, ModelVersion } from '../../services/published-table.service';
import {
  inputTypeFor,
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
  imports: [CommonModule, ReactiveFormsModule, RouterLink, DatePipe],
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

  // Form durumu
  showForm = false;
  editingRow: DataRow | null = null;
  recordForm!: FormGroup;
  formLoading = false;
  formMessage: string | null = null;
  formSuccess: boolean | null = null;

  // Silme durumu
  deletingId: number | null = null;

  // Sürüm paneli durumu
  versions = signal<ModelVersion[]>([]);
  showVersionPanel = signal(false);

  // Assembly yüklenmemiş hatası için tek-seferlik retry bayrağı
  private rowsRetried = false;
  private formRetried = false;

  // Mevcut form oturumunda seçilen dosyaların adları (colName → filename)
  private fileNames: Record<string, string> = {};

  constructor(
    private route: ActivatedRoute,
    private publishedModel: PublishedModelService,
    private publishModel: PublishModelService,
    private fb: FormBuilder,
    public permissionService: PermissionService,
    public publishedTableService: PublishedTableService
  ) {}

  ngOnInit(): void {
    // snapshot yerine paramMap observable'ına abone ol;
    // aynı component örneği farklı modeller için yeniden kullanıldığında
    // (Angular route-reuse) her parametre değişiminde tetiklenir.
    this.route.paramMap.subscribe(params => {
      this.typeName = params.get('typeName') ?? '';
      this.resetState();
      this.loadModelMeta();
    });
  }

  /** Yeni modele geçerken önceki modelin durumunu temizle */
  private resetState(): void {
    this.model = undefined;
    this.rows = [];
    this.loadError = null;
    this.showForm = false;
    this.editingRow = null;
    this.formMessage = null;
    this.formSuccess = null;
    this.deletingId = null;
    this.rowsRetried = false;
    this.formRetried = false;
    this.showVersionPanel.set(false);
    this.versions.set([]);
  }

  get columns(): PublishedColumn[] {
    return this.model?.columns ?? [];
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

  /** Tüm kayıtları yükle */
  loadRows(): void {
    this.loadingRows = true;
    this.loadError = null;

    this.publishedModel.getAll(this.typeName).subscribe({
      next: res => {
        if (res.success) {
          this.loadingRows = false;
          this.rows = (res.data ?? []) as DataRow[];
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

  /** Tablo başlıklarını belirle (ID + schema sütunları) */
  get tableHeaders(): string[] {
    return ['ID', ...this.columns.map(c => c.columnName)];
  }

  /** Ekle formunu aç */
  openAddForm(): void {
    this.editingRow = null;
    this.fileNames = {};
    this.buildForm(null);
    this.showForm = true;
    this.formMessage = null;
    this.formSuccess = null;
  }

  /** Düzenle formunu aç */
  openEditForm(row: DataRow): void {
    this.editingRow = row;
    this.fileNames = {};
    this.buildForm(row);
    this.showForm = true;
    this.formMessage = null;
    this.formSuccess = null;
  }

  closeForm(): void {
    this.showForm = false;
    this.editingRow = null;
  }

  /** Schema sütunlarından reactive form üret */
  private buildForm(row: DataRow | null): void {
    const controls: Record<string, unknown> = {};
    for (const col of this.columns) {
      const existing = row ? (row[col.columnName] ?? row[col.columnName.toLowerCase()] ?? '') : '';
      const validators = col.isNullable ? [] : [Validators.required];
      controls[col.columnName] = [existing, validators];
    }
    this.recordForm = this.fb.group(controls);
  }

  onFormSubmit(): void {
    if (this.recordForm.invalid || this.formLoading) {
      this.recordForm.markAllAsTouched();
      return;
    }
    this.formLoading = true;
    this.formMessage = null;
    this.formSuccess = null;

    const jsonData: DataRow = { ...this.recordForm.value };

    if (this.editingRow) {
      // Güncelleme: ID'yi ekle
      jsonData['ID'] = this.editingRow['ID'] ?? this.editingRow['id'];
      this.publishedModel.update(this.typeName, jsonData).subscribe({
        next: res => this.handleFormResponse(res, () => this.onFormSubmit()),
        error: err => this.handleFormError(err)
      });
    } else {
      this.publishedModel.add(this.typeName, jsonData).subscribe({
        next: res => this.handleFormResponse(res, () => this.onFormSubmit()),
        error: err => this.handleFormError(err)
      });
    }
  }

  private handleFormResponse(res: { success: boolean; message: string }, retryFn?: () => void): void {
    if (!res.success && !this.formRetried && res.message?.includes('Assembly') && retryFn) {
      // Assembly null ise bir kez yükleyip formu tekrar gönder
      this.formRetried = true;
      this.publishModel.loadAssembly().subscribe({
        next: () => retryFn(),
        error: () => {
          this.formLoading = false;
          this.formSuccess = false;
          this.formMessage = 'Model backend\'de yüklü değil. "Tablo Oluştur"dan yeniden yayınlayın.';
        }
      });
      return;
    }
    this.formLoading = false;
    this.formSuccess = res.success;
    this.formMessage = res.message?.includes('Assembly')
      ? 'Model backend\'de yüklü değil. "Tablo Oluştur"dan yeniden yayınlayın.'
      : res.message;
    if (res.success) {
      this.formRetried = false;
      this.loadRows();
      setTimeout(() => this.closeForm(), 1200);
    }
  }

  private handleFormError(err: unknown): void {
    this.formLoading = false;
    this.formSuccess = false;
    const e = err as { error?: { message?: string }; message?: string };
    this.formMessage = e?.error?.message ?? e?.message ?? 'İşlem başarısız.';
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
          this.loadRows();
        }
      },
      error: () => {
        this.deletingId = null;
      }
    });
  }

  // ─── Util delegasyonları — template'te doğrudan çağrılabilmesi için ────────────

  inputTypeFor  = inputTypeFor;
  isImage       = isImage;
  imageSrc      = imageSrc;
  isBase64Value = isBase64Value;
  cellValue     = cellValue;
  rowVal        = rowVal;

  downloadFile(b64: string, colName: string): void {
    downloadFile(b64, colName, this.fileNames);
  }

  rowId(row: DataRow): number {
    return Number(row['ID'] ?? row['id'] ?? 0);
  }

  /**
   * Seçilen dosyayı saf base64 olarak form control'üne yazar.
   * Dosya adı fileNames map'inde saklanır — backend pipe karakterini kabul etmez.
   */
  onFileSelected(event: Event, colName: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.fileNames[colName] = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // data-URL önekini at — backend saf base64 (byte[]) bekler
      const base64 = dataUrl.split(',')[1] ?? dataUrl;
      this.recordForm.get(colName)?.setValue(base64);
    };
    reader.readAsDataURL(file);
  }

  getControl(colName: string) {
    return this.recordForm.get(colName)!;
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
