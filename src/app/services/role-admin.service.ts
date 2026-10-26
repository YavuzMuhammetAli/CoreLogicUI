import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { AppUser } from '../models/appUser';
import { Role } from '../models/role';
import { ModelPermission } from './permission.service';
import { DataResponseModel } from '../models/dataResponseModel';

/**
 * İsimli rol (RBAC) yönetimi servisi.
 * Endpoint'ler yalnızca 'admin' rolüne sahip kullanıcılar tarafından çağrılabilir.
 *
 * 'admin' rolü bu servisin kapsamı dışındadır — o, PermissionAdminService.setAdmin
 * üzerinden ayrı bir akıştır. Bu servis yöneticilerin isimli roller oluşturup model
 * izinleri tanımlayıp kullanıcıları role üye yapabildiği genel RBAC akışını kapsar.
 */
@Injectable({ providedIn: 'root' })
export class RoleAdminService {
  private readonly roleUrl = `${environment.apiBaseUrl}/Role`;

  private readonly http = inject(HttpClient);

  /** Kiracıdaki tüm isimli rolleri (üye sayısıyla) listeler. GET /Role/getall */
  getRoles(): Observable<ListResponseModel<Role>> {
    return this.http.get<ListResponseModel<Role>>(`${this.roleUrl}/getall`);
  }

  /** Yeni isimli rol oluşturur. POST /Role/add?name= */
  createRole(name: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.roleUrl}/add`, null, { params: { name } });
  }

  /** Rolün adını değiştirir. POST /Role/rename?id=&name= */
  renameRole(roleId: number, name: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/rename`,
      null,
      { params: { id: roleId.toString(), name } }
    );
  }

  /**
   * Role üye kullanıcıların login sonrası açılış sayfasını ayarlar (boş string → kaldırılır).
   * POST /Role/setLandingPage?roleId=&page=
   */
  setLandingPage(roleId: number, page: string | null): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/setLandingPage`,
      null,
      { params: { roleId: roleId.toString(), page: page ?? '' } }
    );
  }

  /** Rolü siler (üyelik ve izin kayıtları dahil). POST /Role/delete?id= */
  deleteRole(roleId: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/delete`,
      null,
      { params: { id: roleId.toString() } }
    );
  }

  /** Rolün tüm model izinlerini döndürür. GET /Role/permissions?roleId= */
  /** Rol başına izinli model sayısı (roleId → sayı) — TEK istek. GET /Role/permittedModelCounts */
  getPermittedModelCounts(): Observable<DataResponseModel<Record<string, number>>> {
    return this.http.get<DataResponseModel<Record<string, number>>>(`${this.roleUrl}/permittedModelCounts`);
  }

  getRolePermissions(roleId: number): Observable<ListResponseModel<ModelPermission>> {
    return this.http.get<ListResponseModel<ModelPermission>>(
      `${this.roleUrl}/permissions`,
      { params: { roleId: roleId.toString() } }
    );
  }

  /**
   * Rol için model izni atar veya günceller.
   * action: bitwise int (örn. 7 = Read+Create+Update, 15 = All). toActionInt() ile hesaplanır.
   * POST /Role/setPermission?roleId=&modelName=&action=
   */
  setRolePermission(roleId: number, modelName: string, action: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/setPermission`,
      null,
      { params: { roleId: roleId.toString(), modelName, action: action.toString() } }
    );
  }

  /** Role üye olan kullanıcıları listeler. GET /Role/members?roleId= */
  getRoleMembers(roleId: number): Observable<ListResponseModel<AppUser>> {
    return this.http.get<ListResponseModel<AppUser>>(
      `${this.roleUrl}/members`,
      { params: { roleId: roleId.toString() } }
    );
  }

  /** Kullanıcıyı role üye yapar. POST /Role/addUser?roleId=&userId= */
  addUserToRole(roleId: number, userId: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/addUser`,
      null,
      { params: { roleId: roleId.toString(), userId: userId.toString() } }
    );
  }

  /** Kullanıcıyı rolden çıkarır. POST /Role/removeUser?roleId=&userId= */
  removeUserFromRole(roleId: number, userId: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/removeUser`,
      null,
      { params: { roleId: roleId.toString(), userId: userId.toString() } }
    );
  }
}
