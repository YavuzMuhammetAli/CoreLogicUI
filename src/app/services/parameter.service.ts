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
 * Tenant parametreleri — yalnızca admin (backend `[Authorize(Roles = "admin")]`).
 *
 * Tenant istemciden GÖNDERİLMEZ: tüm uçlar çağıran admin'in JWT'sindeki ambient
 * tenant'ında çalışır; başka bir şirketin yedeği/aboneliği görülemez.
 */
@Injectable({ providedIn: 'root' })
export class ParameterService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Parameter`;

  // ── Yedekleme ────────────────────────────────────────────────────────────

  /** Kayıtlı zamanlama; hiç tanımlanmadıysa kapalı/boş form döner (hata değil). */
  getBackupSchedule(): Observable<DataResponseModel<BackupSchedule>> {
    return this.http.get<DataResponseModel<BackupSchedule>>(`${this.baseUrl}/backup/schedule`);
  }

  /** Zamanlamayı kaydeder; cron geçersizse backend reddeder. */
  saveBackupSchedule(body: BackupSchedule): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/backup/schedule`, body);
  }

  /** Bu tenant'ın yedek geçmişi (en yeni önce, en fazla 50 satır). */
  getBackupHistory(): Observable<ListResponseModel<BackupHistoryItem>> {
    return this.http.get<ListResponseModel<BackupHistoryItem>>(`${this.baseUrl}/backup/history`);
  }

  /**
   * Yedeği kuyruğa alır ve hemen döner (yedeğin kimliği). Yedek arka planda alınır;
   * ilerleme geçmişte Queued → Running → Completed olarak izlenir.
   */
  runBackupNow(): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/backup/run`, null);
  }

  /**
   * Yedeği indirmek için kısa ömürlü bağlantı. Dosya gigabaytlarca olabileceğinden blob olarak
   * belleğe alınmaz: tarayıcı bağlantıyı doğrudan açar, yetki URL'deki imzalı token'dadır.
   */
  getBackupDownloadLink(backupId: number): Observable<DataResponseModel<BackupDownloadLink>> {
    return this.http.post<DataResponseModel<BackupDownloadLink>>(`${this.baseUrl}/backup/${backupId}/download-link`, null);
  }

  /** İndirme bağlantısının tam adresi (API kökü + sunucunun verdiği göreli yol). */
  backupDownloadUrl(link: BackupDownloadLink): string {
    return `${environment.apiBaseUrl}/${link.url}`;
  }

  /** Yedeği geri yüklemeyi kuyruğa alır — şirket kodu yeniden yazılır, parola istenir. */
  restoreBackup(backupId: number, body: RestoreBackupRequest): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/backup/${backupId}/restore`, body);
  }

  /** Geri yükleme durumu — bakım sırasında ve oturum geçersizken de yanıt verir. */
  getRestore(restoreId: number): Observable<DataResponseModel<TenantRestore>> {
    return this.http.get<DataResponseModel<TenantRestore>>(`${this.baseUrl}/backup/restore/${restoreId}`);
  }

  /** Süren geri yükleme (yoksa data null) — sayfa yenilense de ilerleme gösterilsin. */
  getActiveRestore(): Observable<DataResponseModel<TenantRestore | null>> {
    return this.http.get<DataResponseModel<TenantRestore | null>>(`${this.baseUrl}/backup/restore/active`);
  }

  // ── E-posta ──────────────────────────────────────────────────────────────

  /** SMTP ayarları; parola gerçek değeriyle değil maskeli döner. */
  getMailSetting(): Observable<DataResponseModel<MailSetting>> {
    return this.http.get<DataResponseModel<MailSetting>>(`${this.baseUrl}/mail`);
  }

  /** Ayarları kaydeder. Parola maskeli gönderilirse mevcut parola korunur. */
  saveMailSetting(body: MailSetting): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(`${this.baseUrl}/mail`, body);
  }

  /** Kayıtlı ayarlarla deneme maili gönderir; SMTP hatası mesajda döner. */
  sendTestMail(to: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/mail/test`, { to });
  }

  // ── Bildirim şablonları ──────────────────────────────────────────────────

  /** Tür listesi; her tür için özel şablon kayıtlı mı. */
  listNotificationTemplates(
    lang: NotificationLanguage
  ): Observable<ListResponseModel<NotificationTemplateSummary>> {
    return this.http.get<ListResponseModel<NotificationTemplateSummary>>(
      `${this.baseUrl}/mail/templates`, { params: { lang } });
  }

  /** Etkin şablon + gömülü varsayılan + kullanılabilir yer tutucular. */
  getNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage
  ): Observable<DataResponseModel<NotificationTemplate>> {
    return this.http.get<DataResponseModel<NotificationTemplate>>(
      `${this.baseUrl}/mail/templates/${kind}`, { params: { lang } });
  }

  /** Özel şablonu kaydeder; bilinmeyen yer tutucu içerirse backend reddeder. */
  saveNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage,
    body: NotificationTemplateContent
  ): Observable<ResponseModel> {
    return this.http.put<ResponseModel>(
      `${this.baseUrl}/mail/templates/${kind}`, body, { params: { lang } });
  }

  /** Özel şablonu siler — tür gömülü varsayılana döner. */
  resetNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage
  ): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(
      `${this.baseUrl}/mail/templates/${kind}`, { params: { lang } });
  }

  /**
   * Kaydedilmemiş şablonu örnek veriyle render eder. Render sunucuda yapılır ki
   * önizleme ile gerçek gönderim aynı motordan geçsin.
   */
  previewNotificationTemplate(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage,
    body: NotificationTemplateContent
  ): Observable<DataResponseModel<NotificationTemplateContent>> {
    return this.http.post<DataResponseModel<NotificationTemplateContent>>(
      `${this.baseUrl}/mail/templates/${kind}/preview`, body, { params: { lang } });
  }

  /** Şablonu örnek veriyle gerçekten gönderir; SMTP hatası mesajda döner. */
  sendNotificationTemplateTest(
    kind: NotificationTemplateKind,
    lang: NotificationLanguage,
    body: NotificationTemplateTestRequest
  ): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/mail/templates/${kind}/test`, body, { params: { lang } });
  }

  // ── Abonelik ─────────────────────────────────────────────────────────────

  /** Satın alınabilir planlar; tenant'ın mevcut planı `isCurrent` ile işaretli. */
  getPlans(): Observable<ListResponseModel<TenantPlan>> {
    return this.http.get<ListResponseModel<TenantPlan>>(`${this.baseUrl}/subscription/plans`);
  }

  /** Tenant'ın yürürlükteki aboneliği; yoksa success=false döner. */
  getCurrentSubscription(): Observable<DataResponseModel<TenantSubscription>> {
    return this.http.get<DataResponseModel<TenantSubscription>>(
      `${this.baseUrl}/subscription/current`);
  }

  /**
   * Planı satın alır. Ödeme şu an stub sağlayıcıdan geçer (her zaman başarılı);
   * abonelik satırı gerçek olarak yazılır. Stripe geldiğinde bu uç değişmez.
   */
  purchasePlan(body: PurchasePlanRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/subscription/purchase`, body);
  }
}
