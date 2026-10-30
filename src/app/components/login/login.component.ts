import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';

import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

@Component({
    selector: 'app-login',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IconComponent],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  form: FormGroup;
  sessionExpired = false;
  /** Şirket verisi yedekten geri yüklendi — eski oturumlar geçersiz, yeniden giriş gerekiyor. */
  tenantRestored = false;
  isLoading = false;
  errorMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private permissionService: PermissionService,
    private languageService: LanguageService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(4)]]
    });

    const reason = this.route.snapshot.queryParamMap.get('reason');
    this.sessionExpired = reason === 'session_expired';
    this.tenantRestored = reason === 'tenant_restored';
  }

  get f() { return this.form.controls; }

  onLogin(): void {
    if (this.form.invalid || this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = null;

    this.auth.login({
      email: this.f['email'].value,
      password: this.f['password'].value
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success) {
          // Önceki oturumdan kalan yetki sinyalini temizle, ardından yeni kullanıcının
          // yetkilerini (ve rolünden çözülen açılış sayfasını) yükleyip o sayfaya yönlen.
          this.permissionService.clear();
          this.permissionService.loadMyPermissions().pipe(markDirty(this.cdr)).subscribe({
            next: () => {
              this.isLoading = false;
              this.router.navigateByUrl(this.permissionService.getLandingPage());
            },
            error: () => {
              this.isLoading = false;
              this.router.navigate(['/models']);
            }
          });
        } else {
          this.isLoading = false;
          this.errorMessage = res.message ?? this.languageService.t('login.loginFailed');
        }
      },
      error: err => {
        this.isLoading = false;
        this.errorMessage = err?.status === 429
          ? this.languageService.t('common.rateLimited')
          : err?.error?.message ?? err?.message ?? this.languageService.t('login.serverUnreachable');
      }
    });
  }
}
