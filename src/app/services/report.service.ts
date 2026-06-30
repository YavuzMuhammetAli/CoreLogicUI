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

  /** Henüz kaydedilmemiş bir rapor tanımı için üretilecek SQL'i, çalıştırmadan döndürür. */
  previewSql(report: Partial<ReportDefinition>): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/preview-sql`, report);
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

  /** Raporu pasife alır (soft-delete). */
  delete(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params });
  }

  /** Tenant içinde pasiflenmiş (silinmiş) raporları getirir. */
  listDeleted(): Observable<ListResponseModel<ReportDefinition>> {
    return this.http.get<ListResponseModel<ReportDefinition>>(`${this.baseUrl}/deleted`);
  }

  /** Silinmiş bir raporu yeniden aktif eder (Active=true). */
  restore(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restore`, null, { params });
  }
}
