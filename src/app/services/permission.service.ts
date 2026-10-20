import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of, tap, catchError, shareReplay, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ModelPermission {
  modelName: string;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** Kullanıcı sidebar navigasyonunda görünsün mü? Read'den bağımsız bayrak. */
  canShowInNav: boolean;
  /** Kullanıcı yalnızca kendi oluşturduğu (CreatedBy==userId) kayıtları görebilir/değiştirebilir. */
  canOwnOnly: boolean;
  /** Kayıttaki iş akışını görebilir mi (karar sunucuda — IWorkflowAccessPolicy). */
  canViewWorkflow: boolean;
}

export interface MyPermissionsResponse {
  success: boolean;
  message: string;
  data: {
    isAdmin: boolean;
    permissions: ModelPermission[];
    /** Kullanıcının üye olduğu rollerden çözülen açılış sayfası; tanımlı değilse null. */
    landingPage: string | null;
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
   * Uçuştaki yükleme isteği — aynı anda birden fazla guard çalışırsa
   * tek HTTP isteğiyle paylaşılır. clear() çağrısında sıfırlanır.
   */
  private _loadingRef: Observable<MyPermissionsResponse['data'] | null> | null = null;

  /**
   * Yetki verisinin yüklü olmasını garantiler.
   *
   * - Sinyal zaten doluysa anında mevcut veriyi emit eder (HTTP isteği atmaz).
   * - Değilse `loadMyPermissions()` çağırır; aynı anda birden fazla guard
   *   çalışırsa `shareReplay(1)` sayesinde tek HTTP isteği atılır.
   * - Hata durumunda `null` emit eder; 401 `errorInterceptor` tarafından
   *   login yönlendirmesiyle ele alınır.
   *
   * Guard'larda kullanım: `permissions.ensureLoaded().pipe(map(() => ...))`
   */
  ensureLoaded(): Observable<MyPermissionsResponse['data'] | null> {
    // Zaten dolduysa — anında dön, yeniden istek atma
    if (this._data() !== null) {
      return of(this._data());
    }

    // Uçuştaki isteği paylaş; tamamlanınca referansı temizle
    if (!this._loadingRef) {
      this._loadingRef = this.loadMyPermissions().pipe(
        map(() => this._data()),
        catchError(() => of(null)),
        shareReplay(1)
      );
    }

    return this._loadingRef;
  }

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

  /**
   * Verilen modelin navigasyonda görünüp görünmeyeceğini senkron kontrol eder.
   * Yönetici ise her zaman true döner (admin sidebar'ı farklı branch'te render edilir,
   * bu metot admin görünürlüğünü etkilemez; yalnızca normal kullanıcı nav filtresi için).
   */
  canNavigate(modelName: string): boolean {
    const data = this._data();
    if (!data) return false;
    if (data.isAdmin) return true;

    const perm = data.permissions.find(
      p => p.modelName.toLowerCase() === modelName.toLowerCase()
    );
    return perm?.canShowInNav ?? false;
  }

  /**
   * Login sonrası yönlendirilecek açılış sayfasını döndürür. Kullanıcının rolünde tanımlı
   * bir açılış sayfası yoksa (ya da yetki verisi henüz yüklenmediyse) varsayılan /models döner.
   */
  getLandingPage(): string {
    return this._data()?.landingPage ?? '/models';
  }

  /** Yetki verisini temizler (çıkış işleminde çağrılır). */
  clear(): void {
    this._data.set(null);
    this._loadingRef = null; // ensureLoaded uçuş referansını da sıfırla
  }

}
