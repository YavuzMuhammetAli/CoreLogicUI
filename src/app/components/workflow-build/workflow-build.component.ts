import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { WorkflowService } from '../../services/workflow.service';
import { PublishedColumn, PublishedModelService } from '../../services/published-model.service';
import { RoleAdminService } from '../../services/role-admin.service';
import { UserAdminService } from '../../services/user-admin.service';
import {
  TRIGGER_EVENT_OPTIONS,
  WORKFLOW_OPERATORS,
  WorkflowCondition,
  WorkflowDefinition,
  WorkflowGraph,
  WorkflowStep,
  parseConditions,
  parseDefinition
} from '../../models/workflow.model';
import { Role } from '../../models/role';
import { AppUser } from '../../models/appUser';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { ResponseModel } from '../../models/responseModel';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { WorkflowGraphComponent } from '../shared/workflow-graph/workflow-graph.component';
import { WorkflowCanvasComponent } from '../shared/workflow-canvas/workflow-canvas.component';
import { WorkflowStepDialogComponent } from './step-dialog/workflow-step-dialog.component';
import {
  buildAssignment,
  buildSla,
  cloneStepGroup,
  newStepGroup,
  renameStepReferences,
  suggestStepKey
} from './workflow-step.form';

type TabId = 'steps' | 'canvas' | 'trigger' | 'preview';

/** Açık adım pop-up'ı: kopya grup + düzenlenen satırın indeksi (yeni adımda null). */
interface StepDialogState {
  group: FormGroup;
  index: number | null;
  originalKey: string;
}

/**
 * Akış tasarım ekranı — liste ve canvas AYNI veriyi düzenler.
 *
 * Dört sekme: Adımlar (liste), Tasarım (sürükle-bırak canvas), Tetikleyici,
 * Önizleme (salt-okunur şema).
 *
 * Adım ayrıntıları (atama/SLA/dallar/form alanları) tek yerde, adım pop-up'ında
 * düzenlenir; pop-up hem listeden (satıra tıklama) hem canvas'tan (düğüme çift
 * tıklama) açılır. Canvas konum ve bağlantı için hızlı yoldur. Hepsi aynı
 * FormArray üzerinde çalışır, dolayısıyla hangi sekmede düzenlendiğinin
 * kaydedilen tanıma etkisi yoktur.
 *
 * Projede CDK, drag-drop ve diyagram kütüphanesi YOK — canvas native Pointer
 * Events ile yazıldı (dashboard-build'in sürükleme deseni).
 */
