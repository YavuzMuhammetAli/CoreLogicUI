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

/** View state of a single step row on the setup screen. */
interface DisplayStep {
  name: string;
  state: 'pending' | 'running' | 'done' | 'failed';
  durationMs: number | null;
  error: string | null;
}

/**
 * New company sign-up wizard — 4 steps:
 * 1. Company details → 2. Administrator details → 3. Setup (real progress,
 * provision-status polling) → 4. Completed (automatic login).
 *
 * When verification is on, the application ends at step 2: "check your e-mail" is shown and setup
 * starts from step 3 when the `?token=` link in the e-mail reopens this screen.
 *
 * Setup runs in the background on the backend; this component polls the status with the
 * provisionId every ~1.5 s and shows the ProvisionLog steps with their real
 * statuses. The response of a completed setup contains a JWT —
 * the token is stored, permissions are loaded and the user goes straight to the workspace.
 */
@Component({
    selector: 'app-register-company',
    imports: [ReactiveFormsModule, RouterLink, TranslatePipe, IconComponent],
    templateUrl: './register-company.component.html',
    styleUrls: ['./register-company.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterCompanyComponent implements OnInit, OnDestroy {
  /** OnPush: to mark the view dirty when async data arrives (see markDirty). */
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

  /** Application received, waiting for the verification link. */
  readonly verificationSent = signal(false);
  /** The link in the e-mail is invalid or setup could not be started. */
  readonly verifyError = signal<string | null>(null);
  readonly isStarting = signal(false);
  readonly startError = signal<string | null>(null);
  readonly provisionStatus = signal<ProvisionStatus | null>(null);
  /** Setup finished but no token was obtained (10 min window passed, etc.) — show manual login. */
  readonly autoLoginFailed = signal(false);

  /** Has setup reached the Failed/RolledBack final state? */
  readonly provisionFailed = computed(() => {
    const status = this.provisionStatus()?.status;
    return status === 'Failed' || status === 'RolledBack';
  });

  /**
   * Fixed step order merged with the real statuses from the backend.
   * Steps the backend hasn't started yet appear as 'pending'.
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

  /** Arrived from the e-mail link: the setup screen opens, progress is tracked once verified. */
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

  /** Step 2 → start setup: the backend validates synchronously, returns provisionId, polling starts. */
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
        // Synchronous 400 errors such as duplicate code/email are returned to the user here
        this.startError.set(err?.status === 429
          ? this.languageService.t('common.rateLimited')
          : err?.error?.message ?? this.languageService.t('regco.serverUnreachable'));
      }
    });
  }

  /** After a failed setup, return to step 1 keeping the entered details (rollback completed). */
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
      // Transient network errors must not kill polling — swallow as null, retry on the next tick
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
        // Final state — error + rollback info is shown on the step 3 screen
        this.stopPolling();
      }
    });
  }

  private stopPolling(): void {
    this.pollSub?.unsubscribe();
    this.pollSub = null;
  }

  /** Signs in after a completed setup and redirects to the landing page. */
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
        // Same flow as LoginComponent.onLogin: clear the old permission signal,
        // load the new user's permissions, go to their role's landing page.
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
