import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom, of, switchMap } from 'rxjs';

import { routes } from './app.routes';
import { errorInterceptor } from './interceptors/error.interceptor';
import { languageInterceptor } from './interceptors/language.interceptor';
import { AuthService } from './services/auth.service';
import { PermissionService } from './services/permission.service';

/**
 * App startup factory — loads permissions before the guards run.
 *
 * WHY IT IS NEEDED:
 * adminGuard reads the PermissionService.isAdmin() signal synchronously.
 * In the previous design permissions were loaded only in LayoutComponent.ngOnInit.
 * So on direct navigation to admin routes like /build, /drafts, /permissions
 * or on a page reload the signal stayed empty (null), isAdmin() returned
 * false and the admin user was sent to /login (race condition).
 *
 * With APP_INITIALIZER the permissions are resolved before the Angular router activates;
 * once the signal is filled the guards give the right result.
 * If no session is open the request returns 401, the error is swallowed silently and
 * authGuard redirects to /login in the normal flow.
 */
function loadInitialPermissions(
  auth: AuthService,
  permissionService: PermissionService,
  platformId: Object
): Promise<void> {
  // Outside the browser (kept so as not to break the guard structure, even though it no longer happens)
  if (!isPlatformBrowser(platformId)) return Promise.resolve();

  // Without a session (anonymous visitor — /login or /register-company) don't send the permission
  // request: otherwise /Permission/my returns 401 and the error interceptor would redirect the user
  // to login with a misleading "session expired" message
  // (it broke deep links to the sign-up wizard).
  //
  // ensureSession/ensureLoaded: SHARES the in-flight request with the guards. The router's first navigation is
  // also an initializer and starts in parallel with this; when loadMyPermissions was called directly the guards
  // could not see the request, and /Permission/my went out a second time on every protected page load.
  const permissions$ = auth.ensureSession().pipe(
    switchMap(session => (session ? permissionService.ensureLoaded() : of(null)))
  );
  return firstValueFrom(permissions$)
    .then(() => {}) // success — the signal was set
    .catch(() => {}); // error (401, network etc.) — pass silently, authGuard takes over
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // withEnabledBlockingInitialNavigation: navigation does not start until APP_INITIALIZER
    // (permission load) completes; guards run once the signal is filled → no login flash.
    provideRouter(routes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(withInterceptors([languageInterceptor, errorInterceptor])),

    // Guard race condition fix: load permissions before the router activates
    provideAppInitializer(() => loadInitialPermissions(inject(AuthService), inject(PermissionService), inject(PLATFORM_ID)))
  ]
};
