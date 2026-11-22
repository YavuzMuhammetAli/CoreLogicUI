import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, tap } from 'rxjs/operators';
import { startVisiblePoll, VisiblePoll } from '../../utils/visible-poll';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { PermissionService } from '../../services/permission.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { NotificationService } from '../../services/notification.service';
import { UserProfileService } from '../../services/user-profile.service';
import { ThemeService } from '../../services/theme.service';
import { LanguageService } from '../../services/language.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardDefinition } from '../../models/dashboard.model';
import { WorkflowTaskService } from '../../services/workflow-task.service';
import { NotificationBellComponent } from '../shared/notification-bell/notification-bell.component';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { userInitials } from '../../utils/user-initials';
import { computed, signal } from '@angular/core';
import { IconComponent } from '../shared/icon/icon.component';
import { ModelIconComponent } from '../shared/model-icon/model-icon.component';
import { SidebarNavComponent } from './sidebar-nav/sidebar-nav.component';
import { NavigationLayoutService } from '../../services/navigation-layout.service';
import { NavLayout, NavPage } from '../../utils/nav-layout/nav-layout.model';
import { parseNavLayout } from '../../utils/nav-layout/nav-layout.parse';
import { resolveNav } from '../../utils/nav-layout/nav-layout.resolve';

