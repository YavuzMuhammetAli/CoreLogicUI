import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, computed, inject, signal
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
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
  WorkflowStep
} from '../../models/workflow.model';
import { Role } from '../../models/role';
import { AppUser } from '../../models/appUser';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { ResponseModel } from '../../models/responseModel';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { exitForKind, exitsOf, sameKey } from '../../utils/workflow/workflow-exits';
import { WorkflowGraphComponent } from '../shared/workflow-graph/workflow-graph.component';
import { WorkflowCanvasComponent } from '../shared/workflow-canvas/workflow-canvas.component';
import { StepDialogResult, WorkflowStepDialogComponent } from './step-dialog/workflow-step-dialog.component';
import { WorkflowDesignerStore } from './designer/workflow-designer.store';
import { docFromDefinition, docToPayload, emptyDoc } from './designer/workflow-design.doc';
import {
  clearPositions,
  connect,
  findStep,
  moveStep,
  removeStep,
  setConditions,
  setMeta,
  setStart,
  suggestKey,
  upsertStep
} from './designer/workflow-design.commands';

type TabId = 'steps' | 'canvas' | 'trigger' | 'preview';

/** Açık adım pop-up'ı: düzenlenen adım (yenide null), durum etiketi ve önerilen anahtar. */
interface StepDialogState {
  step: WorkflowStep | null;
  statusLabel: string;
  newKey: string;
}

/** Adımlar sekmesindeki bir satır — şablonda metot çağrısı yapılmasın diye önceden hesaplanır. */
interface StepRow {
  key: string;
  name: string;
  isStart: boolean;
  typeKey: string;
  assignment: string;
  approveTarget: string;
  rejectTarget: string;
}

