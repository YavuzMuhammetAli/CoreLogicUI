import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DataResponseModel } from '../models/dataResponseModel';
import { ResponseModel } from '../models/responseModel';
import {
  CreateNavigationLayoutDto, MyNavigationLayoutDto, NavigationLayoutActionDto, NavigationLayoutDetailDto,
  NavigationLayoutListDto, NavigationLayoutSaveResultDto, NavigationLayoutSummaryDto, SaveNavigationLayoutDraftDto,
  UpdateNavigationLayoutMetaDto
} from '../models/navigation-layout.model';
import { SKIP_FORBIDDEN_REDIRECT } from '../interceptors/error.interceptor';

/**
 * /NavigationLayout — admin olmayan kullanıcıların kenar çubuğu tasarımı (migrasyon 026).
 *
 * `my` kabuğun YARDIMCI isteğidir: başarısız olursa kenar çubuğu otomatik menüyle çalışır
 * (SKIP_FORBIDDEN_REDIRECT). Sunucu tasarımı kullanıcının rolüne göre seçer. Diğer uçlar admin'e özeldir.
 */
@Injectable({ providedIn: 'root' })
export class NavigationLayoutService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/NavigationLayout`;

  my(): Observable<DataResponseModel<MyNavigationLayoutDto | null>> {
    return this.http.get<DataResponseModel<MyNavigationLayoutDto | null>>(`${this.baseUrl}/my`, {
      context: new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true)
    });
  }

  list(): Observable<DataResponseModel<NavigationLayoutListDto>> {
    return this.http.get<DataResponseModel<NavigationLayoutListDto>>(`${this.baseUrl}/list`);
  }

  get(id: number): Observable<DataResponseModel<NavigationLayoutDetailDto>> {
    const params = new HttpParams().set('id', id);
    return this.http.get<DataResponseModel<NavigationLayoutDetailDto>>(`${this.baseUrl}/get`, { params });
  }

  create(dto: CreateNavigationLayoutDto): Observable<DataResponseModel<NavigationLayoutDetailDto>> {
    return this.http.post<DataResponseModel<NavigationLayoutDetailDto>>(`${this.baseUrl}/create`, dto);
  }

  saveDraft(dto: SaveNavigationLayoutDraftDto): Observable<DataResponseModel<NavigationLayoutSaveResultDto>> {
    return this.http.post<DataResponseModel<NavigationLayoutSaveResultDto>>(`${this.baseUrl}/saveDraft`, dto);
  }

  publish(dto: NavigationLayoutActionDto): Observable<DataResponseModel<NavigationLayoutSaveResultDto>> {
    return this.http.post<DataResponseModel<NavigationLayoutSaveResultDto>>(`${this.baseUrl}/publish`, dto);
  }

  discardDraft(dto: NavigationLayoutActionDto): Observable<DataResponseModel<NavigationLayoutSaveResultDto>> {
    return this.http.post<DataResponseModel<NavigationLayoutSaveResultDto>>(`${this.baseUrl}/discardDraft`, dto);
  }

  /** Ad, roller, varsayılan, etkin — belgeye dokunmaz; yeni kilit damgası `lastModifiedOn`'da döner. */
  updateMeta(dto: UpdateNavigationLayoutMetaDto): Observable<DataResponseModel<NavigationLayoutSummaryDto>> {
    return this.http.post<DataResponseModel<NavigationLayoutSummaryDto>>(`${this.baseUrl}/updateMeta`, dto);
  }

  reorder(orderedIds: number[]): Observable<DataResponseModel<NavigationLayoutSummaryDto[]>> {
    return this.http.post<DataResponseModel<NavigationLayoutSummaryDto[]>>(`${this.baseUrl}/reorder`, { orderedIds });
  }

  delete(id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params });
  }
}
