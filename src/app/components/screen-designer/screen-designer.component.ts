import {
  ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, forkJoin, of } from 'rxjs';
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

const EMPTY_FORM: FormLayout = { schemaVersion: 1, tabs: [], hiddenColumns: [] };
const EMPTY_LIST: ListLayout = { schemaVersion: 1, columns: [] };

type PreviewFrame = 'desktop' | 'tablet' | 'phone';
const PREVIEW_WIDTH: Record<PreviewFrame, number | null> = { desktop: null, tablet: 720, phone: 390 };

/** Sunucunun yazma sonucu ya da hata gövdesi. */
type SaveOutcome = { ok: true; data: ScreenLayoutSaveResultDto; message: string } | { ok: false };

/**
 * Ekran Tasarımı — /build/:typeName/screen (admin).
 *
 * Admin, yayınlanmış bir modelin kayıt formunu (sekme/bölüm/12 kolonluk ızgara) ve liste
 * kolonlarını görsel olarak düzenler. Yaşam döngüsü taslak + yayın: Kaydet taslağı yazar,
 * kullanıcılar yalnız yayındakini görür; "Yayınla" sunucuda modelin GÜNCEL şemasına karşı
 * yeniden doğrulanır.
 *
 * Form ve liste ayrı belgelerdir (iki depo, iki kilit damgası); ikisi de sayfada canlıdır,
 * görünüm geçişi düzenlemeyi kaybettirmez. Tasarımcı yalnız sunumu değiştirir — etiket ve
 * kurallar şema ekranındadır.
 */
