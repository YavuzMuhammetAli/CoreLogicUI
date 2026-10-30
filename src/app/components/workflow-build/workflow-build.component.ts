import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, HostListener, Injector, OnInit, PLATFORM_ID,
  afterNextRender, computed, effect, inject, signal, untracked, viewChild
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Location, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, debounceTime, distinctUntilChanged, filter, of, switchMap, tap } from 'rxjs';
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
  WorkflowIssue,
  WorkflowSimulation,
  WorkflowStep
} from '../../models/workflow.model';
import { Role } from '../../models/role';
import { AppUser } from '../../models/appUser';
import { LanguageService } from '../../services/language.service';
import { NotificationService } from '../../services/notification.service';
import { DataResponseModel } from '../../models/dataResponseModel';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HasUnsavedChanges } from '../../guards/unsaved-changes.guard';
import { markDirty } from '../../utils/change-detection';
import { ExitPort, exitsOf, sameKey } from '../../utils/workflow/workflow-exits';
import {
  NodeKind, createStep, nodeKindInfo, nodeKindOf, nodeTone
} from '../../utils/workflow/workflow-node-types';
import { SummaryLookup, assignmentSummary, stepSummary } from '../../utils/workflow/workflow-step-summary';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { IDENTITY_CAMERA } from '../shared/workflow-canvas/workflow-canvas.camera';
import {
  CanvasMenuAction, CanvasMoves, CanvasNodeMeta, CanvasSelection, WorkflowCanvasComponent
} from '../shared/workflow-canvas/workflow-canvas.component';
import { Point } from '../shared/workflow-canvas/workflow-canvas.camera';
import { WorkflowPaletteComponent } from './designer/workflow-palette.component';
import { WorkflowInspectorComponent } from './designer/workflow-inspector.component';
import { WorkflowIssuesPanelComponent } from './designer/workflow-issues-panel.component';
import { WorkflowSimulatePanelComponent } from './designer/workflow-simulate-panel.component';
import { WorkflowOverlay, simulationOverlay } from '../../utils/workflow/workflow-overlay';
import {
  IssueRow, badgeTitle, countIssues, issueRows, rowsByStep
} from './designer/workflow-issues';
import {
  commandFor, isActivationTarget, isTypingTarget
} from '../shared/workflow-canvas/workflow-canvas.keymap';
import { StepDialogResult, WorkflowStepDialogComponent } from './step-dialog/workflow-step-dialog.component';
import { WorkflowDesignerStore } from './designer/workflow-designer.store';
import { docFromDefinition, docToPayload, emptyDoc, semanticKey } from './designer/workflow-design.doc';
import {
  clearPositions,
  connect,
  disconnect,
  findStep,
  moveSteps,
  removeSteps,
  setConditions,
  setMeta,
  setStart,
  suggestKey,
  upsertStep
} from './designer/workflow-design.commands';
import { DesignClipboard, copySteps, pasteSteps } from './designer/workflow-clipboard';
import { EdgeRef, isNodeSelected, selectNodes } from './designer/workflow-selection';
import { WORKFLOW_TEMPLATES, WorkflowTemplate } from '../../utils/workflow/workflow-templates';
import { packageFileName, serializePackage, toPackage } from '../../utils/workflow/workflow-package';
import { downloadText } from '../../utils/download';
import { IconComponent } from '../shared/icon/icon.component';

type TabId = 'steps' | 'canvas' | 'trigger';

/** Bu genişliğin altında tuval yerine Adımlar sekmesi açılır (mobil kırılma noktası). */
const NARROW_SCREEN_QUERY = '(max-width: 768px)';

/**
 * Son düzenlemeden bu kadar sonra sunucuda doğrulanır. Yazarken her tuşta istek
 * atılmasın; konum değişiklikleri (sürükleme) hiç doğrulama tetiklemez.
 */
const VALIDATION_DEBOUNCE_MS = 800;

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
  selected: boolean;
  isStart: boolean;
  errors: number;
  warnings: number;
  typeKey: string;
  assignment: string;
  approveTarget: string;
  rejectTarget: string;
}

