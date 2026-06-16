import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { PublishModelService } from '../../services/publish-model.service';
import { PermissionService } from '../../services/permission.service';
import { PublishedModelService, PublishedModel } from '../../services/published-model.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  sidebarOpen = true;
  currentUser: { name: string; email: string; initials: string } | null = null;

  /** Normal kullanıcı sidebar'ında gösterilecek, okuma yetkili tablolar */
  navTables: PublishedModel[] = [];

  private readonly platformId = inject(PLATFORM_ID);

  constructor(
    private auth: AuthService,
    private router: Router,
    private publishModel: PublishModelService,
    public permissionService: PermissionService,
    private publishedModel: PublishedModelService
  ) {}

  ngOnInit(): void {
    // Backend yeniden başlatıldığında publishedModelAssembly null olur.
    // Kabuk mount edilince DB'deki assembly'yi geri yükle; veri ekranındaki
    // /PublishedModel/* çağrıları çalışsın. Hata kullanıcıyı bloklamaz.
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

    // SSR ortamında tarayıcı olmadığından çağırılmaz
    this.currentUser = this.auth.getUserFromToken();

    if (!isPlatformBrowser(this.platformId)) return;

    // İzinler APP_INITIALIZER tarafından zaten yüklendi; sadece model listesini al.
    // Normal kullanıcı sidebar nav'ı için okuma yetkili tabloları filtrele.
    this.publishedModel.getModels().subscribe({
      next: modelsRes => {
        const allModels = modelsRes.success ? (modelsRes.data ?? []) : [];
        // Admin'de bu grup template'te zaten gizli; filtre yine de doğru çalışır
        this.navTables = allModels.filter(m =>
          this.permissionService.can(m.typeName, 'read')
        );
      },
      error: err => {
        console.warn('[CoreLogic] Model listesi yükleme hatası:', err?.message);
      }
    });
  }

  logout(): void {
    this.auth.logout();
    this.permissionService.clear();
    this.router.navigate(['/login']);
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
