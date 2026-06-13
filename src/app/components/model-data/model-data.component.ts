import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ModelRegistryService, RegisteredModel, RegisteredColumn } from '../../services/model-registry.service';
import { PublishedModelService } from '../../services/published-model.service';
import { PublishModelService } from '../../services/publish-model.service';

type DataRow = Record<string, unknown>;

/** Veri tipine göre HTML input tipi */
function inputTypeFor(dataType: string): string {
  switch (dataType) {
    case 'int':
    case 'float':
    case 'decimal': return 'number';
    case 'datetime': return 'date';
    case 'boolean': return 'checkbox';
    default: return 'text';
  }
}

@Component({
  selector: 'app-model-data',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './model-data.component.html',
  styleUrls: ['./model-data.component.scss']
})
export class ModelDataComponent implements OnInit {
  typeName = '';
  model: RegisteredModel | undefined;

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

  // Assembly yüklenmemiş hatası için tek-seferlik retry bayrağı
  private rowsRetried = false;
  private formRetried = false;

  constructor(
    private route: ActivatedRoute,
    private registry: ModelRegistryService,
    private publishedModel: PublishedModelService,
    private publishModel: PublishModelService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.typeName = this.route.snapshot.paramMap.get('typeName') ?? '';
    this.model = this.registry.get(this.typeName);
    this.loadRows();
  }

  get columns(): RegisteredColumn[] {
    return this.model?.columns ?? [];
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
            next: () => this.loadRows(),
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

  /** Satırdan hücre değeri */
  cellValue(row: DataRow, key: string): string {
    const v = row[key] ?? row[key.toLowerCase()] ?? row[key.toUpperCase()];
    if (v === null || v === undefined) return '—';
    if (typeof v === 'boolean') return v ? '✓' : '✗';
    return String(v);
  }

  /** Ekle formunu aç */
  openAddForm(): void {
    this.editingRow = null;
    this.buildForm(null);
    this.showForm = true;
    this.formMessage = null;
    this.formSuccess = null;
  }

  /** Düzenle formunu aç */
  openEditForm(row: DataRow): void {
    this.editingRow = row;
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

  inputTypeFor(dataType: string): string {
    return inputTypeFor(dataType);
  }

  getControl(colName: string) {
    return this.recordForm.get(colName)!;
  }
}
