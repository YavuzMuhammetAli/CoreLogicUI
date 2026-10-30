import '../../i18n/lazy/design'; // design.* sözlüğü bu parçayla iner
import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, NgZone, computed, inject, signal, viewChild
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { NavigationLayoutService } from '../../services/navigation-layout.service';
import { PublishedModel, PublishedModelService } from '../../services/published-model.service';
import { DashboardService } from '../../services/dashboard.service';
import { ReportService } from '../../services/report.service';
import { RoleAdminService } from '../../services/role-admin.service';
import { NotificationService } from '../../services/notification.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { HasUnsavedChanges } from '../../guards/unsaved-changes.guard';
import { NavigationLayoutDetailDto, NavigationLayoutSaveResultDto } from '../../models/navigation-layout.model';
import { DashboardDefinition } from '../../models/dashboard.model';
import { ReportDefinition } from '../../models/report.model';
import { Role } from '../../models/role';
import {
  EMPTY_NAV_LAYOUT, NAV_PAGES, NavFacts, NavFolder, NavIssue, NavLayout, NavLink, NavNode, NavPage
} from '../../utils/nav-layout/nav-layout.model';
import { parseNavLayout, serializeNavLayout } from '../../utils/nav-layout/nav-layout.parse';
import { isAllowedNavUrl, validateNavLayout } from '../../utils/nav-layout/nav-layout.validate';
import {
  NavTarget, addNavNode, findNavNode, indentNavNode, moveNavNode, moveNavNodeBy, nextNavId, outdentNavNode,
  placedNavModels, removeNavNode, setAppendUnplaced, updateNavNode
} from '../../utils/nav-layout/nav-layout.commands';
import { NavRowBox, navDropTarget } from '../../utils/nav-layout/nav-layout.drop';
import { resolveNav } from '../../utils/nav-layout/nav-layout.resolve';
import { exceedsDragThreshold } from '../screen-designer/designer/form-layout.hit-test';
import { LayoutDesignerStore } from '../screen-designer/designer/layout-designer.store';
import { screenCommandFor } from '../screen-designer/designer/screen-designer.keymap';
import { isTypingTarget } from '../shared/workflow-canvas/workflow-canvas.keymap';
import { IconComponent } from '../shared/icon/icon.component';
import { IconName } from '../shared/icon/icons.generated';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';
import { ModelIconPickerComponent } from '../shared/model-icon/model-icon-picker.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { DesignSettings, DesignSettingsDialogComponent } from '../shared/design-settings-dialog/design-settings-dialog.component';
import { roleNames } from '../shared/role-picker/role-picker.component';
import { SidebarNavComponent } from '../layout/sidebar-nav/sidebar-nav.component';

/** Ağaçta çizilen satır: klasör başlığı, bağlantı ya da klasör sonundaki bırakma alanı. */
type TreeRow =
  | { readonly kind: 'folder'; readonly key: string; readonly node: NavFolder }
  | { readonly kind: 'link'; readonly key: string; readonly node: NavLink; readonly folderId: string | null }
  | { readonly kind: 'folderEnd'; readonly key: string; readonly folderId: string; readonly empty: boolean };

/** Paletten eklenecek düğümün tanımı — düğüm bırakıldığı anda (güncel kimlikle) üretilir. */
export type PaletteSpec =
  | { readonly kind: 'folder' }
  | { readonly kind: 'url' }
  | { readonly kind: 'page'; readonly page: NavPage }
  | { readonly kind: 'model'; readonly model: PublishedModel }
  | { readonly kind: 'dashboard'; readonly dashboard: DashboardDefinition }
  | { readonly kind: 'report'; readonly report: ReportDefinition };

/** Sürükleme oturumu: ağaçtaki düğümü taşı ya da paletten yeni düğüm ekle. */
type Session = {
  readonly startX: number;
  readonly startY: number;
  active: boolean;
  readonly label: string;
  readonly isFolder: boolean;
} & ({ readonly kind: 'move'; readonly id: string } | { readonly kind: 'insert'; readonly spec: PaletteSpec });

const PAGE_LABEL_KEYS: Record<NavPage, string> = {
  tasks: 'layout.tasks',
  reports: 'layout.reports',
  dashboards: 'layout.dashboard',
  profile: 'layout.profile'
};

