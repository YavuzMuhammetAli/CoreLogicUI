import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Database`;

  constructor(private http: HttpClient) {}

  /** Veritabanını (ve temel şemayı) sıfırdan oluşturur */
  createDatabase(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/createdatabase`);
  }

  /** Yayınlanan dinamik tipler için SQL tabloları oluşturur */
  createTable(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/createtable`);
  }

  /** Veritabanı bağlantısını ve şemasını kontrol eder */
  checkDatabase(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/checkdatabase`);
  }
}
