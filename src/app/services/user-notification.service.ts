import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { UserNotification } from '../models/userNotification';
import { environment } from '../../environments/environment';

/**
 * In-app notifications — backend UserNotificationController (`/UserNotification`).
 *
 * NOT TO BE CONFUSED with `NotificationService`, which shows toasts: that is a client-side
 * instant alert, whereas this is a notification persisted on the server with read status.
 *
 * Every endpoint is limited to the session user's OWN notifications; no user
 * ID is sent, the server reads it from the token.
 */
@Injectable({ providedIn: 'root' })
export class UserNotificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/UserNotification`;

  my(take = 20, unreadOnly = false): Observable<ListResponseModel<UserNotification>> {
    const params = new HttpParams().set('take', take).set('unreadOnly', unreadOnly);
    return this.http.get<ListResponseModel<UserNotification>>(`${this.baseUrl}/my`, { params });
  }

  /** Bell badge — only the count, without fetching the full list. */
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