@Component({
    selector: 'app-layout',
    imports: [
        RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, NotificationBellComponent, IconComponent, ModelIconComponent,
        SidebarNavComponent
    ],
    templateUrl: './layout.component.html',
    styleUrls: ['./layout.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit, OnDestroy {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  /** Whether the sidebar is open. Starts closed on mobile (see setupMobileSidebar). */
  readonly sidebarOpen = signal(true);

  /**
   * Narrow screen (≤768px): the sidebar does not push the content, it opens as a drawer over it;
   * it closes on backdrop tap, Esc, or page change.
   * The breakpoint must be the SAME as the @media in layout.component.scss.
   */
  readonly isMobile = signal(false);
  private static readonly MobileQuery = '(max-width: 768px)';
  private mobileQuery?: MediaQueryList;
  private readonly onMobileChange = (e: MediaQueryListEvent) => {
    this.isMobile.set(e.matches);
    // Close the drawer when switching to mobile, reopen the fixed sidebar when returning to desktop.
    this.sidebarOpen.set(!e.matches);
  };

  /** User read from the token — shown until the profile arrives (or if it never does). */
  private readonly tokenUser = signal<{ name: string; email: string; initials: string } | null>(null);

  /**
   * Profile chip in the topbar. If /Profile/me data exists it is used: first/last name
   * gives the same initials as the profile screen, and when a photo is added or removed it
   * updates instantly via UserProfileService.current.
   */
  readonly currentUser = computed<{ name: string; email: string; initials: string; photoUrl: string | null } | null>(() => {
    const token = this.tokenUser();
    if (!token) return null;
    const me = this.userProfile.current();
    if (!me) return { ...token, photoUrl: null };
    const name = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim();
    return {
      name: name || token.name,
      email: me.email || token.email,
      initials: userInitials(me.firstName, me.lastName, me.email || token.email),
      photoUrl: this.userProfile.resolvePhotoUrl(me.photoUrl)
    };
  });

  /** Whether the profile dropdown is open. */
  menuOpen = false;

  /** Profile menu wrapper — for the outside-click check */
  @ViewChild('profileMenuRef') profileMenuRef?: ElementRef<HTMLElement>;

  /** Tables with read permission, shown in the regular user's sidebar */
  navTables: PublishedModel[] = [];

  /** Dashboards published by the admin to be shown in navigation — visible to all users */
  navDashboards: DashboardDefinition[] = [];

  /**
   * The menu the admin built on the Design page that applies to the user's role (chosen by the server). If present,
   * it replaces the non-admin user's My Tasks/Tables/Reporting block; otherwise (no design,
   * module not installed, request failed) the current automatic menu is drawn. The admin's menu does not change.
   */
  private readonly navDoc = signal<{ id: number; doc: NavLayout } | null>(null);
  private readonly navModels = signal<PublishedModel[]>([]);
  readonly designedNavId = computed(() => this.navDoc()?.id ?? null);
  readonly designedNav = computed(() => {
    const nav = this.navDoc();
    if (!nav) return null;
    return resolveNav(nav.doc, {
      models: this.navModels(),
      pageLabel: page => this.languageService.t(PAGE_LABEL_KEYS[page]),
      otherModelsLabel: this.languageService.t('layout.navOtherModels')
    });
  });

  /**
   * H: The "Görevlerim" (My Tasks) badge in the sidebar — pending approval count.
   *
   * The project has no SignalR/WebSocket, so there are no instant notifications; the count is
   * re-fetched at intervals. A signal is used so markDirty is not needed.
   */
  readonly pendingTaskCount = signal(0);

  /** Badge refresh interval (ms). Never asked while the tab is hidden, refreshed immediately when visible
   *  (see utils/visible-poll) — which is why the interval could go up to 60 s. */
  private static readonly TaskPollIntervalMs = 60_000;

  private taskPoll?: VisiblePoll;

  private readonly platformId   = inject(PLATFORM_ID);
  private readonly destroyRef   = inject(DestroyRef);
  private readonly userProfile  = inject(UserProfileService);
  private readonly dashboardService = inject(DashboardService);
  private readonly taskService  = inject(WorkflowTaskService);
  private readonly navigationLayouts = inject(NavigationLayoutService);
  readonly themeService         = inject(ThemeService);
  readonly languageService      = inject(LanguageService);

  constructor(
    private auth: AuthService,
    private router: Router,
    public permissionService: PermissionService,
    private publishedModel: PublishedModelService,
    public notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    // Get basic user info from the token (instant, SSR-safe)
    const tokenUser = this.auth.getSessionUser();
    this.tokenUser.set(tokenUser);

    if (!isPlatformBrowser(this.platformId)) return;

    this.setupMobileSidebar();

    // The backend loads the compiled models itself (TenantResolutionMiddleware, on the tenant's first
    // request). The shell used to call /PublishModel/loadAssembly for admins on every open;
    // each call meant a full Roslyn compilation on the server + rebuilding the tenant's EF model and
    // an old generation left in memory. If it really is not loaded, model-data's fallback calls it.

    // H: Task badge. BELOW the isPlatformBrowser check — setting up a timer
    // on the server side would be pointless and a leak.
    this.taskPoll = startVisiblePoll(() => this.refreshTaskCount(), LayoutComponent.TaskPollIntervalMs);

    // The UI language is stored as the language of notification emails. The shell writes it
    // once on every open — existing users who never saved a language preference also gain one
    // this way (after login or a page reload).
    this.syncLanguagePreference();

    // Fetch the profile (first/last name + photo) from the backend; getMe() writes the result to
    // UserProfileService.current, and currentUser is computed from there.
    // Clear first: the previous session's photo/initials must not show on a new login.
    // If it fails, the token data is enough.
    this.userProfile.clearCurrent();
    if (tokenUser) {
      this.userProfile.getMe().subscribe({
        error: () => { /* skip silently; the token data is displayed */ }
      });
    }

    // Permissions were already loaded by APP_INITIALIZER; just fetch the model list.
    // Filter tables with read permission for the regular user's sidebar nav.
    this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: modelsRes => {
        const allModels = modelsRes.success ? (modelsRes.data ?? []) : [];
        // For admins this group is already hidden in the template; the filter still works correctly.
        this.navTables = allModels.filter(m =>
          this.permissionService.canNavigate(m.typeName)
        );
        this.navModels.set(this.navTables);
      },
      error: err => {
        console.warn('[CoreLogic] Failed to load model list:', err?.message);
      }
    });

    // The designed menu is for non-admins only; an auxiliary request — if it fails the automatic menu stays.
    if (!this.permissionService.isAdmin()) {
      this.navigationLayouts.my().subscribe({
        next: res => {
          const doc = res.success && res.data ? parseNavLayout(res.data.layoutJson) : null;
          this.navDoc.set(doc && res.data ? { id: res.data.layoutId, doc } : null);
        },
        error: () => this.navDoc.set(null)
      });
    }

    // Load dashboards published to navigation by the admin — visible to all users.
    // Only the menu dashboards, without widget definitions.
    this.dashboardService.nav().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const all = res.success ? (res.data ?? []) : [];
        this.navDashboards = all.filter(d => d.showInNav);
      },
      error: err => {
        console.warn('[CoreLogic] Failed to load dashboard list:', err?.message);
      }
    });
  }

  /* ──────────────── Profile dropdown ──────────────── */

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  /** Close the menu when clicking outside the profile menu wrapper */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // The check is made only against the .profile-menu-wrap element,
    // not against the whole layout host — otherwise every click would count as "inside".
    if (!this.profileMenuRef?.nativeElement.contains(event.target as Node)) {
      this.menuOpen = false;
    }
  }

  /** Close the menu (and the open drawer on mobile) with the Escape key */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = false;
    if (this.isMobile()) this.sidebarOpen.set(false);
  }

  goToProfile(): void {
    this.menuOpen = false;
    this.router.navigate(['/profile']);
  }

  /* ──────────────── Other ──────────────── */

  logout(): void {
    this.menuOpen = false;
    this.auth.logout().subscribe(() => {
      this.permissionService.clear();
      this.router.navigate(['/login']);
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  /**
   * Mobile drawer behaviour. The sidebar used to start open on mobile too, and the backdrop
   * covered the menu button — the user could not close the menu.
   */
  private setupMobileSidebar(): void {
    this.mobileQuery = window.matchMedia(LayoutComponent.MobileQuery);
    this.isMobile.set(this.mobileQuery.matches);
    if (this.mobileQuery.matches) this.sidebarOpen.set(false);
    this.mobileQuery.addEventListener('change', this.onMobileChange);

    // On mobile, tapping a link closes the drawer; otherwise the new page stays under the menu.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      if (this.isMobile()) this.sidebarOpen.set(false);
    });
  }

  /** Toggles between light/dark theme */
  toggleTheme(): void {
    this.themeService.toggle();
  }

  /** Toggles the UI language (TR/EN) */
  toggleLanguage(): void {
    this.languageService.toggle();
    this.syncLanguagePreference();
  }

  /**
   * Writes the selected language to the backend; notification emails are sent in this language.
   * Not awaited and errors are swallowed: on a tenant without the preference table (migration
   * < 019) the screen must not break — in that case email goes out in the company's default language.
   */
  private syncLanguagePreference(): void {
    // Written only IF CHANGED: previously every page reload was a database write
    // (PUT /Profile/language). The last written (user, language) is kept in the browser; it is
    // rewritten on login with another user or when the language changes.
    const lang = this.languageService.lang();
    const user = this.auth.getSessionUser();
    const marker = `${user?.tenantId ?? ''}|${user?.email ?? ''}|${lang}`;
    if (this.readLanguageMarker() === marker) return;

    this.userProfile.setLanguage(lang).subscribe({
      next: res => { if (res.success) this.writeLanguageMarker(marker); },
      error: () => {}
    });
  }

  private static readonly LanguageMarkerKey = 'lang.synced';

  private readLanguageMarker(): string | null {
    try { return localStorage.getItem(LayoutComponent.LanguageMarkerKey); } catch { return null; }
  }

  private writeLanguageMarker(marker: string): void {
    try { localStorage.setItem(LayoutComponent.LanguageMarkerKey, marker); } catch { /* private window */ }
  }

  /**
   * H: Refreshes the pending task count.
   *
   * Errors are swallowed silently and the badge stays at its last known value: on a tenant without the
   * workflow module (migration < 017) this endpoint returns an error, and showing a warning to the
   * user every 30 seconds would be pointless.
   */
  private refreshTaskCount() {
    // Errors are silent (the poller only lengthens the interval).
    return this.taskService.myCount().pipe(
      tap(res => { if (res.success) this.pendingTaskCount.set(res.data ?? 0); })
    );
  }

  ngOnDestroy(): void {
    this.taskPoll?.stop();
    this.mobileQuery?.removeEventListener('change', this.onMobileChange);
  }
}

/** Default names of app pages in the designed menu (when the admin gave no label). */
const PAGE_LABEL_KEYS: Record<NavPage, string> = {
  tasks: 'layout.tasks',
  reports: 'layout.reports',
  dashboards: 'layout.dashboard',
  profile: 'layout.profile'
};