@Component({
  selector: 'app-screen-designer',
  standalone: true,
  imports: [TranslatePipe, RouterLink, ConfirmDialogComponent, FormDesignerComponent, ListDesignerComponent],
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

  readonly typeName = signal('');
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly model = signal<PublishedModel | null>(null);
  readonly rules = signal<ReadonlyMap<string, PublishedColumnSchema>>(new Map());
  readonly moduleInstalled = signal(true);
  readonly conflict = signal(false);
  readonly busy = signal<'save' | 'publish' | 'discard' | 'reset' | null>(null);

  readonly formStore = new LayoutDesignerStore<FormLayout>(EMPTY_FORM, serializeLayout);
  readonly listStore = new LayoutDesignerStore<ListLayout>(EMPTY_LIST, serializeLayout);
  /** Sunucudaki satırların durumu (yayın sürümü, var mı). */
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

  /** Sunucuda henüz satır yok: ilk taslak bugünkü görünümden tohumlandı, kaydedilmedi. */
  readonly notSaved = computed(() => !this.currentState()?.exists);
  readonly hasUnpublished = computed(() =>
    this.currentStore().dirty() || !!this.currentState()?.hasUnpublishedChanges || this.notSaved());
  readonly canPublish = computed(() =>
    this.moduleInstalled() && !this.busy() && !hasErrors(this.issues()) && this.hasUnpublished());

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.route.paramMap.subscribe(params => {
      this.typeName.set(params.get('typeName') ?? '');
      this.load();
    });
    this.route.queryParamMap.subscribe(params => {
      this.view.set(params.get('view') === 'list' ? 'list' : 'form');
    });

    // Telefon: sürükle-bırak yerine yapı listesi (iş akışı tasarımcısıyla aynı eşik).
    const query = window.matchMedia('(max-width: 768px)');
    const sync = () => this.narrow.set(query.matches);
    sync();
    query.addEventListener('change', sync);
    destroyRef.onDestroy(() => query.removeEventListener('change', sync));
  }

  // ─── Yükleme ───────────────────────────────────────────────────────────────

  /**
   * Model, kurallar, sunucu durumu ve eski "Kolonlar" ayarları birlikte okunur. Kolonlar ve
   * kurallar önbellekten DEĞİL taze alınır: admin şema ekranından yeni dönmüş olabilir.
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
      list: this.columnSettings.get(typeName, 'list').pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ models, schema, state, detail, list }) => {
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
        this.applyFormState(s?.form ?? null, detail?.success ? detail.data?.visibleColumns ?? [] : []);
        this.applyListState(s?.list ?? null, list?.success ? list.data?.visibleColumns ?? [] : []);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? this.languageService.t('screen.designer.loadFailed'));
      }
    });
  }

  /** Kayıtlı taslak varsa o; yoksa (ya da okunamıyorsa) bugünkü görünümden ilk taslak. */
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

  /** Tek görünümün sunucu durumunu yeniden okur (taslağı at / sıfırla / çakışma sonrası). */
  private async reloadView(view: ScreenViewType): Promise<void> {
    const typeName = this.typeName();
    const [state, legacy] = await Promise.all([
      firstValueFrom(this.screenLayouts.getState(typeName)),
      firstValueFrom(this.columnSettings.get(typeName, view === 'form' ? 'detail' : 'list').pipe(catchError(() => of(null))))
    ]);
    const visible = legacy?.success ? legacy.data?.visibleColumns ?? [] : [];
    if (view === 'form') this.applyFormState(state.data?.form ?? null, visible);
    else this.applyListState(state.data?.list ?? null, visible);
  }

  // ─── Görünüm ───────────────────────────────────────────────────────────────

  setView(view: ScreenViewType): void {
    if (view === this.view()) return;
    // Adres çubuğu da güncellenir: yenileme ve paylaşılan bağlantı aynı görünümü açsın.
    this.router.navigate([], { relativeTo: this.route, queryParams: { view: view === 'list' ? 'list' : null }, replaceUrl: true });
    this.view.set(view);
    this.preview.set(false);
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

  // ─── Kaydet / yayınla ──────────────────────────────────────────────────────

  /** Kirli (ya da hiç kaydedilmemiş) görünümleri sırayla kaydeder. */
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
      // Bu oturumdaki kayıt ekranları yeni düzeni hemen okusun.
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
        typeName: this.typeName(), viewType: view, expectedLastModifiedOn: store.lastModifiedOn()
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
        typeName: this.typeName(), viewType: view, expectedLastModifiedOn: this.storeOf(view).lastModifiedOn()
      })).catch((err: HttpErrorResponse) => err.error as DataResponseModel<unknown> | null);
      if (!res?.success) {
        this.notification.warn(res?.message ?? this.languageService.t('screen.designer.saveFailed'));
        return;
      }
      this.metadata.invalidateLayout(this.typeName());
      await this.reloadView(view);
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
      exists: true, hasUnpublishedChanges: outcome.data.hasUnpublishedChanges,
      lastModifiedOn: outcome.data.lastModifiedOn, publishedVersion: outcome.data.publishedVersion
    });
    return outcome;
  }

  /** Taslağı yazar; başarıda gönderilen belge kaydedilmiş sayılır. */
  private async saveWith<T extends FormLayout | ListLayout>(store: LayoutDesignerStore<T>, view: ScreenViewType): Promise<SaveOutcome> {
    const sent = store.doc();
    const outcome = await this.write(this.screenLayouts.saveDraft({
      typeName: this.typeName(), viewType: view,
      layoutJson: serializeLayout(sent), expectedLastModifiedOn: store.lastModifiedOn()
    }));
    if (outcome.ok) store.markSaved(sent, outcome.data.lastModifiedOn);
    return outcome;
  }

  private async publishWith<T extends FormLayout | ListLayout>(store: LayoutDesignerStore<T>, view: ScreenViewType): Promise<SaveOutcome> {
    const sent = store.doc();
    const outcome = await this.write(this.screenLayouts.publish({
      typeName: this.typeName(), viewType: view, expectedLastModifiedOn: store.lastModifiedOn()
    }));
    if (outcome.ok) store.markSaved(sent, outcome.data.lastModifiedOn);
    return outcome;
  }

  /**
   * Yazma isteği: başarıda veri + mesaj; hatada mesaj gösterilir. Çakışmada (başka bir admin
   * aynı taslağı kaydetti) bant açılır — kullanıcı yeniden yükleyip değişikliğini tekrar yapar.
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

  private patchState(view: ScreenViewType, patch: Partial<ScreenLayoutViewStateDto>): void {
    const target = view === 'form' ? this.formState : this.listState;
    const current = target() ?? {
      viewType: view, exists: false, draftJson: null, publishedJson: null, publishedVersion: 0,
      publishedOn: null, lastModifiedOn: null, hasUnpublishedChanges: false
    };
    target.set({ ...current, ...patch });
  }

  private storeOf(view: ScreenViewType): LayoutDesignerStore<FormLayout> | LayoutDesignerStore<ListLayout> {
    return view === 'form' ? this.formStore : this.listStore;
  }

  /** Çakışma bandındaki "Yeniden yükle": sunucudaki taslak açılır, bu ekrandaki değişiklik atılır. */
  reloadAfterConflict(): void {
    this.load();
  }

  // ─── Sorun paneli ──────────────────────────────────────────────────────────

  issueText(issue: LayoutIssue): string {
    const column = issue.column ? this.labelOf(issue.column) : '';
    return this.languageService.t('screen.issue.' + issue.code, { column });
  }

  private labelOf(column: string): string {
    return this.columns().find(c => c.columnName === column)?.label?.trim() || column;
  }

  /** Sorunu tuvalde seçer (hedef öğe/bölüm/sekme ya da kolonun alanı). */
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

  /** Tek tıkla düzeltilebilen sorunlar. */
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
    // Gizli zorunlu / yerleştirilmemiş kolon: ilk bölümün sonuna yerleşir.
    this.formStore.dispatch('', d => {
      const section = d.tabs[0]?.sections[0];
      if (!section) return d;
      return placeField(unhideColumn(d, column), column, { sectionId: section.id, index: section.items.length });
    });
  }

  // ─── Klavye ────────────────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.confirmDiscard() || this.confirmReset() || this.confirmLeave() || this.loading()) return;
    const command = screenCommandFor(event);
    if (!command) return;
    // Yazı alanında yalnız Ctrl+S yakalanır; geri al/yinele alanın kendi geçmişine kalır.
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

  /** Seçime uygulanan kısayol; uygulanacak bir şey yoksa false (tarayıcıya bırakılır). */
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

  // ─── Ayrılma ───────────────────────────────────────────────────────────────

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
