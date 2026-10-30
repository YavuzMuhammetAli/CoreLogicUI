import {
  ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ParameterService } from '../../../services/parameter.service';
import { LanguageService } from '../../../services/language.service';
import { AuthService } from '../../../services/auth.service';
import { PermissionService } from '../../../services/permission.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { BackupHistoryItem, TenantRestore, isRestoreFinished } from '../../../models/parameter.model';
import { formatDate } from '../../../utils/locale-format';
import { IconComponent } from '../../shared/icon/icon.component';

/** Diyaloğun adımı: onay formu → sunucuya gönderiliyor → ilerleme → sonuç. */
type Step = 'confirm' | 'submitting' | 'progress' | 'done' | 'failed';

/** Kullanıcıya gösterilen fazlar (sunucudaki RestorePhase sırasıyla). */
const PHASES = ['SideRestore', 'SafetyBackup', 'Swap', 'Upgrade', 'Reconcile', 'Cleanup'] as const;

/** Geri yükleme sürerken durumun yoklanma aralığı. */
const POLL_MS = 2000;

/**
 * Yedekten geri yükleme diyaloğu — yıkıcı ve geri alınamaz bir işlem olduğu için çift onaylıdır:
 * şirket kodu aynen yeniden yazılır ve parola istenir (açık bırakılmış bir oturumdan geri
 * yükleme yapılamasın). Sunucu işi kuyruğa alır; diyalog fazları yoklayarak gösterir.
 *
 * Bittiğinde herkesin oturumu geçersizdir (geri yüklenen veritabanında kullanıcı kimlikleri
 * değişebilir) — diyalog uzlaştırma özetini gösterip kullanıcıyı yeniden girişe yollar.
 * Durum ucu bakım sırasında ve oturum geçersizken de yanıt verir (sunucuda muaf).
 */
@Component({
    selector: 'app-backup-restore-dialog',
    imports: [FormsModule, TranslatePipe, IconComponent],
    templateUrl: './backup-restore-dialog.component.html',
    styleUrls: ['./backup-restore-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class BackupRestoreDialogComponent {
  private readonly parameterService = inject(ParameterService);
  private readonly languageService = inject(LanguageService);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  /** Geri yüklenecek yedek — onay adımıyla açar. */
  readonly backup = input<BackupHistoryItem | null>(null);
  /** Sayfa açıldığında süren bir geri yükleme varsa doğrudan ilerleme adımıyla açar. */
  readonly activeRestore = input<TenantRestore | null>(null);
  /** Diyalog kapandı (yalnız onay ya da başarısız adımda kapatılabilir). */
  readonly closed = output<void>();

  readonly phases = PHASES;
  readonly step = signal<Step>('confirm');
  readonly restore = signal<TenantRestore | null>(null);
  readonly error = signal('');

  readonly codeInput = signal('');
  readonly passwordInput = signal('');

  /** Onay için aynen yazılacak şirket kodu (JWT'deki tenant). */
  readonly companyCode = this.auth.getSessionUser()?.tenantId ?? '';

  readonly open = computed(() => !!this.backup() || !!this.activeRestore() || this.step() !== 'confirm');

  readonly canSubmit = computed(() =>
    this.codeInput().trim().toLowerCase() === this.companyCode.toLowerCase()
    && this.companyCode.length > 0
    && this.passwordInput().length > 0
    && this.step() === 'confirm');

  readonly currentPhaseIndex = computed(() => PHASES.indexOf((this.restore()?.phase ?? '') as typeof PHASES[number]));

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  /** Kapanışta süren bir istek yanıt verince yeni yoklama zinciri başlamasın. */
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopPolling();
    });

    // Sayfa yenilendiğinde süren geri yükleme: onay adımı atlanır, ilerleme gösterilir.
    effect(() => {
      const active = this.activeRestore();
      if (!active) return;
      untracked(() => this.track(active));
    }, { allowSignalWrites: true });
  }

  backupDate(): string {
    const value = this.backup()?.completedAt ?? this.backup()?.startedAt;
    return value ? formatDate(new Date(value), this.languageService.lang()) : '';
  }

  phaseState(index: number): 'done' | 'current' | 'pending' {
    const current = this.currentPhaseIndex();
    if (this.restore()?.status === 'Completed') return 'done';
    if (index < current) return 'done';
    return index === current ? 'current' : 'pending';
  }

  submit(): void {
    const backup = this.backup();
    if (!backup || !this.canSubmit()) return;

    this.step.set('submitting');
    this.error.set('');

    this.parameterService.restoreBackup(backup.id, {
      companyCodeConfirmation: this.codeInput().trim(),
      password: this.passwordInput()
    }).subscribe({
      next: res => {
        this.passwordInput.set('');
        if (!res.success) {
          this.error.set(res.message);
          this.step.set('confirm');
          return;
        }
        this.track({ id: res.data } as TenantRestore);
      },
      error: (err: { error?: { message?: string } }) => {
        this.passwordInput.set('');
        this.error.set(err?.error?.message ?? this.languageService.t('parameter.backup.restoreFailed'));
        this.step.set('confirm');
      }
    });
  }

  /** Bittikten sonra herkesin oturumu geçersiz — yeniden giriş zorunlu. */
  signInAgain(): void {
    this.auth.logout().subscribe(() => {
      this.permissions.clear();
      this.router.navigate(['/login'], { queryParams: { reason: 'tenant_restored' } });
    });
  }

  close(): void {
    if (this.step() === 'submitting' || this.step() === 'progress' || this.step() === 'done') return;
    this.stopPolling();
    this.step.set('confirm');
    this.restore.set(null);
    this.error.set('');
    this.codeInput.set('');
    this.passwordInput.set('');
    this.closed.emit();
  }

  private track(restore: TenantRestore): void {
    this.restore.set(restore.status ? restore : null);
    this.step.set('progress');
    this.poll(restore.id);
  }

  private poll(restoreId: number): void {
    this.stopPolling();
    this.parameterService.getRestore(restoreId).subscribe({
      next: res => {
        if (res.success && res.data) {
          this.restore.set(res.data);
          if (isRestoreFinished(res.data)) {
            this.step.set(res.data.status === 'Completed' ? 'done' : 'failed');
            if (res.data.status === 'Failed') this.error.set(res.data.error ?? '');
            return;
          }
        }
        this.schedule(restoreId);
      },
      // Takas sırasında kısa kesintiler olabilir — yoklama sürer.
      error: () => this.schedule(restoreId)
    });
  }

  private schedule(restoreId: number): void {
    if (this.destroyed) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.poll(restoreId);
    }, POLL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
