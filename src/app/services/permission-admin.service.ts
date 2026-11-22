import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { ResponseModel } from '../models/responseModel';
import { ListResponseModel } from '../models/responseModelList';
import { AppUser } from '../models/appUser';
import { ModelPermission } from './permission.service';
import { DataResponseModel } from '../models/dataResponseModel';

/** Bitwise PermissionAction flags — match the backend PermissionAction enum one to one */
export const PermissionFlag = {
  None:          0,
  Read:          1,
  Create:        2,
  Update:        4,
  Delete:        8,
  All:           15,
  Navigation:    16,
  /** The user can see/change only the records they created. */
  OwnOnly:       32,
  /** Sees the record's workflow (path taken + who approved/is pending). Together with Read. */
  ViewWorkflow:  64
} as const;

/** Converts a ModelPermission into the bitwise action int */
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
 * Admin permission management service.
 * The endpoints can only be called by users with the 'admin' role.
 */
@Injectable({ providedIn: 'root' })
export class PermissionAdminService {
  private readonly userUrl       = `${environment.apiBaseUrl}/User`;
  private readonly permissionUrl = `${environment.apiBaseUrl}/Permission`;

  private readonly http = inject(HttpClient);

  /**
   * Lists all users (including IsAdmin, excluding sensitive fields).
   * GET /User/getall — requires admin.
   */
  getUsers(): Observable<ListResponseModel<AppUser>> {
    return this.http.get<ListResponseModel<AppUser>>(`${this.userUrl}/getall`);
  }

  /**
   * Returns all model permissions of the given user.
   * GET /Permission/forUser?userId= — requires admin.
   */
  /**
   * Number of permitted models per user (userId → count) — ONE request.
   * GET /Permission/permittedModelCounts — requires admin.
   */
  getPermittedModelCounts(): Observable<DataResponseModel<Record<string, number>>> {
    return this.http.get<DataResponseModel<Record<string, number>>>(`${this.permissionUrl}/permittedModelCounts`);
  }

  getUserPermissions(userId: number): Observable<ListResponseModel<ModelPermission>> {
    return this.http.get<ListResponseModel<ModelPermission>>(
      `${this.permissionUrl}/forUser`,
      { params: { userId: userId.toString() } }
    );
  }

  /**
   * Assigns or updates a model permission for the user.
   * action: bitwise int (e.g. 7 = Read+Create+Update, 15 = All). Computed with toActionInt().
   * POST /Permission/set — requires admin.
   */
  setPermission(userId: number, modelName: string, action: number): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.permissionUrl}/set`,
      null,
      { params: { userId: userId.toString(), modelName, action: action.toString() } }
    );
  }

  /**
   * Grants (isAdmin=true) or removes (isAdmin=false) the 'admin' role for the user.
   * The change takes effect in the user's next JWT session.
   * POST /User/setAdmin — requires admin.
   */
  setAdmin(userId: number, isAdmin: boolean): Observable<ResponseModel> {
    return this.http.post<ResponseModel>(
      `${this.userUrl}/setAdmin`,
      null,
      { params: { userId: userId.toString(), isAdmin: isAdmin.toString() } }
    );
  }
}
