import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import {
  BackupHistoryItem,
  BackupSchedule,
  MailSetting,
  PurchasePlanRequest,
  TenantPlan,
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
   * Zamanlamayı beklemeden hemen yedek alır. Yedekleme backend'de SENKRON
   * koştuğu için büyük veritabanlarında istek uzun sürebilir.
   */
  runBackupNow(): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/backup/run`, null);
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
