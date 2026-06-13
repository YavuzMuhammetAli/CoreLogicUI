import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Database`;

  constructor(private http: HttpClient) {}

  /** Yayınlanan dinamik tipler için SQL tabloları oluşturur */
  createTable(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/createtable`);
  }
}
