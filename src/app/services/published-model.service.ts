import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PublishedModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishedModel`;

  constructor(private http: HttpClient) {}

  /** Tüm kayıtları getirir */
  getAll(typeName: string): Observable<ListResponseModel<Record<string, unknown>>> {
    const params = new HttpParams().set('typeName', typeName);
    return this.http.get<ListResponseModel<Record<string, unknown>>>(`${this.baseUrl}/getall`, { params });
  }

  /** Tek kayıt getirir */
  get(typeName: string, id: number): Observable<ResponseModel> {
    const params = new HttpParams().set('typeName', typeName).set('id', id);
    return this.http.get<ResponseModel>(`${this.baseUrl}/get`, { params });
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
