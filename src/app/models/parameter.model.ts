/**
 * Data models of the Parameters screen (backup · email · subscription).
 * Match the backend `Entities.DTOs.ParameterDtos` one to one.
 *
 * The tenant is NOT SENT in any request — the backend always uses the ambient
 * tenant from the JWT.
 */

// ── Yedekleme ──────────────────────────────────────────────────────────────

/** GET/PUT /Parameter/backup/schedule — counterpart of BackupScheduleDto. */
export interface BackupSchedule {
  enabled: boolean;
  /** 5-field cron expression; produced by `utils/cron-builder.ts`. */
  cronExpression: string;
  /** Time zone the cron is interpreted in; UTC if empty. */
  timeZoneId?: string | null;
  /** Backup retention period (days). 0 = indefinite. */
  retentionDays: number;

  // Read-only state — ignored in the PUT body.
  nextDueAt?: string | null;
  lastRunAt?: string | null;
  lastOutcome?: string | null;
}

/** A GET /Parameter/backup/history row. */
export interface BackupHistoryItem {
  id: number;
  /** Manual | Scheduled | PreMigration | PrePurge | PreRestore */
  type: string;
  /** Queued | Running | Completed | Failed — "Şimdi Yedek Al" (Back up now) queues it, the job advances it. */
  status: string;
  sizeBytes: number;
  startedAt: string;
  completedAt?: string | null;
  /** Time RESTORE VERIFYONLY succeeded — proof of restorability. */
  verifiedAt?: string | null;
  error?: string | null;
  /** End of retention — deleted automatically after this date; null = indefinite. */
  expiresAt?: string | null;
  /** Schema version the backup was taken at; null = unknown. */
  databaseVersion?: number | null;
  /** A completed backup whose file is on disk — downloadable. */
  canDownload?: boolean;
  /** Is it restorable — the server's decision; the UI keeps no rule of its own. */
  canRestore?: boolean;
  /** not_completed | file_missing | version_unknown | version_newer */
  restoreBlockedReason?: string | null;
}

/** POST /Parameter/backup/{id}/download-link — a short-lived (2 min), single-purpose link. */
export interface BackupDownloadLink {
  /** Path relative to the API root (e.g. "Parameter/backup/download?token=…"). */
  url: string;
  expiresAt: string;
  fileName: string;
}

/** Body of POST /Parameter/backup/{id}/restore — double confirmation. */
export interface RestoreBackupRequest {
  companyCodeConfirmation: string;
  password: string;
}

/** Result of the master user reconciliation. */
export interface RestoreReconcileSummary {
  updated: number;
  created: number;
  removed: number;
  /** Email registered in another company — left untouched, cannot log in. */
  conflicts: string[];
}

/** Restore status — GET /Parameter/backup/restore/{id} and /active. */
export interface TenantRestore {
  id: number;
  backupId: number;
  preRestoreBackupId?: number | null;
  /** Queued | Running | Completed | Failed */
  status: string;
  /** Pending | SideRestore | SafetyBackup | Swap | Upgrade | Reconcile | Cleanup | Done */
  phase: string;
  fromVersion: number;
  toVersion?: number | null;
  error?: string | null;
  requestedAt: string;
  completedAt?: string | null;
  reconcile?: RestoreReconcileSummary | null;
}

/** Whether the restore has finished — the dialog stops polling. */
export function isRestoreFinished(restore: Pick<TenantRestore, 'status'>): boolean {
  return restore.status === 'Completed' || restore.status === 'Failed';
}

/** A queued or running backup — the history is polled while in this state. */
export function isBackupActive(item: Pick<BackupHistoryItem, 'status'>): boolean {
  return item.status === 'Queued' || item.status === 'Running';
}

// ── E-posta ────────────────────────────────────────────────────────────────

/**
 * GET/PUT /Parameter/mail — counterpart of MailSettingDto.
 *
 * `password` comes masked (`MASKED_PASSWORD`) on read. If the user does not touch it,
 * the same mask is sent back and the backend keeps the existing password.
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
  /** Root of the links in notification emails (http/https); if empty, no button appears in the mail. */
  appUrl?: string | null;
  /** Logo address in the notification email header (optional). */
  logoUrl?: string | null;
  /** Notification language for users without a language preference. */
  defaultLanguage: NotificationLanguage;
}

/**
 * The mask the backend returns instead of the saved password (same as PlatformConfigManager).
 * This value is loaded into the form as is; if it goes back unchanged, the password is kept.
 */
export const MASKED_PASSWORD = '••••••';

// ── Notification templates ─────────────────────────────────────────────────

/** Notification email language — the same set as TR/EN in the UI. */
export type NotificationLanguage = 'tr' | 'en';

/**
 * Notification kinds whose template can be customized — one to one with the backend `WorkflowNotifyKinds`
 * (in on-screen order). Reassignment uses the `TaskAssigned` kind.
 */
export const NOTIFICATION_TEMPLATE_KINDS = [
  'TaskAssigned',
  'TaskEscalated',
  'TaskExpired',
  'WorkflowCompleted',
  'WorkflowRejected'
] as const;

export type NotificationTemplateKind = (typeof NOTIFICATION_TEMPLATE_KINDS)[number];

/** A GET /Parameter/mail/templates row. */
export interface NotificationTemplateSummary {
  kind: NotificationTemplateKind;
  language: NotificationLanguage;
  /** Has the admin saved their own template for this kind+language. */
  isCustom: boolean;
}

/** GET /Parameter/mail/templates/{kind} — effective template + embedded default. */
export interface NotificationTemplate {
  kind: NotificationTemplateKind;
  language: NotificationLanguage;
  isCustom: boolean;
  subject: string;
  html: string;
  defaultSubject: string;
  defaultHtml: string;
  /** Available placeholder names — written as `{{name}}` in the template. */
  placeholders: string[];
}

/** Body of PUT .../{kind} and POST .../{kind}/preview. */
export interface NotificationTemplateContent {
  subject: string;
  html: string;
}

/** Body of POST .../{kind}/test. */
export interface NotificationTemplateTestRequest extends NotificationTemplateContent {
  to: string;
}

// ── Abonelik ───────────────────────────────────────────────────────────────

/**
 * Plan feature/limit. If `limitValue` is null it is a bool feature (presence = enabled).
 * The label and unit name come from the backend `MetricCatalog` on the server, in the request's language; the list
 * also comes in catalog order — the UI keeps no key list or label table.
 */
export interface TenantPlanFeature {
  featureKey: string;
  limitValue?: string | null;
  unit?: string | null;
  label: string;
  unitLabel?: string | null;
  kind: 'flag' | 'quota' | 'metric';
}

/** A GET /Parameter/subscription/plans row. */
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

/** Body of POST /Parameter/subscription/purchase. */
export interface PurchasePlanRequest {
  planId: number;
  seats: number;
}
