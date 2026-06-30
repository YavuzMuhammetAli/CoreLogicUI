import {
  ApplicationConfig,
  APP_INITIALIZER,
  PLATFORM_ID,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { errorInterceptor } from './interceptors/error.interceptor';
import { languageInterceptor } from './interceptors/language.interceptor';
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
    // Tarayıcı dışında (artık olmasa da guard yapısını bozmamak için korundu)
    if (!isPlatformBrowser(platformId)) return Promise.resolve();

    return firstValueFrom(permissionService.loadMyPermissions())
      .then(() => {}) // başarılı — sinyal set edildi
      .catch(() => {}); // hata (401, ağ vb.) — sessizce geç, authGuard devralır
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withEnabledBlockingInitialNavigation: APP_INITIALIZER (izin yüklemesi) tamamlanana
    // dek navigasyon başlamaz; guard'lar sinyal dolu olduğunda çalışır → login flash yok.
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, languageInterceptor, errorInterceptor])),

    // Guard yarış durumu düzeltmesi: izinleri router etkinleşmeden yükle
    {
      provide: APP_INITIALIZER,
      useFactory: permissionInitializerFactory,
      deps: [PermissionService, PLATFORM_ID],
      multi: true
    }
  ]
};
