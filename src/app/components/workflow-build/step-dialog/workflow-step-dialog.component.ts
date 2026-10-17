import {
  ChangeDetectionStrategy, Component, HostListener, OnInit, computed, inject, input, output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  ASSIGNMENT_MODE_OPTIONS,
  JOIN_MODE_OPTIONS,
  TIMEOUT_POLICY_OPTIONS,
  WorkflowStep
} from '../../../models/workflow.model';
import { Role } from '../../../models/role';
import { AppUser } from '../../../models/appUser';
import { PublishedColumn } from '../../../services/published-model.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { newBranchGroup, newFieldGroup, newRecordFieldGroup, newStepGroup } from '../workflow-step.form';
import { stepFromFormValue } from '../designer/workflow-step.mapper';
import { sameKey } from '../../../utils/workflow/workflow-exits';

/** Form alanı tipi seçenekleri — model kolon tipleriyle aynı sözlükten dar bir alt küme. */
const FORM_FIELD_TYPES = ['string', 'int', 'decimal', 'boolean', 'datetime', 'dateonly', 'enum'] as const;

/** Pop-up kaydedildiğinde tasarım belgesine yazılacak sonuç. */
export interface StepDialogResult {
  step: WorkflowStep;
  statusLabel: string;
  /** Düzenlenen adımın özgün anahtarı; yeni adımda boş. Anahtar değiştiyse bağlantılar taşınır. */
  originalKey: string;
}

/**
 * Tek bir akış adımının ekleme/düzenleme pop-up'ı.
 *
 * Adımı NESNE olarak alır ve kendi formunu kurar; tasarım belgesindeki adıma
 * kaydedilene kadar dokunulmaz — İptal hiçbir şeyi geri almak zorunda değil.
 * Kaydedince form değeri `stepFromFormValue` ile asıl adımın üstüne birleştirilir
 * (formda karşılığı olmayan alanlar korunur).
 */
