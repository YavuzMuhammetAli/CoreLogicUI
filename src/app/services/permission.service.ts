import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ModelPermission {
  modelName: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface MyPermissionsResponse {
  success: boolean;
  message: string;
  data: {
    isAdmin: boolean;
    permissions: ModelPermission[];
  };
}

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Permission`;
  private readonly platformId = inject(PLATFORM_ID);
  private readonly http = inject(HttpClient);

  /** Kullanıcının yetki verisi — null ise henüz yüklenmedi */
  private _data = signal<MyPermissionsResponse['data'] | null>(null);

  /**
   * Kullanıcının yetkilerini backend'den yükler.
   * SSR ortamında tarayıcı olmadığından çağırılmaz.
   * Observable döndürür; subscribe eden çıkış (logout) akışında kullanabilir.
   */
  loadMyPermissions(): Observable<MyPermissionsResponse> {
    return this.http
      .get<MyPermissionsResponse>(`${this.baseUrl}/my`)
      .pipe(
        tap(res => {
          if (res.success && res.data) {
            this._data.set(res.data);
          }
        })
      );
  }

  /**
   * Kullanıcının yönetici olup olmadığını senkron olarak döndürür.
   * Signal tabanlı; yetki verisi henüz yüklenmediyse false döner.
   */
  isAdmin(): boolean {
    return this._data()?.isAdmin ?? false;
  }

  /**
   * Verilen model üzerinde belirtilen işlem yetkisini senkron kontrol eder.
   * Yönetici ise her zaman true döner.
   * @param modelName  Model / tablo adı (typeName)
   * @param action     'read' | 'create' | 'update' | 'delete'
   */
  can(
    modelName: string,
    action: 'read' | 'create' | 'update' | 'delete'
  ): boolean {
    const data = this._data();
    if (!data) return false;
    if (data.isAdmin) return true;

    const perm = data.permissions.find(
      p => p.modelName.toLowerCase() === modelName.toLowerCase()
    );
    if (!perm) return false;

    switch (action) {
      case 'read':   return perm.canRead;
      case 'create': return perm.canCreate;
      case 'update': return perm.canUpdate;
      case 'delete': return perm.canDelete;
    }
  }

  /** Yetki verisini yeniden yükler (örn. kullanıcı değişikliğinden sonra). */
  refresh(): Observable<MyPermissionsResponse> {
    return this.loadMyPermissions();
  }

  /** Yetki verisini temizler (çıkış işleminde çağrılır). */
  clear(): void {
    this._data.set(null);
  }

  /**
   * Uygulama kabuğu yüklendiğinde çağrılır.
   * SSR ortamında tarayıcı yoksa işlem yapılmaz.
   */
  init(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.loadMyPermissions().subscribe({
      error: err => console.warn('[CoreLogic] Yetki yüklenemedi:', err?.message)
    });
  }
}
