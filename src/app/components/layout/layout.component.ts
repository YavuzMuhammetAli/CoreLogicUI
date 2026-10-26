import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
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

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, NotificationBellComponent],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit, OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  /** Sidebar açık mı? Mobilde kapalı başlar (bkz. setupMobileSidebar). */
  readonly sidebarOpen = signal(true);

  /**
   * Dar ekran (≤768px): sidebar içeriği itmez, üstüne çekmece olarak açılır;
   * arka plana dokununca, Esc'le ya da sayfa değişince kapanır.
   * Kırılma noktası layout.component.scss'teki @media ile AYNI olmalı.
   */
  readonly isMobile = signal(false);
  private static readonly MobileQuery = '(max-width: 768px)';
  private mobileQuery?: MediaQueryList;
  private readonly onMobileChange = (e: MediaQueryListEvent) => {
    this.isMobile.set(e.matches);
    // Mobile geçerken çekmeceyi kapat, masaüstüne dönerken sabit sidebar'ı geri aç.
    this.sidebarOpen.set(!e.matches);
  };

  /** Token'dan okunan kullanıcı — profil gelene kadar (ya da gelmezse) gösterilir. */
  private readonly tokenUser = signal<{ name: string; email: string; initials: string } | null>(null);

  /**
   * Topbar'daki profil çipi. /Profile/me verisi varsa o kullanılır: ad/soyad
   * profil ekranıyla aynı baş harfleri verir, fotoğraf eklenip silinince de
   * UserProfileService.current üzerinden anında güncellenir.
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

  /** Profil dropdown açık mı? */
  menuOpen = false;

  /** Profil menüsü sarmalayıcısı — dışarı tıklama kontrolü için */
  @ViewChild('profileMenuRef') profileMenuRef?: ElementRef<HTMLElement>;

  /** Normal kullanıcı sidebar'ında gösterilecek, okuma yetkili tablolar */
  navTables: PublishedModel[] = [];

  /** Admin tarafından navigasyonda gösterilmek üzere yayınlanmış dashboard'lar — tüm kullanıcılar görür */
  navDashboards: DashboardDefinition[] = [];

  /**
   * H: Sidebar'daki "Görevlerim" rozeti — bekleyen onay sayısı.
   *
   * Projede SignalR/WebSocket olmadığı için anlık bildirim yok; sayı belirli
   * aralıklarla yeniden çekilir. Sinyal kullanılıyor ki markDirty gerekmesin.
   */
  readonly pendingTaskCount = signal(0);

  /** Rozet yenileme aralığı (ms). Kullanıcı beklemesin diye kısa, sunucuyu
   *  yormasın diye 30 sn'den seyrek değil. */
  private static readonly TaskPollIntervalMs = 30_000;

  private taskPollTimer?: ReturnType<typeof setInterval>;

  private readonly platformId   = inject(PLATFORM_ID);
  private readonly destroyRef   = inject(DestroyRef);
  private readonly userProfile  = inject(UserProfileService);
  private readonly dashboardService = inject(DashboardService);
  private readonly taskService  = inject(WorkflowTaskService);
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
    // Token'dan temel kullanıcı bilgisini al (anlık, SSR-safe)
    const tokenUser = this.auth.getUserFromToken();
    this.tokenUser.set(tokenUser);

    if (!isPlatformBrowser(this.platformId)) return;

    this.setupMobileSidebar();

    // Derlenmiş modelleri backend kendisi yükler (TenantResolutionMiddleware, tenant'ın ilk
    // isteğinde). Kabuk eskiden admin için her açılışta /PublishModel/loadAssembly çağırıyordu;
    // her çağrı sunucuda baştan Roslyn derlemesi + tenant'ın EF modelinin yeniden kurulması ve
    // bellekte kalan bir eski nesil demekti. Gerçekten yüklenmemişse model-data'nın geri dönüşü çağırır.

    // H: Görev rozeti. isPlatformBrowser kontrolünün ALTINDA — sunucu tarafında
    // zamanlayıcı kurmak anlamsız ve sızıntı olurdu.
    this.refreshTaskCount();
    this.taskPollTimer = setInterval(
      () => this.refreshTaskCount(), LayoutComponent.TaskPollIntervalMs);

    // Arayüz dili bildirim e-postalarının dili olarak saklanır. Kabuk her açılışta
    // bir kez yazar — dil tercihi hiç kaydedilmemiş mevcut kullanıcılar da (girişten
    // ya da sayfa yenilemesinden sonra) tercihlerini böylece kazanır.
    this.syncLanguagePreference();

    // Profili (ad/soyad + fotoğraf) backend'den çek; getMe() sonucu
    // UserProfileService.current'a yazar, currentUser oradan hesaplanır.
    // Önce temizle: önceki oturumun fotoğrafı/harfleri yeni girişte görünmesin.
    // Başarısız olursa token verisi yeterli.
    this.userProfile.clearCurrent();
    if (tokenUser) {
      this.userProfile.getMe().subscribe({
        error: () => { /* sessizce atla; token verisi görüntüleniyor */ }
      });
    }

    // İzinler APP_INITIALIZER tarafından zaten yüklendi; sadece model listesini al.
    // Normal kullanıcı sidebar nav'ı için okuma yetkili tabloları filtrele.
    this.publishedModel.getModels().pipe(markDirty(this.cdr)).subscribe({
      next: modelsRes => {
        const allModels = modelsRes.success ? (modelsRes.data ?? []) : [];
        // Admin'de bu grup template'te zaten gizli; filtre yine de doğru çalışır.
        this.navTables = allModels.filter(m =>
          this.permissionService.canNavigate(m.typeName)
        );
      },
      error: err => {
        console.warn('[CoreLogic] Model listesi yükleme hatası:', err?.message);
      }
    });

    // Admin tarafından navigasyona yayınlanmış dashboard'ları yükle — tüm kullanıcılar görür.
    this.dashboardService.list().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        const all = res.success ? (res.data ?? []) : [];
        this.navDashboards = all.filter(d => d.showInNav);
      },
      error: err => {
        console.warn('[CoreLogic] Dashboard listesi yükleme hatası:', err?.message);
      }
    });
  }

  /* ──────────────── Profil dropdown ──────────────── */

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  /** Profil menüsü sarmalayıcısı dışına tıklandığında menüyü kapat */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Kontrol yalnızca .profile-menu-wrap elementine karşı yapılır;
    // tüm layout host'una karşı değil — aksi hâlde her tıklama "içeride" sayılır.
    if (!this.profileMenuRef?.nativeElement.contains(event.target as Node)) {
      this.menuOpen = false;
    }
  }

  /** Escape tuşuyla menüyü (mobilde açık çekmeceyi de) kapat */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = false;
    if (this.isMobile()) this.sidebarOpen.set(false);
  }

  goToProfile(): void {
    this.menuOpen = false;
    this.router.navigate(['/profile']);
  }

  /* ──────────────── Diğer ──────────────── */

  logout(): void {
    this.menuOpen = false;
    this.auth.logout();
    this.permissionService.clear();
    this.router.navigate(['/login']);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(open => !open);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  /**
   * Mobil çekmece davranışı. Eskiden sidebar mobilde de açık başlıyor, karartma katmanı
   * menü düğmesini örtüyordu — kullanıcı menüyü kapatamıyordu.
   */
  private setupMobileSidebar(): void {
    this.mobileQuery = window.matchMedia(LayoutComponent.MobileQuery);
    this.isMobile.set(this.mobileQuery.matches);
    if (this.mobileQuery.matches) this.sidebarOpen.set(false);
    this.mobileQuery.addEventListener('change', this.onMobileChange);

    // Mobilde bir linke dokununca çekmece kapansın; yoksa yeni sayfa menünün altında kalır.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => {
      if (this.isMobile()) this.sidebarOpen.set(false);
    });
  }

  /** Açık/koyu tema arasında geçiş yapar */
  toggleTheme(): void {
    this.themeService.toggle();
  }

  /** Arayüz dili (TR/EN) arasında geçiş yapar */
  toggleLanguage(): void {
    this.languageService.toggle();
    this.syncLanguagePreference();
  }

  /**
   * Seçili dili backend'e yazar; bildirim e-postaları bu dilde gider.
   * Beklenmez ve hata yutulur: tercih tablosu kurulmamış bir tenant'ta (migrasyon
   * < 019) ekran bozulmamalı — e-posta o durumda şirketin varsayılan dilinde gider.
   */
  private syncLanguagePreference(): void {
    this.userProfile.setLanguage(this.languageService.lang()).subscribe({ error: () => {} });
  }

  /**
   * H: Bekleyen görev sayısını tazeler.
   *
   * Hata sessizce yutulur ve rozet son bilinen değerinde kalır: workflow modülü
   * kurulmamış bir tenant'ta (migrasyon < 017) bu uç hata döner ve her 30 saniyede
   * kullanıcıya uyarı göstermek anlamsız olurdu.
   */
  private refreshTaskCount(): void {
    this.taskService.myCount().subscribe({
      next: res => {
        if (res.success) this.pendingTaskCount.set(res.data ?? 0);
      },
      error: () => { /* sessiz — sınıf notuna bak */ }
    });
  }

  ngOnDestroy(): void {
    if (this.taskPollTimer) clearInterval(this.taskPollTimer);
    this.mobileQuery?.removeEventListener('change', this.onMobileChange);
  }
}
