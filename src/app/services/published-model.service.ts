import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { environment } from '../../environments/environment';

/** Kolon meta verisi — backend PublishedColumnInfo ile eşleşir */
export interface PublishedColumn {
  columnName: string;
  // UI tip anahtarları: string / int / long / short / byte / decimal / double / float / boolean /
  // datetime / dateonly / timeonly / guid / enum / lookup / image / file
  dataType: string;
  isNullable: boolean;
  // Yeni tip metadata'sı: enum / lookup (şemadan — reflection'dan değil)
  enumValues?: string | null;
  lookupTargetTable?: string | null;
  lookupDisplayColumn?: string | null;
  // UI metadata: kullanıcı dostu gösterim (şemadan — reflection'dan değil)
  label?: string | null;
  description?: string | null;
}

/** Model meta verisi — backend PublishedModelInfo ile eşleşir */
export interface PublishedModel {
  typeName: string;
  columns: PublishedColumn[];
}

/** Sayfalı yanıt verisi — backend PagedResult ile eşleşir */
export interface PagedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Sayfalı getAll yanıtı */
export interface PagedResponseModel<T> extends ResponseModel {
  data: PagedData<T>;
}

@Injectable({ providedIn: 'root' })
export class PublishedModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishedModel`;

  constructor(private http: HttpClient) {}

  /** Assembly'deki tüm model tiplerini ve kolon meta verilerini getirir */
  getModels(): Observable<ListResponseModel<PublishedModel>> {
    return this.http.get<ListResponseModel<PublishedModel>>(`${this.baseUrl}/models`);
  }

  /** Tüm kayıtları getirir. parentColumn + parentId verilirse FK filtrelemesi yapılır. */
  getAll(typeName: string, parentColumn?: string, parentId?: number): Observable<ListResponseModel<Record<string, unknown>>> {
    let params = new HttpParams().set('typeName', typeName);
    if (parentColumn && parentId != null) {
      params = params.set('parentColumn', parentColumn).set('parentId', parentId);
    }
    return this.http.get<ListResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /**
   * Sayfalı kayıt listesi getirir. Backend'e page + pageSize gönderilir; yalnız ilgili
   * sayfa döner. Alt-model sekmeleri paramsız getAll kullanmaya devam eder.
   */
  getAllPaged(
    typeName: string,
    page: number,
    pageSize: number,
    parentColumn?: string,
    parentId?: number
  ): Observable<PagedResponseModel<Record<string, unknown>>> {
    let params = new HttpParams()
      .set('typeName', typeName)
      .set('page', page)
      .set('pageSize', pageSize);
    if (parentColumn && parentId != null) {
      params = params.set('parentColumn', parentColumn).set('parentId', parentId);
    }
    return this.http.get<PagedResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /** Belirtilen parent modelin doğrudan alt model adlarını döndürür. */
  getChildModels(parentTypeName: string): Observable<ListResponseModel<string>> {
    const params = new HttpParams().set('parentTypeName', parentTypeName);
    return this.http.get<ListResponseModel<string>>(`${this.baseUrl}/children`, { params });
  }

  /** Tek kayıt getirir */
  get(typeName: string, id: number): Observable<DataResponseModel<Record<string, unknown>>> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.get<DataResponseModel<Record<string, unknown>>>(`${this.baseUrl}/get`, { params });
  }

  /** Yeni kayıt ekler */
  add(typeName: string, jsonData: Record<string, unknown>): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/add`, { typeName, jsonData });
  }

  /** Kayıt günceller */
  update(typeName: string, jsonData: Record<string, unknown>): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/update`, { typeName, jsonData });
  }

  /** Kayıt siler */
  delete(typeName: string, id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.post<ResponseModel>(`${this.baseUrl}/delete`, null, { params });
  }
}
