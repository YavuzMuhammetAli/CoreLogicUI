import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { DataResponseModel } from '../models/dataResponseModel';
import { environment } from '../../environments/environment';

/** View type: the list grid or the parent record form of the detail page */
export type ColumnViewType = 'list' | 'detail';

/** Column visibility setting — matches the backend ModelColumnSettingDto */
export interface ModelColumnSettingDto {
  typeName: string;
  viewType: ColumnViewType;
  /** Visible column names. Empty array = no setting, all columns are considered visible. */
  visibleColumns: string[];
}

/**
 * Admin-managed, per-model column visibility settings.
 * Writing (set) must be called only by an admin — the backend restricts it with [Authorize(Roles="admin")].
 */
@Injectable({ providedIn: 'root' })
export class ModelColumnSettingService {
  private readonly baseUrl = `${environment.apiBaseUrl}/ModelColumnSetting`;

  constructor(private http: HttpClient) {}

  /** Fetches the saved column setting for model + view type (visibleColumns is empty if there is none) */
  get(typeName: string, viewType: ColumnViewType): Observable<DataResponseModel<ModelColumnSettingDto>> {
    const params = new HttpParams().set('typeName', typeName).set('viewType', viewType);
    return this.http.get<DataResponseModel<ModelColumnSettingDto>>(`${this.baseUrl}/get`, { params });
  }

  /** Writes the visible column list for model + view type (admin) */
  set(dto: ModelColumnSettingDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/set`, dto);
  }
}
