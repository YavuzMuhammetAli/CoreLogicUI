import { CanActivateFn, Router } from '@angular/router';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const platformId = inject(PLATFORM_ID);

  // There is no localStorage in an SSR / prerender environment; running the guard here
  // would prerender the login page → a login flash on reload.
  // In a non-browser environment return true and leave the real check to client hydration.
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  // The session is read from the server (HttpOnly cookie); it may still be empty on a page reload.
  return auth.ensureSession().pipe(
    map(session => session ? true : router.createUrlTree(['/login']))
  );
};
