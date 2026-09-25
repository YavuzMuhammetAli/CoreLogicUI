import { ChangeDetectionStrategy, ChangeDetectorRef, Component, forwardRef, Input, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  ValidatorFn,
  Validators
} from '@angular/forms';
import {
  PublishedModelService,
  PublishedModel,
  PublishedColumn
} from '../../services/published-model.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import {
  inputTypeFor,
  mimeFromBase64,
  isImage,
  imageSrc,
  isBase64Value,
  cellValue,
  rowVal,
  fieldValue,
  downloadFile,
  parseEnumValues,
  toInputValue,
  stepFor
} from '../model-data/model-data.util';
import { markDirty } from '../../utils/change-detection';
import { fileSizeError, isFileType, maxFileSizeValidator } from '../../utils/file-size';
import { LookupPickerComponent } from '../shared/lookup-picker/lookup-picker.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { LookupLabelService } from '../../services/lookup-label.service';

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
  /** Boyut sınırı nedeniyle reddedilen dosyaların hata metni (kolon → mesaj). */
  fileErrors: Record<string, string>;
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
    TranslatePipe,
    LookupPickerComponent,
    ConfirmDialogComponent,
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    forwardRef(() => ModelChildrenComponent)
  ],
  templateUrl: './model-children.component.html',
  styleUrls: ['./model-children.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelChildrenComponent implements OnInit {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly languageService = inject(LanguageService);
  /** Tablo hücrelerindeki lookup FK id'lerini toplu şekilde etikete çevirir. */
  private readonly lookupLabels = inject(LookupLabelService);

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
  stepFor = stepFor;
  mimeFromBase64 = mimeFromBase64;
  isImage = isImage;
  imageSrc = imageSrc;
  isBase64Value = isBase64Value;
  cellValue = cellValue;
  rowVal = rowVal;
  parseEnumValues = parseEnumValues;

  downloadFile(b64: string, colName: string, state: ChildModelState): void {
    downloadFile(b64, colName, state.fileNames);
  }

  // ─── Lookup etiketleri (tablo hücreleri için) ───────────────────────────────
  //
  // Dropdown artık app-lookup-picker ile tembel yükleniyor; hedef tablonun tam listesi
  // tutulmuyor. Hücre etiketleri için görünen satırlardaki benzersiz FK id'leri
  // kolon başına TEK istekle çözülür (bkz. LookupLabelService).

  private resolveLookupLabels(columns: PublishedColumn[], rows: DataRow[]): void {
    if (rows.length === 0) return;

    for (const col of columns) {
      if (col.dataType !== 'lookup' || !col.lookupTargetTable) continue;

      const ids = rows
        .map(r => Number(fieldValue(r, col.columnName)))
        .filter(n => Number.isFinite(n) && n > 0);

      if (ids.length === 0) continue;

      this.lookupLabels
        .ensure(col.lookupTargetTable, col.lookupDisplayColumn, ids)
        .pipe(markDirty(this.cdr))
        .subscribe();
    }
  }

  /** Tablo hücresi için görüntülenecek değer — lookup kolonları FK ID yerine etiketi gösterir. */
  cellDisplay(state: ChildModelState, row: DataRow, columnName: string): string {
    const col = state.columns.find(c => c.columnName === columnName);
    if (col?.dataType === 'lookup') {
      const value = fieldValue(row, columnName);
      if (value == null || value === '') return '—';
      if (!col.lookupTargetTable) return String(value);
      return this.lookupLabels.label(col.lookupTargetTable, col.lookupDisplayColumn, Number(value))
             ?? String(value);
    }
    return this.cellValue(row, columnName);
  }

  // ─── Alt model listesini yükle ───────────────────────────────────────────────

  private loadChildren(): void {
    this.loading = true;
    this.loadError = null;

    // 1) Alt model adlarını al
    this.publishedModel.getChildModels(this.parentTypeName).pipe(markDirty(this.cdr)).subscribe({
      next: childRes => {
        if (!childRes.success || !childRes.data?.length) {
          this.loading = false;
          return;
        }

        const childTypeNames = childRes.data;

        // 2) Tüm model kolonlarını al (tek istek, tüm child'lar için)
        this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
          next: modelsRes => {
            this.loading = false;
            if (!modelsRes.success) {
              this.loadError = modelsRes.message ?? this.languageService.t('model.children.metaLoadFailed');
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
                fileErrors: {},
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
            this.loadError = e?.error?.message ?? e?.message ?? this.languageService.t('model.children.metaLoadFailed');
          }
        });
      },
      error: err => {
        this.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        this.loadError = e?.error?.message ?? e?.message ?? this.languageService.t('model.children.childrenLoadFailed');
      }
    });
  }

  loadChildRows(state: ChildModelState): void {
    state.loading = true;
    state.error = null;

    this.publishedModel.getAll(state.typeName, state.fkColumn, this.parentId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        state.loading = false;
        if (res.success) {
          state.rows = (res.data ?? []) as DataRow[];
          // Bu sayfadaki lookup FK etiketlerini kolon basina tek istekte coz.
          this.resolveLookupLabels(state.columns, state.rows);
        } else {
          state.error = res.message ?? this.languageService.t('model.children.recordsFetchFailed');
        }
      },
      error: err => {
        state.loading = false;
        const e = err as { error?: { message?: string }; message?: string };
        state.error = e?.error?.message ?? e?.message ?? this.languageService.t('model.children.recordsLoadFailed');
      }
    });
  }

  // ─── Görüntülenecek sütunlar (FK kolonu grid'de görünmez) ───────────────────

  visibleColumns(state: ChildModelState): PublishedColumn[] {
    return state.columns.filter(c => c.columnName !== state.fkColumn);
  }

  /** UI'da gösterilecek etiket — admin Label tanımlamışsa onu, yoksa ham columnName'i döner. */
  colLabel(col: PublishedColumn): string {
    return col.label?.trim() || col.columnName;
  }

  /** key: veri anahtarı (ham columnName), label: kullanıcıya gösterilen metin. */
  tableHeaders(state: ChildModelState): { key: string; label: string }[] {
    return [
      { key: 'ID', label: 'ID' },
      ...this.visibleColumns(state).map(c => ({ key: c.columnName, label: this.colLabel(c) }))
    ];
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
    state.fileErrors = {};
    state.recordForm = this.buildForm(state, null);
    state.showForm = true;
    state.formMessage = null;
    state.formSuccess = null;
  }

  openEditForm(state: ChildModelState, row: DataRow): void {
    state.editingRow = row;
    state.fileNames = {};
    state.fileErrors = {};
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
      // Ham ISO tarih değeri doğrudan bağlanırsa datetime-local kutusu onu sessizce
      // atar ve alan BOŞ açılır; kullanıcı dokununca tarayıcı o anki zamanı yazar.
      const existing = row ? (toInputValue(col.dataType, fieldValue(row, col.columnName)) ?? '') : '';
      const validators: ValidatorFn[] = col.isNullable ? [] : [Validators.required];
      // image/file: boyut sınırı (maxLength KB, yoksa platform tavanı)
      if (isFileType(col.dataType)) validators.push(maxFileSizeValidator(col.dataType, col.maxLength));
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

      this.publishedModel.update(state.typeName, jsonData).pipe(markDirty(this.cdr)).subscribe({
        next: res => this.handleFormResponse(state, res),
        error: err => this.handleFormError(state, err)
      });
    } else {
      // Ekleme: FK otomatik set edilir
      jsonData[state.fkColumn] = this.parentId;

      this.publishedModel.add(state.typeName, jsonData).pipe(markDirty(this.cdr)).subscribe({
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
      // OnPush: zamanlayici callback'i CD tetiklemez, elle kirli isaretlenir.
      setTimeout(() => { this.closeForm(state); this.cdr.markForCheck(); }, 1200);
    }
  }

  private handleFormError(state: ChildModelState, err: unknown): void {
    state.formLoading = false;
    state.formSuccess = false;
    const e = err as { error?: { message?: string }; message?: string };
    state.formMessage = e?.error?.message ?? e?.message ?? this.languageService.t('model.children.operationFailed');
  }

  /** Kayıt sil */
  deleteRow(state: ChildModelState, row: DataRow): void {
    const id = this.rowId(row);
    if (!id || !confirm(this.languageService.t('model.children.deleteConfirm', { id }))) return;

    this.publishedModel.delete(state.typeName, id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          this.loadChildRows(state);
        }
      },
      error: () => { /* sessizce geç */ }
    });
  }

  /** Dosya seçimi → base64'e çevir → form control'e yaz */
  onFileSelected(event: Event, col: PublishedColumn, state: ChildModelState): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const colName = col.columnName;

    // Boyut, dosya OKUNMADAN kontrol edilir; aşıyorsa önceki değer korunur.
    const sizeError = fileSizeError(file, col.dataType, col.maxLength, this.languageService.lang());
    if (sizeError) {
      state.fileErrors[colName] = this.languageService.t(sizeError.key, { label: this.colLabel(col), ...sizeError.params });
      input.value = '';
      return;
    }
    delete state.fileErrors[colName];

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
