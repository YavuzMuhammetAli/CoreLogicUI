import '../../i18n/lazy/design'; // design.* sözlüğü bu parçayla iner
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, firstValueFrom, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PublishedModel, PublishedModelService } from '../../services/published-model.service';
import { ScreenLayoutService } from '../../services/screen-layout.service';
import { NavigationLayoutService } from '../../services/navigation-layout.service';
import { RoleAdminService } from '../../services/role-admin.service';
import { DashboardService } from '../../services/dashboard.service';
import { NotificationService } from '../../services/notification.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { Role } from '../../models/role';
import { ScreenLayoutSummaryDto } from '../../models/screen-layout.model';
import { NavigationLayoutSummaryDto } from '../../models/navigation-layout.model';
import { seedNavLayout } from '../../utils/nav-layout/nav-layout.seed';
import { serializeNavLayout } from '../../utils/nav-layout/nav-layout.parse';
import { EMPTY_NAV_LAYOUT } from '../../utils/nav-layout/nav-layout.model';
import { IconComponent } from '../shared/icon/icon.component';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { DesignSettings, DesignSettingsDialogComponent } from '../shared/design-settings-dialog/design-settings-dialog.component';
import { roleNames } from '../shared/role-picker/role-picker.component';

type Tab = 'screens' | 'navigation';

/**
 * Tasarım — /design (admin).
 *
 * İki sekme:
 * - **Ekranlar:** yayınlanmış modeller; kart ekran tasarımcısını (`/build/:typeName/screen`) açar,
 *   modelin form/liste tasarım sayısını ve rollere özel tasarımlarını gösterir.
 * - **Navigasyon:** admin olmayan kullanıcıların kenar çubuğu tasarımları. Kullanıcıya hangisinin
 *   düşeceğini sunucu seçer: etkin + yayınlanmış olanlardan listede üstte olan ve rolü eşleşen ilk
 *   tasarım; eşleşme yoksa Varsayılan; o da yoksa uygulamanın otomatik menüsü.
 */
