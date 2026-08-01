import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { AppUser } from '../models/appUser';

/** POST /User/create gövdesi. */
export interface UserCreateRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** true ise kullanıcıya 'admin' rolü verilir. */
  isAdmin: boolean;
  /** Opsiyonel isimli rol (OperationClaim.ID). */
  roleId?: number | null;
}

/** PUT /User/update gövdesi. */
export interface UserUpdateRequest {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Şirket içi kullanıcı yönetimi — yalnızca admin.
 *
 * Tenant istemciden GÖNDERİLMEZ: backend her işlemi çağıran admin'in JWT'sindeki
 * ambient tenant'ta yapar. Dışarıdan başka bir şirkete kullanıcı eklenemez.
 *
 * Not: admin yetkisi ve pasifleme değişiklikleri kullanıcının YENİ oturumunda
 * (yeni JWT) etkinleşir.
 */
@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/User`;

  /** Şirketteki tüm kullanıcılar (hassas alanlar içermez). */
  getUsers(): Observable<ListResponseModel<AppUser>> {
    return this.http.get<ListResponseModel<AppUser>>(`${this.baseUrl}/getall`);
  }

  /** Yeni kullanıcı oluşturur; data alanında yeni kullanıcının ID'si döner. */
  create(body: UserCreateRequest): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/create`, body);
  }

  /** Ad/soyad/e-posta günceller. E-posta değişirse backend master kaydını da günceller. */
  update(userId: number, body: UserUpdateRequest): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId);
    return this.http.put<ResponseModel>(`${this.baseUrl}/update`, body, { params });
  }

  /** Kullanıcının giriş yetkisini açar/kapatır. */
  setActive(userId: number, active: boolean): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId).set('active', active);
    return this.http.post<ResponseModel>(`${this.baseUrl}/setActive`, null, { params });
  }

  /** Admin, kullanıcı için yeni parola belirler. */
  resetPassword(userId: number, newPassword: string): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/resetPassword`, { newPassword }, { params });
  }

  /** 'admin' rolünü verir/kaldırır (kilitlenme korumaları backend'de). */
  setAdmin(userId: number, isAdmin: boolean): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId).set('isAdmin', isAdmin);
    return this.http.post<ResponseModel>(`${this.baseUrl}/setAdmin`, null, { params });
  }

  /**
   * Kullanıcıyı KALICI siler. Kullanıcı sistemde kayıt oluşturmuşsa backend
   * reddeder ve pasifleme önerir — veri bütünlüğü korunur.
   */
  delete(userId: number): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId);
    return this.http.delete<ResponseModel>(`${this.baseUrl}/delete`, { params });
  }
}
