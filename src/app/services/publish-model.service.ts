import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PublishModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishModel`;

  constructor(private http: HttpClient) {}

  /** Sunucu yeniden başladığında assembly'i yükle */
  loadAssembly(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/loadAssembly`);
  }
}
