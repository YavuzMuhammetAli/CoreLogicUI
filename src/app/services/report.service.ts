import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { ReportDefinition, ReportRunResult } from '../models/report.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Report`;

  constructor(private http: HttpClient) {}

  /** Yeni rapor tanımı kaydeder. */
  define(report: Partial<ReportDefinition>): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/define`, report);
  }

  /** Mevcut rapor tanımını günceller (report.id zorunlu). */
  update(report: ReportDefinition): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/update`, report);
  }

  /** Tenant içinde, kullanıcının modelde Read yetkisi olan raporları getirir. */
  list(): Observable<ListResponseModel<ReportDefinition>> {
    return this.http.get<ListResponseModel<ReportDefinition>>(`${this.baseUrl}/list`);
  }

  /** Raporu çalıştırır: filtre + gruplama + aggregate uygulanmış satırları döndürür. */
  run(id: number): Observable<DataResponseModel<ReportRunResult>> {
    const params = new HttpParams().set('id', id);
    return this.http.get<DataResponseModel<ReportRunResult>>(`${this.baseUrl}/run`, { params });
  }

  /** Raporu .xlsx olarak indirir. */
  exportExcel(id: number): Observable<Blob> {
    const params = new HttpParams().set('id', id);
    return this.http.get(`${this.baseUrl}/export/excel`, { params, responseType: 'blob' });
  }

  /** Raporu .pdf olarak indirir. */
  exportPdf(id: number): Observable<Blob> {
    const params = new HttpParams().set('id', id);
    return this.http.get(`${this.baseUrl}/export/pdf`, { params, responseType: 'blob' });
  }
}
