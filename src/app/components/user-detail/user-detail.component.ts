import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';

import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserAdminService } from '../../services/user-admin.service';
import { RoleAdminService } from '../../services/role-admin.service';
import { AuthService } from '../../services/auth.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../shared/confirm-dialog/confirm-dialog.component';
import { AppUser } from '../../models/appUser';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

interface RoleOption { id: number; name: string; }

/**
 * User creation (/users/new) and editing (/users/:id) — admin only.
 *
 * In create mode the admin sets the password and passes it to the user through their own channel;
 * the system doesn't send e-mail.
 *
 * Destructive actions are disabled for one's own account — the backend rejects them anyway, the UI prevents them up front.
 */
@Component({
    selector: 'app-user-detail',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe, ConfirmDialogComponent, IconComponent],
    templateUrl: './user-detail.component.html',
    styleUrls: ['./user-detail.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserDetailComponent {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly fb = inject(FormBuilder);
  private readonly userAdminService = inject(UserAdminService);
  private readonly roleAdminService = inject(RoleAdminService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly languageService = inject(LanguageService);

  readonly isNew: boolean;
  readonly userId: number | null;

  readonly form: FormGroup;
  readonly resetForm: FormGroup;

  readonly user = signal<AppUser | null>(null);
  readonly roles = signal<RoleOption[]>([]);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly message = signal('');
  readonly messageType = signal<'success' | 'danger'>('success');

  readonly resetting = signal(false);
  readonly resetMessage = signal('');
  readonly resetMessageType = signal<'success' | 'danger'>('success');

  readonly togglingActive = signal(false);
  readonly deleting = signal(false);
  readonly confirmOpen = signal(false);

  constructor() {
    this.isNew = this.route.snapshot.data['mode'] === 'new';
    const idParam = this.route.snapshot.paramMap.get('id');
    this.userId = idParam ? Number(idParam) : null;

    this.form = this.fb.group({
      firstName: ['', Validators.required],
      lastName:  ['', Validators.required],
      email:     ['', [Validators.required, Validators.email]],
      // Password fields are used only in create mode.
      password:       [''],
      passwordRepeat: [''],
      isAdmin: [false],
      roleId:  [null as number | null]
    });

    this.resetForm = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(8)]]
    });

    if (this.isNew) {
      this.form.get('password')!.setValidators([Validators.required, Validators.minLength(8)]);
      this.form.get('passwordRepeat')!.setValidators([Validators.required]);
      this.loadRoles();
    } else if (this.userId) {
      this.loadUser(this.userId);
    }
  }

  get f() { return this.form.controls; }

  /** Is the edited user the signed-in person — destructive actions are disabled. */
  isSelf(): boolean {
    return this.userId !== null && this.userId === this.authService.getCurrentUserId();
  }

  get passwordMismatch(): boolean {
    if (!this.isNew) return false;
    const pwd = this.form.get('password')!.value as string;
    const rpt = this.form.get('passwordRepeat')!.value as string;
    return !!rpt && pwd !== rpt;
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  private loadRoles(): void {
    this.roleAdminService.getRoles().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.roles.set(res.success ? (res.data ?? []).map(r => ({ id: r.id, name: r.name })) : []);
      },
      error: () => this.roles.set([])
    });
  }

  /**
   * There's no endpoint that fetches a single user; it is found in the list
   * (same approach as the existing role-detail screen).
   */
  private loadUser(userId: number): void {
    this.loading.set(true);

    this.userAdminService.getUsers().pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.loading.set(false);
        const found = (res.data ?? []).find(u => u.id === userId);
        if (!found) {
          this.message.set(this.languageService.t('user.detail.notFound'));
          this.messageType.set('danger');
          return;
        }

        this.user.set(found);
        this.form.patchValue({
          firstName: found.firstName,
          lastName:  found.lastName,
          email:     found.email,
          isAdmin:   found.isAdmin
        });
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.message.set(err?.error?.message ?? this.languageService.t('user.detail.loadError'));
        this.messageType.set('danger');
      }
    });
  }

  // ── Saving ─────────────────────────────────────────────────────────────────

  save(): void {
    if (this.form.invalid || this.passwordMismatch) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.message.set('');

    const raw = this.form.getRawValue();

    if (this.isNew) {
      this.userAdminService.create({
        firstName: (raw.firstName as string).trim(),
        lastName:  (raw.lastName as string).trim(),
        email:     (raw.email as string).trim(),
        password:  raw.password as string,
        isAdmin:   !!raw.isAdmin,
        roleId:    raw.roleId ? Number(raw.roleId) : null
      }).pipe(markDirty(this.cdr)).subscribe({
        next: res => {
          this.saving.set(false);
          if (!res.success) {
            this.showError(res.message);
            return;
          }
          this.router.navigate(['/users']);
        },
        error: err => { this.saving.set(false); this.showError(this.extract(err)); }
      });
      return;
    }

    if (this.userId === null) return;

    this.userAdminService.update(this.userId, {
      firstName: (raw.firstName as string).trim(),
      lastName:  (raw.lastName as string).trim(),
      email:     (raw.email as string).trim()
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving.set(false);
        if (!res.success) { this.showError(res.message); return; }
        this.message.set(this.languageService.t('user.detail.saved'));
        this.messageType.set('success');
        this.loadUser(this.userId!);
      },
      error: err => { this.saving.set(false); this.showError(this.extract(err)); }
    });
  }

  // ── Permissions / status / password ──────────────────────────────────────

  toggleAdmin(): void {
    if (this.userId === null || this.isSelf()) return;

    const next = !(this.user()?.isAdmin ?? false);
    this.saving.set(true);

    this.userAdminService.setAdmin(this.userId, next).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.saving.set(false);
        if (!res.success) { this.showError(res.message); return; }
        this.message.set(res.message);
        this.messageType.set('success');
        this.loadUser(this.userId!);
      },
      error: err => { this.saving.set(false); this.showError(this.extract(err)); }
    });
  }

  toggleActive(): void {
    if (this.userId === null || this.isSelf()) return;

    const next = !(this.user()?.status ?? false);
    this.togglingActive.set(true);

    this.userAdminService.setActive(this.userId, next).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.togglingActive.set(false);
        if (!res.success) { this.showError(res.message); return; }
        this.message.set(res.message);
        this.messageType.set('success');
        this.loadUser(this.userId!);
      },
      error: err => { this.togglingActive.set(false); this.showError(this.extract(err)); }
    });
  }

  resetPassword(): void {
    if (this.userId === null || this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.resetting.set(true);
    this.resetMessage.set('');

    const newPassword = this.resetForm.get('newPassword')!.value as string;

    this.userAdminService.resetPassword(this.userId, newPassword).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.resetting.set(false);
        this.resetMessage.set(res.message);
        this.resetMessageType.set(res.success ? 'success' : 'danger');
        if (res.success) this.resetForm.reset();
      },
      error: err => {
        this.resetting.set(false);
        this.resetMessage.set(this.extract(err));
        this.resetMessageType.set('danger');
      }
    });
  }

  // ── Permanent deletion ────────────────────────────────────────────────────

  openDelete(): void { this.confirmOpen.set(true); }
  cancelDelete(): void { this.confirmOpen.set(false); }

  confirmDelete(): void {
    if (this.userId === null) return;

    this.deleting.set(true);

    this.userAdminService.delete(this.userId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.deleting.set(false);
        this.confirmOpen.set(false);
        if (!res.success) { this.showError(res.message); return; }
        this.router.navigate(['/users']);
      },
      error: err => {
        this.deleting.set(false);
        this.confirmOpen.set(false);
        this.showError(this.extract(err));
      }
    });
  }

  get displayName(): string {
    const current = this.user();
    return current ? `${current.firstName} ${current.lastName}`.trim() : '';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private showError(text: string): void {
    this.message.set(text);
    this.messageType.set('danger');
  }

  private extract(err: { error?: { message?: string }; message?: string }): string {
    return err?.error?.message ?? err?.message ?? this.languageService.t('user.detail.loadError');
  }
}
