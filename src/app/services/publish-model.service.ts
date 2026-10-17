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
   * Sunucu yeniden başladığında assembly'i yükle.
   *
   * Uç admin'e özeldir ve her çağrısı yardımcı niteliktedir: backend
   * TenantResolutionMiddleware assembly'yi tenant'ın ilk isteğinde zaten kendisi
   * yükler. 403 kullanıcıyı sayfadan koparmasın diye yönlendirme kapalı.
   */
  loadAssembly(): Observable<ResponseModel> {
    return this.http.get<ResponseModel>(`${this.baseUrl}/loadAssembly`, {
      context: new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true)
    });
  }
}
