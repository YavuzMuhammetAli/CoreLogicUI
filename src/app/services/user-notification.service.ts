import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { UserNotification } from '../models/userNotification';
import { environment } from '../../environments/environment';

/**
 * Uygulama içi bildirimler — backend UserNotificationController (`/UserNotification`).
 *
 * Toast gösteren `NotificationService` ile KARIŞTIRILMAMALI: o istemci tarafı
 * anlık uyarıdır, bu ise sunucuda kalıcı duran, okundu bilgisi olan bildirimdir.
 *
 * Tüm uçlar oturumdaki kullanıcının KENDİ bildirimleriyle sınırlı; kullanıcı
 * kimliği gönderilmez, sunucu token'dan okur.
 */
@Injectable({ providedIn: 'root' })
export class UserNotificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/UserNotification`;

  my(take = 20, unreadOnly = false): Observable<ListResponseModel<UserNotification>> {
    const params = new HttpParams().set('take', take).set('unreadOnly', unreadOnly);
    return this.http.get<ListResponseModel<UserNotification>>(`${this.baseUrl}/my`, { params });
  }

  /** Zil rozeti — tam listeyi çekmeden yalnız sayı. */
  unreadCount(): Observable<DataResponseModel<number>> {
    return this.http.get<DataResponseModel<number>>(`${this.baseUrl}/unreadCount`);
  }

  markRead(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/markRead`, null, { params: new HttpParams().set('id', id) });
  }

  markAllRead(): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/markAllRead`, null);
  }
}
