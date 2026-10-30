import {
  ChangeDetectionStrategy, Component, HostListener, OnChanges, SimpleChanges, inject, input, output
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { WorkflowFormField } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { inputTypeFor, parseEnumValues, stepFor } from '../../model-data/model-data.util';
import { buildTaskForm, parseTaskSchema, readTaskForm } from '../task-decision-form/task-form.util';

/** Diyalogun topladığı karar verisi — kayıt alanları buraya girmez (formun kendisinde). */
export interface TaskActionResult {
  comment: string | null;
  formDataJson: string | null;
}

/**
 * Kayıt ekranındaki adım butonunun diyaloğu: adımın EK karar alanları + açıklama.
 *
 * Kayıt alanları burada DEĞİL, kaydın kendi formunda doldurulur; bu diyalog
 * yalnızca kayda yazılmayan karar verisini toplar. Gönderimi çağıran yapar
 * (kayıt değerlerini de aynı isteğe koyabilmesi için) — diyalog `busy`/`error`
 * ile yalnızca durumu gösterir.
 *
 * Onayda ek alan yoksa diyalog hiç açılmaz (ara onay adımı yok ilkesi);
 * reddetmede açıklama yazılabilsin diye her zaman açılır.
 */
@Component({
    selector: 'app-task-action-dialog',
    imports: [ReactiveFormsModule, TranslatePipe],
    templateUrl: './task-action-dialog.component.html',
    styleUrl: './task-action-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskActionDialogComponent implements OnChanges {
  readonly open = input(false);
  readonly decision = input<'approve' | 'reject'>('approve');
  /** Buton metni ve başlık — adım etiketinden gelir. */
  readonly actionLabel = input('');
  readonly schemaJson = input<string | null | undefined>(null);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  /** Formda kaydedilmemiş değişiklik var ve bu eylem onları yazmayacak. */
  readonly discardsChanges = input(false);

  readonly confirmed = output<TaskActionResult>();
  readonly cancelled = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly languageService = inject(LanguageService);

  readonly inputTypeFor = inputTypeFor;
  readonly stepFor = stepFor;
  readonly parseEnumValues = parseEnumValues;

  fields: WorkflowFormField[] = [];
  form: FormGroup = this.fb.group({ comment: [''] });

  /** Form ilk render'dan ÖNCE kurulmalı — effect değil ngOnChanges. */
  ngOnChanges(changes: SimpleChanges): void {
    const opened = changes['open'] && this.open();
    if (opened || changes['schemaJson']) {
      this.fields = parseTaskSchema(this.schemaJson()).fields;
      this.form = buildTaskForm(this.fb, this.fields);
    }
  }

  get isReject(): boolean {
    return this.decision() === 'reject';
  }

  submit(): void {
    if (this.busy()) return;

    // Onayda ek alanlar doğrulanır; REDDE değil — reddetmek için onay formunu
    // doldurmak zorunda bırakmak anlamsız (sunucu da redde aramıyor).
    if (!this.isReject && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.confirmed.emit(readTaskForm(this.form, this.fields));
  }

  cancel(): void {
    if (!this.busy()) this.cancelled.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open()) this.cancel();
  }

  fieldLabel(field: WorkflowFormField): string {
    return field.label?.trim() || field.name;
  }

  errorFor(field: WorkflowFormField): string | null {
    const control = this.form.get(field.name);
    if (!control || !control.touched || control.valid) return null;
    if (control.hasError('required')) return this.languageService.t('common.required');
    if (control.hasError('maxlength')) {
      return this.languageService.t('task.detail.tooLong', { max: String(field.maxLength ?? '') });
    }
    return null;
  }
}
