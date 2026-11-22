import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserAdminService } from '../../services/user-admin.service';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { AppUser } from '../../models/appUser';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

/**
 * In-company user list (/users) — admin only (adminGuard).
 *
 * This screen is the ONLY way to add users; there is no external sign-up into the system.
 * Clicking a row goes to the /users/:id detail.
 */
@Component({
    selector: 'app-user-list',
    imports: [CommonModule, RouterLink, TranslatePipe, IconComponent],
    templateUrl: './user-list.component.html',
    styleUrls: ['./user-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserListComponent {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly userAdminService = inject(UserAdminService);
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);

  readonly users = signal<AppUser[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');
  /** ID of the user being acted on — locks the buttons of that row. */
  readonly busyId = signal<number | null>(null);
  readonly actionError = signal('');

  /** ID of the signed-in user — destructive actions are disabled on their own row. */
  readonly currentUserId = signal<number | null>(null);

  readonly hasUsers = computed(() => this.users().length > 0);

  constructor() {
    this.currentUserId.set(this.authService.getCurrentUserId());
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.userAdminService.getUsers().pipe(markDirty(this.cdr)).subscribe({
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

  /** Is it one's own account — destructive actions are blocked (the backend rejects them too). */
  isSelf(user: AppUser): boolean {
    return user.id === this.currentUserId();
  }

  toggleActive(user: AppUser, event: Event): void {
    event.stopPropagation();
    if (this.isSelf(user)) return;

    this.busyId.set(user.id);
    this.actionError.set('');

    this.userAdminService.setActive(user.id, !user.status).pipe(markDirty(this.cdr)).subscribe({
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