@Component({
  selector: 'app-workflow-build',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterLink, TranslatePipe,
    WorkflowGraphComponent, WorkflowCanvasComponent, WorkflowStepDialogComponent
  ],
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
  private readonly userService = inject(UserAdminService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);

  readonly triggerEventOptions = TRIGGER_EVENT_OPTIONS;
  readonly operators = WORKFLOW_OPERATORS;

  readonly activeTab = signal<TabId>('steps');

  /** Açık adım pop-up'ı; kapalıyken null. */
  readonly stepDialog = signal<StepDialogState | null>(null);

  /**
   * Yayınlanmış akış düzenlenemez. Form disable ediliyor ama canvas bunu
   * kendiliğinden bilemez; taşıma ve bağlantı çizmeyi kapatmak için ayrıca
   * bildirilmesi gerekiyor.
   */
  readonly readonlyMode = signal(false);

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
  /** Kolonların tam meta verisi — adım pop-up'ındaki kayıt alanı seçicisi etiket/tip gösterir. */
  modelColumnMeta: PublishedColumn[] = [];
  roles: Role[] = [];
  users: AppUser[] = [];

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
    this.loadUsers();

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

  // ── Adımlar ───────────────────────────────────────────────────────────────

  /** Yüklenen tanımdan satır ekler (populate); pop-up'tan geçmez. */
  private pushStep(step: WorkflowStep, statusLabel = ''): void {
    this.stepsArray.push(newStepGroup(this.fb, step.key, step, statusLabel), { emitEvent: false });
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

  // ── Adım pop-up'ı ─────────────────────────────────────────────────────────

  /** Yeni adım için pop-up'ı boş bir grupla açar. */
  openNewStep(): void {
    if (this.readonlyMode()) return;
    this.stepDialog.set({
      group: newStepGroup(this.fb, suggestStepKey(this.stepsArray)),
      index: null,
      originalKey: ''
    });
  }

  /**
   * Mevcut adımı pop-up'ta açar. Pop-up ana formdaki grubun KOPYASINI alır;
   * İptal edilirse kopya atılır ve ana form hiç değişmemiş olur.
   */
  openStep(index: number): void {
    const source = this.stepsArray.at(index);
    if (!source) return;

    this.stepDialog.set({
      group: cloneStepGroup(this.fb, source),
      index,
      originalKey: String(source.getRawValue().key ?? '')
    });
  }

  /** Canvas'ta çift tıklanan düğüm — anahtarından satırı bulur. */
  openStepByKey(key: string): void {
    const index = this.stepsArray.controls.findIndex(
      c => String(c.value.key ?? '').toLowerCase() === key.toLowerCase());
    if (index >= 0) this.openStep(index);
  }

  /** Kopya ana forma yazılır: düzenlemede yerine konur, yeni adımda eklenir. */
  onStepSaved(group: FormGroup): void {
    const state = this.stepDialog();
    if (!state) return;

    const newKey = String(group.value.key ?? '');

    if (state.index === null) {
      this.stepsArray.push(group);
    } else {
      this.stepsArray.setControl(state.index, group);
    }

    // Anahtar değiştiyse bağlantılar ve başlangıç adımı yeni anahtara taşınır.
    let startStep = renameStepReferences(
      this.stepsArray, state.originalKey, newKey, String(this.form.value.startStep ?? ''));

    // İlk adım otomatik başlangıç olur — kullanıcının ayrıca seçmesi gerekmesin.
    if (!startStep && this.stepsArray.length > 0) {
      startStep = String(this.stepsArray.at(0).value.key ?? '');
    }
    this.form.patchValue({ startStep });

    this.selectedStepKey.set(newKey);
    this.stepDialog.set(null);
  }

  closeStepDialog(): void {
    this.stepDialog.set(null);
  }

  // ── Adım listesi özetleri ─────────────────────────────────────────────────

  /** Atama sütunu: rol adı, kullanıcı adı, "kaydı oluşturana" ya da dal sayısı. */
  assignmentSummary(control: { getRawValue(): Record<string, unknown> }): string {
    const step = control.getRawValue();

    if (step['type'] === 'parallel') {
      const count = ((step['branches'] ?? []) as unknown[]).length;
      return this.languageService.t('workflow.build.branchCount', { n: count });
    }

    switch (step['assignMode']) {
      case 'role': {
        const role = this.roles.find(r => r.id === Number(step['roleId']));
        return role?.name ?? '—';
      }
      case 'user': {
        const user = this.users.find(u => u.id === Number(step['userId']));
        return user ? `${user.firstName} ${user.lastName}` : '—';
      }
      default:
        return this.languageService.t('workflow.assign.creator');
    }
  }

  /** Geçiş hedefi: boşsa terminal (tamamlandı / reddedildi). */
  targetLabel(key: unknown, kind: 'approve' | 'reject'): string {
    const value = String(key ?? '');
    if (value) return value;
    return this.languageService.t(kind === 'approve'
      ? 'workflow.build.terminalCompleted'
      : 'workflow.build.terminalRejected');
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

  /** Kullanıcıya atama seçicisi için şirket kullanıcıları (yalnız aktifler). */
  private loadUsers(): void {
    this.userService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) this.users = (res.data ?? []).filter(u => u.status);
      },
      error: () => { this.users = []; }
    });
  }

  /** Seçili modelin kolonları — koşul alanı açılır listesini besler. */
  onModelChange(): void {
    const modelName = this.form.value.modelName;
    this.publishedModelService.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const model = (res.data ?? []).find(m => m.typeName === modelName);
        this.modelColumnMeta = model?.columns ?? [];
        this.modelColumns = this.modelColumnMeta.map(c => c.columnName);
      },
      error: () => { this.modelColumns = []; this.modelColumnMeta = []; }
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

        // Yayınlanmış akış düzenlenemez ama ŞEMASI GÖRÜNEBİLMELİ. Daha önce
        // burada erken dönülüyordu; form hiç doldurulmadığı için ekran boş
        // açılıyor ve kullanıcı yayınladığı akışın tasarımına bir daha
        // bakamıyordu. Önce doldur, sonra kilitle.
        this.populate(workflow);

        if (workflow.status !== 'Draft') {
          // Hata değil bilgi: kullanıcıya yolu ("Yeni Sürüm Oluştur") gösteriyoruz.
          this.readonlyVersion = workflow.version;
          this.readonlyMode.set(true);
          // getRawValue() disabled kontrolleri de okuduğu için önizleme ve
          // canvas dolu kalır.
          this.form.disable();
        } else {
          this.resolveDraftVersion(workflow.code);
        }
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  /**
   * Taslak yayınlandığında alacağı sürüm numarası — başlıkta "v3 taslağı".
   * Sürüm yayında verildiği için taslakta 0 durur; zincirin en yükseğinden
   * hesaplanır. Hiç yayın yoksa (ilk taslak) gösterilmez.
   */
  private resolveDraftVersion(code: string): void {
    this.workflowService.versions(code).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const max = Math.max(0, ...(res.data ?? []).map(v => v.version));
        this.draftNextVersion = max > 0 ? max + 1 : null;
      },
      error: () => { this.draftNextVersion = null; }
    });
  }

  /** Salt-okunur açılan sürüm (yayınlanmış/arşiv); taslakta null. */
  readonlyVersion: number | null = null;

  /** Yeni sürüm taslağının yayınlanınca alacağı numara; ilk taslakta null. */
  draftNextVersion: number | null = null;

  /**
   * Salt-okunur sürümden düzenlenebilir taslak açar. Rota aynı bileşende kaldığı
   * için (yalnız :id değişir) Angular bileşeni yeniden kurmaz; state elle
   * sıfırlanıp taslak yeniden yüklenir.
   */
  startNewVersion(): void {
    if (!this.editingId) return;
    this.saving = true;

    this.workflowService.newVersion(this.editingId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (!res.success || !res.data) {
          this.submitError = res.message ?? this.languageService.t('workflow.build.saveFailed');
          return;
        }

        const draftId = res.data;
        this.router.navigate(['/workflows', draftId, 'edit'], { replaceUrl: true });

        this.readonlyMode.set(false);
        this.readonlyVersion = null;
        this.submitError = null;
        this.validationErrors = [];
        this.form.enable({ emitEvent: false });
        this.loadExisting(draftId);
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
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
      // Durum etiketi grafikte ayrı bir haritada duruyor; forma geri taşınıyor.
      this.pushStep(step, graph?.entityStatusMap?.[step.key] ?? '');
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

      const isParallel = step['type'] === 'parallel';
      const fields = (step['fields'] ?? []) as Array<Record<string, unknown>>;
      const approveTarget = String(step['onApprove'] ?? '') || null;
      const rejectTarget = String(step['onReject'] ?? '') || null;

      if (isParallel) {
        const branches = (step['branches'] ?? []) as Array<Record<string, unknown>>;

        return {
          key,
          type: 'parallel' as const,
          name: String(step['name'] ?? ''),
          mode: (step['mode'] as 'all' | 'any') ?? 'all',
          branches: branches.map(branch => ({
            key: String(branch['key'] ?? ''),
            name: String(branch['name'] ?? ''),
            assignment: buildAssignment(branch),
            sla: buildSla(branch)
          })),
          // Paralel adımın KENDİ ataması/formu gönderilmez — doğrulayıcı bunu
          // reddediyor; görevler dallardan doğar.
          assignment: null,
          sla: null,
          form: null,
          onComplete: approveTarget,
          onAnyReject: rejectTarget,
          x: step['x'] as number | null,
          y: step['y'] as number | null
        };
      }

      const recordFields = (step['recordFields'] ?? []) as Array<Record<string, unknown>>;
      const approveLabel = String(step['approveLabel'] ?? '').trim();
      const allowReject = step['allowReject'] !== false;
      const rejectLabel = allowReject ? String(step['rejectLabel'] ?? '').trim() : '';

      // Form, serbest alan YA DA kayıt alanı/buton ayarı varsa üretilir; aksi halde
      // null kalır ve görev şeması kopyası da boş olur (eski davranış).
      const hasForm = fields.length > 0 || recordFields.length > 0
        || !!approveLabel || !!rejectLabel || !allowReject;

      return {
        key,
        type: 'approval' as const,
        name: String(step['name'] ?? ''),
        assignment: buildAssignment(step),
        sla: buildSla(step),
        form: hasForm ? {
          fields: fields.map(field => ({
            name: String(field['name'] ?? ''),
            dataType: String(field['dataType'] ?? 'string'),
            label: String(field['label'] ?? '') || null,
            isRequired: !!field['isRequired'],
            enumValues: String(field['enumValues'] ?? '') || null
          })),
          recordFields: recordFields.map(field => ({
            column: String(field['column'] ?? ''),
            isRequired: !!field['isRequired']
          })),
          approveLabel: approveLabel || null,
          rejectLabel: rejectLabel || null,
          allowReject
        } : null,
        onApprove: approveTarget,
        // Red kapalıyken hedef gönderilmez — doğrulayıcı ölü kenarı reddediyor.
        onReject: allowReject ? rejectTarget : null,
        x: step['x'] as number | null,
        y: step['y'] as number | null
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

  // ── Canvas köprüsü ────────────────────────────────────────────────────────

  /** Canvas'ta seçili adım — form sekmesine geçince odaklanan satır. */
  readonly selectedStepKey = signal<string | null>(null);

  /**
   * Canvas'ta taşınan düğümün konumu tanıma yazılır.
   *
   * emitEvent: false ile: her taşımada valueChanges tetiklenip önizleme
   * yeniden kurulsaydı sürükleme gözle görülür şekilde takılırdı. Önizleme
   * zaten bırakıştan sonra elle tazeleniyor.
   */
  onNodeMoved(event: { key: string; x: number; y: number }): void {
    const control = this.findStepControl(event.key);
    if (!control) return;

    control.patchValue({ x: Math.round(event.x), y: Math.round(event.y) }, { emitEvent: false });
    this.refreshPreview();
  }

  /**
   * Canvas'taki "Otomatik düzenle": konumlar silinir, canvas otomatik yerleşime
   * düşer. null yazılır (hesaplanan koordinat değil) — böylece sonradan eklenen
   * adımlar da aynı düzene katılır ve yerleşim kuralı değişirse tanım onu izler.
   */
  onLayoutReset(): void {
    for (const control of this.stepsArray.controls) {
      control.patchValue({ x: null, y: null }, { emitEvent: false });
    }
    this.refreshPreview();
  }

  /**
   * Canvas'ta çizilen bağlantı adımın hedefine yazılır.
   *
   * Tekil ve paralel adımda aynı iki kontrol kullanılıyor (onApprove/onReject);
   * buildGraph bunları adım tipine göre doğru alanlara ayırıyor.
   */
  onEdgeCreated(event: { from: string; to: string; port: 'approve' | 'reject' }): void {
    const control = this.findStepControl(event.from);
    if (!control) return;

    control.patchValue(
      event.port === 'approve' ? { onApprove: event.to } : { onReject: event.to });
  }

  onNodeSelected(key: string): void {
    this.selectedStepKey.set(key);
  }

  private findStepControl(key: string) {
    return this.stepsArray.controls.find(
      c => String(c.value.key ?? '').toLowerCase() === key.toLowerCase());
  }

  /** Hedef adım açılır listesi: diğer adımlar + iki terminal. */
  get stepKeys(): string[] {
    return this.stepsArray.controls.map(c => String(c.value.key ?? '')).filter(Boolean);
  }
}
