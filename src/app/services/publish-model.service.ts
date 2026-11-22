import { Injectable } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ResponseModel } from '../models/responseModel';
import { environment } from '../../environments/environment';
import { SKIP_FORBIDDEN_REDIRECT } from '../interceptors/error.interceptor';

@Injectable({ providedIn: 'root' })
export class PublishModelService {
  private readonly baseUrl = `${environment.apiBaseUrl}/PublishModel`;

  constructor(private http: HttpClient) {}

  /**
   * Loads the assembly after the server restarts.
   *
   * The endpoint is admin-only and every call is auxiliary: the backend
   * TenantResolutionMiddleware already loads the assembly itself on the tenant's first request.
   * The redirect is disabled so that a 403 does not pull the user off the page.
   */
  loadAssembly(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/loadAssembly`, {
      context: new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true)
    });
  }
}
