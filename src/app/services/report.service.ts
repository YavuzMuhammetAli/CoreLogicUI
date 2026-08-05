import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
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
    return this.http.post<ResponseModel>(`${this.baseUrl}/define`, report)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Mevcut rapor tanımını günceller (report.id zorunlu). */
  update(report: ReportDefinition): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/update`, report)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Tenant içinde, kullanıcının modelde Read yetkisi olan raporları getirir. */
  list(): Observable<ListResponseModel<ReportDefinition>> {
    return this.http.get<ListResponseModel<ReportDefinition>>(`${this.baseUrl}/list`);
  }

  /**
   * list() sonucunun önbelleklenmiş hali. Rapor görüntüleyici ve dashboard yalnızca
   * rapor ADINI çözmek için tüm tanımları çekiyordu; her gezinmede tekrarlanan bu istek
   * shareReplay ile tek sefere indirilir (record-metadata.service.ts ile aynı desen).
   *
   * Tanım değişince (define/update/delete/restore) invalidateListCache() çağrılır.
   */
  listCached(): Observable<ListResponseModel<ReportDefinition>> {
    if (!this.listCache$) {
      this.listCache$ = this.list().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.listCache$;
  }

  /** Tanım değiştiren her işlemden sonra çağrılır; sonraki listCached() yeniden çeker. */
  invalidateListCache(): void {
    this.listCache$ = null;
  }

  private listCache$: Observable<ListResponseModel<ReportDefinition>> | null = null;

  /**
   * Raporu çalıştırır.
   *
   * page + pageSize verilirse o sayfa döner (sunucu pageSize'ı 1..500'e kırpar).
   * Verilmezse sunucu 5000 satırlık güvenlik tavanı uygular ve kırpılma olduysa
   * yanıtta truncated = true gelir. Her durumda total, filtre sonrası gerçek satır sayısıdır.
   */
  run(id: number, page?: number, pageSize?: number): Observable<DataResponseModel<ReportRunResult>> {
    let params = new HttpParams().set('id', id);
    if (page != null && pageSize != null) {
      params = params.set('page', page).set('pageSize', pageSize);
    }
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
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params })
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Tenant içinde pasiflenmiş (silinmiş) raporları getirir. */
  listDeleted(): Observable<ListResponseModel<ReportDefinition>> {
    return this.http.get<ListResponseModel<ReportDefinition>>(`${this.baseUrl}/deleted`);
  }

  /** Silinmiş bir raporu yeniden aktif eder (Active=true). */
  restore(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restore`, null, { params })
      .pipe(tap(() => this.invalidateListCache()));
  }
}
