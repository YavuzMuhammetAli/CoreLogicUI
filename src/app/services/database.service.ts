import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Database`;

  constructor(private http: HttpClient) {}

  /** Creates the database (and the base schema) from scratch */
  createDatabase(): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/createdatabase`, {});
  }

  /** Creates the SQL tables for published dynamic types */
  createTable(): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/createtable`, {});
  }

  /** Checks the database connection and schema */
  checkDatabase(): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/checkdatabase`, {});
  }
}