/**
 * Akış tasarım ekranı — liste ve canvas AYNI belgeyi düzenler.
 *
 * Üç sekme: Adımlar (liste), Tasarım (sürükle-bırak canvas), Tetikleyici.
 * Salt-okunur sürümde tuval şemayı gösterir (ayrı önizleme sekmesi yok).
 *
 * Kaydet ekranda kalır (taslak eksikleriyle de kaydedilir); Kaydet ve Yayınla
 * yayınlanan sürümü salt-okunur açar. Kaydedilmemiş değişiklikle ayrılırken
 * sorulur (rota guard'ı + beforeunload).
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
    imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslatePipe,
    WorkflowCanvasComponent,
    WorkflowStepDialogComponent,
    ConfirmDialogComponent,
    WorkflowPaletteComponent,
    WorkflowInspectorComponent,
    WorkflowIssuesPanelComponent,
    WorkflowSimulatePanelComponent,
    IconComponent
],
    providers: [WorkflowDesignerStore],
    templateUrl: './workflow-build.component.html',
    styleUrl: './workflow-build.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class WorkflowBuildComponent implements OnInit, HasUnsavedChanges {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly injector = inject(Injector);
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
  /** Şablon da okur: tam ekranda layout'un bildirim banner'ı katmanın altında kalıyor. */
  readonly notification = inject(NotificationService);

  readonly store = inject(WorkflowDesignerStore);

  readonly triggerEventOptions = TRIGGER_EVENT_OPTIONS;
  readonly operators = WORKFLOW_OPERATORS;

  /** Masaüstünde tuval, telefonda Adımlar açılır (tuval dokunmatikte zor; bkz. canvasMobileNotice). */
  readonly activeTab = signal<TabId>(this.initialTab());

  /** Tuvale saklı kamera yokken verilen başlangıç değeri. */
  readonly identityCamera = IDENTITY_CAMERA;

  /** "Kaydetmeden ayrıl?" sorusu açık mı; cevap bekleyen guard'ın çözücüsü. */
  readonly leaveConfirm = signal(false);
  private leaveResolver: ((leave: boolean) => void) | null = null;

  /** Açık adım pop-up'ı; kapalıyken null. */
  readonly stepDialog = signal<StepDialogState | null>(null);

  /**
   * Yayınlanmış akış düzenlenemez. Belge komutları salt-okunurken uygulanmaz;
   * canvas da taşıma ve bağlantı çizmeyi bu bayrakla kapatır.
   */
  readonly readonlyMode = this.store.readonly;

  /** Tasarım tuvali — klavye kısayolları görünüm komutlarını (sığdır, it) ona iletir. */
  private readonly canvas = viewChild(WorkflowCanvasComponent);

  /** Sayfa içi pano (kopyala/yapıştır). */
  private clipboard: DesignClipboard | null = null;

  /** Tuvalin grafiği; adım yoksa tuval boş durum gösterir. */
  readonly canvasGraph = computed<WorkflowGraph | null>(() => {
    const graph = this.store.graph();
    return graph.steps.length > 0 ? graph : null;
  });

  /** Hedef ve başlangıç adımı açılır listeleri. */
  readonly stepKeys = computed(() => this.store.graph().steps.map(step => step.key).filter(Boolean));

  readonly roles = signal<Role[]>([]);
  readonly users = signal<AppUser[]>([]);

  /**
   * Rol/kullanıcı adlarını ve çeviriyi özet fonksiyonlarına veren bağlam. Dil
   * değişince de yeniden kurulur — özet metinleri çevrilmiş parçalar içeriyor.
   */
  private readonly summaryLookup = computed<SummaryLookup>(() => {
    this.languageService.lang();
    const roles = new Map(this.roles().map(role => [role.id, role.name]));
    const users = new Map(this.users().map(user => [user.id, `${user.firstName} ${user.lastName}`]));
    return {
      roleName: id => roles.get(id) ?? null,
      userName: id => users.get(id) ?? null,
      t: (key, params) => this.languageService.t(key, params)
    };
  });

  // ── Canlı doğrulama ───────────────────────────────────────────────────────

  /** Sunucunun son doğrulama bulguları (taslak; yayınlanmış sürümde boş). */
  readonly issues = signal<WorkflowIssue[]>([]);
  readonly validating = signal(false);
  readonly issuesExpanded = signal(true);

  /** Belge yüklendi mi — yükleme bitmeden boş belgeyi doğrulayıp yalancı sorun gösterme. */
  private readonly docReady = signal(false);

  /** Doğrulamayı tetikleyen anahtar: konumsuz belge; salt-okunurda ya da yüklenmeden null. */
  private readonly validationKey = computed(() =>
    this.docReady() && !this.store.readonly() ? semanticKey(this.store.doc()) : null);

  // ── Simülasyon ────────────────────────────────────────────────────────────

  /** Simülasyon paneli açık mı (özellik panelinin yerini alır). */
  readonly simulating = signal(false);

  /** Tasarım alanı (palet + tuval + panel) tam ekranda mı. */
  readonly fullscreen = signal(false);

  /** Son simülasyonun şemadaki yolu; belge anlamca değişince silinir (eskimiş yol yanıltır). */
  readonly simOverlay = signal<WorkflowOverlay | null>(null);

  /** Simülasyona gönderilen tanım — kaydedilmemiş taslak da koşturulabilir. */
  readonly simPayload = computed(() => docToPayload(this.store.doc(), this.editingId));

  private readonly semanticDoc = computed(() => semanticKey(this.store.doc()));

  /** Sorun satırları — dil ya da adım adı değişince metinler yenilenir. */
  readonly issueRows = computed<IssueRow[]>(() => {
    this.languageService.lang();
    return issueRows(this.issues(), this.store.doc(), this.languageService);
  });

  readonly issueCounts = computed(() => countIssues(this.issueRows()));

  /** Adım başına sorunlar (anahtar küçük harfli) — rozet, liste ve özellik paneli. */
  readonly stepIssues = computed<Record<string, IssueRow[]>>(() =>
    Object.fromEntries(rowsByStep(this.issueRows())));

  /** Özellik panelinde seçili adımın sorunları. */
  readonly selectedIssues = computed<IssueRow[]>(() => {
    const selection = this.store.selection();
    if (selection.edge || selection.nodes.length !== 1) return [];
    return this.stepIssues()[selection.nodes[0].toLowerCase()] ?? [];
  });

  /** Tuval kartlarının tip etiketi, ikonu, özet satırı ve sorun rozeti (anahtar küçük harfli). */
  readonly nodeMeta = computed<Record<string, CanvasNodeMeta>>(() => {
    const lookup = this.summaryLookup();
    const byStep = this.stepIssues();
    const meta: Record<string, CanvasNodeMeta> = {};

    for (const step of this.store.graph().steps) {
      const info = nodeKindInfo(nodeKindOf(step));
      const key = step.key.toLowerCase();
      const rows = byStep[key] ?? [];
      const counts = countIssues(rows);
      meta[key] = {
        kindLabel: lookup.t(info.labelKey),
        tone: nodeTone(step),
        icon: info.icon,
        summary: stepSummary(step, lookup),
        errors: counts.errors,
        warnings: counts.warnings,
        issueTitle: badgeTitle(rows, this.languageService)
      };
    }
    return meta;
  });

  /** Adımlar sekmesinin satırları. */
  readonly rows = computed<StepRow[]>(() => {
    const lookup = this.summaryLookup();
    const graph = this.store.graph();
    const selection = this.store.selection();
    const byStep = this.stepIssues();

    return graph.steps.map(step => {
      const exits = exitsOf(step);
      const [positive, negative] = exits;
      const counts = countIssues(byStep[step.key.toLowerCase()] ?? []);
      const targets = this.exitColumns(step.type, exits, positive?.target, negative?.target);
      return {
        key: step.key,
        name: step.name,
        selected: isNodeSelected(selection, step.key),
        isStart: sameKey(graph.startStep, step.key),
        errors: counts.errors,
        warnings: counts.warnings,
        typeKey: nodeKindInfo(nodeKindOf(step)).labelKey,
        assignment: assignmentSummary(step, lookup),
        approveTarget: targets[0],
        rejectTarget: targets[1]
      };
    });
  });

  /** Başlık alanları + tetik koşulları. Değeri belgeye yazılır (bkz. pushFormToDoc). */
  form!: FormGroup;

  /** Model seçimi: değer tablo adı, görünen metin etiket (yoksa tablo adı). */
  models: Array<{ typeName: string; label: string }> = [];
  modelColumns: string[] = [];
  /** Kolonların tam meta verisi — adım pop-up'ındaki kayıt alanı seçicisi etiket/tip gösterir. */
  modelColumnMeta: PublishedColumn[] = [];

  isNew = true;
  editingId: number | null = null;
  loading = false;
  saving = false;
  loadError: string | null = null;
  submitError: string | null = null;

  /** Salt-okunur açılan sürüm (yayınlanmış/arşiv); taslakta null. */
  readonlyVersion: number | null = null;

  /** Yeni sürüm taslağının yayınlanınca alacağı numara; ilk taslakta null. */
  draftNextVersion: number | null = null;

  /**
   * Salt okunur sürümün zincirinde açık taslak var mı — varsa başlıktaki düğme
   * "Yeni Sürüm Oluştur" değil "Taslağa Git" der (sunucu yeni taslak açmaz, onu döner).
   */
  hasOpenDraft = false;

  /**
   * Taslağın sunucudaki son değişiklik damgası — kayıtta geri gönderilir; arada
   * başka biri kaydettiyse sunucu reddeder (iyimser kilit). Yeni taslakta null.
   */
  private lastModifiedOn: string | null = null;

  constructor() {
    // Tam ekrandayken sayfadan ayrılınca tarayıcı tam ekranda kalmasın.
    inject(DestroyRef).onDestroy(() => {
      if (this.fullscreen()) this.exitFullscreen();
    });

    // Başlangıç adımı belgede birçok yoldan değişir (silme, yeniden adlandırma —
    // özellik paneli dahil, geri alma); başlıktaki seçici her zaman belgeyi göstersin.
    effect(() => {
      const start = this.store.graph().startStep;
      untracked(() => {
        const control = this.form?.get('startStep');
        if (control && control.value !== start) control.setValue(start, { emitEvent: false });
      });
    });

    // Şemadaki simülasyon yolu, akış ANLAMCA değişince silinir (taşımak silmez):
    // eski yolu yeni şemanın üstünde göstermek yanıltırdı.
    let lastSemantic: string | null = null;
    effect(() => {
      const key = this.semanticDoc();
      untracked(() => {
        if (lastSemantic !== null && key !== lastSemantic) this.simOverlay.set(null);
        lastSemantic = key;
      });
    });

    // Canlı doğrulama: belge (konumlar hariç) değişip durulunca sunucuya sorulur;
    // yeni düzenleme gelirse önceki istek iptal edilir. Ağ hatasında son sonuç
    // ekranda kalır — doğrulama yardımcıdır, düzenlemeyi engellemez.
    toObservable(this.validationKey).pipe(
      debounceTime(VALIDATION_DEBOUNCE_MS),
      distinctUntilChanged(),
      tap(key => { if (key === null) this.issues.set([]); }),
      filter((key): key is string => key !== null),
      tap(() => this.validating.set(true)),
      switchMap(() => this.workflowService.validate(docToPayload(this.store.doc(), this.editingId)).pipe(
        catchError(() => of(null)))),
      takeUntilDestroyed()
    ).subscribe(res => {
      this.validating.set(false);
      if (res?.success && res.data) this.issues.set(res.data.issues ?? []);
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    if (this.isNew) this.docReady.set(true);
    this.buildForm();
    this.store.load(emptyDoc());
    this.syncFormFromDoc();

    this.loadModels();
    this.loadRoles();
    this.loadUsers();
    this.loadCapabilities();

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
    this.store.dispatch('', doc => removeSteps(doc, [key]));
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

    this.store.selection.set(selectNodes([step.key]));

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

    this.store.selection.set(selectNodes([result.step.key]));
    this.syncStartStep();
    this.stepDialog.set(null);
  }

  closeStepDialog(): void {
    this.stepDialog.set(null);
  }

  // ── Yeni düğüm (palet, "+", sağ tık, bırakma) ─────────────────────────────

  /**
   * Paletten tıklayarak ekleme: tek adım seçiliyse yeni düğüm onun ilk boş
   * çıkışına bağlanır (akışı yukarıdan aşağı kurmanın en kısa yolu); değilse
   * bağlantısız eklenir.
   */
  onPaletteAdd(kind: NodeKind): void {
    if (this.readonlyMode()) return;

    const selected = this.store.selection().nodes;
    const source = selected.length === 1 ? findStep(this.store.doc(), selected[0]) : undefined;
    const free = source ? exitsOf(source).find(exit => exit.enabled && !exit.target) : undefined;
    const from: EdgeRef | null = source && free ? { from: source.key, port: free.port } : null;

    const placement = this.canvas()?.placeNew(kind, from) ?? { at: null, pins: [] };
    this.addNode(kind, placement.at, from, placement.pins);
  }

  /**
   * Yeni düğümü ekler — konum, komşuların sabitlenmesi ve bağlantı TEK geri al
   * adımında. Varsayılan ad verilir ve düğüm seçilir; eksik atama sorun olarak
   * görünür, özellik panelinden tamamlanır.
   */
  private addNode(kind: NodeKind, at: Point | null, from: EdgeRef | null, pins: CanvasMoves): void {
    if (this.readonlyMode()) return;

    const t = (key: string, params?: Record<string, string | number>) => this.languageService.t(key, params);
    const key = suggestKey(this.store.doc());
    const step = createStep(kind, {
      key,
      name: t(nodeKindInfo(kind).defaultNameKey),
      completeLabel: t('workflow.node.taskComplete'),
      branchNames: [t('workflow.node.branchName', { n: 1 }), t('workflow.node.branchName', { n: 2 })],
      caseLabel: t('workflow.case.firstLabel'),
      subject: t('workflow.notify.defaultSubject')
    });

    this.store.dispatch('', doc => {
      let next = upsertStep(doc, null, step, '');
      if (pins.length > 0) next = moveSteps(next, pins);
      if (at) next = moveSteps(next, [{ key, x: at.x, y: at.y }]);
      if (from) next = connect(next, from.from, from.port, key);
      return next;
    });

    this.store.selection.set(selectNodes([key]));
    this.syncStartStep();
    this.canvas()?.reveal(key);
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
        if (res.success) {
          this.models = (res.data ?? []).map(m => ({ typeName: m.typeName, label: m.label?.trim() || m.typeName }));
        }
      },
      error: () => { this.models = []; }
    });
  }

  /**
   * Bu şirkette kullanılamayan düğümler paletten pasif görünür (Bekleme →
   * migrasyon 022). Okunamazsa kısıt konmaz: yayın sunucuda zaten denetleniyor.
   */
  readonly unavailableKinds = signal<ReadonlySet<NodeKind>>(new Set());

  // ── Şablonlar ve dışa aktarım ─────────────────────────────────────────────

  readonly templates = WORKFLOW_TEMPLATES;

  /**
   * Boş yeni akışı şablonla doldurur. Rol/kolon seçimleri bilerek boş gelir;
   * sorun paneli neyin tamamlanacağını gösterir. Tek geri al adımıdır.
   */
  applyTemplate(template: WorkflowTemplate): void {
    if (this.readonlyMode()) return;
    const t = (key: string) => this.languageService.t(key);
    const graph = template.build(t);

    this.store.dispatch('', doc => ({
      ...doc,
      graph,
      meta: { ...doc.meta, name: doc.meta.name || t(template.nameKey) }
    }));
    this.syncFormFromDoc();
    this.syncStartStep();
  }

  /** Ekrandaki (kaydedilmemiş değişiklikler dahil) tasarımı paket olarak indirir. */
  exportDesign(): void {
    const payload = docToPayload(this.store.doc(), this.editingId);
    downloadText(
      serializePackage(toPackage({
        name: payload.name ?? '',
        code: payload.code ?? '',
        modelName: payload.modelName ?? '',
        triggerEvent: payload.triggerEvent ?? 'manual',
        triggerConditionJson: payload.triggerConditionJson ?? null,
        isEnabled: payload.isEnabled ?? true,
        definitionJson: payload.definitionJson ?? '{}'
      })),
      packageFileName(payload.code || 'akis'));
  }

  private loadCapabilities(): void {
    this.workflowService.capabilities().subscribe({
      next: res => {
        if (res.success && res.data && !res.data.timers) this.unavailableKinds.set(new Set<NodeKind>(['timer']));
      },
      error: () => { /* kısıt yok */ }
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
        this.lastModifiedOn = workflow.lastModifiedOn ?? null;

        // Yayınlanmış akış düzenlenemez ama ŞEMASI GÖRÜNEBİLMELİ: önce doldur,
        // sonra kilitle (kilit, belge komutlarını ve formu kapatır).
        const readonly = workflow.status !== 'Draft';
        this.readonlyMode.set(readonly);
        this.populate(workflow);
        this.docReady.set(true);

        // Hata değil bilgi: kullanıcıya yolu ("Yeni Sürüm Oluştur") gösteriyoruz.
        if (readonly) this.readonlyVersion = workflow.version;
        this.resolveVersionInfo(workflow.code, workflow.id);
      },
      error: err => {
        this.loading = false;
        this.loadError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  /**
   * Sürüm zincirinden başlık bilgisi:
   * - taslakta, yayınlandığında alacağı sürüm numarası ("v3 taslağı"). Sürüm yayında
   *   verildiği için taslakta 0 durur; zincirin en yükseğinden hesaplanır, hiç yayın
   *   yoksa (ilk taslak) gösterilmez;
   * - salt okunurda, zincirde açık taslak olup olmadığı (düğme etiketi).
   */
  private resolveVersionInfo(code: string, currentId: number): void {
    this.workflowService.versions(code).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const versions = res.data ?? [];
        if (this.readonlyMode()) {
          this.hasOpenDraft = versions.some(v => v.status === 'Draft' && v.id !== currentId);
        } else {
          const max = Math.max(0, ...versions.map(v => v.version));
          this.draftNextVersion = max > 0 ? max + 1 : null;
        }
      },
      error: () => { this.draftNextVersion = null; this.hasOpenDraft = false; }
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
        this.hasOpenDraft = false;
        this.submitError = null;
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

  // ── Simülasyon ────────────────────────────────────────────────────────────

  openSimulation(): void {
    this.setTab('canvas');
    this.simulating.set(true);
  }

  closeSimulation(): void {
    this.simulating.set(false);
    this.simOverlay.set(null);
  }

  onSimulated(result: WorkflowSimulation | null): void {
    this.simOverlay.set(result ? simulationOverlay(result) : null);
  }

  // ── Tam ekran ─────────────────────────────────────────────────────────────

  toggleFullscreen(): void {
    if (this.fullscreen()) this.exitFullscreen(); else this.enterFullscreen();
  }

  /**
   * İki katman: tasarım alanı sabit konumla uygulamayı örter (her zaman), tarayıcı
   * tam ekranı da desteklenirse istenir. Tarayıcı tam ekranı tasarım kutusuna DEĞİL
   * belgenin tamamına istenir: adım pop-up'ı, onay diyalogları ve sağ tık menüsü
   * kutunun dışında render ediliyor, yalnız kutu tam ekran olsaydı görünmezlerdi.
   */
  private enterFullscreen(): void {
    this.fullscreen.set(true);
    if (!isPlatformBrowser(this.platformId) || document.fullscreenElement) return;
    // Desteklemeyen tarayıcıda (iPhone) ya da reddedilirse uygulama içi katman yeter.
    document.documentElement.requestFullscreen?.().catch(() => { /* katman yeterli */ });
  }

  exitFullscreen(): void {
    this.fullscreen.set(false);
    if (!isPlatformBrowser(this.platformId) || !document.fullscreenElement) return;
    document.exitFullscreen().catch(() => { /* zaten çıkılmış */ });
  }

  /** Esc ya da tarayıcının kendi düğmesiyle çıkıldı: katman da kapansın. */
  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.fullscreen()) this.fullscreen.set(false);
  }

  // ── Sorunlar ──────────────────────────────────────────────────────────────

  /** Başlıktaki sorun düğmesi: listeyi açar ve görünür alana getirir. */
  showIssues(): void {
    this.issuesExpanded.set(true);
    if (!isPlatformBrowser(this.platformId)) return;
    afterNextRender(() => document.getElementById('wf-issues')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), { injector: this.injector });
  }

  /**
   * Sorun satırına tıklama: ilgili adımı seçer ve tuvalde gösterir; telefonda
   * (tuval yok) adım pop-up'ını açar. Tetik sorunu Tetikleyici sekmesine götürür.
   */
  pickIssue(row: IssueRow): void {
    if (row.target === 'trigger') {
      this.setTab('trigger');
      return;
    }

    const step = row.stepKey ? findStep(this.store.doc(), row.stepKey) : undefined;
    if (!step) return;

    this.store.selection.set(selectNodes([step.key]));
    if (this.isNarrowScreen()) {
      this.openStep(step.key);
      return;
    }

    this.setTab('canvas');
    afterNextRender(() => this.canvas()?.reveal(step.key, false), { injector: this.injector });
  }

  private isNarrowScreen(): boolean {
    return isPlatformBrowser(this.platformId)
      && typeof window.matchMedia === 'function'
      && window.matchMedia(NARROW_SCREEN_QUERY).matches;
  }

  /**
   * Kaydeder ve EKRANDA KALIR. Yayınla seçiliyse ardından yayınlar ve yayınlanan
   * sürüm salt-okunur açılır. Taslak eksikleriyle de kaydedilir; eksikler yayında
   * engellenir.
   */
  onSubmit(publish: boolean): void {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.submitError = null;

    // Gönderilen belge: yanıt gelene kadar yapılan düzenlemeler "kaydedildi" sayılmasın.
    const sent = this.store.doc();
    const payload: Partial<WorkflowDefinition> = {
      ...docToPayload(sent, this.editingId),
      expectedLastModifiedOn: this.lastModifiedOn
    };

    // define() yeni ID'yi, update() yeni damgayı döner.
    const request: Observable<DataResponseModel<number | string>> = this.editingId
      ? this.workflowService.update(payload)
      : this.workflowService.define(payload);

    request.pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.saving = false;
          this.submitError = res.message ?? this.languageService.t('workflow.build.saveFailed');
          return;
        }

        this.store.markSaved(sent);
        if (this.editingId) {
          this.lastModifiedOn = typeof res.data === 'string' && res.data ? res.data : this.lastModifiedOn;
        } else {
          this.adoptNewDraft(Number(res.data));
        }

        if (publish && this.editingId) {
          this.publishThen(this.editingId);
        } else {
          this.saving = false;
          this.notification.success(res.message ?? '');
        }
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  /**
   * Yeni taslak kaydedildi: ekran düzenleme moduna geçer. Aksi halde ikinci
   * Kaydet define()'ı yeniden çağırır ve aynı kodla ikinci taslak açmaya çalışırdı.
   * define() damga dönmediği için sonraki kaydın iyimser kilidi için okunur.
   */
  private adoptNewDraft(id: number): void {
    if (!id) return;
    this.editingId = id;
    this.isNew = false;
    this.location.replaceState(`/workflows/${id}/edit`);

    this.workflowService.get(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success && res.data && this.editingId === id) {
          this.lastModifiedOn = res.data.lastModifiedOn ?? null;
        }
      },
      error: () => { /* damga okunamazsa sonraki kayıt kilitsiz gider; kayıt yine olur */ }
    });
  }

  private publishThen(id: number): void {
    this.workflowService.publish(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (!res.success) {
          // Taslak kaydedildi ama yayın reddedildi (eksikler): ekranda düzenlemeye devam.
          this.submitError = res.message ?? this.languageService.t('workflow.build.saveFailed');
          return;
        }

        this.notification.success(res.message ?? '');
        // Yayınlanan sürüm salt-okunur açılır — listeye atmak, kullanıcıya az önce
        // yayınladığı şemayı göstermemek olurdu.
        this.draftNextVersion = null;
        this.loadExisting(id);
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  // ── Ayrılma ───────────────────────────────────────────────────────────────

  /** Rota guard'ı sorar: kaydedilmemiş değişiklik varsa kullanıcıya onaylatılır. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.store.dirty()) return true;

    // Önceki soru cevapsız kaldıysa (art arda iki gezinme) o "kal" sayılır.
    this.leaveResolver?.(false);
    return new Promise<boolean>(resolve => {
      this.leaveResolver = resolve;
      this.leaveConfirm.set(true);
      this.cdr.markForCheck();
    });
  }

  resolveLeave(leave: boolean): void {
    this.leaveConfirm.set(false);
    const resolve = this.leaveResolver;
    this.leaveResolver = null;
    resolve?.(leave);
  }

  /** Sekme kapatma / yenileme rota guard'ına uğramaz; tarayıcının kendi uyarısı istenir. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.store.dirty()) return;
    event.preventDefault();
    // Eski tarayıcılar uyarıyı yalnız returnValue doluysa gösterir.
    event.returnValue = '';
  }

  private initialTab(): TabId {
    if (!isPlatformBrowser(this.platformId) || typeof window.matchMedia !== 'function') return 'steps';
    return window.matchMedia(NARROW_SCREEN_QUERY).matches ? 'steps' : 'canvas';
  }

  setTab(tab: TabId): void {
    // Tasarım alanı yalnız tuval sekmesinde çizilir; katman kaybolurken tarayıcı
    // tam ekranı açık kalmasın.
    if (tab !== 'canvas' && this.fullscreen()) this.exitFullscreen();
    this.activeTab.set(tab);
  }

  // ── Canvas köprüsü ────────────────────────────────────────────────────────

  /** Canvas'ta taşınan düğümlerin konumları belgeye yazılır (bırakışta, tek geri al adımı). */
  onNodesMoved(moves: Array<{ key: string; x: number; y: number }>): void {
    this.store.dispatch(this.moveReason, doc => moveSteps(doc, moves));
  }

  /**
   * Taşımanın geçmiş nedeni. Sürükleme bırakışı tek adımdır (''); ok tuşuyla
   * itmeler 'nudge' ile birleşir — basılı tutulan ok onlarca geri al adımı
   * bırakmasın. Tuvalin output'u senkron yayıldığı için alan bayrağı yeterli.
   */
  private moveReason = '';

  private nudge(direction: 'left' | 'right' | 'up' | 'down', large: boolean): void {
    this.moveReason = 'nudge';
    try {
      this.canvas()?.nudge(direction, large);
    } finally {
      this.moveReason = '';
    }
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
  /** Porttan çizilen bağlantı — port kimliği tuvalden gelir (koşulun her durumu ayrı porttur). */
  onEdgeCreated(event: { from: string; to: string; exitPort: ExitPort }): void {
    this.store.dispatch('', doc => connect(doc, event.from, event.exitPort, event.to));
  }

  /**
   * Adım listesinin "onaylanırsa / reddedilirse" sütunları. Koşulda tüm yollar
   * tek sütunda ("Evet → finans · Diğer → son"), Bitiş'te çıkış yok.
   */
  private exitColumns(
    type: string, exits: ReturnType<typeof exitsOf>, approve?: string | null, reject?: string | null
  ): [string, string] {
    const t = (key: string) => this.languageService.t(key);
    if (type === 'end') return ['—', '—'];
    if (type === 'action' || type === 'notify' || type === 'timer') return [exits[0]?.target || '—', '—'];
    if (type === 'condition') {
      const paths = exits.map(e => `${e.label ?? t('workflow.canvas.edgeDefault')} → ${e.target ?? '—'}`);
      return [paths.join(' · '), '—'];
    }
    return [approve || t('workflow.build.terminalCompleted'), reject || t('workflow.build.terminalRejected')];
  }

  /** Pop-up'ın hedef seçicisi için adım adları (tip: bildirimin görevli seçimi). */
  readonly stepOptions = computed(() =>
    this.store.graph().steps.map(step => ({ key: step.key, name: step.name, type: step.type })));

  onSelectionChange(selection: CanvasSelection): void {
    this.store.selection.set(selection);
  }

  /** Sağ tık menüsünden gelen, belgeyi ilgilendiren işlemler. */
  onMenuAction(action: CanvasMenuAction): void {
    switch (action.type) {
      case 'open':      this.openStep(action.key); break;
      case 'setStart':  this.makeStart(action.key); break;
      case 'duplicate': this.duplicateSelection(); break;
      case 'delete':    this.deleteSelection(); break;
      case 'selectAll': this.selectAll(); break;
      case 'addNode':   this.addNode(action.kind, action.at, action.from, action.pins); break;
    }
  }

  // ── Düzenleme komutları (menü + klavye) ───────────────────────────────────

  undo(): void {
    this.store.undo();
    this.syncFormFromDoc();
  }

  redo(): void {
    this.store.redo();
    this.syncFormFromDoc();
  }

  makeStart(key: string): void {
    this.store.dispatch('', doc => setStart(doc, findStep(doc, key)?.key ?? doc.graph.startStep));
    this.syncStartStep();
  }

  /**
   * Seçimi siler: kenar seçiliyse bağlantı kaldırılır (çıkış terminale düşer),
   * düğümler seçiliyse adımlar silinir. Onay sorulmaz — Ctrl+Z geri alır ve
   * bildirim bunu söyler (geri alınabilir işlemde diyalog gereksiz bir adımdır).
   */
  deleteSelection(): void {
    if (this.readonlyMode()) return;
    const selection = this.store.selection();

    if (selection.edge) {
      const edge = selection.edge;
      this.store.dispatch('', doc => disconnect(doc, edge.from, edge.port));
      this.store.selection.set(selectNodes([]));
      this.notification.success(this.languageService.t('workflow.build.edgeRemoved'));
      return;
    }

    if (selection.nodes.length === 0) return;

    const count = selection.nodes.length;
    this.store.dispatch('', doc => removeSteps(doc, selection.nodes));
    this.syncStartStep();
    this.notification.success(this.languageService.t('workflow.build.stepsDeleted', { n: count }));
  }

  copySelection(): void {
    this.clipboard = copySteps(this.store.doc(), this.store.selection().nodes) ?? this.clipboard;
  }

  paste(): void {
    if (this.readonlyMode() || !this.clipboard) return;
    this.insertCopies(this.clipboard, true);
  }

  duplicateSelection(): void {
    if (this.readonlyMode()) return;
    const clip = copySteps(this.store.doc(), this.store.selection().nodes);
    if (clip) this.insertCopies(clip, false);
  }

  /** Panodaki adımları ekler ve kopyaları seçer. */
  private insertCopies(clipboard: DesignClipboard, announce: boolean): void {
    let pasted: string[] = [];
    this.store.dispatch('', doc => {
      const result = pasteSteps(doc, clipboard);
      pasted = result.keys;
      return result.doc;
    });

    if (pasted.length === 0) return;
    this.store.selection.set(selectNodes(pasted));
    this.syncStartStep();
    if (announce) {
      this.notification.success(this.languageService.t('workflow.build.pasted', { n: pasted.length }));
    }
  }

  selectAll(): void {
    this.store.selection.set(selectNodes(this.store.graph().steps.map(step => step.key)));
  }

  /**
   * Tasarımcı klavye kısayolları. Yazı alanındayken ya da adım pop-up'ı açıkken
   * hiçbiri çalışmaz (orada Ctrl+Z metni geri alır). Geri al/yinele her sekmede,
   * diğerleri yalnız Tasarım sekmesinde.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.stepDialog() || this.leaveConfirm() || isTypingTarget(event.target)) return;

    const action = commandFor(event);
    if (!action) return;

    if (action.command === 'undo' || action.command === 'redo') {
      event.preventDefault();
      if (action.command === 'undo') this.undo(); else this.redo();
      return;
    }

    if (this.activeTab() !== 'canvas') return;
    const canvas = this.canvas();

    // Yapacak işi olmayan komut tarayıcıya bırakılır: seçim yokken oklar sayfayı
    // kaydırsın, Ctrl+C sayfadaki seçili metni kopyalasın.
    const hasNodes = this.store.selection().nodes.length > 0;
    if (action.command.startsWith('nudge') && !hasNodes) return;
    if ((action.command === 'copy' || action.command === 'duplicate') && !hasNodes) return;
    if (action.command === 'paste' && !this.clipboard) return;

    switch (action.command) {
      case 'delete':     this.deleteSelection(); break;
      case 'copy':       this.copySelection(); break;
      case 'paste':      this.paste(); break;
      case 'duplicate':  this.duplicateSelection(); break;
      case 'selectAll':  this.selectAll(); break;
      case 'escape': {
        // Önce seçim ve menü kapanır, sonra tam ekran. Tarayıcı tam ekranında Esc'i
        // tarayıcı yakalar; bu yol tam ekran API'si olmayan tarayıcılar için.
        const selection = this.store.selection();
        const idle = selection.nodes.length === 0 && !selection.edge && !canvas?.menu();
        if (idle && this.fullscreen()) {
          this.exitFullscreen();
          break;
        }
        this.store.selection.set(selectNodes([]));
        canvas?.closeMenu();
        break;
      }
      case 'open': {
        if (isActivationTarget(event.target)) return;
        const key = this.store.selection().nodes[0];
        if (key) this.openStep(key);
        break;
      }
      case 'fit':        canvas?.fitToScreen(); break;
      case 'zoomIn':     canvas?.zoomIn(); break;
      case 'zoomOut':    canvas?.zoomOut(); break;
      case 'nudgeLeft':  this.nudge('left', action.large); break;
      case 'nudgeRight': this.nudge('right', action.large); break;
      case 'nudgeUp':    this.nudge('up', action.large); break;
      case 'nudgeDown':  this.nudge('down', action.large); break;
      default: return;
    }

    event.preventDefault();
  }
}
