import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { AppUser } from '../models/appUser';
import { ModelPermission } from './permission.service';

/** Bitwise PermissionAction bayrakları — backend PermissionAction enum ile birebir eşleşir */
export const PermissionFlag = {
  None:          0,
  Read:          1,
  Create:        2,
  Update:        4,
  Delete:        8,
  All:           15,
  Navigation:    16,
  /** Kullanıcı yalnızca kendi oluşturduğu kayıtları görebilir/değiştirebilir. */
  OwnOnly:       32,
  /** Kayıttaki iş akışını (ilerlenen yol + kim onayladı/bekliyor) görür. Read ile birlikte. */
  ViewWorkflow:  64
} as const;

/** ModelPermission'ı bitwise action int'ine dönüştürür */
export function toActionInt(p: {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canShowInNav: boolean;
  canOwnOnly: boolean;
  canViewWorkflow: boolean;
}): number {
  let action = 0;
  if (p.canRead)      action |= PermissionFlag.Read;
  if (p.canCreate)    action |= PermissionFlag.Create;
  if (p.canUpdate)    action |= PermissionFlag.Update;
  if (p.canDelete)    action |= PermissionFlag.Delete;
  if (p.canShowInNav) action |= PermissionFlag.Navigation;
  if (p.canOwnOnly)   action |= PermissionFlag.OwnOnly;
  if (p.canViewWorkflow) action |= PermissionFlag.ViewWorkflow;
  return action;
}

/**
 * Admin yetki yönetimi servisi.
 * Endpoint'ler yalnızca 'admin' rolüne sahip kullanıcılar tarafından çağrılabilir.
 */
@Injectable({ providedIn: 'root' })
export class PermissionAdminService {
  private readonly userUrl       = `${environment.apiBaseUrl}/User`;
  private readonly permissionUrl = `${environment.apiBaseUrl}/Permission`;

  private readonly http = inject(HttpClient);

  /**
   * Tüm kullanıcıları listeler (IsAdmin bilgisi dahil, hassas alanlar hariç).
   * GET /User/getall — admin yetkisi gerekli.
   */
  getUsers(): Observable<ListResponseModel<AppUser>> {
    return this.http.get<ListResponseModel<AppUser>>(`${this.userUrl}/getall`);
  }

  /**
   * Belirtilen kullanıcının tüm model izinlerini döndürür.
   * GET /Permission/forUser?userId= — admin yetkisi gerekli.
   */
  getUserPermissions(userId: number): Observable<ListResponseModel<ModelPermission>> {
    return this.http.get<ListResponseModel<ModelPermission>>(
      `${this.permissionUrl}/forUser`,
      { params: { userId: userId.toString() } }
    );
  }

  /**
   * Kullanıcı için model izni atar veya günceller.
   * action: bitwise int (örn. 7 = Read+Create+Update, 15 = All). toActionInt() ile hesaplanır.
   * POST /Permission/set — admin yetkisi gerekli.
   */
  setPermission(userId: number, modelName: string, action: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.permissionUrl}/set`,
      null,
      { params: { userId: userId.toString(), modelName, action: action.toString() } }
    );
  }

  /**
   * Kullanıcıya 'admin' rolü atar (isAdmin=true) veya kaldırır (isAdmin=false).
   * Değişiklik kullanıcının yeni JWT oturumunda etkinleşir.
   * POST /User/setAdmin — admin yetkisi gerekli.
   */
  setAdmin(userId: number, isAdmin: boolean): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.userUrl}/setAdmin`,
      null,
      { params: { userId: userId.toString(), isAdmin: isAdmin.toString() } }
    );
  }
}
