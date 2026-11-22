import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DataResponseModel } from '../models/dataResponseModel';
import { ListResponseModel } from '../models/responseModelList';
import { ResponseModel } from '../models/responseModel';
import { DashboardDefinition, DashboardRunResult } from '../models/dashboard.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Dashboard`;

  constructor(private http: HttpClient) {}

  /** Saves a new dashboard definition; the backend returns the created dashboard's ID. */
  define(dashboard: Partial<DashboardDefinition>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/define`, dashboard);
  }

  /** Fetches the dashboard and the executed data of each widget. */
  get(id: number): Observable<DataResponseModel<DashboardRunResult>> {
    const params = new HttpParams().set('id', id);
    return this.http.get<DataResponseModel<DashboardRunResult>>(`${this.baseUrl}/get`, { params });
  }

  /** Dashboards to show in the menu — only ID + name (widgets are not loaded). */
  nav(): Observable<ListResponseModel<DashboardDefinition>> {
    return this.http.get<ListResponseModel<DashboardDefinition>>(`${this.baseUrl}/nav`);
  }

  /** Fetches all dashboard definitions in the tenant (including widget lists). */
  list(): Observable<ListResponseModel<DashboardDefinition>> {
    return this.http.get<ListResponseModel<DashboardDefinition>>(`${this.baseUrl}/list`);
  }

  /** Deactivates the dashboard (soft-delete). */
  delete(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params });
  }

  /** Fetches the deactivated (deleted) dashboards in the tenant. */
  listDeleted(): Observable<ListResponseModel<DashboardDefinition>> {
    return this.http.get<ListResponseModel<DashboardDefinition>>(`${this.baseUrl}/deleted`);
  }

  /** Reactivates a deleted dashboard (Active=true). */
  restore(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restore`, null, { params });
  }
}
