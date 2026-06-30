import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ListResponseModel } from '../models/responseModelList';
import { AuditLog } from '../models/auditLog';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly baseUrl = `${environment.apiBaseUrl}/AuditLog`;

  constructor(private http: HttpClient) {}

  /**
   * Denetim kayıtlarını filtreleyerek getirir (admin-only). Tüm parametreler opsiyoneldir;
   * tenant filtresi backend'de ambient tenant scope üzerinden uygulanır.
   */
  getFiltered(entityName?: string, from?: Date | null, to?: Date | null): Observable<ListResponseModel<AuditLog>> {
    let params = new HttpParams();
    if (entityName) params = params.set('entityName', entityName);
    if (from) params = params.set('from', from.toISOString());
    if (to) params = params.set('to', to.toISOString());

    return this.http.get<ListResponseModel<AuditLog>>(this.baseUrl, { params });
  }
}
