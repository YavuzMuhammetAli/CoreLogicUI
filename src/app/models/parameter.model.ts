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
  /** Manual | Scheduled | PreMigration | PrePurge | PreRestore */
  type: string;
  /** Queued | Running | Completed | Failed — "Şimdi Yedek Al" kuyruğa alır, iş ilerletir. */
  status: string;
  sizeBytes: number;
  startedAt: string;
  completedAt?: string | null;
  /** RESTORE VERIFYONLY başarı zamanı — geri yüklenebilirlik kanıtı. */
  verifiedAt?: string | null;
  error?: string | null;
  /** Saklama sonu — bu tarihten sonra otomatik silinir; null = süresiz. */
  expiresAt?: string | null;
}

/** Kuyrukta ya da sürmekte olan yedek — geçmiş bu durumdayken yoklanır. */
export function isBackupActive(item: Pick<BackupHistoryItem, 'status'>): boolean {
  return item.status === 'Queued' || item.status === 'Running';
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
  /** Bildirim e-postasındaki bağlantıların kökü (http/https); boşsa mailde buton çıkmaz. */
  appUrl?: string | null;
  /** Bildirim e-postası başlığındaki logo adresi (isteğe bağlı). */
  logoUrl?: string | null;
  /** Dil tercihi olmayan kullanıcıların bildirim dili. */
  defaultLanguage: NotificationLanguage;
}

/**
 * Backend'in kayıtlı parola yerine döndürdüğü maske (PlatformConfigManager ile aynı).
 * Bu değer forma olduğu gibi yüklenir; değişmeden geri giderse parola korunur.
 */
export const MASKED_PASSWORD = '••••••';

// ── Bildirim şablonları ────────────────────────────────────────────────────

/** Bildirim e-postası dili — UI'daki TR/EN ile aynı küme. */
export type NotificationLanguage = 'tr' | 'en';

/**
 * Şablonu özelleştirilebilen bildirim türleri — backend `WorkflowNotifyKinds`
 * ile birebir (ekrandaki sırayla). Yeniden atama `TaskAssigned` türünü kullanır.
 */
export const NOTIFICATION_TEMPLATE_KINDS = [
  'TaskAssigned',
  'TaskEscalated',
  'TaskExpired',
  'WorkflowCompleted',
  'WorkflowRejected'
] as const;

export type NotificationTemplateKind = (typeof NOTIFICATION_TEMPLATE_KINDS)[number];

/** GET /Parameter/mail/templates satırı. */
export interface NotificationTemplateSummary {
  kind: NotificationTemplateKind;
  language: NotificationLanguage;
  /** Admin bu tür+dil için kendi şablonunu kaydetmiş mi. */
  isCustom: boolean;
}

/** GET /Parameter/mail/templates/{kind} — etkin şablon + gömülü varsayılan. */
export interface NotificationTemplate {
  kind: NotificationTemplateKind;
  language: NotificationLanguage;
  isCustom: boolean;
  subject: string;
  html: string;
  defaultSubject: string;
  defaultHtml: string;
  /** Kullanılabilir yer tutucu adları — şablonda `{{ad}}` olarak yazılır. */
  placeholders: string[];
}

/** PUT .../{kind} ve POST .../{kind}/preview gövdesi. */
export interface NotificationTemplateContent {
  subject: string;
  html: string;
}

/** POST .../{kind}/test gövdesi. */
export interface NotificationTemplateTestRequest extends NotificationTemplateContent {
  to: string;
}

// ── Abonelik ───────────────────────────────────────────────────────────────

/**
 * Plan özelliği/limiti. `limitValue` null ise bool özellik (varlığı = açık).
 * Etiket ve birim adı sunucuda, isteğin dilinde backend `MetricCatalog`'dan gelir; liste de
 * katalog sırasıyla döner — arayüz anahtar listesi ya da etiket tablosu tutmaz.
 */
export interface TenantPlanFeature {
  featureKey: string;
  limitValue?: string | null;
  unit?: string | null;
  label: string;
  unitLabel?: string | null;
  kind: 'flag' | 'quota' | 'metric';
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
