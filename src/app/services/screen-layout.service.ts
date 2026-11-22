import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataResponseModel } from '../models/dataResponseModel';
import { ResponseModel } from '../models/responseModel';
import {
  CreateScreenLayoutVariantDto, PublishedScreenLayoutDto, ReorderScreenLayoutVariantsDto, SaveScreenLayoutDraftDto,
  ScreenLayoutActionDto, ScreenLayoutSaveResultDto, ScreenLayoutStampDto, ScreenLayoutStateDto, ScreenLayoutSummaryDto,
  ScreenLayoutViewStateDto, UpdateScreenLayoutVariantDto
} from '../models/screen-layout.model';
import { ScreenViewType } from '../utils/screen-layout/screen-layout.model';
import { SKIP_FORBIDDEN_REDIRECT } from '../interceptors/error.interceptor';

/**
 * /ModelScreenLayout — screen design (model form and list layout).
 *
 * `getPublished` is an AUXILIARY request of the record screens: if it fails, the screen runs with
 * the default view and the user must not be pulled off the page (SKIP_FORBIDDEN_REDIRECT). The server
 * picks, from the designs of model + view, the one matching the user's ROLE (role IDs are not on the client).
 * The other endpoints are admin-only (designer, Tasarım (Design) page). In operation DTOs `layoutId: null`
 * is the view's default design.
 */
@Injectable({ providedIn: 'root' })
export class ScreenLayoutService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/ModelScreenLayout`;

  getPublished(typeName: string, viewType: ScreenViewType): Observable<DataResponseModel<PublishedScreenLayoutDto | null>> {
    const params = new HttpParams().set('typeName', typeName).set('viewType', viewType);
    return this.http.get<DataResponseModel<PublishedScreenLayoutDto | null>>(`${this.baseUrl}/published`, {
      params,
      context: new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true)
    });
  }

  getState(typeName: string): Observable<DataResponseModel<ScreenLayoutStateDto>> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.get<DataResponseModel<ScreenLayoutStateDto>>(`${this.baseUrl}/state`, { params });
  }

  saveDraft(dto: SaveScreenLayoutDraftDto): Observable<DataResponseModel<ScreenLayoutSaveResultDto>> {
    return this.http.post<DataResponseModel<ScreenLayoutSaveResultDto>>(`${this.baseUrl}/saveDraft`, dto);
  }

  publish(dto: ScreenLayoutActionDto): Observable<DataResponseModel<ScreenLayoutSaveResultDto>> {
    return this.http.post<DataResponseModel<ScreenLayoutSaveResultDto>>(`${this.baseUrl}/publish`, dto);
  }

  discardDraft(dto: ScreenLayoutActionDto): Observable<DataResponseModel<ScreenLayoutSaveResultDto>> {
    return this.http.post<DataResponseModel<ScreenLayoutSaveResultDto>>(`${this.baseUrl}/discardDraft`, dto);
  }

  /** On the default, removes the design; on a variant, deletes the design. */
  reset(dto: ScreenLayoutActionDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/reset`, dto);
  }

  createVariant(dto: CreateScreenLayoutVariantDto): Observable<DataResponseModel<ScreenLayoutViewStateDto>> {
    return this.http.post<DataResponseModel<ScreenLayoutViewStateDto>>(`${this.baseUrl}/createVariant`, dto);
  }

  updateVariant(dto: UpdateScreenLayoutVariantDto): Observable<DataResponseModel<ScreenLayoutViewStateDto>> {
    return this.http.post<DataResponseModel<ScreenLayoutViewStateDto>>(`${this.baseUrl}/updateVariant`, dto);
  }

  reorderVariants(dto: ReorderScreenLayoutVariantsDto): Observable<DataResponseModel<ScreenLayoutStampDto[]>> {
    return this.http.post<DataResponseModel<ScreenLayoutStampDto[]>>(`${this.baseUrl}/reorderVariants`, dto);
  }

  summary(): Observable<DataResponseModel<ScreenLayoutSummaryDto[]>> {
    return this.http.get<DataResponseModel<ScreenLayoutSummaryDto[]>>(`${this.baseUrl}/summary`);
  }
}
