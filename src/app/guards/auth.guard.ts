import { CanActivateFn, Router } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);

  // SSR / prerender ortamında localStorage yoktur; guard'ı burada çalıştırmak
  // login sayfasının prerender edilmesine yol açar → yenilemede login flash'i.
  // Tarayıcı olmayan ortamda true döndürüp gerçek kontrolü client hidrasyonuna bırak.
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  // Oturum sunucudan okunur (çerez HttpOnly); sayfa yenilemesinde henüz boş olabilir.
  return auth.ensureSession().pipe(
    map(session => session ? true : router.createUrlTree(['/login']))
  );
};
