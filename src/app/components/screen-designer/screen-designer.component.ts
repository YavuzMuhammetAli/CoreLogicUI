import '../../i18n/lazy/design'; // the design.* dictionary loads with this chunk
import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PublishedColumn, PublishedModel, PublishedModelService } from '../../services/published-model.service';
import { PublishedColumnSchema } from '../../services/published-table.service';
import { ScreenLayoutService } from '../../services/screen-layout.service';
import { ModelColumnSettingService } from '../../services/model-column-setting.service';
import { RecordMetadataService } from '../../services/record-metadata.service';
import { NotificationService } from '../../services/notification.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { HasUnsavedChanges } from '../../guards/unsaved-changes.guard';
import { isTypingTarget } from '../shared/workflow-canvas/workflow-canvas.keymap';
import { DataResponseModel } from '../../models/dataResponseModel';
import { ScreenLayoutSaveResultDto, ScreenLayoutViewStateDto } from '../../models/screen-layout.model';
import { Role } from '../../models/role';
import { RoleAdminService } from '../../services/role-admin.service';
import { DesignSettings, DesignSettingsDialogComponent } from '../shared/design-settings-dialog/design-settings-dialog.component';
import { roleNames } from '../shared/role-picker/role-picker.component';
import {
  FormLayout, LayoutIssue, ListLayout, ScreenViewType
} from '../../utils/screen-layout/screen-layout.model';
import { parseFormLayout, parseListLayout, serializeLayout } from '../../utils/screen-layout/screen-layout.parse';
import { hasErrors, validateLayout } from '../../utils/screen-layout/screen-layout.validate';
import { layoutFacts, seedFormLayout, seedListLayout } from '../../utils/screen-layout/screen-layout.seed';
import { LayoutDesignerStore } from './designer/layout-designer.store';
import { FormDesignerComponent } from './designer/form-designer.component';
import { ListDesignerComponent } from './designer/list-designer.component';
import { screenCommandFor } from './designer/screen-designer.keymap';
import {
  findField, findItem, moveItemBy, placeField, removeColumnEverywhere, removeItem, setSpan, unhideColumn
} from './designer/form-layout.commands';
import { hideListColumn, moveColumnBy, setColumnWidth } from './designer/list-layout.commands';
import { IconComponent } from '../shared/icon/icon.component';

const EMPTY_FORM: FormLayout = { schemaVersion: 1, tabs: [], hiddenColumns: [] };
const EMPTY_LIST: ListLayout = { schemaVersion: 1, columns: [] };

type PreviewFrame = 'desktop' | 'tablet' | 'phone';
const PREVIEW_WIDTH: Record<PreviewFrame, number | null> = { desktop: null, tablet: 720, phone: 390 };

/** The server's write result or the error body. */
type SaveOutcome = { ok: true; data: ScreenLayoutSaveResultDto; message: string } | { ok: false };

/**
 * Screen Design — /build/:typeName/screen (admin).
 *
 * The admin visually edits a published model's record form (tab/section/12-column grid) and list
 * columns. Lifecycle is draft + publish: Save writes the draft,
 * users see only the published one; "Yayınla" (Publish) is re-validated on the server against
 * the model's CURRENT schema.
 *
 * Form and list are separate documents (two stores, two lock stamps); both are live on the page,
 * switching views does not lose edits. The designer changes only presentation — labels and
 * rules are on the schema screen.
 *
 * Each view can have a DEFAULT design and named variants assigned to roles
 * (migration 026). The server picks which one a user gets: in priority order, the first published
 * variant with a matching role, otherwise the default. The store holds the selected design's document (`?layout=ID`).
 */
