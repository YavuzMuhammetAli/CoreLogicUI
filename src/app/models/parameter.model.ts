/**
 * Parametreler ekranının (yedekleme · e-posta · abonelik) veri modelleri.
 * Backend `Entities.DTOs.ParameterDtos` ile bire bir eşleşir.
 *
 * Tenant hiçbir istekte GÖNDERİLMEZ — backend her zaman JWT'deki ambient
 * tenant'ı kullanır.
 */

// ── Yedekleme ──────────────────────────────────────────────────────────────

/** GET/PUT /Parameter/backup/schedule — BackupScheduleDto karşılığı. */
export interface BackupSchedule {
  enabled: boolean;
  /** 5 alanlı cron ifadesi; `utils/cron-builder.ts` üretir. */
  cronExpression: string;
  /** Cron'un yorumlanacağı saat dilimi; boşsa UTC. */
  timeZoneId?: string | null;
  /** Yedeklerin saklanma süresi (gün). 0 = süresiz. */
  retentionDays: number;

  // Salt-okunur durum — PUT gövdesinde yok sayılır.
  nextDueAt?: string | null;
  lastRunAt?: string | null;
  lastOutcome?: string | null;
}

/** GET /Parameter/backup/history satırı. */
export interface BackupHistoryItem {
  id: number;
  /** Manual | Scheduled | PreMigration | PrePurge */
  type: string;
  /** Running | Completed | Failed */
  status: string;
  sizeBytes: number;
  startedAt: string;
  completedAt?: string | null;
  /** RESTORE VERIFYONLY başarı zamanı — geri yüklenebilirlik kanıtı. */
  verifiedAt?: string | null;
  error?: string | null;
}

// ── E-posta ────────────────────────────────────────────────────────────────

/**
 * GET/PUT /Parameter/mail — MailSettingDto karşılığı.
 *
 * `password` okumada maskeli (`MASKED_PASSWORD`) gelir. Kullanıcı dokunmazsa
 * aynı maske geri gönderilir ve backend mevcut parolayı korur.
 */
export interface MailSetting {
  enabled: boolean;
  host: string;
  port: number;
  user?: string | null;
  password?: string | null;
  from: string;
  fromName?: string | null;
  useSsl: boolean;
}

/**
 * Backend'in kayıtlı parola yerine döndürdüğü maske (PlatformConfigManager ile aynı).
 * Bu değer forma olduğu gibi yüklenir; değişmeden geri giderse parola korunur.
 */
export const MASKED_PASSWORD = '••••••';

// ── Abonelik ───────────────────────────────────────────────────────────────

/** Plan özelliği/limiti. `limitValue` null ise bool özellik (varlığı = açık). */
export interface TenantPlanFeature {
  featureKey: string;
  limitValue?: string | null;
  unit?: string | null;
}

/** GET /Parameter/subscription/plans satırı. */
export interface TenantPlan {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  trialDays: number;
  isCurrent: boolean;
  features: TenantPlanFeature[];
}

/** GET /Parameter/subscription/current. */
export interface TenantSubscription {
  id: number;
  planCode: string;
  planName: string;
  /** Trial | Active | PastDue | Suspended | Cancelled | Expired */
  status: string;
  seats: number;
  startsAt: string;
  endsAt?: string | null;
  trialEndsAt?: string | null;
}

/** POST /Parameter/subscription/purchase gövdesi. */
export interface PurchasePlanRequest {
  planId: number;
  seats: number;
}

/**
 * Backend'in bildiği özellik anahtarları (Entities.Concrete.Master.FeatureKeys).
 * Sıra, plan kartındaki özellik listesinin gösterim sırasını belirler.
 */
export const FEATURE_KEY_ORDER: readonly string[] = [
  'max_users',
  'max_models',
  'max_storage_gb',
  'api_requests_per_day',
  'ai_tokens_per_month',
  'feature_reports',
  'feature_api_access'
];
