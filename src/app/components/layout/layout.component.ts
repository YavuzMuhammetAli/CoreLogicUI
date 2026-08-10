import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, inject, OnDestroy, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';
import { NotificationService } from '../../services/notification.service';
import { UserProfileService } from '../../services/user-profile.service';
import { ThemeService } from '../../services/theme.service';
import { LanguageService } from '../../services/language.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardDefinition } from '../../models/dashboard.model';
import { WorkflowTaskService } from '../../services/workflow-task.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { signal } from '@angular/core';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LayoutComponent implements OnInit, OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  sidebarOpen = true;

  /** Giriş yapmış kullanıcının kısa profil bilgisi */
  currentUser: { name: string; email: string; initials: string; photoUrl?: string | null } | null = null;

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
  private readonly userProfile  = inject(UserProfileService);
  private readonly dashboardService = inject(DashboardService);
  private readonly taskService  = inject(WorkflowTaskService);
  readonly themeService         = inject(ThemeService);
  readonly languageService      = inject(LanguageService);

  constructor(
    private auth: AuthService,
    private router: Router,
    private publishModel: PublishModelService,
    public permissionService: PermissionService,
    private publishedModel: PublishedModelService,
    public notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    // Token'dan temel kullanıcı bilgisini al (anlık, SSR-safe)
    const tokenUser = this.auth.getUserFromToken();
    this.currentUser = tokenUser;

    if (!isPlatformBrowser(this.platformId)) return;

    // Backend yeniden başlatıldığında publishedModelAssembly null olur.
    // Kabuk mount edilince DB'deki assembly'yi geri yükle; veri ekranındaki
    // /PublishedModel/* çağrıları çalışsın. Hata kullanıcıyı bloklamaz.
    // SSR/prerender'da tarayıcı olmadığından bu blok çalışmaz — gereksiz HTTP isteği engellenir.
    this.publishModel.loadAssembly().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          console.warn('[CoreLogic] loadAssembly:', res.message);
        }
      },
      error: err => {
        console.warn('[CoreLogic] loadAssembly başarısız:', err?.message);
      }
    });

    // H: Görev rozeti. isPlatformBrowser kontrolünün ALTINDA — sunucu tarafında
    // zamanlayıcı kurmak anlamsız ve sızıntı olurdu.
    this.refreshTaskCount();
    this.taskPollTimer = setInterval(
      () => this.refreshTaskCount(), LayoutComponent.TaskPollIntervalMs);

    // Profil fotoğrafını backend'den çek; başarısız olursa token verisi yeterli
    if (tokenUser) {
      this.userProfile.getMe().pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          if (res.success && res.data) {
            this.currentUser = {
              ...tokenUser,
              photoUrl: this.userProfile.resolvePhotoUrl(res.data.photoUrl)
            };
          }
        },
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

  /** Escape tuşuyla menüyü kapat */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen = false;
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
    this.sidebarOpen = !this.sidebarOpen;
  }

  /** Açık/koyu tema arasında geçiş yapar */
  toggleTheme(): void {
    this.themeService.toggle();
  }

  /** Arayüz dili (TR/EN) arasında geçiş yapar */
  toggleLanguage(): void {
    this.languageService.toggle();
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
  }
}
