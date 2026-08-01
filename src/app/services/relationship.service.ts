import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import {
  RelationshipDefinition,
  RelationshipUpsert,
  RelationshipValidationResult,
  PublishPreview
} from '../models/relationship.model';

/**
 * Model ilişkileri API'si (G1).
 *
 * Base URL deseni: /publish/models/{tableId}/...
 * {tableId} = PublishedTable.ID — `PublishedTableService.getAllTables()` bu id'yi döner.
 *
 * Not: Yayınlama akışının kendisi DEĞİŞMEZ; ilişkiler `/Published/publish`
 * çağrısına otomatik dahil olur. Buradaki endpoint'ler yalnızca tanımları
 * yönetir ve publish öncesi doğrulama/önizleme sağlar.
 */
@Injectable({ providedIn: 'root' })
export class RelationshipService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/publish/models`;

  /** Kaynak modelin tüm ilişki tanımlarını döner. */
  list(tableId: number): Observable<ListResponseModel<RelationshipDefinition>> {
    return this.http.get<ListResponseModel<RelationshipDefinition>>(
      `${this.baseUrl}/${tableId}/relationships`);
  }

  /** Yeni ilişki ekler. sourceModel/depth backend tarafından belirlenir. */
  add(tableId: number, body: RelationshipUpsert): Observable<DataResponseModel<RelationshipDefinition>> {
    return this.http.post<DataResponseModel<RelationshipDefinition>>(
      `${this.baseUrl}/${tableId}/relationships`, body);
  }

  /** Mevcut ilişkiyi günceller. */
  update(
    tableId: number,
    relationshipId: string,
    body: RelationshipUpsert
  ): Observable<DataResponseModel<RelationshipDefinition>> {
    return this.http.put<DataResponseModel<RelationshipDefinition>>(
      `${this.baseUrl}/${tableId}/relationships/${relationshipId}`, body);
  }

  /** İlişkiyi siler (soft-delete). SQL FK constraint'i bir sonraki publish'te düşer. */
  delete(tableId: number, relationshipId: string): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(
      `${this.baseUrl}/${tableId}/relationships/${relationshipId}`);
  }

  /**
   * Graph'ı doğrular (döngü, derinlik, çakışma…). Publish BAŞLATMAZ —
   * kullanıcı kaydetmeden önce uyarı görsün diye kullanılır.
   */
  validateGraph(tableId: number): Observable<DataResponseModel<RelationshipValidationResult>> {
    return this.http.post<DataResponseModel<RelationshipValidationResult>>(
      `${this.baseUrl}/${tableId}/validate-graph`, {});
  }

  /** Oluşacak entity graph'ı, üretilecek C#'ı ve DDL'i assembly'e yazmadan döner. */
  preview(tableId: number): Observable<DataResponseModel<PublishPreview>> {
    return this.http.post<DataResponseModel<PublishPreview>>(
      `${this.baseUrl}/${tableId}/preview`, {});
  }
}
