import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import {
  WorkflowCapabilities,
  WorkflowUsage,
  WorkflowDefinition,
  WorkflowValidationResult,
  WorkflowSimulateRequest,
  WorkflowSimulation
} from '../models/workflow.model';
import { environment } from '../../environments/environment';

/**
 * Workflow definition service — backend WorkflowController (`/Workflow`).
 *
 * Every endpoint is admin-only (`[Authorize(Roles = "admin")]` on the server); on the client
 * the routes are protected by `adminGuard`.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Workflow`;

  /**
   * Creates a new draft definition; returns the created record's ID. Validation gaps
   * do not block saving (the message reports the issue count), they only block publishing.
   */
  define(workflow: Partial<WorkflowDefinition>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/define`, workflow)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /**
   * Updates only a definition in the Draft state; `data` is the row's new
   * `lastModifiedOn` stamp — sent as `expectedLastModifiedOn` on the next update.
   * If the stamp is stale the server returns a conflict error.
   */
  update(workflow: Partial<WorkflowDefinition>): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/update`, workflow)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /**
   * Opens an editable draft with the same Code from the published version; returns the draft's
   * ID. If a draft already exists for that Code the server does not create a new one, it returns that.
   * When the draft is published it becomes the next version (v2, v3…).
   */
  newVersion(id: number): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(
      `${this.baseUrl}/new-version`, null, { params: new HttpParams().set('id', id) })
      .pipe(tap(() => this.invalidateListCache()));
  }

  list(): Observable<ListResponseModel<WorkflowDefinition>> {
    return this.http.get<ListResponseModel<WorkflowDefinition>>(`${this.baseUrl}/list`);
  }

  /**
   * Cached version of the list() result — the "Süreci Başlat" (Start instance) menu in record detail
   * fetched all definitions to resolve workflow names, and this was repeated on
   * every navigation (same pattern as report.service.ts).
   */
  listCached(): Observable<ListResponseModel<WorkflowDefinition>> {
    if (!this.listCache$) {
      this.listCache$ = this.list().pipe(shareReplay({ bufferSize: 1, refCount: false }));
    }
    return this.listCache$;
  }

  private listCache$?: Observable<ListResponseModel<WorkflowDefinition>>;

  private invalidateListCache(): void {
    this.listCache$ = undefined;
  }

  get(id: number): Observable<DataResponseModel<WorkflowDefinition>> {
    return this.http.get<DataResponseModel<WorkflowDefinition>>(
      `${this.baseUrl}/get`, { params: new HttpParams().set('id', id) });
  }

  /** All versions of a Code (newest to oldest). */
  versions(code: string): Observable<ListResponseModel<WorkflowDefinition>> {
    return this.http.get<ListResponseModel<WorkflowDefinition>>(
      `${this.baseUrl}/versions`, { params: new HttpParams().set('code', code) });
  }

  /**
   * Validates without saving — so the design screen can show live warnings.
   * Publish runs the same validation again on the server; this is only a convenience.
   */
  validate(workflow: Partial<WorkflowDefinition>): Observable<DataResponseModel<WorkflowValidationResult>> {
    return this.http.post<DataResponseModel<WorkflowValidationResult>>(
      `${this.baseUrl}/validate`, workflow);
  }

  /**
   * Runs the definition (possibly an unsaved draft) in memory on the server with a sample record
   * and decisions; nothing is written. Since it uses the real engine's functions,
   * the path shown is the path that will be followed after publishing.
   */
  simulate(request: WorkflowSimulateRequest): Observable<DataResponseModel<WorkflowSimulation>> {
    return this.http.post<DataResponseModel<WorkflowSimulation>>(`${this.baseUrl}/simulate`, request);
  }

  /** Stops / resumes the published workflow — does not open a new version, open instances continue. */
  setEnabled(id: number, enabled: boolean): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/setEnabled`, null, { params: new HttpParams().set('id', id).set('enabled', enabled) })
      .pipe(tap(() => this.invalidateListCache()));
  }

  /** Plan quota: definition count and runs in this period. */
  usage(): Observable<DataResponseModel<WorkflowUsage>> {
    return this.http.get<DataResponseModel<WorkflowUsage>>(`${this.baseUrl}/usage`);
  }

  /** Nodes available in this company (Bekleme (Wait) → migration 022). */
  capabilities(): Observable<DataResponseModel<WorkflowCapabilities>> {
    return this.http.get<DataResponseModel<WorkflowCapabilities>>(`${this.baseUrl}/capabilities`);
  }

  publish(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/publish`, null, { params: new HttpParams().set('id', id) })
      .pipe(tap(() => this.invalidateListCache()));
  }

  delete(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/delete`, null, { params: new HttpParams().set('id', id) })
      .pipe(tap(() => this.invalidateListCache()));
  }

  listDeleted(): Observable<ListResponseModel<WorkflowDefinition>> {
    return this.http.get<ListResponseModel<WorkflowDefinition>>(`${this.baseUrl}/deleted`);
  }

  restore(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/restore`, null, { params: new HttpParams().set('id', id) })
      .pipe(tap(() => this.invalidateListCache()));
  }
}
