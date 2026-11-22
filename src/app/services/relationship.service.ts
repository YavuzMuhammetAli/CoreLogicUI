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
 * Model relationships API (G1).
 *
 * Base URL pattern: /publish/models/{tableId}/...
 * {tableId} = PublishedTable.ID — `PublishedTableService.getAllTables()` returns this id.
 *
 * Note: the publish flow itself does NOT CHANGE; relationships are included automatically in the
 * `/Published/publish` call. The endpoints here only manage the definitions
 * and provide pre-publish validation/preview.
 */
@Injectable({ providedIn: 'root' })
export class RelationshipService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/publish/models`;

  /** Returns all relationship definitions of the source model. */
  list(tableId: number): Observable<ListResponseModel<RelationshipDefinition>> {
    return this.http.get<ListResponseModel<RelationshipDefinition>>(
      `${this.baseUrl}/${tableId}/relationships`);
  }

  /** Adds a new relationship. sourceModel/depth are determined by the backend. */
  add(tableId: number, body: RelationshipUpsert): Observable<DataResponseModel<RelationshipDefinition>> {
    return this.http.post<DataResponseModel<RelationshipDefinition>>(
      `${this.baseUrl}/${tableId}/relationships`, body);
  }

  /** Updates an existing relationship. */
  update(
    tableId: number,
    relationshipId: string,
    body: RelationshipUpsert
  ): Observable<DataResponseModel<RelationshipDefinition>> {
    return this.http.put<DataResponseModel<RelationshipDefinition>>(
      `${this.baseUrl}/${tableId}/relationships/${relationshipId}`, body);
  }

  /** Deletes the relationship (soft-delete). The SQL FK constraint is dropped on the next publish. */
  delete(tableId: number, relationshipId: string): Observable<ResponseModel> {
    return this.http.delete<ResponseModel>(
      `${this.baseUrl}/${tableId}/relationships/${relationshipId}`);
  }

  /**
   * Validates the graph (cycle, depth, conflict…). Does NOT START a publish —
   * used so the user sees warnings before saving.
   */
  validateGraph(tableId: number): Observable<DataResponseModel<RelationshipValidationResult>> {
    return this.http.post<DataResponseModel<RelationshipValidationResult>>(
      `${this.baseUrl}/${tableId}/validate-graph`, {});
  }

  /** Returns the resulting entity graph, the C# to be generated and the DDL without writing to the assembly. */
  preview(tableId: number): Observable<DataResponseModel<PublishPreview>> {
    return this.http.post<DataResponseModel<PublishPreview>>(
      `${this.baseUrl}/${tableId}/preview`, {});
  }
}
