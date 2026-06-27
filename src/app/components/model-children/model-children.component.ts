import {
  Component,
  Input,
  OnInit,
  forwardRef
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import {
  PublishedModelService,
  PublishedModel,
  PublishedColumn
} from '../../services/published-model.service';
import {
  inputTypeFor,
  mimeFromBase64,
  isImage,
  imageSrc,
  isBase64Value,
  cellValue,
  rowVal,
  fieldValue,
  downloadFile
} from '../model-data/model-data.util';

type DataRow = Record<string, unknown>;

/** Tek bir child model için durum */
interface ChildModelState {
  typeName: string;
  columns: PublishedColumn[];
  /** FK kolonu adı: parentTypeName + 'Id' */
  fkColumn: string;
  rows: DataRow[];
  loading: boolean;
  error: string | null;
  /** Formun görünürlüğü */
  showForm: boolean;
  editingRow: DataRow | null;
  recordForm: FormGroup | null;
  formLoading: boolean;
  formMessage: string | null;
  formSuccess: boolean | null;
  fileNames: Record<string, string>;
  /** Genişletilmiş satır ID'leri (alt-alt modeller için) */
  expandedRows: Set<number>;
}

/** Maksimum özyineleme derinliği (Feature 1 ile simetrik) */
const MAX_CHILD_DEPTH = 4;

@Component({
  selector: 'app-model-children',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DatePipe,
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    forwardRef(() => ModelChildrenComponent)
  ],
  templateUrl: './model-children.component.html',
  styleUrls: ['./model-children.component.scss']
})
export class ModelChildrenComponent implements OnInit {
  /** Parent model adı (örn. 'Order') */
  @Input({ required: true }) parentTypeName!: string;
  /** Parent kaydın ID değeri */
  @Input({ required: true }) parentId!: number;
  /** Görsel girinti + özyineleme sınırı için derinlik (1'den başlar) */
  @Input() depth = 1;

  readonly MAX_CHILD_DEPTH = MAX_CHILD_DEPTH;

  /** Her alt model için durum nesnesi */
  childStates: ChildModelState[] = [];

  /** Yükleniyor mu? */
  loading = false;
  /** Üst düzey yükleme hatası */
  loadError: string | null = null;

  constructor(
    private publishedModel: PublishedModelService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.loadChildren();
  }

  // ─── Util delegasyonları — template'te doğrudan erişim için ─────────────────

  inputTypeFor = inputTypeFor;
  mimeFromBase64 = mimeFromBase64;
  isImage = isImage;
  imageSrc = imageSrc;
  isBase64Value = isBase64Value;
  cellValue = cellValue;
  rowVal = rowVal;

  downloadFile(b64: string, colName: string, state: ChildModelState): void {
    downloadFile(b64, colName, state.fileNames);
  }

  // ─── Alt model listesini yükle ───────────────────────────────────────────────

  private loadChildren(): void {
    this.loading = true;
    this.loadError = null;

    // 1) Alt model adlarını al
    this.publishedModel.getChildModels(this.parentTypeName).subscribe({
      next: childRes => {
        if (!childRes.success || !childRes.data?.length) {
          this.loading = false;
          return;
        }

        const childTypeNames = childRes.data;

        // 2) Tüm model kolonlarını al (tek istek, tüm child'lar için)
        this.publishedModel.getModels().subscribe({
          next: modelsRes => {
            this.loading = false;
            if (!modelsRes.success) {
              this.loadError = modelsRes.message ?? 'Model meta verisi alınamadı.';
              return;
            }

            const allModels = modelsRes.data ?? [];

            // Her child için durum oluştur
            this.childStates = childTypeNames.map(childType => {
              const meta = allModels.find(m => m.typeName === childType);
              const fkColumn = this.parentTypeName + 'Id';
              // Görüntülenen sütunlar: FK kolonu hariç (formda gizlenir, gridde de gizlenebilir)
              const allCols = meta?.columns ?? [];

              const state: ChildModelState = {
                typeName: childType,
                columns: allCols,
                fkColumn,
                rows: [],
                loading: false,
                error: null,
                showForm: false,
                editingRow: null,
                recordForm: null,
                formLoading: false,
                formMessage: null,
                formSuccess: null,
                fileNames: {},
                expandedRows: new Set<number>()
              };

              // 3) Bu child'ın FK-filtreli kayıtlarını yükle
              this.loadChildRows(state);
              return state;
            });
          },
          error: err => {
            this.loading = false;
            const e = err as { error?: { message?: string }; message?: string };
            this.loadError = e?.error?.message ?? e?.message ?? 'Model meta verisi alınamadı.';
          }
        });
      },
      error: err => {
        this.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        this.loadError = e?.error?.message ?? e?.message ?? 'Alt modeller yüklenemedi.';
      }
    });
  }

