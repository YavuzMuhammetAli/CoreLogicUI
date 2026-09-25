import {
  ChangeDetectionStrategy, Component, HostListener, OnInit, inject, input, output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import {
  ASSIGNMENT_MODE_OPTIONS,
  JOIN_MODE_OPTIONS,
  TIMEOUT_POLICY_OPTIONS
} from '../../../models/workflow.model';
import { Role } from '../../../models/role';
import { AppUser } from '../../../models/appUser';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { newBranchGroup, newFieldGroup } from '../workflow-step.form';

/** Form alanı tipi seçenekleri — model kolon tipleriyle aynı sözlükten dar bir alt küme. */
const FORM_FIELD_TYPES = ['string', 'int', 'decimal', 'boolean', 'datetime', 'dateonly', 'enum'] as const;

/**
 * Tek bir akış adımının ekleme/düzenleme pop-up'ı.
 *
 * Kendisine verilen grup, ana formdaki adımın KOPYASIDIR (cloneStepGroup).
 * Bu bileşen kopyayı serbestçe değiştirir; kaydetme kararı ve kopyanın ana
 * forma yerleştirilmesi çağıranın işidir. İptal bir şey geri almak zorunda
 * kalmaz — kopya yalnızca atılır.
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

  readonly group = input.required<FormGroup>();
  readonly isNew = input(false);
  readonly readonly = input(false);
  readonly roles = input<Role[]>([]);
  readonly users = input<AppUser[]>([]);
  /** Tüm adım anahtarları (kendisi hariç tutulur) — geçiş hedefi listesi. */
  readonly stepKeys = input<string[]>([]);
  /** Düzenlenen adımın ana formdaki özgün anahtarı; yeni adımda boş. */
  readonly originalKey = input('');

  readonly saved = output<FormGroup>();
  readonly cancelled = output<void>();

  readonly assignmentModeOptions = ASSIGNMENT_MODE_OPTIONS;
  readonly timeoutPolicyOptions = TIMEOUT_POLICY_OPTIONS;
  readonly joinModeOptions = JOIN_MODE_OPTIONS;
  readonly fieldTypes = FORM_FIELD_TYPES;

  /** Kaydet geçersiz formla denendi — alt çubuktaki uyarıyı açar. */
  showErrors = false;

  ngOnInit(): void {
    if (this.readonly()) this.group().disable({ emitEvent: false });
  }

  get fields(): FormArray {
    return this.group().get('fields') as FormArray;
  }

  get branches(): FormArray {
    return this.group().get('branches') as FormArray;
  }

  get isParallel(): boolean {
    return this.group().get('type')?.value === 'parallel';
  }

  /**
   * Geçiş hedefleri: diğer adımlar. Kendi anahtarı (hem özgün hem şu an
   * yazılı olan) çıkarılır — adım kendine bağlanamaz.
   */
  get targetKeys(): string[] {
    const own = new Set([this.originalKey(), String(this.group().get('key')?.value ?? '')]);
    return this.stepKeys().filter(key => !own.has(key));
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

  // ── Kapatma ───────────────────────────────────────────────────────────────

  save(): void {
    if (this.readonly()) {
      this.cancelled.emit();
      return;
    }

    if (this.group().invalid) {
      this.group().markAllAsTouched();
      this.showErrors = true;
      return;
    }

    this.saved.emit(this.group());
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
    const control = this.group().get(path);
    return !!control && control.invalid && control.touched;
  }
}