@Component({
  selector: 'app-workflow-step-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './workflow-step-dialog.component.html',
  styleUrl: './workflow-step-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowStepDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  /** Düzenlenecek adım; yeni adımda null. */
  readonly step = input<WorkflowStep | null>(null);
  /** Adımın durum etiketi (`entityStatusMap` girdisi). */
  readonly statusLabel = input('');
  /** Yeni adıma önerilen anahtar. */
  readonly newKey = input('');
  readonly readonly = input(false);
  readonly roles = input<Role[]>([]);
  readonly users = input<AppUser[]>([]);
  /** Tüm adım anahtarları (kendisi hariç tutulur) — geçiş hedefi listesi ve tekillik denetimi. */
  readonly stepKeys = input<string[]>([]);
  /** Akışın bağlı olduğu modelin kolonları — kayıt alanı seçicisi. Model seçilmemişse boş. */
  readonly columns = input<PublishedColumn[]>([]);

  readonly saved = output<StepDialogResult>();
  readonly cancelled = output<void>();

  readonly isNew = computed(() => this.step() === null);
  readonly originalKey = computed(() => this.step()?.key ?? '');

  readonly assignmentModeOptions = ASSIGNMENT_MODE_OPTIONS;
  readonly timeoutPolicyOptions = TIMEOUT_POLICY_OPTIONS;
  readonly joinModeOptions = JOIN_MODE_OPTIONS;
  readonly fieldTypes = FORM_FIELD_TYPES;

  form!: FormGroup;

  /** Kaydet geçersiz formla denendi — alt çubuktaki uyarıyı açar. */
  showErrors = false;
  /** Anahtar başka bir adımda kullanılıyor. */
  duplicateKey = false;

  /** Açılıştaki form değeri — hiçbir şey değişmeden Kaydet'e basılınca belge değişmesin. */
  private initialValue = '';

  ngOnInit(): void {
    const step = this.step();
    this.form = newStepGroup(this.fb, step?.key ?? this.newKey(), step ?? undefined, this.statusLabel());
    this.initialValue = JSON.stringify(this.form.getRawValue());
    if (this.readonly()) this.form.disable({ emitEvent: false });
  }

  get fields(): FormArray {
    return this.form.get('fields') as FormArray;
  }

  get recordFields(): FormArray {
    return this.form.get('recordFields') as FormArray;
  }

  get allowReject(): boolean {
    return this.form.get('allowReject')?.value !== false;
  }

  get branches(): FormArray {
    return this.form.get('branches') as FormArray;
  }

  get isParallel(): boolean {
    return this.form.get('type')?.value === 'parallel';
  }

  /**
   * Geçiş hedefleri: diğer adımlar. Kendi anahtarı (hem özgün hem şu an
   * yazılı olan) çıkarılır — adım kendine bağlanamaz.
   */
  get targetKeys(): string[] {
    const ownKeys = [this.originalKey(), String(this.form.get('key')?.value ?? '')];
    return this.stepKeys().filter(key => !ownKeys.some(own => sameKey(own, key)));
  }

  // ── Dallar ────────────────────────────────────────────────────────────────

  addBranch(): void {
    this.branches.push(newBranchGroup(this.fb, { key: `dal${this.branches.length + 1}`, name: '' }));
  }

  removeBranch(index: number): void {
    this.branches.removeAt(index);
  }

  /** Paralele geçişte iki boş dal hazırlanır (en az iki dal şart). */
  onTypeChange(): void {
    if (!this.isParallel) return;
    while (this.branches.length < 2) this.addBranch();
  }

  // ── Form alanları ─────────────────────────────────────────────────────────

  addField(): void {
    this.fields.push(newFieldGroup(this.fb));
  }

  removeField(index: number): void {
    this.fields.removeAt(index);
  }

  // ── Kayıt alanları ────────────────────────────────────────────────────────

  addRecordField(): void {
    this.recordFields.push(newRecordFieldGroup(this.fb));
  }

  removeRecordField(index: number): void {
    this.recordFields.removeAt(index);
  }

  /**
   * Satırın seçicisinde gösterilecek kolonlar: başka satırlarda seçilmiş olanlar
   * gizlenir (aynı kolon iki kez seçilemez), satırın kendi değeri kalır.
   */
  columnsFor(index: number): PublishedColumn[] {
    const taken = new Set(
      this.recordFields.controls
        .filter((_, i) => i !== index)
        .map(c => String(c.value.column ?? '').toLowerCase()));

    return this.columns().filter(c => !taken.has(c.columnName.toLowerCase()));
  }

  /** Kolon seçicideki metin: "Etiket (KolonAdı)" ya da yalnız kolon adı. */
  columnLabel(column: PublishedColumn): string {
    return column.label && column.label !== column.columnName
      ? `${column.label} (${column.columnName})`
      : column.columnName;
  }

  // ── Kapatma ───────────────────────────────────────────────────────────────

  save(): void {
    if (this.readonly()) {
      this.cancelled.emit();
      return;
    }

    // Anahtar akışta tekil olmalı: iki adım aynı anahtarı taşırsa bağlantılar
    // hangisine gittiği belirsizleşir ve doğrulayıcı yayını reddeder.
    const key = String(this.form.get('key')?.value ?? '');
    this.duplicateKey = this.stepKeys().some(existing =>
      sameKey(existing, key) && !sameKey(existing, this.originalKey()));

    if (this.form.invalid || this.duplicateKey) {
      this.form.markAllAsTouched();
      this.showErrors = true;
      return;
    }

    // Var olan adım hiç değiştirilmeden kaydedildiyse belgeye yazılmaz: eşleyici
    // adımı normalleştirdiği için (boş form → açık alanlar) belge "değişmiş"
    // görünür ve kullanıcı boş yere "kaydedilmemiş değişiklik" uyarısı alırdı.
    // (pristine yetmez: dal/alan ekleyip silmek kontrolü "kirli" işaretlemiyor.)
    if (!this.isNew() && JSON.stringify(this.form.getRawValue()) === this.initialValue) {
      this.cancelled.emit();
      return;
    }

    const { step, statusLabel } = stepFromFormValue(this.form.getRawValue(), this.step());
    this.saved.emit({ step, statusLabel, originalKey: this.originalKey() });
  }

  cancel(): void {
    this.cancelled.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.cancel();
  }

  /** Alanın hata göstermesi gerekiyor mu (dokunulmuş + geçersiz). */
  invalid(path: string): boolean {
    const control = this.form.get(path);
    return !!control && control.invalid && control.touched;
  }
}
