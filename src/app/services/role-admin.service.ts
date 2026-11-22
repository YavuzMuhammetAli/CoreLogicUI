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
 * Named role (RBAC) management service.
 * The endpoints can only be called by users with the 'admin' role.
 *
 * The 'admin' role is outside the scope of this service — it is a separate flow through
 * PermissionAdminService.setAdmin. This service covers the general RBAC flow where admins create
 * named roles, define model permissions and make users members of roles.
 */
@Injectable({ providedIn: 'root' })
export class RoleAdminService {
  private readonly roleUrl = `${environment.apiBaseUrl}/Role`;

  private readonly http = inject(HttpClient);

  /** Lists all named roles in the tenant (with member counts). GET /Role/getall */
  getRoles(): Observable<ListResponseModel<Role>> {
    return this.http.get<ListResponseModel<Role>>(`${this.roleUrl}/getall`);
  }

  /** Creates a new named role. POST /Role/add?name= */
  createRole(name: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(`${this.roleUrl}/add`, null, { params: { name } });
  }

  /** Renames the role. POST /Role/rename?id=&name= */
  renameRole(roleId: number, name: string): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/rename`,
      null,
      { params: { id: roleId.toString(), name } }
    );
  }

  /**
   * Sets the post-login landing page for the role's members (empty string → removed).
   * POST /Role/setLandingPage?roleId=&page=
   */
  setLandingPage(roleId: number, page: string | null): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/setLandingPage`,
      null,
      { params: { roleId: roleId.toString(), page: page ?? '' } }
    );
  }

  /** Deletes the role (including membership and permission records). POST /Role/delete?id= */
  deleteRole(roleId: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/delete`,
      null,
      { params: { id: roleId.toString() } }
    );
  }

  /** Returns all model permissions of the role. GET /Role/permissions?roleId= */
  /** Number of permitted models per role (roleId → count) — ONE request. GET /Role/permittedModelCounts */
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
   * Assigns or updates a model permission for the role.
   * action: bitwise int (e.g. 7 = Read+Create+Update, 15 = All). Computed with toActionInt().
   * POST /Role/setPermission?roleId=&modelName=&action=
   */
  setRolePermission(roleId: number, modelName: string, action: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/setPermission`,
      null,
      { params: { roleId: roleId.toString(), modelName, action: action.toString() } }
    );
  }

  /** Lists the users who are members of the role. GET /Role/members?roleId= */
  getRoleMembers(roleId: number): Observable<ListResponseModel<AppUser>> {
    return this.http.get<ListResponseModel<AppUser>>(
      `${this.roleUrl}/members`,
      { params: { roleId: roleId.toString() } }
    );
  }

  /** Makes the user a member of the role. POST /Role/addUser?roleId=&userId= */
  addUserToRole(roleId: number, userId: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/addUser`,
      null,
      { params: { roleId: roleId.toString(), userId: userId.toString() } }
    );
  }

  /** Removes the user from the role. POST /Role/removeUser?roleId=&userId= */
  removeUserFromRole(roleId: number, userId: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.roleUrl}/removeUser`,
      null,
      { params: { roleId: roleId.toString(), userId: userId.toString() } }
    );
  }
}
