import { Component, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { PublishModelService } from '../../services/publish-model.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  sidebarOpen = true;

  constructor(
    private auth: AuthService,
    private router: Router,
    private publishModel: PublishModelService
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
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