@Component({
    selector: 'app-design-hub',
    imports: [
        TranslatePipe, RouterLink, IconComponent, ModelIconComponent, ConfirmDialogComponent, DesignSettingsDialogComponent
    ],
    templateUrl: './design-hub.component.html',
    styleUrls: ['./design-hub.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DesignHubComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publishedModel = inject(PublishedModelService);
  private readonly screenLayouts = inject(ScreenLayoutService);
  private readonly navigationLayouts = inject(NavigationLayoutService);
  private readonly roleAdmin = inject(RoleAdminService);
  private readonly dashboards = inject(DashboardService);
  private readonly notification = inject(NotificationService);
  private readonly languageService = inject(LanguageService);

  readonly tab = signal<Tab>('screens');

  // ─── Ekranlar ──────────────────────────────────────────────────────────────
  readonly loadingScreens = signal(true);
  readonly screensError = signal<string | null>(null);
  readonly models = signal<PublishedModel[]>([]);
  readonly summaries = signal<ReadonlyMap<string, ScreenLayoutSummaryDto>>(new Map());
  readonly search = signal('');
  readonly filteredModels = computed(() => {
    const term = this.search().trim().toLocaleLowerCase(this.languageService.lang());
    const models = this.models();
    if (!term) return models;
    return models.filter(m => (m.label || m.typeName).toLocaleLowerCase(this.languageService.lang()).includes(term)
      || m.typeName.toLowerCase().includes(term));
  });

  // ─── Navigasyon ────────────────────────────────────────────────────────────
  readonly loadingNav = signal(true);
  readonly navError = signal<string | null>(null);
  readonly navInstalled = signal(true);
  readonly navLayouts = signal<NavigationLayoutSummaryDto[]>([]);
  readonly roles = signal<Role[]>([]);
  readonly busy = signal<number | 'create' | null>(null);
  readonly createOpen = signal(false);
  /** Yeni tasarım: bugünkü menüden mi, boş mu, başka bir tasarımdan kopya mı. */
  readonly createFrom = signal<'current' | 'empty' | number>('current');
  readonly toDelete = signal<NavigationLayoutSummaryDto | null>(null);

  readonly hasDefault = computed(() => this.navLayouts().some(l => l.isDefault));

  constructor() {
    this.route.queryParamMap.subscribe(params => this.tab.set(params.get('tab') === 'nav' ? 'navigation' : 'screens'));
    this.loadScreens();
    this.loadNavigation();
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    this.router.navigate([], { relativeTo: this.route, replaceUrl: true, queryParams: { tab: tab === 'navigation' ? 'nav' : null } });
  }

  // ─── Ekranlar ──────────────────────────────────────────────────────────────

  private loadScreens(): void {
    this.loadingScreens.set(true);
    forkJoin({
      models: this.publishedModel.getModels(),
      summary: this.screenLayouts.summary().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ models, summary }) => {
        this.models.set(models.success ? models.data ?? [] : []);
        this.summaries.set(new Map((summary?.success ? summary.data ?? [] : []).map(s => [s.typeName, s])));
        this.screensError.set(models.success ? null : models.message);
        this.loadingScreens.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.screensError.set(err?.error?.message ?? this.languageService.t('design.hub.loadFailed'));
        this.loadingScreens.set(false);
      }
    });
  }

  summaryOf(typeName: string): ScreenLayoutSummaryDto | null {
    return this.summaries().get(typeName) ?? null;
  }

  // ─── Navigasyon ────────────────────────────────────────────────────────────

  private loadNavigation(): void {
    this.loadingNav.set(true);
    forkJoin({
      list: this.navigationLayouts.list(),
      roles: this.roleAdmin.getRoles().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ list, roles }) => {
        this.navInstalled.set(!!list.data?.moduleInstalled);
        this.navLayouts.set(list.data?.layouts ?? []);
        this.roles.set(roles?.success ? roles.data ?? [] : []);
        this.navError.set(list.success ? null : list.message);
        this.loadingNav.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.navError.set(err?.error?.message ?? this.languageService.t('design.hub.loadFailed'));
        this.loadingNav.set(false);
      }
    });
  }

  roleSummary(layout: NavigationLayoutSummaryDto): string {
    const names = roleNames(this.roles(), layout.roleIds);
    if (names.length) return names.join(', ');
    return this.languageService.t(layout.isDefault ? 'design.roles.everyone' : 'design.roles.nobody');
  }

  /** Bu tasarım kimseye düşmüyor mu (rolü yok ve varsayılan değil). */
  unreachable(layout: NavigationLayoutSummaryDto): boolean {
    return !layout.isDefault && layout.roleIds.length === 0;
  }

  openCreate(from: 'current' | 'empty' | number = 'current'): void {
    this.createFrom.set(from);
    this.createOpen.set(true);
  }

  createName(): string {
    const from = this.createFrom();
    if (typeof from !== 'number') return '';
    const source = this.navLayouts().find(l => l.id === from);
    return source ? this.languageService.t('design.nav.copyName', { name: source.name }).slice(0, 100) : '';
  }

  createRoles(): number[] {
    const from = this.createFrom();
    return typeof from === 'number' ? this.navLayouts().find(l => l.id === from)?.roleIds ?? [] : [];
  }

  /** Yeni tasarım: belge tohumlanır, oluşturulur, rolleri yazılır, tasarımcı açılır. */
  async create(settings: DesignSettings): Promise<void> {
    if (this.busy()) return;
    this.busy.set('create');
    try {
      const layoutJson = await this.seedFor(this.createFrom());
      if (layoutJson === null) return;
      const created = await this.call(this.navigationLayouts.create({ name: settings.name, layoutJson }));
      if (!created?.success || !created.data) return;
      const layout = created.data;
      if (settings.roleIds.length) {
        await this.call(this.navigationLayouts.updateMeta({
          id: layout.id, name: layout.name, roleIds: settings.roleIds, isDefault: layout.isDefault, isEnabled: layout.isEnabled
        }));
      }
      this.createOpen.set(false);
      this.notification.success(created.message);
      this.router.navigate(['/design/navigation', layout.id]);
    } finally {
      this.busy.set(null);
    }
  }

  private async seedFor(from: 'current' | 'empty' | number): Promise<string | null> {
    if (from === 'empty') return serializeNavLayout(EMPTY_NAV_LAYOUT);
    if (typeof from === 'number') {
      const source = await this.call(this.navigationLayouts.get(from));
      return source?.success ? source.data?.draftJson ?? serializeNavLayout(EMPTY_NAV_LAYOUT) : null;
    }
    // Bugünkü menü: tüm yayınlanmış modeller + menüye yayınlanmış dashboard'lar.
    const nav = await firstValueFrom(this.dashboards.nav().pipe(catchError(() => of(null))));
    return serializeNavLayout(seedNavLayout({
      models: this.models(),
      navDashboards: (nav?.success ? nav.data ?? [] : []).filter(d => d.showInNav)
    }));
  }

  async toggleEnabled(layout: NavigationLayoutSummaryDto): Promise<void> {
    await this.updateMeta(layout, { isEnabled: !layout.isEnabled });
  }

  async makeDefault(layout: NavigationLayoutSummaryDto): Promise<void> {
    await this.updateMeta(layout, { isDefault: true });
  }

  private async updateMeta(layout: NavigationLayoutSummaryDto, patch: Partial<Pick<NavigationLayoutSummaryDto, 'isDefault' | 'isEnabled'>>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(layout.id);
    try {
      const res = await this.call(this.navigationLayouts.updateMeta({
        id: layout.id, name: layout.name, roleIds: layout.roleIds,
        isDefault: patch.isDefault ?? layout.isDefault, isEnabled: patch.isEnabled ?? layout.isEnabled
      }));
      if (!res?.success || !res.data) return;
      const updated = res.data;
      // Varsayılan tek: yenisi seçilince eskisi düşer.
      this.navLayouts.update(list => list.map(l =>
        l.id === updated.id ? updated : (updated.isDefault ? { ...l, isDefault: false } : l)));
      this.notification.success(res.message);
    } finally {
      this.busy.set(null);
    }
  }

  async move(layout: NavigationLayoutSummaryDto, delta: -1 | 1): Promise<void> {
    const list = this.navLayouts();
    const index = list.findIndex(l => l.id === layout.id);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= list.length || this.busy()) return;
    const ordered = list.map(l => l.id);
    [ordered[index], ordered[to]] = [ordered[to], ordered[index]];
    this.busy.set(layout.id);
    try {
      const res = await this.call(this.navigationLayouts.reorder(ordered));
      if (res?.success && res.data) this.navLayouts.set(res.data);
    } finally {
      this.busy.set(null);
    }
  }

  async confirmDelete(): Promise<void> {
    const layout = this.toDelete();
    if (!layout || this.busy()) return;
    this.busy.set(layout.id);
    try {
      const res = await this.call(this.navigationLayouts.delete(layout.id));
      if (!res?.success) return;
      this.navLayouts.update(list => list.filter(l => l.id !== layout.id));
      this.toDelete.set(null);
      this.notification.success(res.message);
    } finally {
      this.busy.set(null);
    }
  }

  private async call<T>(request: Observable<T & { success: boolean; message: string }>): Promise<(T & { success: boolean; message: string }) | null> {
    let res: (T & { success: boolean; message: string }) | null;
    try {
      res = await firstValueFrom(request);
    } catch (e) {
      res = ((e as HttpErrorResponse)?.error ?? null) as (T & { success: boolean; message: string }) | null;
    }
    if (!res?.success) this.notification.warn(res?.message || this.languageService.t('design.hub.saveFailed'));
    return res;
  }
}
