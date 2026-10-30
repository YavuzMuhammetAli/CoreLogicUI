import { ChangeDetectionStrategy, ChangeDetectorRef, Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';

import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, interval, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { LanguageService } from '../../services/language.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { PROVISION_STEP_ORDER, ProvisionStatus } from '../../models/provision.model';
import { markDirty } from '../../utils/change-detection';
import { IconComponent } from '../shared/icon/icon.component';

/** Kurulum ekranındaki tek adım satırının görünüm durumu. */
interface DisplayStep {
  name: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  durationMs: number | null;
  error: string | null;
}

/**
 * Yeni şirket kayıt sihirbazı — 4 adım:
 * 1. Şirket Bilgileri → 2. Yönetici Bilgileri → 3. Kurulum (gerçek ilerleme,
 * provision-status polling) → 4. Tamamlandı (otomatik login).
 *
 * Doğrulama açıkken başvuru 2. adımda biter: "e-postanızı kontrol edin" gösterilir ve kurulum,
 * e-postadaki `?token=` bağlantısı bu ekranı yeniden açınca 3. adımdan başlar.
 *
 * Kurulum backend'de arka planda çalışır; bu component provisionId ile
 * ~1.5 sn'de bir durumu poll'lar ve ProvisionLog adımlarını gerçek
 * durumlarıyla gösterir. Tamamlanan kurulumun yanıtı JWT içerir —
 * token saklanıp izinler yüklenerek doğrudan çalışma alanına girilir.
 */
@Component({
    selector: 'app-register-company',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IconComponent],
    templateUrl: './register-company.component.html',
    styleUrls: ['./register-company.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterCompanyComponent implements OnInit, OnDestroy {
  /** OnPush: asenkron veri geldiğinde görünümü kirli işaretlemek için (bkz. markDirty). */
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly permissionService = inject(PermissionService);
  private readonly languageService = inject(LanguageService);

  readonly totalSteps = 4;
  readonly step = signal<1 | 2 | 3 | 4>(1);

  readonly companyForm = this.fb.group({
    companyName: ['', [Validators.required, Validators.maxLength(200)]],
    companyCode: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9]{2,20}$/)]]
  });

  readonly adminForm = this.fb.group({
    adminName: ['', Validators.required],
    adminSurname: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  /** Başvuru alındı, doğrulama bağlantısı bekleniyor. */
  readonly verificationSent = signal(false);
  /** E-postadaki bağlantı geçersiz ya da kurulum başlatılamadı. */
  readonly verifyError = signal<string | null>(null);
  readonly isStarting = signal(false);
  readonly startError = signal<string | null>(null);
  readonly provisionStatus = signal<ProvisionStatus | null>(null);
  /** Kurulum bitti ama token alınamadı (10 dk penceresi geçti vb.) — manuel login göster. */
  readonly autoLoginFailed = signal(false);

  /** Kurulum Failed/RolledBack son durumuna ulaştı mı? */
  readonly provisionFailed = computed(() => {
    const status = this.provisionStatus()?.status;
    return status === 'Failed' || status === 'RolledBack';
  });

  /**
   * Sabit adım sırası + backend'den gelen gerçek durumların birleşimi.
   * Backend'in henüz başlamadığı adımlar 'pending' görünür.
   */
  readonly displaySteps = computed<DisplayStep[]>(() => {
    const backendSteps = this.provisionStatus()?.steps ?? [];
    return PROVISION_STEP_ORDER.map(name => {
      const found = backendSteps.find(s => s.stepName === name);
      const state: DisplayStep['state'] = !found
        ? 'pending'
        : found.status === 'Completed' ? 'done'
        : found.status === 'Failed' ? 'failed'
        : 'running';
      return { name, state, durationMs: found?.durationMs ?? null, error: found?.error ?? null };
    });
  });

  private provisionId: string | null = null;
  private pollSub: Subscription | null = null;

  get cf() { return this.companyForm.controls; }
  get af() { return this.adminForm.controls; }

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) this.verify(token);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** E-postadaki bağlantıdan gelindi: kurulum ekranı açılır, doğrulanınca ilerleme izlenir. */
  private verify(token: string): void {
    this.step.set(3);
    this.auth.verifyCompany(token).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.provisionId = res.data;
          this.startPolling();
        } else {
          this.verifyError.set(res.message || this.languageService.t('regco.verifyFailed'));
        }
      },
      error: err => this.verifyError.set(err?.error?.message ?? this.languageService.t('regco.verifyFailed'))
    });
  }

  nextFromCompany(): void {
    if (this.companyForm.invalid) {
      this.companyForm.markAllAsTouched();
      return;
    }
    this.step.set(2);
  }

  backToCompany(): void {
    this.step.set(1);
  }

  /** Adım 2 → kurulumu başlat: backend senkron doğrular, provisionId döner, polling başlar. */
  startProvisioning(): void {
    if (this.adminForm.invalid || this.isStarting()) {
      this.adminForm.markAllAsTouched();
      return;
    }

    this.isStarting.set(true);
    this.startError.set(null);

    this.auth.registerCompany({
      companyName: this.cf.companyName.value!.trim(),
      companyCode: this.cf.companyCode.value!.trim().toLowerCase(),
      adminName: this.af.adminName.value!.trim(),
      adminSurname: this.af.adminSurname.value!.trim(),
      email: this.af.email.value!.trim(),
      password: this.af.password.value!
    }).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        this.isStarting.set(false);
        if (res.success && res.data?.verificationRequired) {
          this.verificationSent.set(true);
        } else if (res.success && res.data?.provisionId) {
          this.provisionId = res.data.provisionId;
          this.provisionStatus.set(null);
          this.step.set(3);
          this.startPolling();
        } else {
          this.startError.set(res.message || this.languageService.t('regco.startFailed'));
        }
      },
      error: err => {
        this.isStarting.set(false);
        // Duplicate code/email gibi senkron 400 hataları burada kullanıcıya döner
        this.startError.set(err?.status === 429
          ? this.languageService.t('common.rateLimited')
          : err?.error?.message ?? this.languageService.t('regco.serverUnreachable'));
      }
    });
  }

  /** Başarısız kurulumdan sonra bilgiler korunarak adım 1'e dönülür (rollback tamamlandı). */
  retry(): void {
    this.stopPolling();
    this.provisionId = null;
    this.provisionStatus.set(null);
    this.startError.set(null);
    this.step.set(1);
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollSub = interval(1500).pipe(
      // Geçici ağ hataları polling'i öldürmesin — null yut, sonraki tikte tekrar dene
      switchMap(() => this.auth.getProvisionStatus(this.provisionId!).pipe(
        catchError(() => of(null))
      ))
    ).pipe(markDirty(this.cdr)).subscribe(res => {
      if (!res?.success || !res.data) return;

      this.provisionStatus.set(res.data);

      if (res.data.status === 'Completed') {
        this.stopPolling();
        this.step.set(4);
        this.autoLogin(res.data);
      } else if (res.data.status === 'Failed' || res.data.status === 'RolledBack') {
        // Son durum — hata + rollback bilgisi adım 3 ekranında gösterilir
        this.stopPolling();
      }
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  /** Tamamlanan kurulumda oturum açıp açılış sayfasına yönlendirir. */
  private autoLogin(status: ProvisionStatus): void {
    if (!status.autoLoginAvailable) {
      this.autoLoginFailed.set(true);
      return;
    }

    this.auth.startProvisionSession(status.provisionId).pipe(markDirty(this.cdr)).subscribe({
      next: res => {
        if (!res.success) {
          this.autoLoginFailed.set(true);
          return;
        }
        // LoginComponent.onLogin ile aynı akış: eski yetki sinyalini temizle,
        // yeni kullanıcının yetkilerini yükle, rolünün açılış sayfasına git.
        this.permissionService.clear();
        this.permissionService.loadMyPermissions().pipe(markDirty(this.cdr)).subscribe({
          next: () => this.router.navigateByUrl(this.permissionService.getLandingPage()),
          error: () => this.router.navigate(['/models'])
        });
      },
      error: () => this.autoLoginFailed.set(true)
    });
  }
}
