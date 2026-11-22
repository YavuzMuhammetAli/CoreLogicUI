import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import {
  BackupDownloadLink,
  BackupHistoryItem,
  BackupSchedule,
  MailSetting,
  NotificationLanguage,
  NotificationTemplate,
  NotificationTemplateContent,
  NotificationTemplateKind,
  NotificationTemplateSummary,
  NotificationTemplateTestRequest,
  PurchasePlanRequest,
  RestoreBackupRequest,
  TenantPlan,
  TenantRestore,
  TenantSubscription
} from '../models/parameter.model';

/**
 * Tenant parameters — admin only (backend `[Authorize(Roles = "admin")]`).
 *
 * The tenant is NOT sent by the client: every endpoint runs in the ambient tenant of the
 * calling admin's JWT; another company's backups/subscription cannot be seen.
 */
@Injectable({ providedIn: 'root' })
export class ParameterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Parameter`;

  // ── Yedekleme ────────────────────────────────────────────────────────────

  /** Saved schedule; if none was ever defined, returns a disabled/empty form (not an error). */
  getBackupSchedule(): Observable<DataResponseModel<BackupSchedule>> {
    return this.http.get<DataResponseModel<BackupSchedule>>(`${this.baseUrl}/backup/schedule`);
  }

  /** Saves the schedule; the backend rejects an invalid cron. */
  saveBackupSchedule(body: BackupSchedule): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/backup/schedule`, body);
  }

  /** Backup history of this tenant (newest first, at most 50 rows). */
  getBackupHistory(): Observable<ListResponseModel<BackupHistoryItem>> {
    return this.http.get<ListResponseModel<BackupHistoryItem>>(`${this.baseUrl}/backup/history`);
  }

  /**
   * Queues a backup and returns immediately (the backup's ID). The backup runs in the background;
   * progress is tracked in the history as Queued → Running → Completed.
   */
  runBackupNow(): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/backup/run`, null);
  }

  /**
   * Short-lived link to download a backup. The file can be gigabytes, so it is not loaded into
   * memory as a blob: the browser opens the link directly, authorization is in the signed token in the URL.
   */
  getBackupDownloadLink(backupId: number): Observable<DataResponseModel<BackupDownloadLink>> {
    return this.http.post<DataResponseModel<BackupDownloadLink>>(`${this.baseUrl}/backup/${backupId}/download-link`, null);
  }

  /** Full address of the download link (API root + the relative path the server returned). */
  backupDownloadUrl(link: BackupDownloadLink): string {
    return `${environment.apiBaseUrl}/${link.url}`;
  }

  /** Queues a backup restore — the company code is retyped and the password is required. */
  restoreBackup(backupId: number, body: RestoreBackupRequest): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/backup/${backupId}/restore`, body);
  }

  /** Restore status — also answers during maintenance and while the session is invalid. */
  getRestore(restoreId: number): Observable<DataResponseModel<TenantRestore>> {
    return this.http.get<DataResponseModel<TenantRestore>>(`${this.baseUrl}/backup/restore/${restoreId}`);
  }

  /** The running restore (data null if none) — so progress shows even after a page reload. */
  getActiveRestore(): Observable<DataResponseModel<TenantRestore | null>> {
    return this.http.get<DataResponseModel<TenantRestore | null>>(`${this.baseUrl}/backup/restore/active`);
  }

  // ── E-posta ──────────────────────────────────────────────────────────────

  /** SMTP settings; the password is returned masked, not with its real value. */
  getMailSetting(): Observable<DataResponseModel<MailSetting>> {
    return this.http.get<DataResponseModel<MailSetting>>(`${this.baseUrl}/mail`);
  }

  /** Saves the settings. If the password is sent masked, the existing password is kept. */
  saveMailSetting(body: MailSetting): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/mail`, body);
  }

  /** Sends a test mail with the saved settings; an SMTP error is returned in the message. */
  sendTestMail(to: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/mail/test`, { to });
  }

  // ── Notification templates ───────────────────────────────────────────────

  /** Kind list; whether a custom template is saved for each kind. */
  listNotificationTemplates(
    lang: NotificationLanguage
  ): Observable<ListResponseModel<NotificationTemplateSummary>> {
    return this.http.get<ListResponseModel<NotificationTemplateSummary>>(
      `${this.baseUrl}/mail/templates`, { params: { lang } });
  }

  /** Effective template + embedded default + available placeholders. */
  getNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage
  ): Observable<DataResponseModel<NotificationTemplate>> {
    return this.http.get<DataResponseModel<NotificationTemplate>>(
      `${this.baseUrl}/mail/templates/${kind}`, { params: { lang } });
  }

  /** Saves the custom template; the backend rejects it if it contains an unknown placeholder. */
  saveNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage,
    body: NotificationTemplateContent
  ): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(
      `${this.baseUrl}/mail/templates/${kind}`, body, { params: { lang } });
  }

  /** Deletes the custom template — the kind falls back to the embedded default. */
  resetNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage
  ): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(
      `${this.baseUrl}/mail/templates/${kind}`, { params: { lang } });
  }

  /**
   * Renders an unsaved template with sample data. Rendering happens on the server so that
   * the preview and the real send go through the same engine.
   */
  previewNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage,
    body: NotificationTemplateContent
  ): Observable<DataResponseModel<NotificationTemplateContent>> {
    return this.http.post<DataResponseModel<NotificationTemplateContent>>(
      `${this.baseUrl}/mail/templates/${kind}/preview`, body, { params: { lang } });
  }

  /** Actually sends the template with sample data; an SMTP error is returned in the message. */
  sendNotificationTemplateTest(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage,
    body: NotificationTemplateTestRequest
  ): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/mail/templates/${kind}/test`, body, { params: { lang } });
  }

  // ── Abonelik ─────────────────────────────────────────────────────────────

  /** Purchasable plans; the tenant's current plan is marked with `isCurrent`. */
  getPlans(): Observable<ListResponseModel<TenantPlan>> {
    return this.http.get<ListResponseModel<TenantPlan>>(`${this.baseUrl}/subscription/plans`);
  }

  /** The tenant's current subscription; returns success=false if there is none. */
  getCurrentSubscription(): Observable<DataResponseModel<TenantSubscription>> {
    return this.http.get<DataResponseModel<TenantSubscription>>(
      `${this.baseUrl}/subscription/current`);
  }

  /**
   * Purchases the plan. Payment currently goes through a stub provider (always succeeds);
   * the subscription row is written for real. This endpoint will not change when Stripe arrives.
   */
  purchasePlan(body: PurchasePlanRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/subscription/purchase`, body);
  }
}
