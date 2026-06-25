import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { DataResponseModel } from '../models/dataResponseModel';
import { environment } from '../../environments/environment';

/** Görünüm türü: listeleme grid'i veya detay sayfası üst kayıt formu */
export type ColumnViewType = 'list' | 'detail';

/** Kolon görünürlük ayarı — backend ModelColumnSettingDto ile eşleşir */
export interface ModelColumnSettingDto {
  typeName: string;
  viewType: ColumnViewType;
  /** Görünür kolon adları. Boş dizi = ayar yok, tüm kolonlar görünür kabul edilir. */
  visibleColumns: string[];
}

/**
 * Admin tarafından yönetilen, model bazlı kolon görünürlük ayarları.
 * Yazma (set) yalnızca admin tarafından çağrılmalı — backend [Authorize(Roles="admin")] ile sınırlar.
 */
@Injectable({ providedIn: 'root' })
export class ModelColumnSettingService {
  private readonly baseUrl = `${environment.apiBaseUrl}/ModelColumnSetting`;

  constructor(private http: HttpClient) {}

  /** Model + görünüm türü için kayıtlı kolon ayarını getirir (ayar yoksa visibleColumns boş döner) */
  get(typeName: string, viewType: ColumnViewType): Observable<DataResponseModel<ModelColumnSettingDto>> {
    const params = new HttpParams().set('typeName', typeName).set('viewType', viewType);
    return this.http.get<DataResponseModel<ModelColumnSettingDto>>(`${this.baseUrl}/get`, { params });
  }

  /** Model + görünüm türü için görünür kolon listesini yazar (admin) */
  set(dto: ModelColumnSettingDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/set`, dto);
  }
}
