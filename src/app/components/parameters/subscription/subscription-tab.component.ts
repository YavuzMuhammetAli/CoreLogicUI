import {
  ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal, untracked
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ParameterService } from '../../../services/parameter.service';
import { LanguageService } from '../../../services/language.service';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { TenantPlan, TenantPlanFeature, TenantSubscription } from '../../../models/parameter.model';
import { formatDate, formatNumber } from '../../../utils/locale-format';

/**
 * Abonelik sekmesi — mevcut abonelik + satın alınabilir planlar.
 *
 * Ödeme şu an backend'de stub sağlayıcıdan geçiyor (her tahsilat başarılı) ama
 * abonelik satırı gerçekten yazılıyor. Kullanıcıya bu durum açıkça bildirilir —
 * ücret alınmadığını bilmeden plan değiştirmesi yanıltıcı olurdu.
 */
@Component({
  selector: 'app-subscription-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './subscription-tab.component.html',
  styleUrls: ['../parameters.shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubscriptionTabComponent implements OnInit {
  private readonly parameterService = inject(ParameterService);
  private readonly languageService = inject(LanguageService);

  readonly loading = signal(true);
  readonly purchasing = signal(false);
  readonly loadError = signal('');
  readonly actionError = signal('');
  readonly actionSuccess = signal('');

  readonly plans = signal<TenantPlan[]>([]);
  readonly subscription = signal<TenantSubscription | null>(null);

  /** Kullanıcı sayısı plan kartında seçilir; varsayılan mevcut abonelikten gelir. */
  readonly seats = signal(1);

  readonly pendingPlan = signal<TenantPlan | null>(null);

  readonly confirmMessage = computed(() => {
    const plan = this.pendingPlan();
    return plan
      ? this.languageService.t('parameter.subscription.confirmMessage', { plan: plan.name })
      : '';
  });

  constructor() {
    // Özellik adları sunucuda isteğin dilinde üretilir: dil değişince planlar yeniden istenir.
    let firstRun = true;
    effect(() => {
      this.languageService.lang();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => this.loadPlans());
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loadPlans();

    // Aboneliği olmayan tenant hata değil, "henüz plan seçilmedi" durumudur —
    // bu yüzden başarısız yanıt loadError'a yazılmaz.
    this.parameterService.getCurrentSubscription().subscribe({
      next: res => {
        if (res.success && res.data) {
          this.subscription.set(res.data);
          this.seats.set(res.data.seats || 1);
        } else {
          this.subscription.set(null);
        }
      },
      error: () => this.subscription.set(null)
    });
  }

  private loadPlans(): void {
    this.loading.set(true);
    this.loadError.set('');

    this.parameterService.getPlans().subscribe({
      next: res => {
        this.plans.set(res.success ? (res.data ?? []) : []);
        if (!res.success) this.loadError.set(res.message);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(this.languageService.t('parameter.subscription.loadFailed'));
        this.loading.set(false);
      }
    });
  }

  requestPurchase(plan: TenantPlan): void {
    this.actionError.set('');
    this.actionSuccess.set('');
    this.pendingPlan.set(plan);
  }

  cancelPurchase(): void {
    this.pendingPlan.set(null);
  }

  confirmPurchase(): void {
    const plan = this.pendingPlan();
    if (!plan) return;

    this.purchasing.set(true);
    this.parameterService.purchasePlan({ planId: plan.id, seats: this.seats() }).subscribe({
      next: res => {
        if (res.success) {
          this.actionSuccess.set(res.message);
          this.load();
        } else {
          this.actionError.set(res.message);
        }
        this.purchasing.set(false);
        this.pendingPlan.set(null);
      },
      error: () => {
        this.actionError.set(this.languageService.t('parameter.subscription.purchaseFailed'));
        this.purchasing.set(false);
        this.pendingPlan.set(null);
      }
    });
  }

  // ── Görüntüleme yardımcıları ──────────────────────────────────────────────

  /** Sunucu etiket göndermediyse (eski backend) ham anahtar gösterilir — anahtar uydurma yok. */
  featureLabel(feature: TenantPlanFeature): string {
    return feature.label || feature.featureKey;
  }

  /** Sayısal kota yoksa özellik bool'dur: varlığı "Dahil" demektir. */
  featureValue(feature: TenantPlanFeature): string {
    if (feature.limitValue === null || feature.limitValue === undefined || feature.limitValue === '') {
      return this.languageService.t('parameter.subscription.featureIncluded');
    }

    const numeric = Number(feature.limitValue);
    const text = Number.isFinite(numeric)
      ? formatNumber(numeric, this.languageService.lang())
      : feature.limitValue;

    const unit = feature.unitLabel || feature.unit;
    return unit ? `${text} ${unit}` : text;
  }

  statusLabel(status: string): string {
    const key = `parameter.subscription.status.${status}`;
    const label = this.languageService.t(key);
    return label === key ? status : label;
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'Active': return 'badge-success';
      case 'Trial': return 'badge-meta';
      case 'PastDue':
      case 'Suspended': return 'badge-warn';
      case 'Cancelled':
      case 'Expired': return 'badge-danger';
      default: return 'badge-meta';
    }
  }

  formatInstant(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : formatDate(date, this.languageService.lang());
  }
}
