import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  form: FormGroup;
  sessionExpired = false;
  isLoading = false;
  errorMessage: string | null = null;
  /** register sekmesi */
  activeTab: 'login' | 'register' = 'login';

  registerForm: FormGroup;
  registerLoading = false;
  registerError: string | null = null;
  registerSuccess: string | null = null;

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

    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });

    this.sessionExpired = this.route.snapshot.queryParamMap.get('reason') === 'session_expired';
  }

  get f() { return this.form.controls; }
  get rf() { return this.registerForm.controls; }

  onLogin(): void {
    if (this.form.invalid || this.isLoading) return;
    this.isLoading = true;
    this.errorMessage = null;

    this.auth.login({
      email: this.f['email'].value,
      password: this.f['password'].value
    }).subscribe({
      next: res => {
        if (res.success) {
          // Önceki oturumdan kalan yetki sinyalini temizle, ardından yeni kullanıcının
          // yetkilerini (ve rolünden çözülen açılış sayfasını) yükleyip o sayfaya yönlen.
          this.permissionService.clear();
          this.permissionService.loadMyPermissions().subscribe({
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
        this.errorMessage = err?.error?.message ?? err?.message ?? this.languageService.t('login.serverUnreachable');
      }
    });
  }

  onRegister(): void {
    if (this.registerForm.invalid || this.registerLoading) return;
    this.registerLoading = true;
    this.registerError = null;
    this.registerSuccess = null;

    const v = this.registerForm.value;
    this.auth.register({
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      password: v.password,
      tc: '00000000000',
      birthDay: new Date().toISOString(),
      createdBy: 1,
      lastModifiedBy: 1
    }).subscribe({
      next: () => {
        this.registerLoading = false;
        this.registerSuccess = this.languageService.t('login.registerSuccess');
        this.activeTab = 'login';
        this.form.patchValue({ email: v.email });
      },
      error: err => {
        this.registerLoading = false;
        this.registerError = err?.error?.message ?? this.languageService.t('login.registerFailed');
      }
    });
  }
}
