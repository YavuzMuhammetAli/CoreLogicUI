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

  /**
   * Saves a new report definition and returns the created report's ID.
   *
   * Returning the ID is required for G4: when a dashboard is imported from AI
   * proposals, its widgets refer to reports by NAME; the name→ID mapping
   * must be done at the moment the report is defined. Fetching `list()` later and matching
   * by name would pick the wrong target when two reports share a name.
   * (`define()` in `dashboard.service.ts` already returned the ID — now they are symmetric.)
   */
  define(report: Partial<ReportDefinition>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/define`, report)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Updates an existing report definition (report.id required). */
  update(report: ReportDefinition): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/update`, report)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Fetches the reports in the tenant whose model the user has Read permission on. */
  list(): Observable<ListResponseModel<ReportDefinition>> {
    return this.http.get<ListResponseModel<ReportDefinition>>(`${this.baseUrl}/list`);
  }

  /**
   * Cached version of the list() result. The report viewer and dashboard fetched all
   * definitions just to resolve the report NAME; this request, repeated on every navigation,
   * is reduced to one with shareReplay (same pattern as record-metadata.service.ts).
   *
   * invalidateListCache() is called when a definition changes (define/update/delete/restore).
   */
  listCached(): Observable<ListResponseModel<ReportDefinition>> {
    if (!this.listCache$) {
      this.listCache$ = this.list().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.listCache$;
  }

  /** Called after every definition-changing operation; the next listCached() fetches again. */
  invalidateListCache(): void {
    this.listCache$ = null;
  }

  private listCache$: Observable<ListResponseModel<ReportDefinition>> | null = null;

  /**
   * Runs the report.
   *
   * If page + pageSize are given, that page is returned (the server clamps pageSize to 1..500).
   * Otherwise the server applies a 5000-row safety cap and, if truncated,
   * the response has truncated = true. In every case total is the real row count after filtering.
   */
  /**
   * `maxRows`: maximum rows for an unpaged (chart) run — the chart does not draw more than
   * 50/200 points anyway; the server should not produce and send up to 5000 rows.
   */
  run(id: number, page?: number, pageSize?: number, maxRows?: number | null): Observable<DataResponseModel<ReportRunResult>> {
    let params = new HttpParams().set('id', id);
    if (page != null && pageSize != null) {
      params = params.set('page', page).set('pageSize', pageSize);
    } else if (maxRows != null) {
      params = params.set('maxRows', maxRows);
    }
    return this.http.get<DataResponseModel<ReportRunResult>>(`${this.baseUrl}/run`, { params });
  }

  /** Returns the SQL that would be generated for a not-yet-saved report definition, without running it. */
  previewSql(report: Partial<ReportDefinition>): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/preview-sql`, report);
  }

  /** Downloads the report as .xlsx. */
  exportExcel(id: number): Observable<Blob> {
    const params = new HttpParams().set('id', id);
    return this.http.get(`${this.baseUrl}/export/excel`, { params, responseType: 'blob' });
  }

  /** Downloads the report as .pdf. */
  exportPdf(id: number): Observable<Blob> {
    const params = new HttpParams().set('id', id);
    return this.http.get(`${this.baseUrl}/export/pdf`, { params, responseType: 'blob' });
  }

  /** Deactivates the report (soft-delete). */
  delete(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params })
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Fetches the deactivated (deleted) reports in the tenant. */
  listDeleted(): Observable<ListResponseModel<ReportDefinition>> {
    return this.http.get<ListResponseModel<ReportDefinition>>(`${this.baseUrl}/deleted`);
  }

  /** Reactivates a deleted report (Active=true). */
  restore(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/restore`, null, { params })
      .pipe(tap(() => this.invalidateListCache()));
  }
}
