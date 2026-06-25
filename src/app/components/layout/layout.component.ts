import {
  Component, OnInit, inject, PLATFORM_ID, HostListener, ElementRef, ViewChild
} from '@angular/core';
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

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  sidebarOpen = true;

  /** Giriş yapmış kullanıcının kısa profil bilgisi */
  currentUser: { name: string; email: string; initials: string; photoUrl?: string | null } | null = null;

  /** Profil dropdown açık mı? */
  menuOpen = false;

  /** Profil menüsü sarmalayıcısı — dışarı tıklama kontrolü için */
  @ViewChild('profileMenuRef') profileMenuRef?: ElementRef<HTMLElement>;

  /** Normal kullanıcı sidebar'ında gösterilecek, okuma yetkili tablolar */
  navTables: PublishedModel[] = [];

  private readonly platformId   = inject(PLATFORM_ID);
  private readonly userProfile  = inject(UserProfileService);
  readonly themeService         = inject(ThemeService);

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
    this.publishModel.loadAssembly().subscribe({
      next: res => {
        if (!res.success) {
          console.warn('[CoreLogic] loadAssembly:', res.message);
        }
      },
      error: err => {
        console.warn('[CoreLogic] loadAssembly başarısız:', err?.message);
      }
    });

    // Profil fotoğrafını backend'den çek; başarısız olursa token verisi yeterli
    if (tokenUser) {
      this.userProfile.getMe().subscribe({
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
    this.publishedModel.getModels().subscribe({
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
}
