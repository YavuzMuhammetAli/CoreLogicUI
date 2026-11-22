import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ListResponseModel } from '../models/responseModelList';
import { PagedResponseModel } from './published-model.service';
import { AuditLog } from '../models/auditLog';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private readonly baseUrl = `${environment.apiBaseUrl}/AuditLog`;

  constructor(private http: HttpClient) {}

  /**
   * Fetches audit records with filters (admin-only). All parameters are optional;
   * the tenant filter is applied on the backend through the ambient tenant scope.
   */
  getFiltered(entityName?: string, from?: Date | null, to?: Date | null): Observable<ListResponseModel<AuditLog>> {
    let params = new HttpParams();
    if (entityName) params = params.set('entityName', entityName);
    if (from) params = params.set('from', from.toISOString());
    if (to) params = params.set('to', to.toISOString());

    return this.http.get<ListResponseModel<AuditLog>>(this.baseUrl, { params });
  }

  /**
   * Paged audit record list. The screen uses this because the audit table can reach
   * millions of rows; an unfiltered `getFiltered` downloads the whole table.
   */
  getFilteredPaged(
    page: number,
    pageSize: number,
    entityName?: string,
    from?: Date | null,
    to?: Date | null
  ): Observable<PagedResponseModel<AuditLog>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (entityName) params = params.set('entityName', entityName);
    if (from) params = params.set('from', from.toISOString());
    if (to) params = params.set('to', to.toISOString());

    return this.http.get<PagedResponseModel<AuditLog>>(this.baseUrl, { params });
  }
}
