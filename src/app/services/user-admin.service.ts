import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { DataResponseModel } from '../models/dataResponseModel';
import { AppUser } from '../models/appUser';

/** Body of POST /User/create. */
export interface UserCreateRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** If true, the user is given the 'admin' role. */
  isAdmin: boolean;
  /** Opsiyonel isimli rol (OperationClaim.ID). */
  roleId?: number | null;
}

/** Body of PUT /User/update. */
export interface UserUpdateRequest {
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * In-company user management — admin only.
 *
 * The tenant is NOT sent by the client: the backend performs every operation in the ambient tenant
 * of the calling admin's JWT. Users cannot be added to another company from outside.
 *
 * Note: admin permission and deactivation changes take effect in the user's NEW session
 * (new JWT).
 */
@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/User`;

  /** All users in the company (no sensitive fields). */
  getUsers(): Observable<ListResponseModel<AppUser>> {
    return this.http.get<ListResponseModel<AppUser>>(`${this.baseUrl}/getall`);
  }

  /** Creates a new user; the data field returns the new user's ID. */
  create(body: UserCreateRequest): Observable<DataResponseModel<number>> {
    return this.http.post<DataResponseModel<number>>(`${this.baseUrl}/create`, body);
  }

  /** Updates first name/last name/email. If the email changes, the backend also updates the master record. */
  update(userId: number, body: UserUpdateRequest): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId);
    return this.http.put<ResponseModel>(`${this.baseUrl}/update`, body, { params });
  }

  /** Enables/disables the user's login. */
  setActive(userId: number, active: boolean): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId).set('active', active);
    return this.http.post<ResponseModel>(`${this.baseUrl}/setActive`, null, { params });
  }

  /** The admin sets a new password for the user. */
  resetPassword(userId: number, newPassword: string): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId);
    return this.http.post<ResponseModel>(
      `${this.baseUrl}/resetPassword`, { newPassword }, { params });
  }

  /** Grants/removes the 'admin' role (lockout protections are on the backend). */
  setAdmin(userId: number, isAdmin: boolean): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId).set('isAdmin', isAdmin);
    return this.http.post<ResponseModel>(`${this.baseUrl}/setAdmin`, null, { params });
  }

  /**
   * PERMANENTLY deletes the user. If the user has created records in the system, the backend
   * rejects it and suggests deactivation — data integrity is preserved.
   */
  delete(userId: number): Observable<ResponseModel> {
    const params = new HttpParams().set('userId', userId);
    return this.http.delete<ResponseModel>(`${this.baseUrl}/delete`, { params });
  }
}
