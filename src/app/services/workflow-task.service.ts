import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import {
  CompleteTaskRequest,
  ReassignTaskRequest,
  RecordWorkflowState,
  SaveTaskRecordRequest,
  StartableWorkflow,
  StartWorkflowRequest,
  WorkflowChain,
  WorkflowInstance,
  WorkflowStepInfo,
  WorkflowTask,
  WorkflowInstanceQuery
} from '../models/workflow.model';
import { PagedResponseModel } from './published-model.service';
import { environment } from '../../environments/environment';

/**
 * Task service — backend WorkflowTaskController (`/WorkflowTask`).
 *
 * These endpoints do NOT REQUIRE admin: authorization comes from the assignment (only the assigned
 * user or a member of the assigned role can close the task; checked on the server).
 */
@Injectable({ providedIn: 'root' })
export class WorkflowTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/WorkflowTask`;

  /** Pending tasks of the session user (directly assigned + role pool). */
  my(): Observable<ListResponseModel<WorkflowTask>> {
    return this.http.get<ListResponseModel<WorkflowTask>>(`${this.baseUrl}/my`);
  }

  /** Sidebar badge — only the count, without fetching the full list. */
  myCount(): Observable<DataResponseModel<number>> {
    return this.http.get<DataResponseModel<number>>(`${this.baseUrl}/myCount`);
  }

  get(id: number): Observable<DataResponseModel<WorkflowTask>> {
    return this.http.get<DataResponseModel<WorkflowTask>>(
      `${this.baseUrl}/get`, { params: new HttpParams().set('id', id) });
  }

  forInstance(instanceId: number): Observable<ListResponseModel<WorkflowTask>> {
    return this.http.get<ListResponseModel<WorkflowTask>>(
      `${this.baseUrl}/forInstance`, { params: new HttpParams().set('instanceId', instanceId) });
  }

  /** Approves or rejects the task and advances the workflow. */
  complete(request: CompleteTaskRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/complete`, request);
  }

  /**
   * Saves the assignee's step fields without advancing the step. Authorization comes from the task
   * assignment (no model update permission needed); only the step columns are written.
   */
  saveRecord(request: SaveTaskRecordRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/saveRecord`, request);
  }

  /**
   * Skips the step and advances the workflow (admin).
   * A separate endpoint from complete: the audit must distinguish "approved" from "skipped".
   */
  skip(id: number, reason?: string | null): Observable<ResponseModel> {
    let params = new HttpParams().set('id', id);
    if (reason) params = params.set('reason', reason);
    return this.http.post<ResponseModel>(`${this.baseUrl}/skip`, null, { params });
  }

  /** Reassigns the task to another user/role (admin). */
  reassign(request: ReassignTaskRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/reassign`, request);
  }
}

/**
 * Instance service — backend WorkflowInstanceController (`/WorkflowInstance`).
 *
 * Lives in the same file as the task service because both belong to the "running instance" area
 * and the screens (task detail, the Süreç (Instance) panel in record detail) use them
 * together. Definition management is a separate permission area, so it has its own service.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowInstanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/WorkflowInstance`;

  /** Starts an instance manually. Permission: update permission on the record (checked on the server). */
  start(request: StartWorkflowRequest): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/start`, request);
  }

  /** New record screen: workflows that can be started manually on the model ("{Akış} Başlat" (Start {workflow}) buttons). */
  startable(entityType: string): Observable<ListResponseModel<StartableWorkflow>> {
    return this.http.get<ListResponseModel<StartableWorkflow>>(`${this.baseUrl}/startable`, {
      params: new HttpParams().set('entityType', entityType)
    });
  }

  /** Instance state of the record screen: lock, step buttons, startable workflows. */
  recordState(entityType: string, entityId: number): Observable<DataResponseModel<RecordWorkflowState>> {
    return this.http.get<DataResponseModel<RecordWorkflowState>>(`${this.baseUrl}/recordState`, {
      params: new HttpParams().set('entityType', entityType).set('entityId', entityId)
    });
  }

  /** A single instance with its timeline and tasks. */
  get(id: number): Observable<DataResponseModel<WorkflowInstance>> {
    return this.http.get<DataResponseModel<WorkflowInstance>>(
      `${this.baseUrl}/get`, { params: new HttpParams().set('id', id) });
  }

  /** Instance list — filtered, paged, newest first (admin). */
  listPaged(query: WorkflowInstanceQuery): Observable<PagedResponseModel<WorkflowInstance>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.status) params = params.set('status', query.status);
    if (query.incident) params = params.set('incident', true);
    if (query.model) params = params.set('model', query.model);
    if (query.code) params = params.set('code', query.code);
    return this.http.get<PagedResponseModel<WorkflowInstance>>(`${this.baseUrl}/list`, { params });
  }

  list(status?: string): Observable<ListResponseModel<WorkflowInstance>> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<ListResponseModel<WorkflowInstance>>(`${this.baseUrl}/list`, { params });
  }

  /** Data source of the "Süreç" (Instance) panel in record detail. */
  /** `latestOnly`: only the newest instance, without the event history (the record header only uses the ID). */
  forEntity(entityType: string, entityId: number, latestOnly = false): Observable<ListResponseModel<WorkflowInstance>> {
    let params = new HttpParams().set('entityType', entityType).set('entityId', entityId);
    if (latestOnly) params = params.set('latestOnly', true);
    return this.http.get<ListResponseModel<WorkflowInstance>>(`${this.baseUrl}/forEntity`, { params });
  }

  /**
   * Verifies the event log chain (audit, admin).
   *
   * The log is append-only so it normally cannot be corrupted; this endpoint shows
   * whether the database was tampered with directly.
   */
  verifyChain(instanceId: number): Observable<DataResponseModel<WorkflowChain>> {
    return this.http.get<DataResponseModel<WorkflowChain>>(
      `${this.baseUrl}/verifyChain`, { params: new HttpParams().set('instanceId', instanceId) });
  }

  /**
   * Rolls the instance back to a previous step (admin).
   * Only the workflow position is rolled back; business data is preserved.
   */
  rollback(id: number, targetStepKey: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/rollback`, null, {
      params: new HttpParams().set('id', id).set('targetStepKey', targetStepKey)
    });
  }

  /** Steps in the definition, for choosing the rollback target (admin). */
  steps(instanceId: number): Observable<ListResponseModel<WorkflowStepInfo>> {
    return this.http.get<ListResponseModel<WorkflowStepInfo>>(
      `${this.baseUrl}/steps`, { params: new HttpParams().set('instanceId', instanceId) });
  }

  /**
   * Skips a failed (incident) automatic step (admin) — on a condition the default path
   * is taken. To fix and retry, `rollback` to the same step.
   */
  skipStep(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/skipStep`, null, { params: new HttpParams().set('id', id) });
  }

  /** Cancels the instance and closes its open tasks (admin). */
  cancel(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/cancel`, null, { params: new HttpParams().set('id', id) });
  }
}
