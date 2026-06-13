import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PublishModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishModel`;

  constructor(private http: HttpClient) {}

  /** C# entity kodunu backend'e gönderir ve derler */
  publishModel(dotNetCode: string): Observable<ResponseModel> {
    const params = new HttpParams().set('dotNetCode', dotNetCode);
    return this.http.post<ResponseModel>(this.baseUrl, null, { params });
  }

  /** Sunucu yeniden başladığında assembly'i yükle */
  loadAssembly(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/loadAssembly`);
  }
}
