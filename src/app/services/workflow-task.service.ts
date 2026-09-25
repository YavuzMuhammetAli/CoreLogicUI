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
  WorkflowTask
} from '../models/workflow.model';
import { environment } from '../../environments/environment';

/**
 * Görev servisi — backend WorkflowTaskController (`/WorkflowTask`).
 *
 * Bu uçlar admin İSTEMEZ: yetkilendirme atamayla yapılır (görevi yalnızca atanan
 * kullanıcı ya da atanan rolün üyesi kapatabilir, kontrol sunucuda).
 */
@Injectable({ providedIn: 'root' })
export class WorkflowTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/WorkflowTask`;

  /** Oturumdaki kullanıcının bekleyen görevleri (doğrudan atananlar + rol havuzu). */
  my(): Observable<ListResponseModel<WorkflowTask>> {
    return this.http.get<ListResponseModel<WorkflowTask>>(`${this.baseUrl}/my`);
  }

  /** Sidebar rozeti — tam listeyi çekmeden yalnız sayı. */
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

  /** Görevi onaylar veya reddeder ve akışı ilerletir. */
  complete(request: CompleteTaskRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/complete`, request);
  }

  /**
   * Görevlinin adım alanlarını, adımı ilerletmeden kaydeder. Yetki görev
   * atamasından gelir (model güncelleme izni gerekmez); yalnız adım kolonları yazılır.
   */
  saveRecord(request: SaveTaskRecordRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/saveRecord`, request);
  }

  /**
   * Adımı atlar ve akışı ilerletir (admin).
   * Tamamlamadan ayrı uç: audit'te "onaylandı" ile "atlandı" ayırt edilebilmeli.
   */
  skip(id: number, reason?: string | null): Observable<ResponseModel> {
    let params = new HttpParams().set('id', id);
    if (reason) params = params.set('reason', reason);
    return this.http.post<ResponseModel>(`${this.baseUrl}/skip`, null, { params });
  }

  /** Görevi başka bir kullanıcıya/role devreder (admin). */
  reassign(request: ReassignTaskRequest): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/reassign`, request);
  }
}

/**
 * Süreç servisi — backend WorkflowInstanceController (`/WorkflowInstance`).
 *
 * Görev servisiyle aynı dosyada duruyor çünkü ikisi de "çalışan süreç" alanına ait
 * ve ekranlar (görev detayı, kayıt detayındaki Süreç paneli) ikisini birlikte
 * kullanıyor. Tanım yönetimi ise ayrı bir yetki alanı olduğu için ayrı serviste.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowInstanceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/WorkflowInstance`;

  /** Elle süreç başlatır. Yetki: kayıt üzerinde güncelleme izni (sunucuda denetlenir). */
  start(request: StartWorkflowRequest): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/start`, request);
  }

  /** Yeni kayıt ekranı: modelde elle başlatılabilen akışlar ("{Akış} Başlat" butonları). */
  startable(entityType: string): Observable<ListResponseModel<StartableWorkflow>> {
    return this.http.get<ListResponseModel<StartableWorkflow>>(`${this.baseUrl}/startable`, {
      params: new HttpParams().set('entityType', entityType)
    });
  }

  /** Kayıt ekranının süreç durumu: kilit, adım butonları, başlatılabilir akışlar. */
  recordState(entityType: string, entityId: number): Observable<DataResponseModel<RecordWorkflowState>> {
    return this.http.get<DataResponseModel<RecordWorkflowState>>(`${this.baseUrl}/recordState`, {
      params: new HttpParams().set('entityType', entityType).set('entityId', entityId)
    });
  }

  /** Zaman çizelgesi ve görevleriyle birlikte tek süreç. */
  get(id: number): Observable<DataResponseModel<WorkflowInstance>> {
    return this.http.get<DataResponseModel<WorkflowInstance>>(
      `${this.baseUrl}/get`, { params: new HttpParams().set('id', id) });
  }

  list(status?: string): Observable<ListResponseModel<WorkflowInstance>> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);
    return this.http.get<ListResponseModel<WorkflowInstance>>(`${this.baseUrl}/list`, { params });
  }

  /** Kayıt detayındaki "Süreç" panelinin veri kaynağı. */
  forEntity(entityType: string, entityId: number): Observable<ListResponseModel<WorkflowInstance>> {
    return this.http.get<ListResponseModel<WorkflowInstance>>(`${this.baseUrl}/forEntity`, {
      params: new HttpParams().set('entityType', entityType).set('entityId', entityId)
    });
  }

  /**
   * Olay günlüğü zincirini doğrular (denetim, admin).
   *
   * Günlük salt-ekleme olduğu için normalde bozulamaz; bu uç veritabanına
   * doğrudan müdahale edilip edilmediğini gösterir.
   */
  verifyChain(instanceId: number): Observable<DataResponseModel<WorkflowChain>> {
    return this.http.get<DataResponseModel<WorkflowChain>>(
      `${this.baseUrl}/verifyChain`, { params: new HttpParams().set('instanceId', instanceId) });
  }

  /**
   * Süreci önceki bir adıma geri alır (admin).
   * Yalnızca akış konumu geri alınır; iş verisi korunur.
   */
  rollback(id: number, targetStepKey: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/rollback`, null, {
      params: new HttpParams().set('id', id).set('targetStepKey', targetStepKey)
    });
  }

  /** Rollback hedefi seçimi için tanımdaki adımlar (admin). */
  steps(instanceId: number): Observable<ListResponseModel<WorkflowStepInfo>> {
    return this.http.get<ListResponseModel<WorkflowStepInfo>>(
      `${this.baseUrl}/steps`, { params: new HttpParams().set('instanceId', instanceId) });
  }

  /** Süreci iptal eder ve açık görevlerini kapatır (admin). */
  cancel(id: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/cancel`, null, { params: new HttpParams().set('id', id) });
  }
}
