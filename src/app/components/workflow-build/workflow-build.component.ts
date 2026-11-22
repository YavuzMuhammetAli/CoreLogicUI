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

/** Below this width the Steps tab opens instead of the canvas (mobile breakpoint). */
const NARROW_SCREEN_QUERY = '(max-width: 768px)';

/**
 * Validated on the server this long after the last edit. No request on every
 * keystroke while typing; position changes (dragging) never trigger validation.
 */
const VALIDATION_DEBOUNCE_MS = 800;

/** Open step pop-up: the edited step (null for a new one), status label and suggested key. */
interface StepDialogState {
  step: WorkflowStep | null;
  statusLabel: string;
  newKey: string;
}

/** A row in the Steps tab — precomputed so the template does not call methods. */
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
 * Flow design screen — the list and the canvas edit the SAME document.
 *
 * Three tabs: Steps (list), Design (drag-and-drop canvas), Trigger.
 * In a read-only version the canvas shows the diagram (no separate preview tab).
 *
 * Save stays on the screen (a draft is saved with its gaps too); Save and Publish
 * opens the published version read-only. Leaving with unsaved changes
 * asks for confirmation (route guard + beforeunload).
 *
 * The source of truth is the design document (WorkflowDesignerStore). The document only changes
 * through pure commands (designer/workflow-design.commands.ts) and every change
 * is written to undo history. Reactive Forms remain in only two places: the header
 * fields + trigger conditions (this form's value is written to the document) and the step pop-up
 * (converted to a step object on save).
 *
 * The project has NO CDK, drag-drop or diagram library — the canvas is written with native Pointer
 * Events (the drag pattern of dashboard-build).
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
  /** Read by the template too: in full screen the layout's notification banner stays beneath the layer. */
  readonly notification = inject(NotificationService);

  readonly store = inject(WorkflowDesignerStore);

  readonly triggerEventOptions = TRIGGER_EVENT_OPTIONS;
  readonly operators = WORKFLOW_OPERATORS;

  /** Canvas opens on desktop, Steps on phones (the canvas is hard on touch; see canvasMobileNotice). */
  readonly activeTab = signal<TabId>(this.initialTab());

  /** Initial value given when the canvas has no stored camera. */
  readonly identityCamera = IDENTITY_CAMERA;

  /** Is the "Kaydetmeden ayrıl?" (Leave without saving?) question open; resolver of the guard waiting for the answer. */
  readonly leaveConfirm = signal(false);
  private leaveResolver: ((leave: boolean) => void) | null = null;

  /** Open step pop-up; null when closed. */
  readonly stepDialog = signal<StepDialogState | null>(null);

  /**
   * A published flow cannot be edited. Document commands are not applied while read-only;
   * the canvas also disables moving and drawing connections with this flag.
   */
  readonly readonlyMode = this.store.readonly;

  /** Design canvas — keyboard shortcuts forward view commands (fit, nudge) to it. */
  private readonly canvas = viewChild(WorkflowCanvasComponent);

  /** In-page clipboard (copy/paste). */
  private clipboard: DesignClipboard | null = null;

  /** The canvas graph; with no steps the canvas shows an empty state. */
  readonly canvasGraph = computed<WorkflowGraph | null>(() => {
    const graph = this.store.graph();
    return graph.steps.length > 0 ? graph : null;
  });

  /** Target and start step dropdowns. */
  readonly stepKeys = computed(() => this.store.graph().steps.map(step => step.key).filter(Boolean));

  readonly roles = signal<Role[]>([]);
  readonly users = signal<AppUser[]>([]);

  /**
   * Context that passes role/user names and the translation to the summary functions. Also
   * rebuilt when the language changes — the summary texts contain translated parts.
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

  // ── Live validation ───────────────────────────────────────────────────────

  /** The server's latest validation findings (draft; empty in a published version). */
  readonly issues = signal<WorkflowIssue[]>([]);
  readonly validating = signal(false);
  readonly issuesExpanded = signal(true);

  /** Is the document loaded — don't validate the empty document before loading finishes and show false issues. */
  private readonly docReady = signal(false);

  /** Key that triggers validation: the position-free document; null when read-only or not loaded. */
  private readonly validationKey = computed(() =>
    this.docReady() && !this.store.readonly() ? semanticKey(this.store.doc()) : null);

  // ── Simulation ────────────────────────────────────────────────────────────

  /** Is the simulation panel open (takes the place of the inspector panel). */
  readonly simulating = signal(false);

  /** Is the design area (palette + canvas + panel) in full screen. */
  readonly fullscreen = signal(false);

  /** Path of the last simulation on the diagram; deleted when the document changes in meaning (a stale path misleads). */
  readonly simOverlay = signal<WorkflowOverlay | null>(null);

  /** Definition sent to the simulation — an unsaved draft can be run too. */
  readonly simPayload = computed(() => docToPayload(this.store.doc(), this.editingId));

  private readonly semanticDoc = computed(() => semanticKey(this.store.doc()));

  /** Issue rows — texts refresh when the language or a step name changes. */
  readonly issueRows = computed<IssueRow[]>(() => {
    this.languageService.lang();
    return issueRows(this.issues(), this.store.doc(), this.languageService);
  });

  readonly issueCounts = computed(() => countIssues(this.issueRows()));

  /** Issues per step (lower-case key) — badge, list and inspector panel. */
  readonly stepIssues = computed<Record<string, IssueRow[]>>(() =>
    Object.fromEntries(rowsByStep(this.issueRows())));

  /** Issues of the selected step in the inspector panel. */
  readonly selectedIssues = computed<IssueRow[]>(() => {
    const selection = this.store.selection();
    if (selection.edge || selection.nodes.length !== 1) return [];
    return this.stepIssues()[selection.nodes[0].toLowerCase()] ?? [];
  });

  /** Type label, icon, summary line and issue badge of the canvas cards (lower-case key). */
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

  /** Rows of the Steps tab. */
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

  /** Header fields + trigger conditions. Its value is written to the document (see pushFormToDoc). */
  form!: FormGroup;

  /** Model selection: value is the table name, display text is the label (table name if none). */
  models: Array<{ typeName: string; label: string }> = [];
  modelColumns: string[] = [];
  /** Full metadata of the columns — the record field picker in the step pop-up shows label/type. */
  modelColumnMeta: PublishedColumn[] = [];

  isNew = true;
  editingId: number | null = null;
  loading = false;
  saving = false;
  loadError: string | null = null;
  submitError: string | null = null;

  /** Version opened read-only (published/archived); null for a draft. */
  readonlyVersion: number | null = null;

  /** Number the new version draft will get when published; null for the first draft. */
  draftNextVersion: number | null = null;

  /**
   * Is there an open draft in the read-only version's chain — if so the header button
   * says "Taslağa Git" (Go to draft), not "Yeni Sürüm Oluştur" (Create new version) (the server does not open a new draft, it returns that one).
   */
  hasOpenDraft = false;

  /**
   * The draft's last-modified stamp on the server — sent back on save; if someone
   * else saved in between the server rejects it (optimistic lock). null for a new draft.
   */
  private lastModifiedOn: string | null = null;

  constructor() {
    // When leaving the page while in full screen, the browser should not stay in full screen.
    inject(DestroyRef).onDestroy(() => {
      if (this.fullscreen()) this.exitFullscreen();
    });

    // The start step changes in the document in many ways (delete, rename —
    // including the inspector panel, undo); the header picker should always reflect the document.
    effect(() => {
      const start = this.store.graph().startStep;
      untracked(() => {
        const control = this.form?.get('startStep');
        if (control && control.value !== start) control.setValue(start, { emitEvent: false });
      });
    });

    // The simulation path on the diagram is deleted when the flow changes IN MEANING (moving does not delete it):
    // showing the old path on top of the new diagram would mislead.
    let lastSemantic: string | null = null;
    effect(() => {
      const key = this.semanticDoc();
      untracked(() => {
        if (lastSemantic !== null && key !== lastSemantic) this.simOverlay.set(null);
        lastSemantic = key;
      });
    });

    // Live validation: the server is asked once the document (excluding positions) changes and settles;
    // if a new edit arrives the previous request is cancelled. On a network error the last result
    // stays on screen — validation is a helper, it does not block editing.
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

    // Header fields and conditions are written to the document. Programmatic writes
    // (load, undo) use emitEvent:false, so no loop occurs.
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

  // ── Form ↔ document ──────────────────────────────────────────────────────────

  /**
   * Writes the header form's value to the document. Writes arriving shortly after each other
   * with the same reason ('form') merge into a single undo step — each letter is not
   * a separate step.
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

  /** Writes the document to the form (load, undo). Emits no events. */
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

  /** Step commands may change the start step (add, rename, delete). */
  private syncStartStep(): void {
    this.form.patchValue({ startStep: this.store.graph().startStep }, { emitEvent: false });
  }

  // ── Steps ───────────────────────────────────────────────────────────────

  removeStep(key: string): void {
    this.store.dispatch('', doc => removeSteps(doc, [key]));
    this.syncStartStep();
  }

  // ── Step pop-up ─────────────────────────────────────────────────────────

  /** Opens the pop-up for a new step. */
  openNewStep(): void {
    if (this.readonlyMode()) return;
    this.stepDialog.set({ step: null, statusLabel: '', newKey: suggestKey(this.store.doc()) });
  }

  /**
   * Opens an existing step in the pop-up (row click in the list, double click
   * on the canvas). The pop-up works on a COPY of the step; the document does not change until saved.
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

  /** The pop-up result is written to the document: replaced when editing, appended for a new step. */
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

  // ── New node (palette, "+", context menu, drop) ─────────────────────────────

  /**
   * Adding by clicking in the palette: if a single step is selected the new node is connected to its
   * first empty exit (the shortest way to build a flow top to bottom); otherwise it is
   * added unconnected.
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
   * Adds the new node — position, pinning of neighbours and connection in A SINGLE undo
   * step. A default name is given and the node is selected; a missing assignment shows up as an issue
   * and is completed from the inspector panel.
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

  // ── Condition rows ───────────────────────────────────────────────────────

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

  // ── Data loading ──────────────────────────────────────────────────────────

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
   * Nodes not available in this company appear disabled in the palette (Wait →
   * migration 022). If it cannot be read no restriction is applied: publishing is checked on the server anyway.
   */
  readonly unavailableKinds = signal<ReadonlySet<NodeKind>>(new Set());

  // ── Templates and export ─────────────────────────────────────────────

  readonly templates = WORKFLOW_TEMPLATES;

  /**
   * Fills an empty new flow with a template. Role/column selections deliberately come empty;
   * the issues panel shows what needs completing. It is a single undo step.
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

  /** Downloads the on-screen design (including unsaved changes) as a package. */
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
      packageFileName(payload.code || 'workflow'));
  }

  private loadCapabilities(): void {
    this.workflowService.capabilities().subscribe({
      next: res => {
        if (res.success && res.data && !res.data.timers) this.unavailableKinds.set(new Set<NodeKind>(['timer']));
      },
      error: () => { /* no restriction */ }
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

  /** Company users for the user assignment picker (active ones only). */
  private loadUsers(): void {
    this.userService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) this.users.set((res.data ?? []).filter(u => u.status));
      },
      error: () => { this.users.set([]); }
    });
  }

  /**
   * Columns of the selected model — feeds the condition field dropdown. The model name
   * is read from the form: no ordering assumption between (change) in the template and
   * the form's write to the document.
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

        // A published flow cannot be edited but its DIAGRAM MUST BE VISIBLE: fill first,
        // then lock (the lock disables document commands and the form).
        const readonly = workflow.status !== 'Draft';
        this.readonlyMode.set(readonly);
        this.populate(workflow);
        this.docReady.set(true);

        // Info, not an error: we show the user the way ("Yeni Sürüm Oluştur" — Create new version).
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
   * Header info from the version chain:
   * - for a draft, the version number it will get when published ("v3 taslağı" — v3 draft). The version is assigned on publish,
   *   so a draft holds 0; it is computed from the highest in the chain, and if there is no
   *   publish at all (first draft) it is not shown;
   * - when read-only, whether there is an open draft in the chain (button label).
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
   * Opens an editable draft from a read-only version. Since the route stays on the same component
   * (only :id changes) Angular does not rebuild the component; state is reset
   * manually and the draft is reloaded.
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

  // ── Submission ──────────────────────────────────────────────────────────────

  // ── Simulation ────────────────────────────────────────────────────────────

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

  // ── Full screen ─────────────────────────────────────────────────────────────

  toggleFullscreen(): void {
    if (this.fullscreen()) this.exitFullscreen(); else this.enterFullscreen();
  }

  /**
   * Two layers: the design area covers the app with fixed positioning (always), and browser
   * full screen is requested too if supported. Browser full screen is requested NOT for the design box
   * but for the whole document: the step pop-up, confirmation dialogs and context menu
   * render outside the box; if only the box were full screen they would be invisible.
   */
  private enterFullscreen(): void {
    this.fullscreen.set(true);
    if (!isPlatformBrowser(this.platformId) || document.fullscreenElement) return;
    // On browsers that don't support it (iPhone) or if it is refused, the in-app layer is enough.
    document.documentElement.requestFullscreen?.().catch(() => { /* the layer is enough */ });
  }

  exitFullscreen(): void {
    this.fullscreen.set(false);
    if (!isPlatformBrowser(this.platformId) || !document.fullscreenElement) return;
    document.exitFullscreen().catch(() => { /* already exited */ });
  }

  /** Exited with Esc or the browser's own button: the layer should close too. */
  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    if (!document.fullscreenElement && this.fullscreen()) this.fullscreen.set(false);
  }

  // ── Issues ──────────────────────────────────────────────────────────────

  /** The issues button in the header: opens the list and scrolls it into view. */
  showIssues(): void {
    this.issuesExpanded.set(true);
    if (!isPlatformBrowser(this.platformId)) return;
    afterNextRender(() => document.getElementById('wf-issues')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), { injector: this.injector });
  }

  /**
   * Clicking an issue row: selects the related step and shows it on the canvas; on phones
   * (no canvas) opens the step pop-up. A trigger issue goes to the Trigger tab.
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
   * Saves and STAYS ON THE SCREEN. If Publish is selected it then publishes and the published
   * version opens read-only. A draft is saved with its gaps too; gaps are
   * blocked on publish.
   */
  onSubmit(publish: boolean): void {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.submitError = null;

    // The sent document: edits made until the response arrives should not count as "saved".
    const sent = this.store.doc();
    const payload: Partial<WorkflowDefinition> = {
      ...docToPayload(sent, this.editingId),
      expectedLastModifiedOn: this.lastModifiedOn
    };

    // define() returns the new ID, update() the new stamp.
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
   * A new draft was saved: the screen switches to edit mode. Otherwise a second
   * Save would call define() again and try to open a second draft with the same code.
   * Since define() returns no stamp, it is read for the next save's optimistic lock.
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
      error: () => { /* if the stamp cannot be read the next save goes without a lock; the save still happens */ }
    });
  }

  private publishThen(id: number): void {
    this.workflowService.publish(id).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving = false;
        if (!res.success) {
          // The draft was saved but publishing was rejected (gaps): continue editing on screen.
          this.submitError = res.message ?? this.languageService.t('workflow.build.saveFailed');
          return;
        }

        this.notification.success(res.message ?? '');
        // The published version opens read-only — sending the user to the list would mean
        // not showing them the diagram they just published.
        this.draftNextVersion = null;
        this.loadExisting(id);
      },
      error: err => {
        this.saving = false;
        this.submitError = err?.error?.message ?? this.languageService.t('workflow.build.serverError');
      }
    });
  }

  // ── Leaving ───────────────────────────────────────────────────────────────

  /** The route guard asks: if there are unsaved changes the user is asked to confirm. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.store.dirty()) return true;

    // If the previous question went unanswered (two navigations in a row) it counts as "stay".
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

  /** Tab close / reload does not pass through the route guard; the browser's own warning is requested. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.store.dirty()) return;
    event.preventDefault();
    // Old browsers only show the warning if returnValue is set.
    event.returnValue = '';
  }

  private initialTab(): TabId {
    if (!isPlatformBrowser(this.platformId) || typeof window.matchMedia !== 'function') return 'steps';
    return window.matchMedia(NARROW_SCREEN_QUERY).matches ? 'steps' : 'canvas';
  }

  setTab(tab: TabId): void {
    // The design area is only drawn on the canvas tab; the browser's full screen
    // should not stay open while the layer disappears.
    if (tab !== 'canvas' && this.fullscreen()) this.exitFullscreen();
    this.activeTab.set(tab);
  }

  // ── Canvas bridge ────────────────────────────────────────────────────────

  /** Positions of nodes moved on the canvas are written to the document (on drop, a single undo step). */
  onNodesMoved(moves: Array<{ key: string; x: number; y: number }>): void {
    this.store.dispatch(this.moveReason, doc => moveSteps(doc, moves));
  }

  /**
   * History reason for a move. A drag drop is a single step (''); arrow-key
   * nudges merge under 'nudge' — so a held arrow key does not leave dozens of undo
   * steps. Since the canvas output emits synchronously, a field flag is enough.
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
   * "Auto arrange" on the canvas: positions are deleted, the canvas falls back to auto
   * layout. null is written (not computed coordinates) — so steps added later
   * join the same arrangement too, and if the layout rule changes the definition follows it.
   */
  onLayoutReset(): void {
    this.store.dispatch('', clearPositions);
  }

  /**
   * A connection drawn on the canvas is written to the step's exit. The canvas reports the port kind
   * (positive/negative); the step's real exit (approve/reject or
   * complete/any-reject) is resolved from the type catalogue.
   */
  /** Connection drawn from a port — the port identity comes from the canvas (each condition case is a separate port). */
  onEdgeCreated(event: { from: string; to: string; exitPort: ExitPort }): void {
    this.store.dispatch('', doc => connect(doc, event.from, event.exitPort, event.to));
  }

  /**
   * The "if approved / if rejected" columns of the step list. For a condition all paths are
   * in a single column ("Evet → finans · Diğer → son" — Yes → finans · Other → son), an End has no exit.
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

  /** Step names for the pop-up's target picker (type: the notification's assignee choice). */
  readonly stepOptions = computed(() =>
    this.store.graph().steps.map(step => ({ key: step.key, name: step.name, type: step.type })));

  onSelectionChange(selection: CanvasSelection): void {
    this.store.selection.set(selection);
  }

  /** Document-related actions coming from the context menu. */
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

  // ── Editing commands (menu + keyboard) ───────────────────────────────────

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
   * Deletes the selection: if an edge is selected the connection is removed (the exit falls to the terminal),
   * if nodes are selected the steps are deleted. No confirmation — Ctrl+Z undoes it and
   * the notification says so (for an undoable action a dialog is an unnecessary step).
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

  /** Adds the clipboard steps and selects the copies. */
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
   * Designer keyboard shortcuts. None of them work while in a text field or while the step pop-up
   * is open (there Ctrl+Z undoes text). Undo/redo works on every tab,
   * the others only on the Design tab.
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

    // A command with nothing to do is left to the browser: with no selection the arrows scroll
    // the page, Ctrl+C copies the selected text on the page.
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
        // First the selection and menu close, then full screen. In browser full screen Esc is
        // captured by the browser; this path is for browsers without the full screen API.
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
