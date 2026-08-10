import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { WorkflowService } from '../../services/workflow.service';
import { PublishedModelService } from '../../services/published-model.service';
import { RoleAdminService } from '../../services/role-admin.service';
import {
  ASSIGNMENT_MODE_OPTIONS,
  TIMEOUT_POLICY_OPTIONS,
  TRIGGER_EVENT_OPTIONS,
  WORKFLOW_OPERATORS,
  WORKFLOW_TERMINAL_COMPLETED,
  WORKFLOW_TERMINAL_REJECTED,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowStep,
  parseConditions,
  parseDefinition
} from '../../models/workflow.model';
import { Role } from '../../models/role';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { ResponseModel } from '../../models/responseModel';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { WorkflowGraphComponent } from '../shared/workflow-graph/workflow-graph.component';

type TabId = 'steps' | 'trigger' | 'preview';

/** Form alanı tipi seçenekleri — model kolon tipleriyle aynı sözlükten dar bir alt küme. */
const FORM_FIELD_TYPES = ['string', 'int', 'decimal', 'boolean', 'datetime', 'dateonly', 'enum'] as const;

/**
 * Akış tasarım ekranı — FORM TABANLI (sürükle-bırak canvas değil).
 *
 * Gerekçe: UI'da CDK, drag-drop veya diyagram kütüphanesi yok; canvas tek başına
 * ~2 haftalık iş. report-build de aynı tercihi yapmıştı ("Drag&drop ileride;
 * şimdilik form tabanlı yeterli"). Adım listesi report-build'in FormArray
 * desenini, sekme çubuğu table-detail'i izliyor; Önizleme sekmesinde
 * salt-okunur SVG akış şeması var.
 */