/**
 * Akış tasarım ekranı — liste ve canvas AYNI belgeyi düzenler.
 *
 * Dört sekme: Adımlar (liste), Tasarım (sürükle-bırak canvas), Tetikleyici,
 * Önizleme (salt-okunur şema).
 *
 * Doğruluk kaynağı tasarım belgesidir (WorkflowDesignerStore). Belge yalnız saf
 * komutlarla değişir (designer/workflow-design.commands.ts) ve her değişiklik
 * geri al geçmişine yazılır. Reactive Forms yalnız iki yerde kalır: başlık
 * alanları + tetik koşulları (bu formun değeri belgeye yazılır) ve adım pop-up'ı
 * (kaydedince adım nesnesine çevrilir).
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
  providers: [WorkflowDesignerStore],
  templateUrl: './workflow-build.component.html',
  styleUrl: './workflow-build.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowBuildComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly workflowService = inject(WorkflowService);
  private readonly publishedModelService = inject(PublishedModelService);
  private readonly roleService = inject(RoleAdminService);
  private readonly userService = inject(UserAdminService);
  private readonly languageService = inject(LanguageService);
  private readonly notification = inject(NotificationService);

  readonly store = inject(WorkflowDesignerStore);

  readonly triggerEventOptions = TRIGGER_EVENT_OPTIONS;
  readonly operators = WORKFLOW_OPERATORS;

  readonly activeTab = signal<TabId>('steps');

  /** Açık adım pop-up'ı; kapalıyken null. */
  readonly stepDialog = signal<StepDialogState | null>(null);

  /**
   * Yayınlanmış akış düzenlenemez. Belge komutları salt-okunurken uygulanmaz;
   * canvas da taşıma ve bağlantı çizmeyi bu bayrakla kapatır.
   */
  readonly readonlyMode = this.store.readonly;

  /** Canvas'ta seçili adım — liste satırı da vurgulanır. */
  readonly selectedStepKey = this.store.selectedKey;

  /** Canvas ve önizleme grafiği; adım yoksa boş durum gösterilir. */
  readonly previewGraph = computed<WorkflowGraph | null>(() => {
    const graph = this.store.graph();
    return graph.steps.length > 0 ? graph : null;
  });

  /** Hedef ve başlangıç adımı açılır listeleri. */
  readonly stepKeys = computed(() => this.store.graph().steps.map(step => step.key).filter(Boolean));

  readonly roles = signal<Role[]>([]);
  readonly users = signal<AppUser[]>([]);

  /** Adımlar sekmesinin satırları. */
  readonly rows = computed<StepRow[]>(() => {
    // Dil değişince satır metinleri (atama özeti, terminal etiketleri) yenilensin.
    this.languageService.lang();
    const graph = this.store.graph();
    const roles = this.roles();
    const users = this.users();

    return graph.steps.map(step => {
      const [positive, negative] = exitsOf(step);
      return {
        key: step.key,
        name: step.name,
        isStart: sameKey(graph.startStep, step.key),
        typeKey: step.type === 'parallel' ? 'workflow.build.typeParallel' : 'workflow.build.typeApproval',
        assignment: this.assignmentSummary(step, roles, users),
        approveTarget: positive?.target || this.languageService.t('workflow.build.terminalCompleted'),
        rejectTarget: negative?.target || this.languageService.t('workflow.build.terminalRejected')
      };
    });
  });

  /** Başlık alanları + tetik koşulları. Değeri belgeye yazılır (bkz. pushFormToDoc). */
  form!: FormGroup;

  models: string[] = [];
  modelColumns: string[] = [];
  /** Kolonların tam meta verisi — adım pop-up'ındaki kayıt alanı seçicisi etiket/tip gösterir. */
  modelColumnMeta: PublishedColumn[] = [];

  isNew = true;
  editingId: number | null = null;
  loading = false;
  saving = false;
  loadError: string | null = null;
  submitError: string | null = null;
  validationErrors: string[] = [];

  /** Salt-okunur açılan sürüm (yayınlanmış/arşiv); taslakta null. */
  readonlyVersion: number | null = null;

  /** Yeni sürüm taslağının yayınlanınca alacağı numara; ilk taslakta null. */
  draftNextVersion: number | null = null;

  ngOnInit(): void {
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    this.buildForm();
    this.store.load(emptyDoc());
    this.syncFormFromDoc();

    this.loadModels();
    this.loadRoles();
    this.loadUsers();

    if (!this.isNew) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (id) this.loadExisting(id);
    }

    // Başlık alanları ve koşullar belgeye yazılır. Programatik yazımlar
    // (yükleme, geri alma) emitEvent:false ile yapıldığı için döngü oluşmaz.
    this.form.valueChanges.subscribe(() => this.pushFormToDoc());
  }

  private buildForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      code: ['', [Validators.required, Validators.pattern(/^[A-Za-z][A-Za-z0-9_]*$/)]],
      modelName: ['', Validators.required],
      triggerEvent: ['onCreate', Validators.required],
      isEnabled: [true],
      startStep: [''],
      conditions: this.fb.array([])
    });
  }

  get conditionsArray(): FormArray {
    return this.form.get('conditions') as FormArray;
  }

  // ── Form ↔ belge ──────────────────────────────────────────────────────────

  /**
   * Başlık formunun değerini belgeye yazar. Aynı sebep ('form') ile kısa
   * aralıkla gelen yazımlar tek geri al adımında birleşir — her harf ayrı
   * adım olmaz.
   */
  private pushFormToDoc(): void {
    const raw = this.form.getRawValue();
    const conditions = ((raw.conditions ?? []) as WorkflowCondition[]).map(condition => ({
      field: condition.field ?? '',
      operator: condition.operator ?? 'eq',
      value: condition.value ?? ''
    }));

    this.store.dispatch('form', doc => {
      let next = setMeta(doc, {
        name: raw.name ?? '',
        code: raw.code ?? '',
        modelName: raw.modelName ?? '',
        triggerEvent: raw.triggerEvent,
        isEnabled: !!raw.isEnabled
      });
      next = setStart(next, String(raw.startStep ?? ''));
      return setConditions(next, conditions);
    });
  }

  /** Belgeyi forma yazar (yükleme, geri alma). Olay üretmez. */
  private syncFormFromDoc(): void {
    const doc = this.store.doc();

    this.form.patchValue({
      name: doc.meta.name,
      code: doc.meta.code,
      modelName: doc.meta.modelName,
      triggerEvent: doc.meta.triggerEvent,
      isEnabled: doc.meta.isEnabled,
      startStep: doc.graph.startStep
    }, { emitEvent: false });

    this.conditionsArray.clear({ emitEvent: false });
    for (const condition of doc.conditions) {
      this.conditionsArray.push(this.newConditionGroup(condition), { emitEvent: false });
    }

    if (this.readonlyMode()) this.form.disable({ emitEvent: false });
  }

  /** Adım komutları başlangıç adımını değiştirebilir (ekleme, yeniden adlandırma, silme). */
  private syncStartStep(): void {
    this.form.patchValue({ startStep: this.store.graph().startStep }, { emitEvent: false });
  }

  // ── Adımlar ───────────────────────────────────────────────────────────────

  removeStep(key: string): void {
    this.store.dispatch('', doc => removeStep(doc, key));
    if (sameKey(this.selectedStepKey(), key)) this.selectedStepKey.set(null);
    this.syncStartStep();
  }

  // ── Adım pop-up'ı ─────────────────────────────────────────────────────────

  /** Yeni adım için pop-up'ı açar. */
  openNewStep(): void {
    if (this.readonlyMode()) return;
    this.stepDialog.set({ step: null, statusLabel: '', newKey: suggestKey(this.store.doc()) });
  }

  /**
   * Var olan adımı pop-up'ta açar (listeden satır tıklaması, canvas'tan çift
   * tıklama). Pop-up adımın KOPYASIYLA çalışır; kaydedilene kadar belge değişmez.
   */
  openStep(key: string): void {
    const doc = this.store.doc();
    const step = findStep(doc, key);
    if (!step) return;

    const labelKey = Object.keys(doc.graph.entityStatusMap).find(k => sameKey(k, step.key));
    this.stepDialog.set({
      step,
      statusLabel: labelKey ? doc.graph.entityStatusMap[labelKey] : '',
      newKey: ''
    });
  }

  /** Pop-up sonucu belgeye yazılır: düzenlemede yerine konur, yeni adımda eklenir. */
  onStepSaved(result: StepDialogResult): void {
    this.store.dispatch('', doc =>
      upsertStep(doc, result.originalKey || null, result.step, result.statusLabel));

    this.selectedStepKey.set(result.step.key);
    this.syncStartStep();
    this.stepDialog.set(null);
  }

  closeStepDialog(): void {
    this.stepDialog.set(null);
  }

  // ── Adım listesi özetleri ─────────────────────────────────────────────────

  /** Atama sütunu: rol adı, kullanıcı adı, "kaydı oluşturana" ya da dal sayısı. */
  private assignmentSummary(step: WorkflowStep, roles: Role[], users: AppUser[]): string {
    if (step.type === 'parallel') {
      return this.languageService.t('workflow.build.branchCount', { n: (step.branches ?? []).length });
    }

    switch (step.assignment?.mode) {
      case 'role': {
        const role = roles.find(r => r.id === Number(step.assignment?.roleId));
        return role?.name ?? '—';
      }
      case 'user': {
        const user = users.find(u => u.id === Number(step.assignment?.userId));
        return user ? `${user.firstName} ${user.lastName}` : '—';
      }
      case 'creator':
        return this.languageService.t('workflow.assign.creator');
      default:
        return '—';
    }
  }

  // ── Koşul satırları ───────────────────────────────────────────────────────

  private newConditionGroup(condition?: WorkflowCondition): FormGroup {
    return this.fb.group({
      field: [condition?.field ?? '', Validators.required],
      operator: [condition?.operator ?? 'eq'],
      value: [condition?.value ?? '']
    });
  }

  addCondition(): void {
    this.conditionsArray.push(this.newConditionGroup());
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
        if (res.success) this.roles.set(res.data ?? []);
      },
      error: () => { this.roles.set([]); }
    });
  }

  /** Kullanıcıya atama seçicisi için şirket kullanıcıları (yalnız aktifler). */
  private loadUsers(): void {
    this.userService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) this.users.set((res.data ?? []).filter(u => u.status));
      },
      error: () => { this.users.set([]); }
    });
  }

  /**
   * Seçili modelin kolonları — koşul alanı açılır listesini besler. Model adı
   * formdan okunur: şablondaki (change) ile formun belgeye yazımı arasında sıra
   * varsayımı yapılmasın.
   */
  onModelChange(): void {
    const modelName = String(this.form.getRawValue().modelName ?? '');
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

        // Yayınlanmış akış düzenlenemez ama ŞEMASI GÖRÜNEBİLMELİ: önce doldur,
        // sonra kilitle (kilit, belge komutlarını ve formu kapatır).
        const readonly = workflow.status !== 'Draft';
        this.readonlyMode.set(readonly);
        this.populate(workflow);

        if (readonly) {
          // Hata değil bilgi: kullanıcıya yolu ("Yeni Sürüm Oluştur") gösteriyoruz.
          this.readonlyVersion = workflow.version;
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
    this.store.load(docFromDefinition(workflow));
    this.syncFormFromDoc();
    this.onModelChange();
  }

  // ── Gönderim ──────────────────────────────────────────────────────────────

  private buildPayload(): Partial<WorkflowDefinition> {
    return docToPayload(this.store.doc(), this.editingId);
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

    // define() DataResponseModel<number>, update() DataResponseModel<string> döner;
    // ortak abonelik için ResponseModel'e genişletiliyor (report-build ile aynı desen).
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

        this.store.markSaved();
        const newId = this.editingId ?? (res as { data?: number }).data ?? 0;

        // Yeni akış artık kayıtlı: ekran düzenleme moduna geçer. Aksi halde yayın
        // düşüp kullanıcı tekrar bastığında define() yeniden çağrılır ve aynı
        // kodla ikinci bir taslak açılmaya çalışılırdı (taslak artık eksikleriyle
        // de kaydedildiği için bu yol gerçekten koşuyor).
        if (!this.editingId && newId) {
          this.editingId = newId;
          this.isNew = false;
          this.location.replaceState(`/workflows/${newId}/edit`);
        }

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

  /** Canvas'ta taşınan düğümün konumu belgeye yazılır (bırakışta, tek geri al adımı). */
  onNodeMoved(event: { key: string; x: number; y: number }): void {
    this.store.dispatch('', doc => moveStep(doc, event.key, event.x, event.y));
  }

  /**
   * Canvas'taki "Otomatik düzenle": konumlar silinir, canvas otomatik yerleşime
   * düşer. null yazılır (hesaplanan koordinat değil) — böylece sonradan eklenen
   * adımlar da aynı düzene katılır ve yerleşim kuralı değişirse tanım onu izler.
   */
  onLayoutReset(): void {
    this.store.dispatch('', clearPositions);
  }

  /**
   * Canvas'ta çizilen bağlantı adımın çıkışına yazılır. Canvas port türünü
   * (olumlu/olumsuz) bildirir; adımın gerçek çıkışı (onay/red ya da
   * tamamlanma/herhangi biri reddederse) tip kataloğundan çözülür.
   */
  onEdgeCreated(event: { from: string; to: string; port: 'approve' | 'reject' }): void {
    this.store.dispatch('', doc => {
      const source = findStep(doc, event.from);
      const exit = source ? exitForKind(source, event.port) : undefined;
      return exit ? connect(doc, event.from, exit.port, event.to) : doc;
    });
  }

  onNodeSelected(key: string): void {
    this.selectedStepKey.set(key);
  }
}
