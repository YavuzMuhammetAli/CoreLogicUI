import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserAdminService } from '../../services/user-admin.service';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { AppUser } from '../../models/appUser';

/**
 * Şirket içi kullanıcı listesi (/users) — yalnızca admin (adminGuard).
 *
 * Kullanıcı eklemenin TEK yolu bu ekrandır; sisteme dışarıdan katılım yoktur.
 * Satır tıklanınca /users/:id detayına gidilir.
 */
@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslatePipe],
  templateUrl: './user-list.component.html',
  styleUrls: ['./user-list.component.scss']
})
export class UserListComponent {
  private readonly userAdminService = inject(UserAdminService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);

  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');
  /** Üzerinde işlem yapılan kullanıcının ID'si — o satırın butonlarını kilitler. */
  readonly busyId = signal<number | null>(null);
  readonly actionError = signal('');

  /** Oturumdaki kullanıcının ID'si — kendi satırında yıkıcı aksiyonlar kapatılır. */
  readonly currentUserId = signal<number | null>(null);

  readonly hasUsers = computed(() => this.users().length > 0);

  constructor() {
    this.currentUserId.set(this.authService.getCurrentUserId());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.userAdminService.getUsers().subscribe({
      next: res => {
        this.loading.set(false);
        this.users.set(res.success ? (res.data ?? []) : []);
        if (!res.success) this.loadError.set(res.message);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.loadError.set(err?.error?.message ?? this.languageService.t('user.list.loadError'));
      }
    });
  }

  /** Kendi hesabı mı — yıkıcı aksiyonlar engellenir (backend de reddeder). */
  isSelf(user: AppUser): boolean {
    return user.id === this.currentUserId();
  }

  toggleActive(user: AppUser, event: Event): void {
    event.stopPropagation();
    if (this.isSelf(user)) return;

    this.busyId.set(user.id);
    this.actionError.set('');

    this.userAdminService.setActive(user.id, !user.status).subscribe({
      next: res => {
        this.busyId.set(null);
        if (res.success) {
          this.load();
        } else {
          this.actionError.set(res.message);
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.busyId.set(null);
        this.actionError.set(err?.error?.message ?? this.languageService.t('user.list.loadError'));
      }
    });
  }

}