@Component({
  selector: 'app-workflow-build',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe, WorkflowGraphComponent],
  templateUrl: './workflow-build.component.html',
  styleUrl: './workflow-build.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowBuildComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workflowService = inject(WorkflowService);
  private readonly publishedModelService = inject(PublishedModelService);
  private readonly roleService = inject(RoleAdminService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);

  readonly triggerEventOptions = TRIGGER_EVENT_OPTIONS;
  readonly assignmentModeOptions = ASSIGNMENT_MODE_OPTIONS;
  readonly timeoutPolicyOptions = TIMEOUT_POLICY_OPTIONS;
  readonly operators = WORKFLOW_OPERATORS;
  readonly fieldTypes = FORM_FIELD_TYPES;
  readonly terminalCompleted = WORKFLOW_TERMINAL_COMPLETED;
  readonly terminalRejected = WORKFLOW_TERMINAL_REJECTED;

  readonly activeTab = signal<TabId>('steps');

  /**
   * Önizleme grafiği signal olarak tutulur, getter olarak DEĞİL.
   * Getter her CD turunda yeni nesne referansı üretir ve salt-okunur graf
   * bileşenini gereksiz yere yeniden çizerdi (report-build'in canlı önizleme
   * için yaptığı tespitle aynı).
   */
  readonly previewGraph = signal<WorkflowGraph | null>(null);

  form!: FormGroup;

  models: string[] = [];
  modelColumns: string[] = [];
  roles: Role[] = [];

  isNew = true;
  editingId: number | null = null;
  loading = false;
  saving = false;
  loadError: string | null = null;
  submitError: string | null = null;
  validationErrors: string[] = [];

  ngOnInit(): void {
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    this.buildForm();
    this.loadModels();
    this.loadRoles();

    if (!this.isNew) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (id) this.loadExisting(id);
    }

    // Her değişiklikte önizlemeyi tazele; kullanıcı adımı yazarken şemayı görsün.
    this.form.valueChanges.pipe(markDirty(this.cdr)).subscribe(() => this.refreshPreview());
    this.refreshPreview();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      code: ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      modelName: ['', Validators.required],
      triggerEvent: ['onCreate', Validators.required],
      isEnabled: [true],
      startStep: [''],
      steps: this.fb.array([]),
      conditions: this.fb.array([])
    });
  }

  // ── FormArray erişimcileri ────────────────────────────────────────────────

  get stepsArray(): FormArray {
    return this.form.get('steps') as FormArray;
  }

  get conditionsArray(): FormArray {
    return this.form.get('conditions') as FormArray;
  }

  stepFields(index: number): FormArray {
    return this.stepsArray.at(index).get('fields') as FormArray;
  }

  // ── Adım satırları ────────────────────────────────────────────────────────

  addStep(step?: WorkflowStep): void {
    this.stepsArray.push(this.newStepGroup(step));

    // İlk adım otomatik başlangıç olur — kullanıcının ayrıca seçmesi gerekmesin.
    if (this.stepsArray.length === 1 && !this.form.value.startStep) {
      this.form.patchValue({ startStep: this.stepsArray.at(0).value.key });
    }
  }

  removeStep(index: number): void {
    const removedKey = this.stepsArray.at(index).value.key;
    this.stepsArray.removeAt(index);

    // Silinen adım başlangıç ya da bir hedefse referanslar temizlenir; aksi halde
    // doğrulayıcı "hedef adım bulunamadı" der ve kullanıcı sebebini göremez.
    if (this.form.value.startStep === removedKey) {
      this.form.patchValue({ startStep: this.stepsArray.at(0)?.value.key ?? '' });
    }
    for (const control of this.stepsArray.controls) {
      if (control.value.onApprove === removedKey) control.patchValue({ onApprove: '' });
      if (control.value.onReject === removedKey) control.patchValue({ onReject: '' });
    }
  }

  private newStepGroup(step?: WorkflowStep): FormGroup {
    const group = this.fb.group({
      key: [step?.key ?? this.suggestKey(), [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      name: [step?.name ?? '', Validators.required],
      assignMode: [step?.assignment?.mode ?? 'role'],
      roleId: [step?.assignment?.roleId ?? null],
      userId: [step?.assignment?.userId ?? null],
      dueHours: [step?.sla?.dueHours ?? null],
      escalateAfterHours: [step?.sla?.escalateAfterHours ?? null],
      onTimeout: [step?.sla?.onTimeout ?? 'escalate'],
      onApprove: [step?.onApprove ?? ''],
      onReject: [step?.onReject ?? ''],
      statusLabel: [''],
      fields: this.fb.array([])
    });

    const fields = group.get('fields') as FormArray;
    for (const field of step?.form?.fields ?? []) {
      fields.push(this.newFieldGroup(field));
    }

    return group;
  }

  /** Yeni adıma çakışmayan bir anahtar önerir (adim1, adim2, …). */
  private suggestKey(): string {
    const existing = new Set(this.stepsArray.controls.map(c => (c.value.key ?? '').toLowerCase()));
    let index = this.stepsArray.length + 1;
    while (existing.has(`adim${index}`)) index++;
    return `adim${index}`;
  }

  // ── Form alanı satırları ──────────────────────────────────────────────────

  addField(stepIndex: number): void {
    this.stepFields(stepIndex).push(this.newFieldGroup());
  }

  removeField(stepIndex: number, fieldIndex: number): void {
    this.stepFields(stepIndex).removeAt(fieldIndex);
  }

  private newFieldGroup(field?: { name: string; dataType: string; label?: string | null; isRequired: boolean; enumValues?: string | null }): FormGroup {
    return this.fb.group({
      name: [field?.name ?? '', Validators.required],
      dataType: [field?.dataType ?? 'string'],
      label: [field?.label ?? ''],
      isRequired: [field?.isRequired ?? false],
      enumValues: [field?.enumValues ?? '']
    });
  }

  // ── Koşul satırları ───────────────────────────────────────────────────────

  addCondition(condition?: WorkflowCondition): void {
    this.conditionsArray.push(this.fb.group({
      field: [condition?.field ?? '', Validators.required],
      operator: [condition?.operator ?? 'eq'],
      value: [condition?.value ?? '']
    }));
  }

  removeCondition(index: number): void {
    this.conditionsArray.removeAt(index);
  }

  // ── Veri yükleme ──────────────────────────────────────────────────────────

  private loadModels(): void {
    this.publishedModelService.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) this.models = (res.data ?? []).map(m => m.typeName);
      },
      error: () => { this.models = []; }
    });
  }

  private loadRoles(): void {
    this.roleService.getRoles().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) this.roles = res.data ?? [];
      },
      error: () => { this.roles = []; }
    });
  }

  /** Seçili modelin kolonları — koşul alanı açılır listesini besler. */
  onModelChange(): void {
    const modelName = this.form.value.modelName;
    this.publishedModelService.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const model = (res.data ?? []).find(m => m.typeName === modelName);
        this.modelColumns = (model?.columns ?? []).map(c => c.columnName);
      },
      error: () => { this.modelColumns = []; }
    });
  }

  private loadExisting(id: number): void {
    this.loading = true;

    this.workflowService.get(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading = false;
        if (!res.success || !res.data) {
          this.loadError = res.message ?? this.languageService.t('workflow.build.loadFailed');
          return;
        }

        const workflow = res.data;
        this.editingId = workflow.id;

        if (workflow.status !== 'Draft') {
          this.loadError = this.languageService.t('workflow.build.publishedNotEditable');
          this.form.disable();
          return;
        }

        this.populate(workflow);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  private populate(workflow: WorkflowDefinition): void {
    this.form.patchValue({
      name: workflow.name,
      code: workflow.code,
      modelName: workflow.modelName,
      triggerEvent: workflow.triggerEvent,
      isEnabled: workflow.isEnabled
    }, { emitEvent: false });

    const graph = parseDefinition(workflow.definitionJson);
    this.stepsArray.clear();

    for (const step of graph?.steps ?? []) {
      const group = this.newStepGroup(step);
      // Durum etiketi grafikte ayrı bir haritada duruyor; forma geri taşınıyor.
      group.patchValue({ statusLabel: graph?.entityStatusMap?.[step.key] ?? '' }, { emitEvent: false });
      this.stepsArray.push(group);
    }

    this.form.patchValue({ startStep: graph?.startStep ?? '' }, { emitEvent: false });

    this.conditionsArray.clear();
    for (const condition of parseConditions(workflow.triggerConditionJson)) {
      this.addCondition(condition);
    }

    this.onModelChange();
    this.refreshPreview();
  }

  // ── Önizleme + gönderim ───────────────────────────────────────────────────

  private refreshPreview(): void {
    const graph = this.buildGraph();
    this.previewGraph.set(graph.steps.length > 0 ? graph : null);
  }

  /** Form değerlerinden tanım grafiğini kurar — kaydetme ve önizleme ortak kullanır. */
  private buildGraph(): WorkflowGraph {
    const raw = this.form.getRawValue();
    const entityStatusMap: Record<string, string> = {};

    const steps: WorkflowStep[] = (raw.steps ?? []).map((step: Record<string, unknown>) => {
      const key = String(step['key'] ?? '');
      const statusLabel = String(step['statusLabel'] ?? '').trim();
      if (statusLabel) entityStatusMap[key] = statusLabel;

      const mode = step['assignMode'] as 'role' | 'user' | 'creator';
      const dueHours = step['dueHours'] as number | null;
      const escalateAfterHours = step['escalateAfterHours'] as number | null;
      const fields = (step['fields'] ?? []) as Array<Record<string, unknown>>;

      return {
        key,
        type: 'approval' as const,
        name: String(step['name'] ?? ''),
        assignment: {
          mode,
          roleId: mode === 'role' ? Number(step['roleId']) || null : null,
          userId: mode === 'user' ? Number(step['userId']) || null : null
        },
        // SLA yalnızca gerçekten girildiyse gönderilir; boş nesne doğrulayıcıda
        // "sıfırdan büyük olmalı" hatasına düşerdi.
        sla: dueHours || escalateAfterHours ? {
          dueHours: dueHours || null,
          escalateAfterHours: escalateAfterHours || null,
          onTimeout: (step['onTimeout'] as 'escalate' | 'autoApprove' | 'autoReject') ?? 'escalate'
        } : null,
        form: fields.length > 0 ? {
          fields: fields.map(field => ({
            name: String(field['name'] ?? ''),
            dataType: String(field['dataType'] ?? 'string'),
            label: String(field['label'] ?? '') || null,
            isRequired: !!field['isRequired'],
            enumValues: String(field['enumValues'] ?? '') || null
          }))
        } : null,
        onApprove: String(step['onApprove'] ?? '') || null,
        onReject: String(step['onReject'] ?? '') || null
      };
    });

    return { startStep: String(raw.startStep ?? ''), steps, entityStatusMap };
  }

  private buildPayload(): Partial<WorkflowDefinition> {
    const raw = this.form.getRawValue();
    const conditions = (raw.conditions ?? []) as WorkflowCondition[];

    return {
      id: this.editingId ?? 0,
      name: raw.name,
      code: raw.code,
      modelName: raw.modelName,
      triggerEvent: raw.triggerEvent,
      isEnabled: raw.isEnabled,
      definitionJson: JSON.stringify(this.buildGraph()),
      triggerConditionJson: conditions.length > 0 ? JSON.stringify(conditions) : null
    };
  }

  validate(): void {
    this.workflowService.validate(this.buildPayload()).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.validationErrors = res.data?.errors ?? [];
        if (res.data?.isValid) {
          this.notification.success(this.languageService.t('workflow.build.validationOk'));
        }
      },
      error: err => {
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  onSubmit(publish: boolean): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.submitError = null;
    this.validationErrors = [];

    const payload = this.buildPayload();

    // define() DataResponseModel<number>, update() ResponseModel döner; ortak
    // abonelik için ResponseModel'e genişletiliyor (report-build ile aynı desen).
    const request: Observable<ResponseModel> = this.editingId
      ? this.workflowService.update(payload)
      : this.workflowService.define(payload);

    request.pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.saving = false;
          this.submitError = res.message ?? this.languageService.t('workflow.build.saveFailed');
          return;
        }

        const newId = this.editingId ?? (res as { data?: number }).data ?? 0;

        if (publish && newId) {
          this.publishThen(newId);
        } else {
          this.saving = false;
          this.notification.success(res.message ?? '');
          this.router.navigate(['/workflows']);
        }
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  private publishThen(id: number): void {
    this.workflowService.publish(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (res.success) {
          this.notification.success(res.message ?? '');
          this.router.navigate(['/workflows']);
        } else {
          // Kayıt başarılı ama yayın başarısız: kullanıcı listede taslağı görecek,
          // bu yüzden hata ekranda kalmalı ve yönlendirme yapılmamalı.
          this.submitError = res.message ?? this.languageService.t('workflow.build.saveFailed');
        }
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  setTab(tab: TabId): void {
    this.activeTab.set(tab);
  }

  /** Hedef adım açılır listesi: diğer adımlar + iki terminal. */
  get stepKeys(): string[] {
    return this.stepsArray.controls.map(c => String(c.value.key ?? '')).filter(Boolean);
  }
}