@Component({
    selector: 'app-screen-designer',
    imports: [
        TranslatePipe, RouterLink, ConfirmDialogComponent, FormDesignerComponent, ListDesignerComponent, IconComponent,
        DesignSettingsDialogComponent
    ],
    templateUrl: './screen-designer.component.html',
    styleUrls: ['./screen-designer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScreenDesignerComponent implements HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly screenLayouts = inject(ScreenLayoutService);
  private readonly columnSettings = inject(ModelColumnSettingService);
  private readonly metadata = inject(RecordMetadataService);
  readonly notification = inject(NotificationService);
  private readonly languageService = inject(LanguageService);
  private readonly roleAdmin = inject(RoleAdminService);

  readonly typeName = signal('');
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly model = signal<PublishedModel | null>(null);
  readonly rules = signal<ReadonlyMap<string, PublishedColumnSchema>>(new Map());
  readonly moduleInstalled = signal(true);
  readonly conflict = signal(false);
  readonly busy = signal<'save' | 'publish' | 'discard' | 'reset' | 'variant' | null>(null);

  /** All designs on the server (both views, default + variants). */
  readonly layouts = signal<ScreenLayoutViewStateDto[]>([]);
  readonly roles = signal<Role[]>([]);
  /** Selected design per view; null = default. */
  readonly formLayoutId = signal<number | null>(null);
  readonly listLayoutId = signal<number | null>(null);
  /** Legacy "Kolonlar" (Columns) setting, used to seed a view that has no default row. */
  private legacyDetail: string[] = [];
  private legacyList: string[] = [];
  /** The design requested via `?layout=` on first load. */
  private requestedLayoutId: number | null = null;

  readonly formStore = new LayoutDesignerStore<FormLayout>(EMPTY_FORM, serializeLayout);
  readonly listStore = new LayoutDesignerStore<ListLayout>(EMPTY_LIST, serializeLayout);
  /** State of the server rows (published version, whether it exists). */
  readonly formState = signal<ScreenLayoutViewStateDto | null>(null);
  readonly listState = signal<ScreenLayoutViewStateDto | null>(null);

  readonly view = signal<ScreenViewType>('form');
  readonly preview = signal(false);
  readonly previewFrame = signal<PreviewFrame>('desktop');
  readonly previewWidth = computed(() => PREVIEW_WIDTH[this.previewFrame()]);
  readonly fullscreen = signal(false);
  readonly narrow = signal(false);
  readonly issuesOpen = signal(true);

  readonly confirmDiscard = signal(false);
  readonly confirmReset = signal(false);
  readonly confirmLeave = signal(false);
  private resolveLeave: ((leave: boolean) => void) | null = null;
  /** Request to switch to another design while dirty — awaits confirmation. */
  readonly pendingSwitch = signal<{ id: number | null } | null>(null);
  /** Variant dialog: a new design or the selected variant's settings. */
  readonly variantDialog = signal<'create' | 'edit' | null>(null);
  readonly copyCurrent = signal(true);

  readonly columns = computed<readonly PublishedColumn[]>(() => this.model()?.columns ?? []);
  readonly modelLabel = computed(() => this.model()?.label?.trim() || this.typeName());
  readonly facts = computed(() => layoutFacts(this.columns(), this.rules()));

  readonly formIssues = computed(() => validateLayout(this.formStore.doc(), 'form', this.facts(), 'publish'));
  readonly listIssues = computed(() => validateLayout(this.listStore.doc(), 'list', this.facts(), 'publish'));
  readonly issues = computed<LayoutIssue[]>(() => this.view() === 'form' ? this.formIssues() : this.listIssues());
  readonly errorCount = computed(() => this.issues().filter(i => i.severity === 'error').length);

  readonly currentStore = computed(() => this.view() === 'form' ? this.formStore : this.listStore);
  readonly currentState = computed(() => this.view() === 'form' ? this.formState() : this.listState());
  readonly anyDirty = computed(() => this.formStore.dirty() || this.listStore.dirty());

  readonly currentLayoutId = computed(() => this.view() === 'form' ? this.formLayoutId() : this.listLayoutId());
  /** Whether the selected design is a variant assigned to roles (not the default). */
  readonly isVariant = computed(() => this.currentLayoutId() !== null);
  /** The view's variants, in priority order. */
  readonly currentVariants = computed(() => this.variantsOf(this.view()));
  readonly variantIndex = computed(() => this.currentVariants().findIndex(v => v.id === this.currentLayoutId()));

  /** No row on the server yet: the first draft was seeded from the current view, not saved. */
  readonly notSaved = computed(() => !this.currentState()?.exists);
  readonly hasUnpublished = computed(() =>
    this.currentStore().dirty() || !!this.currentState()?.hasUnpublishedChanges || this.notSaved());
  readonly canPublish = computed(() =>
    this.moduleInstalled() && !this.busy() && !hasErrors(this.issues()) && this.hasUnpublished());

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.route.paramMap.subscribe(params => {
      this.typeName.set(params.get('typeName') ?? '');
      const layout = Number(this.route.snapshot.queryParamMap.get('layout'));
      this.requestedLayoutId = Number.isInteger(layout) && layout > 0 ? layout : null;
      this.load();
    });
    this.route.queryParamMap.subscribe(params => {
      this.view.set(params.get('view') === 'list' ? 'list' : 'form');
    });

    // Phone: a structure list instead of drag and drop (same threshold as the workflow designer).
    const query = window.matchMedia('(max-width: 768px)');
    const sync = () => this.narrow.set(query.matches);
    sync();
    query.addEventListener('change', sync);
    destroyRef.onDestroy(() => query.removeEventListener('change', sync));
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  /**
   * Model, rules, server state and the legacy "Kolonlar" (Columns) settings are read together. Columns and
   * rules are fetched fresh, NOT from the cache: the admin may have just come back from the schema screen.
   */
  private load(): void {
    const typeName = this.typeName();
    this.loading.set(true);
    this.loadError.set(null);
    this.conflict.set(false);

    forkJoin({
      models: this.publishedModel.getModels(),
      schema: this.publishedModel.getSchema(typeName).pipe(catchError(() => of(null))),
      state: this.screenLayouts.getState(typeName),
      detail: this.columnSettings.get(typeName, 'detail').pipe(catchError(() => of(null))),
      list: this.columnSettings.get(typeName, 'list').pipe(catchError(() => of(null))),
      roles: this.roleAdmin.getRoles().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ models, schema, state, detail, list, roles }) => {
        if (typeName !== this.typeName()) return;
        const model = models.success ? (models.data ?? []).find(m => m.typeName === typeName) ?? null : null;
        if (!model) {
          this.loading.set(false);
          this.loadError.set(this.languageService.t('screen.designer.modelNotFound', { typeName }));
          return;
        }
        const rules = new Map<string, PublishedColumnSchema>();
        for (const c of schema?.success ? schema.data?.columns ?? [] : []) rules.set(c.name, c);
        this.model.set(model);
        this.rules.set(rules);

        const s = state.data;
        this.moduleInstalled.set(!!s?.moduleInstalled);
        this.roles.set(roles?.success ? roles.data ?? [] : []);
        this.layouts.set(s?.layouts ?? []);
        this.legacyDetail = detail?.success ? detail.data?.visibleColumns ?? [] : [];
        this.legacyList = list?.success ? list.data?.visibleColumns ?? [] : [];

        // `?layout=` (the record screen's "Ekranı tasarla" (Design screen) opens the design it shows); if it is the default, the selection stays empty.
        const requested = this.layouts().find(l => l.id === this.requestedLayoutId);
        this.requestedLayoutId = null;
        if (requested) this.view.set(requested.viewType);
        this.formLayoutId.set(requested?.viewType === 'form' && !requested.isDefault ? requested.id : null);
        this.listLayoutId.set(requested?.viewType === 'list' && !requested.isDefault ? requested.id : null);
        this.applyView('form');
        this.applyView('list');
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? this.languageService.t('screen.designer.loadFailed'));
      }
    });
  }

  /** The saved draft if there is one; otherwise (or if unreadable) the first draft from the current view. */
  private applyFormState(state: ScreenLayoutViewStateDto | null, legacyVisible: string[]): void {
    this.formState.set(state);
    const doc = parseFormLayout(state?.draftJson)
      ?? seedFormLayout(this.columns(), this.rules(), legacyVisible.length ? legacyVisible : null);
    this.formStore.load(doc, state?.exists ? state.lastModifiedOn : null);
  }

  private applyListState(state: ScreenLayoutViewStateDto | null, legacyVisible: string[]): void {
    this.listState.set(state);
    const doc = parseListLayout(state?.draftJson)
      ?? seedListLayout(this.columns(), legacyVisible.length ? legacyVisible : null);
    this.listStore.load(doc, state?.exists ? state.lastModifiedOn : null);
  }

  /** Loads the view's selected design into the store; if the selected variant no longer exists, falls back to the default. */
  private applyView(view: ScreenViewType): void {
    const selected = this.selectedSignal(view);
    let row = selected() === null
      ? this.layouts().find(l => l.viewType === view && l.isDefault) ?? null
      : this.layouts().find(l => l.id === selected()) ?? null;
    if (selected() !== null && !row) {
      selected.set(null);
      row = this.layouts().find(l => l.viewType === view && l.isDefault) ?? null;
    }
    if (view === 'form') this.applyFormState(row, this.legacyDetail);
    else this.applyListState(row, this.legacyList);
  }

  /** Re-reads the designs' server state and reloads a single view (after discarding / deleting the draft). */
  private async reloadView(view: ScreenViewType): Promise<void> {
    const state = await firstValueFrom(this.screenLayouts.getState(this.typeName()));
    this.layouts.set(state.data?.layouts ?? []);
    this.applyView(view);
  }

  private selectedSignal(view: ScreenViewType) {
    return view === 'form' ? this.formLayoutId : this.listLayoutId;
  }

  private variantsOf(view: ScreenViewType): ScreenLayoutViewStateDto[] {
    return this.layouts()
      .filter(l => l.viewType === view && !l.isDefault)
      .sort((a, b) => a.priority - b.priority || a.id - b.id);
  }

  private syncUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: { view: this.view() === 'list' ? 'list' : null, layout: this.currentLayoutId() }
    });
  }

  // ─── View ──────────────────────────────────────────────────────────────────

  setView(view: ScreenViewType): void {
    if (view === this.view()) return;
    // The address bar is updated too: a reload or a shared link should open the same view.
    this.view.set(view);
    this.preview.set(false);
    this.syncUrl();
  }

  // ─── Designs (default + role-specific) ────────────────────────────────────

  /** The picker changed: '' = default. If dirty, confirm first. */
  onSelectLayout(value: string): void {
    const id = value ? Number(value) : null;
    if (id === this.currentLayoutId()) return;
    if (this.currentStore().dirty()) {
      this.pendingSwitch.set({ id });
      return;
    }
    this.switchTo(id);
  }

  answerSwitch(confirmed: boolean): void {
    const pending = this.pendingSwitch();
    this.pendingSwitch.set(null);
    if (confirmed && pending) this.switchTo(pending.id);
  }

  private switchTo(id: number | null): void {
    this.selectedSignal(this.view()).set(id);
    this.applyView(this.view());
    this.preview.set(false);
    this.syncUrl();
  }

  roleSummary(roleIds: readonly number[]): string {
    const names = roleNames(this.roles(), roleIds);
    return names.length ? names.join(', ') : this.languageService.t('design.roles.nobody');
  }

  readonly currentVariant = computed(() => this.layouts().find(l => l.id === this.currentLayoutId()) ?? null);

  async confirmVariant(settings: DesignSettings): Promise<void> {
    const mode = this.variantDialog();
    if (!mode || this.busy()) return;
    this.busy.set('variant');
    try {
      if (mode === 'create') await this.createVariant(settings);
      else await this.updateVariant(settings);
    } finally {
      this.busy.set(null);
    }
  }

  /**
   * New variant. If "Mevcut tasarımdan kopyala" (Copy from current design) is selected, the store's document (unsaved changes
   * included) goes to the new design — like "save as"; the old design stays in its saved state.
   */
  private async createVariant(settings: DesignSettings): Promise<void> {
    const view = this.view();
    const doc = this.copyCurrent()
      ? this.currentStore().doc()
      : view === 'form'
        ? seedFormLayout(this.columns(), this.rules(), this.legacyDetail.length ? this.legacyDetail : null)
        : seedListLayout(this.columns(), this.legacyList.length ? this.legacyList : null);
    const res = await this.call(this.screenLayouts.createVariant({
      typeName: this.typeName(), viewType: view, name: settings.name, roleIds: settings.roleIds,
      layoutJson: serializeLayout(doc)
    }));
    if (!res?.success || !res.data) return;
    this.layouts.update(list => [...list, res.data]);
    this.variantDialog.set(null);
    this.switchTo(res.data.id);
    this.notification.success(res.message);
  }

  private async updateVariant(settings: DesignSettings): Promise<void> {
    const current = this.currentVariant();
    if (!current) return;
    const store = this.currentStore();
    const res = await this.call(this.screenLayouts.updateVariant({
      layoutId: current.id, name: settings.name, roleIds: settings.roleIds, expectedLastModifiedOn: store.lastModifiedOn()
    }));
    if (!res?.success || !res.data) return;
    this.upsertLayout(res.data);
    store.restamp(res.data.lastModifiedOn);
    this.variantDialog.set(null);
    this.notification.success(res.message);
  }

  /** Shifts the selected variant's priority by one (the first matching variant wins). */
  async moveVariant(delta: -1 | 1): Promise<void> {
    const list = this.currentVariants();
    const index = this.variantIndex();
    const to = index + delta;
    if (index < 0 || to < 0 || to >= list.length || this.busy()) return;
    const ordered = list.map(v => v.id);
    [ordered[index], ordered[to]] = [ordered[to], ordered[index]];

    this.busy.set('variant');
    try {
      const res = await this.call(this.screenLayouts.reorderVariants({
        typeName: this.typeName(), viewType: this.view(), orderedIds: ordered
      }));
      if (!res?.success) return;
      const stamps = new Map((res.data ?? []).map(s => [s.layoutId, s.lastModifiedOn]));
      this.layouts.update(rows => rows.map(r => {
        const position = ordered.indexOf(r.id);
        return position < 0 ? r : { ...r, priority: position, lastModifiedOn: stamps.get(r.id) ?? r.lastModifiedOn };
      }));
      const own = stamps.get(this.currentLayoutId() ?? -1);
      if (own) this.currentStore().restamp(own);
      this.notification.success(res.message);
    } finally {
      this.busy.set(null);
    }
  }

  private async call<T>(request: Observable<DataResponseModel<T>>): Promise<DataResponseModel<T> | null> {
    let res: DataResponseModel<T> | null;
    try {
      res = await firstValueFrom(request);
    } catch (e) {
      res = ((e as HttpErrorResponse)?.error ?? null) as DataResponseModel<T> | null;
    }
    if (!res?.success) this.notification.warn(res?.message || this.languageService.t('screen.designer.saveFailed'));
    return res;
  }

  private upsertLayout(row: ScreenLayoutViewStateDto): void {
    this.layouts.update(rows => rows.some(r => r.id === row.id) ? rows.map(r => (r.id === row.id ? row : r)) : [...rows, row]);
  }

  togglePreview(): void {
    this.preview.update(v => !v);
  }

  toggleFullscreen(): void {
    this.fullscreen.update(v => !v);
  }

  undo(): void {
    this.currentStore().undo();
  }

  redo(): void {
    this.currentStore().redo();
  }

  // ─── Save / publish ────────────────────────────────────────────────────────

  /** Saves dirty (or never saved) views in order. */
  async save(): Promise<void> {
    if (this.busy() || !this.moduleInstalled()) return;
    this.busy.set('save');
    try {
      for (const view of ['form', 'list'] as const) {
        if (!this.needsSave(view)) continue;
        const outcome = await this.saveView(view);
        if (!outcome.ok) return;
        this.notification.success(outcome.message);
      }
    } finally {
      this.busy.set(null);
    }
  }

  async publish(): Promise<void> {
    if (!this.canPublish()) return;
    const view = this.view();
    this.busy.set('publish');
    try {
      if (this.needsSave(view)) {
        const saved = await this.saveView(view);
        if (!saved.ok) return;
      }
      const outcome = view === 'form'
        ? await this.publishWith(this.formStore, view)
        : await this.publishWith(this.listStore, view);
      if (!outcome.ok) return;
      this.patchState(view, {
        exists: true, publishedVersion: outcome.data.publishedVersion,
        hasUnpublishedChanges: outcome.data.hasUnpublishedChanges, lastModifiedOn: outcome.data.lastModifiedOn
      });
      // Record screens in this session should read the new layout immediately.
      this.metadata.invalidateLayout(this.typeName());
      this.notification.success(outcome.message);
    } finally {
      this.busy.set(null);
    }
  }

  async discard(): Promise<void> {
    this.confirmDiscard.set(false);
    const view = this.view();
    const store = this.storeOf(view);
    this.busy.set('discard');
    try {
      const outcome = await this.write(this.screenLayouts.discardDraft({
        layoutId: this.selectedSignal(view)(), typeName: this.typeName(), viewType: view,
        expectedLastModifiedOn: store.lastModifiedOn()
      }));
      if (!outcome.ok) return;
      await this.reloadView(view);
      this.notification.success(outcome.message);
    } finally {
      this.busy.set(null);
    }
  }

  async reset(): Promise<void> {
    this.confirmReset.set(false);
    const view = this.view();
    this.busy.set('reset');
    try {
      const res = await firstValueFrom(this.screenLayouts.reset({
        layoutId: this.selectedSignal(view)(), typeName: this.typeName(), viewType: view,
        expectedLastModifiedOn: this.storeOf(view).lastModifiedOn()
      })).catch((err: HttpErrorResponse) => err.error as DataResponseModel<unknown> | null);
      if (!res?.success) {
        this.notification.warn(res?.message ?? this.languageService.t('screen.designer.saveFailed'));
        return;
      }
      this.metadata.invalidateLayout(this.typeName());
      // The default opens in place of the deleted variant.
      this.selectedSignal(view).set(null);
      await this.reloadView(view);
      this.syncUrl();
      this.notification.success(res.message);
    } finally {
      this.busy.set(null);
    }
  }

  private needsSave(view: ScreenViewType): boolean {
    const state = view === 'form' ? this.formState() : this.listState();
    return this.storeOf(view).dirty() || !state?.exists;
  }

  private async saveView(view: ScreenViewType): Promise<SaveOutcome> {
    const outcome = view === 'form'
      ? await this.saveWith(this.formStore, view)
      : await this.saveWith(this.listStore, view);
    if (!outcome.ok) return outcome;
    this.patchState(view, {
      // On first save the default row is created; its id should enter the list.
      ...(outcome.data.layoutId ? { id: outcome.data.layoutId } : {}),
      exists: true, hasUnpublishedChanges: outcome.data.hasUnpublishedChanges,
      lastModifiedOn: outcome.data.lastModifiedOn, publishedVersion: outcome.data.publishedVersion
    });
    return outcome;
  }

  /** Writes the draft; on success the sent document counts as saved. */
  private async saveWith<T extends FormLayout | ListLayout>(store: LayoutDesignerStore<T>, view: ScreenViewType): Promise<SaveOutcome> {
    const sent = store.doc();
    const outcome = await this.write(this.screenLayouts.saveDraft({
      layoutId: this.selectedSignal(view)(), typeName: this.typeName(), viewType: view,
      layoutJson: serializeLayout(sent), expectedLastModifiedOn: store.lastModifiedOn()
    }));
    if (outcome.ok) store.markSaved(sent, outcome.data.lastModifiedOn);
    return outcome;
  }

  private async publishWith<T extends FormLayout | ListLayout>(store: LayoutDesignerStore<T>, view: ScreenViewType): Promise<SaveOutcome> {
    const sent = store.doc();
    const outcome = await this.write(this.screenLayouts.publish({
      layoutId: this.selectedSignal(view)(), typeName: this.typeName(), viewType: view,
      expectedLastModifiedOn: store.lastModifiedOn()
    }));
    if (outcome.ok) store.markSaved(sent, outcome.data.lastModifiedOn);
    return outcome;
  }

  /**
   * Write request: on success data + message; on error the message is shown. On conflict (another admin
   * saved the same draft) the banner opens — the user reloads and redoes their change.
   */
  private async write(request: ReturnType<ScreenLayoutService['saveDraft']>): Promise<SaveOutcome> {
    let res: DataResponseModel<ScreenLayoutSaveResultDto> | null;
    try {
      res = await firstValueFrom(request);
    } catch (e) {
      res = ((e as HttpErrorResponse)?.error ?? null) as DataResponseModel<ScreenLayoutSaveResultDto> | null;
    }
    if (res?.success && res.data) return { ok: true, data: res.data, message: res.message };
    if (res?.data?.conflict) this.conflict.set(true);
    this.notification.warn(res?.message || this.languageService.t('screen.designer.saveFailed'));
    return { ok: false };
  }

  /** Updates the selected design's state and its row in the design list together. */
  private patchState(view: ScreenViewType, patch: Partial<ScreenLayoutViewStateDto>): void {
    const target = view === 'form' ? this.formState : this.listState;
    const current = target() ?? {
      id: 0, viewType: view, name: null, isDefault: true, priority: 0, roleIds: [],
      exists: false, draftJson: null, publishedJson: null, publishedVersion: 0,
      publishedOn: null, lastModifiedOn: null, hasUnpublishedChanges: false
    };
    const next = { ...current, ...patch };
    target.set(next);
    if (next.id) this.upsertLayout(next);
  }

  private storeOf(view: ScreenViewType): LayoutDesignerStore<FormLayout> | LayoutDesignerStore<ListLayout> {
    return view === 'form' ? this.formStore : this.listStore;
  }

  /** "Yeniden yükle" (Reload) in the conflict banner: the server's draft opens, changes on this screen are discarded. */
  reloadAfterConflict(): void {
    this.load();
  }

  // ─── Issue panel ───────────────────────────────────────────────────────────

  issueText(issue: LayoutIssue): string {
    const column = issue.column ? this.labelOf(issue.column) : '';
    return this.languageService.t('screen.issue.' + issue.code, { column });
  }

  private labelOf(column: string): string {
    return this.columns().find(c => c.columnName === column)?.label?.trim() || column;
  }

  /** Selects the issue on the canvas (the target item/section/tab or the column's field). */
  pickIssue(issue: LayoutIssue): void {
    if (this.view() === 'list') {
      if (issue.column) this.listStore.selection.set(issue.column);
      return;
    }
    if (issue.targetId) {
      this.formStore.selection.set(issue.targetId);
      return;
    }
    if (issue.column) {
      const placed = findField(this.formStore.doc(), issue.column);
      if (placed) this.formStore.selection.set(placed.item.id);
    }
  }

  /** Issues fixable with a single click. */
  canFix(issue: LayoutIssue): boolean {
    return (issue.code === 'unknownColumn' || issue.code === 'requiredHidden' || issue.code === 'unplacedColumn') && !!issue.column;
  }

  fix(issue: LayoutIssue): void {
    const column = issue.column;
    if (!column) return;
    if (this.view() === 'list') {
      if (issue.code === 'unknownColumn') this.listStore.dispatch('', d => hideListColumn(d, column));
      return;
    }
    if (issue.code === 'unknownColumn') {
      this.formStore.dispatch('', d => removeColumnEverywhere(d, column));
      return;
    }
    // Hidden required / unplaced column: placed at the end of the first section.
    this.formStore.dispatch('', d => {
      const section = d.tabs[0]?.sections[0];
      if (!section) return d;
      return placeField(unhideColumn(d, column), column, { sectionId: section.id, index: section.items.length });
    });
  }

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.confirmDiscard() || this.confirmReset() || this.confirmLeave() || this.pendingSwitch()
      || this.variantDialog() || this.loading()) return;
    const command = screenCommandFor(event);
    if (!command) return;
    // In a text field only Ctrl+S is captured; undo/redo stays with the field's own history.
    if (isTypingTarget(event.target) && command !== 'save') return;
    if (this.preview() && command !== 'save') return;

    switch (command) {
      case 'save': void this.save(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      default:
        if (!this.applySelectionCommand(command)) return;
    }
    event.preventDefault();
  }

  /** Shortcut applied to the selection; false if there is nothing to apply (left to the browser). */
  private applySelectionCommand(command: string): boolean {
    if (this.view() === 'list') {
      const column = this.listStore.selection();
      if (!column) return false;
      const width = this.listStore.doc().columns.find(c => c.column === column)?.width ?? 160;
      switch (command) {
        case 'deselect': this.listStore.selection.set(null); return true;
        case 'delete': this.listStore.dispatch('', d => hideListColumn(d, column)); this.listStore.selection.set(null); return true;
        case 'moveBack': this.listStore.dispatch('', d => moveColumnBy(d, column, -1)); return true;
        case 'moveForward': this.listStore.dispatch('', d => moveColumnBy(d, column, 1)); return true;
        case 'narrower': this.listStore.dispatch('nudge', d => setColumnWidth(d, column, width - 20)); return true;
        case 'wider': this.listStore.dispatch('nudge', d => setColumnWidth(d, column, width + 20)); return true;
      }
      return false;
    }

    const id = this.formStore.selection();
    if (!id) return false;
    if (command === 'deselect') {
      this.formStore.selection.set(null);
      return true;
    }
    const found = findItem(this.formStore.doc(), id);
    if (!found) return false;
    const item = found.item;
    switch (command) {
      case 'delete':
        this.formStore.dispatch('', d => removeItem(d, id));
        this.formStore.selection.set(null);
        return true;
      case 'moveBack': this.formStore.dispatch('', d => moveItemBy(d, id, -1)); return true;
      case 'moveForward': this.formStore.dispatch('', d => moveItemBy(d, id, 1)); return true;
      case 'narrower':
      case 'wider':
        if (item.kind === 'divider') return false;
        this.formStore.dispatch('nudge', d => setSpan(d, id, item.span + (command === 'wider' ? 1 : -1)));
        return true;
    }
    return false;
  }

  // ─── Leaving ───────────────────────────────────────────────────────────────

  canLeave(): boolean | Promise<boolean> {
    if (!this.anyDirty()) return true;
    this.confirmLeave.set(true);
    return new Promise<boolean>(resolve => { this.resolveLeave = resolve; });
  }

  answerLeave(leave: boolean): void {
    this.confirmLeave.set(false);
    this.resolveLeave?.(leave);
    this.resolveLeave = null;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.anyDirty()) event.preventDefault();
  }
}
