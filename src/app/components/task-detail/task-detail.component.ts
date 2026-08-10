import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { WorkflowTaskService, WorkflowInstanceService } from '../../services/workflow-task.service';
import {
  WorkflowEvent,
  WorkflowFormField,
  WorkflowTask
} from '../../models/workflow.model';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { markDirty } from '../../utils/change-detection';
import { inputTypeFor, stepFor, parseEnumValues } from '../model-data/model-data.util';
import { formatDate } from '../../utils/locale-format';

/**
 * Görev detayı — onay/red ekranı.
 *
 * Dinamik form YENİDEN YAZILMADI: adım şeması `dataType` sözlüğünü model
 * kolonlarıyla paylaştığı için (CoreLogicTypeMap) `inputTypeFor`, `stepFor` ve
 * `parseEnumValues` yardımcıları olduğu gibi kullanılıyor; şablondaki tip
 * merdiveni de record-form-dialog'dan alındı.
 *
 * Form şeması TANIMDAN değil GÖREVDEN okunur — görev açıldığı andaki formu
 * gösterir, tanım o sırada yeni bir sürüme geçmiş olabilir.
 */
@Component({
  selector: 'app-task-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskDetailComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly taskService = inject(WorkflowTaskService);
  private readonly instanceService = inject(WorkflowInstanceService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);

  // Şablonun çağırabilmesi için saf yardımcılar alan olarak bağlanıyor
  // (record-form-dialog ile aynı desen).
  readonly inputTypeFor = inputTypeFor;
  readonly stepFor = stepFor;
  readonly parseEnumValues = parseEnumValues;

  task: WorkflowTask | null = null;
  fields: WorkflowFormField[] = [];
  timeline: WorkflowEvent[] = [];
  form: FormGroup = this.fb.group({});

  loading = false;
  saving = false;
  loadError: string | null = null;
  submitError: string | null = null;

  /** confirm-dialog'u açan bekleyen karar. */
  pendingDecision: 'approve' | 'reject' | null = null;

  get isClosed(): boolean {
    return !!this.task && this.task.status !== 'Pending';
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) {
      this.loadError = this.languageService.t('task.detail.loadFailed');
      return;
    }
    this.load(id);
  }

  private load(id: number): void {
    this.loading = true;
    this.loadError = null;

    this.taskService.get(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('task.detail.loadFailed');
          return;
        }

        this.task = res.data;
        this.fields = this.parseSchema(res.data.formSchemaJson);
        this.buildForm();
        this.loadTimeline(res.data.instanceId);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('task.detail.serverError');
      }
    });
  }

  /** Süreç geçmişi ayrı çekilir; görev ekranı süreç bağlamını da göstermeli. */
  private loadTimeline(instanceId: number): void {
    this.instanceService.get(instanceId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success && res.data) this.timeline = res.data.timeline ?? [];
      },
      // Zaman çizelgesi ikincil bilgi — alınamazsa ekran çalışmaya devam etsin.
      error: () => { this.timeline = []; }
    });
  }

  private parseSchema(json: string | null | undefined): WorkflowFormField[] {
    if (!json?.trim()) return [];
    try {
      const parsed = JSON.parse(json) as { fields?: WorkflowFormField[] };
      return parsed.fields ?? [];
    } catch {
      // Bozuk şema formu kilitlememeli; yalnızca açıklama alanıyla devam edilir.
      return [];
    }
  }

  private buildForm(): void {
    const controls: Record<string, unknown> = { comment: [''] };

    for (const field of this.fields) {
      const validators = field.isRequired ? [Validators.required] : [];
      if (field.maxLength && field.maxLength > 0) {
        validators.push(Validators.maxLength(field.maxLength));
      }
      controls[field.name] = [this.defaultValueFor(field), validators];
    }

    this.form = this.fb.group(controls);

    if (this.isClosed) {
      // Kapalı görevde form salt-okunur: geçmiş karar görünsün ama değiştirilemesin.
      this.patchExistingValues();
      this.form.disable();
    }
  }

  private defaultValueFor(field: WorkflowFormField): unknown {
    return inputTypeFor(field.dataType) === 'checkbox' ? false : '';
  }

  private patchExistingValues(): void {
    if (!this.task?.formDataJson) {
      this.form.patchValue({ comment: this.task?.comment ?? '' }, { emitEvent: false });
      return;
    }

    try {
      const values = JSON.parse(this.task.formDataJson) as Record<string, unknown>;
      this.form.patchValue({ ...values, comment: this.task.comment ?? '' }, { emitEvent: false });
    } catch {
      this.form.patchValue({ comment: this.task.comment ?? '' }, { emitEvent: false });
    }
  }

  fieldLabel(field: WorkflowFormField): string {
    return field.label?.trim() || field.name;
  }

  askDecision(decision: 'approve' | 'reject'): void {
    // Onayda form doğrulaması şart; REDDE değil — bir talebi reddetmek için
    // zorunlu alanları doldurmak zorunda bırakmak anlamsız olurdu.
    if (decision === 'approve' && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.pendingDecision = decision;
  }

  cancelDecision(): void {
    this.pendingDecision = null;
  }

  confirmDecision(): void {
    const decision = this.pendingDecision;
    const task = this.task;
    this.pendingDecision = null;

    if (!decision || !task) return;

    this.saving = true;
    this.submitError = null;

    const { comment, ...formValues } = this.form.getRawValue() as Record<string, unknown>;

    this.taskService.complete({
      taskId: task.id,
      decision,
      comment: (comment as string) || null,
      // Form alanı yoksa null gönderilir; sunucu boş şemada doğrulama yapmıyor.
      formDataJson: this.fields.length > 0 ? JSON.stringify(formValues) : null
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.router.navigate(['/tasks']);
        } else {
          this.submitError = res.message ?? this.languageService.t('task.detail.submitFailed');
        }
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('task.detail.serverError');
      }
    });
  }

  get confirmTitle(): string {
    return this.languageService.t(
      this.pendingDecision === 'reject' ? 'task.detail.rejectConfirmTitle' : 'task.detail.approveConfirmTitle');
  }

  get confirmMessage(): string {
    return this.languageService.t(
      this.pendingDecision === 'reject' ? 'task.detail.rejectConfirm' : 'task.detail.approveConfirm',
      { name: this.task?.name ?? '' });
  }

  eventLabel(event: WorkflowEvent): string {
    return this.languageService.t('workflow.event.' + event.eventType);
  }

  eventTime(event: WorkflowEvent): string {
    return formatDate(new Date(event.createdAt), this.languageService.lang());
  }

  /** Vade tarihi; yoksa "süresiz". */
  get dueLabel(): string {
    return this.task?.dueAt
      ? formatDate(new Date(this.task.dueAt), this.languageService.lang())
      : this.languageService.t('task.list.noDue');
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
