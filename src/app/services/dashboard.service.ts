import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DataResponseModel } from '../models/dataResponseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DashboardDefinition, DashboardRunResult } from '../models/dashboard.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Dashboard`;

  constructor(private http: HttpClient) {}

  /** Yeni dashboard tanımı kaydeder; backend oluşturulan dashboard'un ID'sini döner. */
  define(dashboard: Partial<DashboardDefinition>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/define`, dashboard);
  }

  /** Dashboard'u ve her widget'ın çalıştırılmış verisini getirir. */
  get(id: number): Observable<DataResponseModel<DashboardRunResult>> {
    const params = new HttpParams().set('id', id);
    return this.http.get<DataResponseModel<DashboardRunResult>>(`${this.baseUrl}/get`, { params });
  }

  /** Tenant içindeki tüm dashboard tanımlarını (widget listeleri dahil) getirir. */
  list(): Observable<ListResponseModel<DashboardDefinition>> {
    return this.http.get<ListResponseModel<DashboardDefinition>>(`${this.baseUrl}/list`);
  }
}
