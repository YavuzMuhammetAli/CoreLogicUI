import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';

export interface PublishedTableDto {
  tableName: string;
  description: string;
  version: number;
}

@Injectable({ providedIn: 'root' })
export class PublishedTableService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Published`;

  constructor(private http: HttpClient) {}

  /** Yeni tablo metadata kaydı ekler */
  addTable(table: PublishedTableDto): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.baseUrl}/addTable`, table);
  }

  /** Tabloya kolon metadata kaydı ekler */
  addMember(
    typeName: string,
    memberName: string,
    memberType: string,
    isRequired: boolean
  ): Observable<ResponseModel> {
    const params = new HttpParams()
      .set('typeName', typeName)
      .set('memberName', memberName)
      .set('memberType', memberType)
      .set('isRequired', isRequired);
    return this.http.post<ResponseModel>(`${this.baseUrl}/addMember`, null, { params });
  }
}
