import {
  ChangeDetectionStrategy, Component, OnChanges, SimpleChanges, inject, input, output, signal
} from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { WorkflowTaskService } from '../../../services/workflow-task.service';
import { WorkflowFormField, WorkflowTask } from '../../../models/workflow.model';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { inputTypeFor, stepFor, parseEnumValues } from '../../model-data/model-data.util';
import { TaskSchema, buildTaskForm, parseTaskSchema, readTaskForm } from './task-form.util';
import { IconComponent } from '../icon/icon.component';

/**
 * Görev karar formu — adım formu + açıklama + Onayla/Reddet.
 *
 * Görev detayı (`/tasks/:id`) ve kayıt detayı (`/models/:type/:id`) aynı formu
 * kullanır; karar mantığı tek yerde durur.
 *
 * Karar ARA ONAY DİYALOĞU OLMADAN gönderilir: kullanıcı zaten formu doldurup
 * butonu seçmiş durumda, ikinci bir "emin misiniz" adımı yalnızca tıklama ekliyordu.
 *
 * Dinamik form YENİDEN YAZILMADI: adım şeması `dataType` sözlüğünü model
 * kolonlarıyla paylaştığı için (CoreLogicTypeMap) `inputTypeFor`, `stepFor` ve
 * `parseEnumValues` yardımcıları olduğu gibi kullanılıyor.
 *
 * Form şeması TANIMDAN değil GÖREVDEN okunur — görev açıldığı andaki formu
 * gösterir, tanım o sırada yeni bir sürüme geçmiş olabilir.
 */
@Component({
  selector: 'app-task-decision-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IconComponent],
  templateUrl: './task-decision-form.component.html',
  styleUrl: './task-decision-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDecisionFormComponent implements OnChanges {
  readonly task = input.required<WorkflowTask>();
  /** Panel başlığı; verilmezse "Onay formu". */
  readonly heading = input<string | null>(null);

  /** Karar sunucuda kabul edildi — sunucu mesajıyla. */
  readonly completed = output<string>();

  private readonly fb = inject(FormBuilder);
  private readonly taskService = inject(WorkflowTaskService);
  private readonly languageService = inject(LanguageService);

  // Şablonun çağırabilmesi için saf yardımcılar alan olarak bağlanıyor
  // (record-form-dialog ile aynı desen).
  readonly inputTypeFor = inputTypeFor;
  readonly stepFor = stepFor;
  readonly parseEnumValues = parseEnumValues;

  fields: WorkflowFormField[] = [];
  schema: TaskSchema = parseTaskSchema(null);
  form: FormGroup = this.fb.group({ comment: [''] });

  /** Gönderilmekte olan karar — basılan butonda spinner göstermek için. */
  readonly saving = signal<'approve' | 'reject' | null>(null);
  readonly submitError = signal<string | null>(null);

  get isClosed(): boolean {
    return this.task().status !== 'Pending';
  }

  /**
   * Adım KAYIT alanı istiyorsa onay kayıt ekranından verilir: alanlar orada,
   * formun kendisinde doldurulur ve onayla aynı transaction'da yazılır. Burada
   * onaylamak zorunlu alanları boş bırakıp sunucudan hata almak olurdu.
   */
  get approveOnRecord(): boolean {
    return this.schema.recordFields.length > 0;
  }

  /** Yönetici "Atla" işlemi gerekçeyi bu alandan okur. */
  get commentValue(): string | null {
    return (this.form.get('comment')?.value as string) || null;
  }

  /**
   * Form ilk render'dan ÖNCE kurulmalı (formControlName'ler kontrolü bulamazsa
   * hata fırlatır) — bu yüzden effect değil ngOnChanges.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['task']) {
      this.schema = parseTaskSchema(this.task().formSchemaJson);
      this.fields = this.schema.fields;
      this.buildForm();
      this.submitError.set(null);
    }
  }

  private buildForm(): void {
    this.form = buildTaskForm(this.fb, this.fields);

    if (this.isClosed) {
      // Kapalı görevde form salt-okunur: geçmiş karar görünsün ama değiştirilemesin.
      this.patchExistingValues();
      this.form.disable();
    }
  }

  private patchExistingValues(): void {
    const task = this.task();
    if (!task.formDataJson) {
      this.form.patchValue({ comment: task.comment ?? '' }, { emitEvent: false });
      return;
    }

    try {
      const values = JSON.parse(task.formDataJson) as Record<string, unknown>;
      this.form.patchValue({ ...values, comment: task.comment ?? '' }, { emitEvent: false });
    } catch {
      this.form.patchValue({ comment: task.comment ?? '' }, { emitEvent: false });
    }
  }

  fieldLabel(field: WorkflowFormField): string {
    return field.label?.trim() || field.name;
  }

  decide(decision: 'approve' | 'reject'): void {
    if (this.saving()) return;

    // Onayda form doğrulaması şart; REDDE değil — bir talebi reddetmek için
    // zorunlu alanları doldurmak zorunda bırakmak anlamsız olurdu.
    if (decision === 'approve' && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(decision);
    this.submitError.set(null);

    const { comment, formDataJson } = readTaskForm(this.form, this.fields);

    this.taskService.complete({
      taskId: this.task().id,
      decision,
      comment,
      formDataJson
    }).subscribe({
      next: res => {
        this.saving.set(null);
        if (res.success) {
          this.completed.emit(res.message ?? '');
        } else {
          this.submitError.set(res.message ?? this.languageService.t('task.detail.submitFailed'));
        }
      },
      error: err => {
        this.saving.set(null);
        this.submitError.set(err?.error?.message ?? this.languageService.t('task.detail.serverError'));
      }
    });
  }

  errorFor(field: WorkflowFormField): string | null {
    const control = this.form.get(field.name);
    if (!control || !control.touched || control.valid) return null;

    if (control.hasError('required')) {
      return this.languageService.t('common.required');
    }
    if (control.hasError('maxlength')) {
      return this.languageService.t('task.detail.tooLong', { max: String(field.maxLength ?? '') });
    }
    return null;
  }
}
