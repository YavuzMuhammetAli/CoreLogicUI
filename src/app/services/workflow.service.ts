import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay, tap } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import {
  WorkflowDefinition,
  WorkflowValidationResult,
  WorkflowSimulateRequest,
  WorkflowSimulation
} from '../models/workflow.model';
import { environment } from '../../environments/environment';

/**
 * Akış tanımı servisi — backend WorkflowController (`/Workflow`).
 *
 * Tüm uçlar admin'e kapalıdır (sunucuda `[Authorize(Roles = "admin")]`); istemci
 * tarafında rotalar `adminGuard` ile korunur.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Workflow`;

  /**
   * Yeni taslak tanım oluşturur; oluşan kaydın ID'sini döner. Doğrulama eksikleri
   * kaydı engellemez (mesaj sorun sayısını söyler), yalnız yayını engeller.
   */
  define(workflow: Partial<WorkflowDefinition>): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/define`, workflow)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /**
   * Yalnızca Draft durumundaki tanımı günceller; `data` satırın yeni
   * `lastModifiedOn` damgasıdır — sonraki güncellemede `expectedLastModifiedOn`
   * olarak gönderilir. Damga bayatsa sunucu çakışma hatası döner.
   */
  update(workflow: Partial<WorkflowDefinition>): Observable<DataResponseModel<string>> {
    return this.http.post<DataResponseModel<string>>(`${this.baseUrl}/update`, workflow)
      .pipe(tap(() => this.invalidateListCache()));
  }

  /**
   * Yayınlanmış sürümden aynı Code'la düzenlenebilir taslak açar; taslağın ID'sini
   * döner. O Code için taslak zaten varsa sunucu yenisini üretmez, onu döner.
   * Taslak yayınlanınca bir sonraki sürüm olur (v2, v3…).
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
   * list() sonucunun önbelleklenmiş hali — kayıt detayındaki "Süreci Başlat"
   * menüsü akış adlarını çözmek için tüm tanımları çekiyor ve bu her gezinmede
   * tekrarlanıyordu (report.service.ts ile aynı desen).
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

  /** Bir Code'un tüm sürümleri (yeniden eskiye). */
  versions(code: string): Observable<ListResponseModel<WorkflowDefinition>> {
    return this.http.get<ListResponseModel<WorkflowDefinition>>(
      `${this.baseUrl}/versions`, { params: new HttpParams().set('code', code) });
  }

  /**
   * Kaydetmeden doğrular — tasarım ekranı canlı uyarı gösterebilsin diye.
   * Publish aynı doğrulamayı sunucuda tekrar koşar; bu yalnızca kolaylıktır.
   */
  validate(workflow: Partial<WorkflowDefinition>): Observable<DataResponseModel<WorkflowValidationResult>> {
    return this.http.post<DataResponseModel<WorkflowValidationResult>>(
      `${this.baseUrl}/validate`, workflow);
  }

  /**
   * Tanımı (kaydedilmemiş taslak olabilir) örnek kayıt ve kararlarla sunucuda
   * bellekte koşturur; hiçbir şey yazılmaz. Gerçek motorun fonksiyonlarını
   * kullandığı için görülen yol, yayından sonra izlenecek yoldur.
   */
  simulate(request: WorkflowSimulateRequest): Observable<DataResponseModel<WorkflowSimulation>> {
    return this.http.post<DataResponseModel<WorkflowSimulation>>(`${this.baseUrl}/simulate`, request);
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