  loadChildRows(state: ChildModelState): void {
    state.loading = true;
    state.error = null;

    this.publishedModel.getAll(state.typeName, state.fkColumn, this.parentId).subscribe({
      next: res => {
        state.loading = false;
        if (res.success) {
          state.rows = (res.data ?? []) as DataRow[];
        } else {
          state.error = res.message ?? 'Kayıtlar alınamadı.';
        }
      },
      error: err => {
        state.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        state.error = e?.error?.message ?? e?.message ?? 'Kayıtlar yüklenemedi.';
      }
    });
  }

  // ─── Görüntülenecek sütunlar (FK kolonu grid'de görünmez) ───────────────────

  visibleColumns(state: ChildModelState): PublishedColumn[] {
    return state.columns.filter(c => c.columnName !== state.fkColumn);
  }

  tableHeaders(state: ChildModelState): string[] {
    return ['ID', ...this.visibleColumns(state).map(c => c.columnName)];
  }

  // ─── Alt satır genişletme (torun modeller) ───────────────────────────────────

  toggleExpand(state: ChildModelState, rowId: number): void {
    if (state.expandedRows.has(rowId)) {
      state.expandedRows.delete(rowId);
    } else {
      state.expandedRows.add(rowId);
    }
  }

  rowId(row: DataRow): number {
    return Number(fieldValue(row, 'ID') ?? 0);
  }

  // ─── Form yönetimi ───────────────────────────────────────────────────────────

  openAddForm(state: ChildModelState): void {
    state.editingRow = null;
    state.fileNames = {};
    state.recordForm = this.buildForm(state, null);
    state.showForm = true;
    state.formMessage = null;
    state.formSuccess = null;
  }

  openEditForm(state: ChildModelState, row: DataRow): void {
    state.editingRow = row;
    state.fileNames = {};
    state.recordForm = this.buildForm(state, row);
    state.showForm = true;
    state.formMessage = null;
    state.formSuccess = null;
  }

  closeForm(state: ChildModelState): void {
    state.showForm = false;
    state.editingRow = null;
    state.recordForm = null;
  }

  private buildForm(state: ChildModelState, row: DataRow | null): FormGroup {
    const controls: Record<string, unknown> = {};
    for (const col of this.visibleColumns(state)) {
      const existing = row ? (fieldValue(row, col.columnName) ?? '') : '';
      const validators = col.isNullable ? [] : [Validators.required];
      controls[col.columnName] = [existing, validators];
    }
    return this.fb.group(controls);
  }

  onFormSubmit(state: ChildModelState): void {
    if (!state.recordForm || state.recordForm.invalid || state.formLoading) {
      state.recordForm?.markAllAsTouched();
      return;
    }
    state.formLoading = true;
    state.formMessage = null;
    state.formSuccess = null;

    const jsonData: DataRow = { ...state.recordForm.value };

    if (state.editingRow) {
      // Güncelleme: ID + FK ekle
      jsonData['ID'] = fieldValue(state.editingRow, 'ID');
      jsonData[state.fkColumn] = this.parentId;

      this.publishedModel.update(state.typeName, jsonData).subscribe({
        next: res => this.handleFormResponse(state, res),
        error: err => this.handleFormError(state, err)
      });
    } else {
      // Ekleme: FK otomatik set edilir
      jsonData[state.fkColumn] = this.parentId;

      this.publishedModel.add(state.typeName, jsonData).subscribe({
        next: res => this.handleFormResponse(state, res),
        error: err => this.handleFormError(state, err)
      });
    }
  }

  private handleFormResponse(state: ChildModelState, res: { success: boolean; message: string }): void {
    state.formLoading = false;
    state.formSuccess = res.success;
    state.formMessage = res.message;
    if (res.success) {
      this.loadChildRows(state);
      setTimeout(() => this.closeForm(state), 1200);
    }
  }

  private handleFormError(state: ChildModelState, err: unknown): void {
    state.formLoading = false;
    state.formSuccess = false;
    const e = err as { error?: { message?: string }; message?: string };
    state.formMessage = e?.error?.message ?? e?.message ?? 'İşlem başarısız.';
  }

  /** Kayıt sil */
  deleteRow(state: ChildModelState, row: DataRow): void {
    const id = this.rowId(row);
    if (!id || !confirm(`ID:${id} kaydını silmek istediğinize emin misiniz?`)) return;

    this.publishedModel.delete(state.typeName, id).subscribe({
      next: res => {
        if (res.success) {
          this.loadChildRows(state);
        }
      },
      error: () => { /* sessizce geç */ }
    });
  }

  /** Dosya seçimi → base64'e çevir → form control'e yaz */
  onFileSelected(event: Event, colName: string, state: ChildModelState): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    state.fileNames[colName] = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1] ?? dataUrl;
      state.recordForm?.get(colName)?.setValue(base64);
    };
    reader.readAsDataURL(file);
  }

  getControl(state: ChildModelState, colName: string) {
    return state.recordForm!.get(colName)!;
  }
}
