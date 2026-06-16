import {
  ApplicationConfig,
  APP_INITIALIZER,
  PLATFORM_ID,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { PermissionService } from './services/permission.service';

/**
 * Uygulama başlatma fabrikası — guard'lar çalışmadan önce izinleri yükler.
 *
 * NEDEN GEREKLİ:
 * adminGuard, PermissionService.isAdmin() sinyalini senkron okur.
 * Önceki tasarımda izinler yalnızca LayoutComponent.ngOnInit içinde yükleniyordu.
 * Bu yüzden /build, /drafts, /permissions gibi admin route'larına doğrudan
 * navigasyon veya sayfa yenilemesinde sinyal boş (null) kalıyor, isAdmin()
 * false dönüyor ve admin kullanıcı /login'e atılıyordu (yarış durumu).
 *
 * APP_INITIALIZER ile izinler Angular router etkinleşmeden önce çözülür;
 * sinyal dolu olduğunda guard'lar doğru sonucu verir.
 * Oturum açık değilse istek 401 ile döner, hata sessizce yutulur ve
 * authGuard normal akışta /login'e yönlendirir.
 */
function permissionInitializerFactory(
  permissionService: PermissionService,
  platformId: Object
): () => Promise<void> {
  return () => {
    // SSR ortamında tarayıcı yoktur; localStorage/JWT erişimi anlamsız
    if (!isPlatformBrowser(platformId)) return Promise.resolve();

    return firstValueFrom(permissionService.loadMyPermissions())
      .then(() => {}) // başarılı — sinyal set edildi
      .catch(() => {}); // hata (401, ağ vb.) — sessizce geç, authGuard devralır
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, errorInterceptor])),

    // Guard yarış durumu düzeltmesi: izinleri router etkinleşmeden yükle
    {
      provide: APP_INITIALIZER,
      useFactory: permissionInitializerFactory,
      deps: [PermissionService, PLATFORM_ID],
      multi: true
    }
  ]
};