const PAGE_ICONS: Record<NavPage, IconName> = {
  tasks: 'task_alt',
  reports: 'bar_chart',
  dashboards: 'dashboard',
  profile: 'person'
};

/**
 * Navigasyon tasarımcısı — /design/navigation/:id (admin).
 *
 * Admin olmayan kullanıcıların kenar çubuğunu tasarlar: palet (klasör, sayfalar, modeller,
 * dashboard'lar, raporlar, bağlantı) · ağaç (sürükle-bırak, klavye) · özellikler. Tek seviye klasör.
 * Yaşam döngüsü ekran tasarımıyla aynı: Kaydet taslağı yazar, kullanıcılar yalnız yayındakini görür;
 * "Yayınla" sunucuda güncel modellere/dashboard'lara/raporlara karşı yeniden doğrulanır.
 *
 * Telefonda sürükleme yok: özellik panelindeki düğmelerle taşınır.
 */
@Component({
    selector: 'app-nav-designer',
    imports: [
        TranslatePipe, RouterLink, IconComponent, ModelIconComponent, ModelIconPickerComponent, ConfirmDialogComponent,
        DesignSettingsDialogComponent, SidebarNavComponent
    ],
    templateUrl: './nav-designer.component.html',
    styleUrls: ['./nav-designer.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavDesignerComponent implements HasUnsavedChanges {
  private readonly route = inject(ActivatedRoute);
  private readonly zone = inject(NgZone);
  private readonly navigationLayouts = inject(NavigationLayoutService);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly dashboardService = inject(DashboardService);
  private readonly reportService = inject(ReportService);
  private readonly roleAdmin = inject(RoleAdminService);
  readonly notification = inject(NotificationService);
  private readonly languageService = inject(LanguageService);

  readonly pages = NAV_PAGES;
  readonly pageIcons = PAGE_ICONS;

  readonly id = signal(0);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly detail = signal<NavigationLayoutDetailDto | null>(null);
  readonly models = signal<PublishedModel[]>([]);
  readonly dashboards = signal<DashboardDefinition[] | null>(null);
  readonly reports = signal<ReportDefinition[] | null>(null);
  readonly roles = signal<Role[]>([]);
  readonly conflict = signal(false);
  readonly busy = signal<'save' | 'publish' | 'discard' | 'meta' | null>(null);

  readonly store = new LayoutDesignerStore<NavLayout>(EMPTY_NAV_LAYOUT, serializeNavLayout);
  readonly doc = this.store.doc;
  readonly selection = this.store.selection;

  readonly narrow = signal(false);
  readonly preview = signal(false);
  readonly issuesOpen = signal(true);
  readonly paletteSearch = signal('');
  readonly settingsOpen = signal(false);
  readonly metaDefault = signal(false);
  readonly metaEnabled = signal(true);
  readonly iconPickerFor = signal<string | null>(null);
  readonly confirmDiscard = signal(false);
  readonly confirmLeave = signal(false);
  private resolveLeave: ((leave: boolean) => void) | null = null;

  // ─── Türetilmiş ────────────────────────────────────────────────────────────

  private readonly modelByName = computed(() => new Map(this.models().map(m => [m.typeName, m])));
  private readonly dashboardById = computed(() => new Map((this.dashboards() ?? []).map(d => [d.id, d])));
  private readonly reportById = computed(() => new Map((this.reports() ?? []).map(r => [r.id, r])));

  readonly facts = computed<NavFacts>(() => ({
    models: new Set(this.models().map(m => m.typeName)),
    dashboards: this.dashboards() ? new Set(this.dashboards()!.map(d => d.id)) : null,
    reports: this.reports() ? new Set(this.reports()!.map(r => r.id)) : null
  }));

  readonly issues = computed<NavIssue[]>(() => validateNavLayout(this.doc(), this.facts(), 'publish'));
  readonly errorCount = computed(() => this.issues().filter(i => i.severity === 'error').length);
  readonly placedModels = computed(() => placedNavModels(this.doc()));

  readonly rows = computed<TreeRow[]>(() => {
    const out: TreeRow[] = [];
    for (const node of this.doc().items) {
      if (node.kind !== 'folder') {
        out.push({ kind: 'link', key: node.id, node, folderId: null });
        continue;
      }
      out.push({ kind: 'folder', key: node.id, node });
      for (const child of node.children) out.push({ kind: 'link', key: child.id, node: child, folderId: node.id });
      out.push({ kind: 'folderEnd', key: `${node.id}$end`, folderId: node.id, empty: node.children.length === 0 });
    }
    return out;
  });

  readonly selectedLocation = computed(() => {
    const id = this.selection();
    return id ? findNavNode(this.doc(), id) : null;
  });
  readonly selected = computed(() => this.selectedLocation()?.node ?? null);

  readonly filteredModels = computed(() => {
    const term = this.paletteSearch().trim().toLocaleLowerCase(this.languageService.lang());
    const models = this.models();
    if (!term) return models;
    return models.filter(m => (m.label || m.typeName).toLocaleLowerCase(this.languageService.lang()).includes(term)
      || m.typeName.toLowerCase().includes(term));
  });

  readonly previewNodes = computed(() => resolveNav(this.doc(), {
    models: this.models(),
    pageLabel: page => this.languageService.t(PAGE_LABEL_KEYS[page]),
    otherModelsLabel: this.languageService.t('layout.navOtherModels')
  }));

  readonly hasUnpublished = computed(() =>
    this.store.dirty() || !!this.detail()?.hasUnpublishedChanges || !this.detail()?.publishedVersion);
  readonly canPublish = computed(() => !this.busy() && this.errorCount() === 0 && this.hasUnpublished());
  readonly roleSummary = computed(() => {
    const detail = this.detail();
    if (!detail) return '';
    const names = roleNames(this.roles(), detail.roleIds);
    if (names.length) return names.join(', ');
    return this.languageService.t(detail.isDefault ? 'design.roles.everyone' : 'design.roles.nobody');
  });

  // ─── Sürükle-bırak durumu ──────────────────────────────────────────────────

  private readonly canvas = viewChild<ElementRef<HTMLElement>>('canvas');
  readonly dragging = signal(false);
  readonly draggingId = signal<string | null>(null);
  readonly dropLine = signal<{ top: number; inset: boolean } | null>(null);
  readonly ghost = signal<{ x: number; y: number; label: string } | null>(null);
  private session: Session | null = null;
  /** Sürükleme aynı düğmede bittiyse ardından gelen tıklama ikinci kez eklemesin. */
  private suppressClick = false;
  private frame = 0;
  private pointer = { x: 0, y: 0 };
  private readonly onMove = (e: PointerEvent) => this.pointerMove(e);
  private readonly onUp = (e: PointerEvent) => this.zone.run(() => this.pointerUp(e, false));
  private readonly onCancel = (e: PointerEvent) => this.zone.run(() => this.pointerUp(e, true));

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.detach());

    this.route.paramMap.subscribe(params => {
      this.id.set(Number(params.get('id')) || 0);
      this.load();
    });

    const query = window.matchMedia('(max-width: 768px)');
    const sync = () => this.narrow.set(query.matches);
    sync();
    query.addEventListener('change', sync);
    destroyRef.onDestroy(() => query.removeEventListener('change', sync));
  }

  // ─── Yükleme ───────────────────────────────────────────────────────────────

  private load(): void {
    const id = this.id();
    this.loading.set(true);
    this.loadError.set(null);
    this.conflict.set(false);

    forkJoin({
      detail: this.navigationLayouts.get(id),
      models: this.publishedModel.getModels(),
      dashboards: this.dashboardService.list().pipe(catchError(() => of(null))),
      reports: this.reportService.list().pipe(catchError(() => of(null))),
      roles: this.roleAdmin.getRoles().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ detail, models, dashboards, reports, roles }) => {
        if (id !== this.id()) return;
        if (!detail.success || !detail.data) {
          this.loadError.set(detail.message || this.languageService.t('design.hub.loadFailed'));
          this.loading.set(false);
          return;
        }
        this.models.set(models.success ? models.data ?? [] : []);
        this.dashboards.set(dashboards?.success ? dashboards.data ?? [] : null);
        this.reports.set(reports?.success ? reports.data ?? [] : null);
        this.roles.set(roles?.success ? roles.data ?? [] : []);
        this.applyDetail(detail.data);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.loadError.set(err?.error?.message ?? this.languageService.t('design.hub.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  private applyDetail(detail: NavigationLayoutDetailDto): void {
    this.detail.set(detail);
    this.store.load(parseNavLayout(detail.draftJson) ?? EMPTY_NAV_LAYOUT, detail.lastModifiedOn);
  }

  reloadAfterConflict(): void {
    this.load();
  }

  // ─── Görünüm yardımcıları ──────────────────────────────────────────────────

  /** Düğümün tasarımcıda görünen adı (boş etikette varsayılan ad). */
  labelOf(node: NavNode): string {
    switch (node.kind) {
      case 'folder': return node.label || this.languageService.t('design.nav.untitledFolder');
      case 'model': {
        const model = this.modelByName().get(node.typeName);
        return node.label || model?.label || node.typeName;
      }
      case 'dashboard': return node.label || this.dashboardById().get(node.dashboardId)?.name || `#${node.dashboardId}`;
      case 'report': return node.label || this.reportById().get(node.reportId)?.name || `#${node.reportId}`;
      case 'page': return node.label || this.languageService.t(PAGE_LABEL_KEYS[node.page]);
      case 'url': return node.label || node.url || this.languageService.t('design.nav.newLink');
    }
  }

  /** Etiket alanının yer tutucusu — boş bırakılırsa kullanılacak ad. */
  defaultLabelOf(node: NavNode): string {
    switch (node.kind) {
      case 'model': return this.modelByName().get(node.typeName)?.label || node.typeName;
      case 'page': return this.languageService.t(PAGE_LABEL_KEYS[node.page]);
      default: return '';
    }
  }

  modelIconOf(node: NavNode): string | null {
    if (node.kind === 'model') return this.modelByName().get(node.typeName)?.icon ?? null;
    if (node.kind === 'folder' || node.kind === 'url') return node.icon ?? null;
    return null;
  }

  appIconOf(node: NavNode): IconName {
    switch (node.kind) {
      case 'folder': return 'folder_open';
      case 'dashboard': return 'dashboard';
      case 'report': return 'bar_chart';
      case 'page': return PAGE_ICONS[node.page];
      case 'url': return 'open_in_new';
      default: return 'table';
    }
  }

  kindLabel(node: NavNode): string {
    return this.languageService.t('design.nav.kind.' + node.kind);
  }

  /** Hedefi silinmiş/bilinmeyen bağlantı (ağaçta uyarı işareti). */
  isBroken(node: NavNode): boolean {
    const facts = this.facts();
    if (node.kind === 'model') return !!facts.models && !facts.models.has(node.typeName);
    if (node.kind === 'dashboard') return !!facts.dashboards && !facts.dashboards.has(node.dashboardId);
    if (node.kind === 'report') return !!facts.reports && !facts.reports.has(node.reportId);
    if (node.kind === 'url') return !isAllowedNavUrl(node.url);
    return false;
  }

  urlValid(url: string): boolean {
    return isAllowedNavUrl(url);
  }

  pageLabel(page: NavPage): string {
    return this.languageService.t(PAGE_LABEL_KEYS[page]);
  }

  issueText(issue: NavIssue): string {
    const at = issue.targetId ? findNavNode(this.doc(), issue.targetId) : null;
    return this.languageService.t('design.issue.' + issue.code, { name: at ? this.labelOf(at.node) : '' });
  }

  pickIssue(issue: NavIssue): void {
    if (issue.targetId && findNavNode(this.doc(), issue.targetId)) this.select(issue.targetId);
  }

  // ─── Komutlar ──────────────────────────────────────────────────────────────

  select(id: string | null): void {
    this.selection.set(id);
  }

  private apply(command: (doc: NavLayout) => NavLayout, reason = ''): void {
    this.store.dispatch(reason, command);
  }

  /** Paletten eklenecek yer: seçili klasörün sonu, seçili bağlantının arkası, yoksa kökün sonu. */
  private insertTarget(isFolder: boolean): NavTarget {
    const at = this.selectedLocation();
    if (!at) return { folderId: null };
    if (isFolder) {
      const rootIndex = at.folderId === null ? at.index : this.doc().items.findIndex(n => n.id === at.folderId);
      return { folderId: null, index: rootIndex + 1 };
    }
    if (at.node.kind === 'folder') return { folderId: at.node.id };
    return { folderId: at.folderId, index: at.index + 1 };
  }

  private insert(node: NavNode, target?: NavTarget): void {
    this.apply(d => addNavNode(d, node, target ?? this.insertTarget(node.kind === 'folder')));
    this.select(node.id);
  }

  private create(spec: PaletteSpec): NavNode {
    const id = nextNavId(this.doc());
    switch (spec.kind) {
      case 'folder': return { kind: 'folder', id, label: this.languageService.t('design.nav.newFolder'), children: [] };
      case 'url': return { kind: 'url', id, url: 'https://', label: this.languageService.t('design.nav.newLink') };
      case 'page': return { kind: 'page', id, page: spec.page };
      case 'model': return { kind: 'model', id, typeName: spec.model.typeName };
      case 'dashboard': return { kind: 'dashboard', id, dashboardId: spec.dashboard.id, label: spec.dashboard.name.slice(0, 60) };
      case 'report': return { kind: 'report', id, reportId: spec.report.id, label: spec.report.name.slice(0, 60) };
    }
  }

  /** Palet tıklaması (fare, dokunma, klavye): seçime göre uygun yere ekler. Sürükleme bittiyse yok sayılır. */
  addFromPalette(spec: PaletteSpec): void {
    if (this.suppressClick) return;
    this.insert(this.create(spec));
  }

  setLabel(id: string, value: string): void {
    this.apply(d => updateNavNode(d, id, { label: value.slice(0, 60) }), `label:${id}`);
  }

  setUrl(id: string, value: string): void {
    this.apply(d => updateNavNode(d, id, { url: value.trim() }), `url:${id}`);
  }

  setCollapsed(id: string, value: boolean): void {
    this.apply(d => updateNavNode(d, id, { collapsed: value }));
  }

  setIcon(icon: string | null): void {
    const id = this.iconPickerFor();
    this.iconPickerFor.set(null);
    if (!id) return;
    this.apply(d => updateNavNode(d, id, { icon: icon ?? undefined }));
  }

  setAppendUnplaced(value: boolean): void {
    this.apply(d => setAppendUnplaced(d, value));
  }

  remove(id: string): void {
    this.apply(d => removeNavNode(d, id));
    this.select(null);
  }

  moveBy(id: string, delta: -1 | 1): void {
    this.apply(d => moveNavNodeBy(d, id, delta));
  }

  indent(id: string): void {
    this.apply(d => indentNavNode(d, id));
  }

  outdent(id: string): void {
    this.apply(d => outdentNavNode(d, id));
  }

  /** Bağlantı hemen üstündeki klasöre alınabilir mi (Alt+→). */
  canIndent(): boolean {
    const at = this.selectedLocation();
    if (!at || at.folderId !== null || at.node.kind === 'folder' || at.index === 0) return false;
    return this.doc().items[at.index - 1]?.kind === 'folder';
  }

  canMove(delta: -1 | 1): boolean {
    const at = this.selectedLocation();
    if (!at) return false;
    const size = at.folderId === null
      ? this.doc().items.length
      : (this.doc().items.find(n => n.id === at.folderId) as NavFolder | undefined)?.children.length ?? 0;
    const to = at.index + delta;
    return to >= 0 && to < size;
  }

  // ─── Sürükle-bırak ─────────────────────────────────────────────────────────

  onRowPointerDown(event: PointerEvent, node: NavNode): void {
    if (!event.isPrimary || event.button !== 0 || this.narrow()) return;
    event.preventDefault();
    this.select(node.id);
    this.begin(event, {
      kind: 'move', id: node.id, startX: event.clientX, startY: event.clientY, active: false,
      label: this.labelOf(node), isFolder: node.kind === 'folder'
    });
  }

  onPalettePointerDown(event: PointerEvent, spec: PaletteSpec): void {
    if (!event.isPrimary || event.button !== 0 || this.narrow() || event.pointerType === 'touch') return;
    this.begin(event, {
      kind: 'insert', spec, startX: event.clientX, startY: event.clientY, active: false,
      label: this.labelOf(this.create(spec)), isFolder: spec.kind === 'folder'
    });
  }

  private begin(event: PointerEvent, session: Session): void {
    this.detach();
    this.session = session;
    this.pointer = { x: event.clientX, y: event.clientY };
    this.zone.runOutsideAngular(() => {
      document.addEventListener('pointermove', this.onMove);
      document.addEventListener('pointerup', this.onUp);
      document.addEventListener('pointercancel', this.onCancel);
    });
  }

  private pointerMove(event: PointerEvent): void {
    this.pointer = { x: event.clientX, y: event.clientY };
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.zone.run(() => this.update());
    });
  }

  private update(): void {
    const session = this.session;
    if (!session) return;
    const { x, y } = this.pointer;
    if (!session.active) {
      if (!exceedsDragThreshold(x - session.startX, y - session.startY)) return;
      session.active = true;
      this.dragging.set(true);
      if (session.kind === 'move') this.draggingId.set(session.id);
    }
    this.ghost.set({ x, y, label: session.label });
    const drop = this.computeDrop(x, y, session);
    this.dropLine.set(drop ? { top: drop.lineY, inset: drop.inset } : null);
  }

  private pointerUp(event: PointerEvent, cancelled: boolean): void {
    const session = this.session;
    if (session?.active) {
      // Tıklama ekleme yolu paletteki (click) olayıdır; sürüklemenin ardından gelen tıklama yutulur.
      this.suppressClick = true;
      setTimeout(() => { this.suppressClick = false; });
      if (!cancelled) {
        const drop = this.computeDrop(event.clientX, event.clientY, session);
        if (drop) {
          if (session.kind === 'move') this.apply(d => moveNavNode(d, session.id, drop.target));
          else this.insert(this.create(session.spec), drop.target);
        }
      }
    }
    this.detach();
  }

  private detach(): void {
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onCancel);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.session = null;
    this.dragging.set(false);
    this.draggingId.set(null);
    this.dropLine.set(null);
    this.ghost.set(null);
  }

  /** İmleç ağacın üstündeyse bırakma yeri; taşınan düğüm (ve klasörse çocukları) hesaba katılmaz. */
  private computeDrop(x: number, y: number, session: Session) {
    const host = this.canvas()?.nativeElement;
    if (!host) return null;
    const area = host.getBoundingClientRect();
    if (x < area.left - 60 || x > area.right + 60 || y < area.top - 40 || y > area.bottom + 40) return null;

    const excluded = session.kind === 'move' ? session.id : null;
    const boxes: NavRowBox[] = [];
    for (const el of Array.from(host.querySelectorAll<HTMLElement>('[data-row-kind]'))) {
      const id = el.dataset['rowId'] ?? '';
      const kind = el.dataset['rowKind'] as NavRowBox['kind'];
      if (excluded && (id === excluded || el.dataset['parent'] === excluded)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) continue;
      boxes.push({ id, kind, top: rect.top - area.top, bottom: rect.bottom - area.top });
    }
    return navDropTarget(this.doc(), boxes, y - area.top, session.isFolder);
  }

  // ─── Kaydet / yayınla ──────────────────────────────────────────────────────

  undo(): void {
    this.store.undo();
  }

  redo(): void {
    this.store.redo();
  }

  async save(): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set('save');
    try {
      return await this.saveDraft();
    } finally {
      this.busy.set(null);
    }
  }

  private async saveDraft(): Promise<boolean> {
    const sent = this.doc();
    const outcome = await this.write(this.navigationLayouts.saveDraft({
      id: this.id(), layoutJson: serializeNavLayout(sent), expectedLastModifiedOn: this.store.lastModifiedOn()
    }));
    if (!outcome) return false;
    this.store.markSaved(sent, outcome.data.lastModifiedOn);
    this.patchDetail(outcome.data);
    this.notification.success(outcome.message);
    return true;
  }

  async publish(): Promise<void> {
    if (!this.canPublish()) return;
    this.busy.set('publish');
    try {
      if (this.store.dirty() && !(await this.saveDraft())) return;
      const sent = this.doc();
      const outcome = await this.write(this.navigationLayouts.publish({ id: this.id(), expectedLastModifiedOn: this.store.lastModifiedOn() }));
      if (!outcome) return;
      this.store.markSaved(sent, outcome.data.lastModifiedOn);
      this.patchDetail(outcome.data);
      this.notification.success(outcome.message);
    } finally {
      this.busy.set(null);
    }
  }

  async discard(): Promise<void> {
    this.confirmDiscard.set(false);
    this.busy.set('discard');
    try {
      const outcome = await this.write(this.navigationLayouts.discardDraft({ id: this.id(), expectedLastModifiedOn: this.store.lastModifiedOn() }));
      if (!outcome) return;
      const doc = parseNavLayout(outcome.data.draftJson) ?? EMPTY_NAV_LAYOUT;
      this.store.load(doc, outcome.data.lastModifiedOn);
      this.patchDetail(outcome.data);
      this.notification.success(outcome.message);
    } finally {
      this.busy.set(null);
    }
  }

  private patchDetail(result: NavigationLayoutSaveResultDto): void {
    const detail = this.detail();
    if (!detail) return;
    this.detail.set({
      ...detail,
      publishedVersion: result.publishedVersion,
      hasUnpublishedChanges: result.hasUnpublishedChanges,
      lastModifiedOn: result.lastModifiedOn ?? detail.lastModifiedOn
    });
  }

  private async write(request: Observable<{ success: boolean; message: string; data: NavigationLayoutSaveResultDto }>):
    Promise<{ data: NavigationLayoutSaveResultDto; message: string } | null> {
    let res: { success: boolean; message: string; data: NavigationLayoutSaveResultDto } | null;
    try {
      res = await firstValueFrom(request);
    } catch (e) {
      res = ((e as HttpErrorResponse)?.error ?? null) as typeof res;
    }
    if (res?.success && res.data) return { data: res.data, message: res.message };
    if (res?.data?.conflict) this.conflict.set(true);
    this.notification.warn(res?.message || this.languageService.t('design.hub.saveFailed'));
    return null;
  }

  // ─── Tasarım ayarları (ad, roller, varsayılan, etkin) ─────────────────────

  openSettings(): void {
    const detail = this.detail();
    if (!detail) return;
    this.metaDefault.set(detail.isDefault);
    this.metaEnabled.set(detail.isEnabled);
    this.settingsOpen.set(true);
  }

  async saveSettings(settings: DesignSettings): Promise<void> {
    const detail = this.detail();
    if (!detail || this.busy()) return;
    this.busy.set('meta');
    try {
      let res: { success: boolean; message: string; data: NavigationLayoutDetailDto | null } | null;
      try {
        res = await firstValueFrom(this.navigationLayouts.updateMeta({
          id: detail.id, name: settings.name, roleIds: settings.roleIds,
          isDefault: this.metaDefault(), isEnabled: this.metaEnabled()
        })) as typeof res;
      } catch (e) {
        res = ((e as HttpErrorResponse)?.error ?? null) as typeof res;
      }
      if (!res?.success || !res.data) {
        this.notification.warn(res?.message || this.languageService.t('design.hub.saveFailed'));
        return;
      }
      const updated = res.data;
      this.detail.set({ ...detail, ...updated, draftJson: detail.draftJson, publishedJson: detail.publishedJson });
      // Belgeye dokunmayan yazım damgayı yeniledi; açık taslak bir sonraki kayıtta çakışmasın.
      this.store.restamp(updated.lastModifiedOn);
      this.settingsOpen.set(false);
      this.notification.success(res.message);
    } finally {
      this.busy.set(null);
    }
  }

  // ─── Klavye ────────────────────────────────────────────────────────────────

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.loading() || this.settingsOpen() || this.confirmDiscard() || this.confirmLeave() || this.iconPickerFor()) return;
    const command = screenCommandFor(event);
    if (!command) return;
    if (isTypingTarget(event.target) && command !== 'save') return;

    const id = this.selection();
    switch (command) {
      case 'save': void this.save(); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'deselect': if (!id) return; this.select(null); break;
      case 'delete': if (!id) return; this.remove(id); break;
      case 'moveBack': if (!id) return; this.moveBy(id, -1); break;
      case 'moveForward': if (!id) return; this.moveBy(id, 1); break;
      // Alt+→ klasöre al, Alt+← klasörden çıkar.
      case 'wider': if (!id) return; this.indent(id); break;
      case 'narrower': if (!id) return; this.outdent(id); break;
      default: return;
    }
    event.preventDefault();
  }

  // ─── Ayrılma ───────────────────────────────────────────────────────────────

  canLeave(): boolean | Promise<boolean> {
    if (!this.store.dirty()) return true;
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
    if (this.store.dirty()) event.preventDefault();
  }
}
