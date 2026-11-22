import { HttpInterceptorFn, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { LanguageService } from '../services/language.service';
import { NotificationService } from '../services/notification.service';

/** Don't show the maintenance and rate-limit warnings again and again on consecutive requests (ms). */
const MAINTENANCE_NOTICE_INTERVAL = 10_000;
let lastMaintenanceNotice = 0;
let lastRateLimitNotice = 0;

/**
 * Disables the redirect to `/models` on 403 for this request.
 *
 * Used only on AUXILIARY requests — calls that are not the page's main data and can
 * fail silently (assembly loading, form rules, lookup
 * labels). They are not the page's main data; pulling the user off their current page
 * when they return 403 is wrong. For example, a non-admin user could never see the landing
 * dashboard and could not enter the record screen on the first try.
 *
 * Usage: `{ context: new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true) }`
 */
export const SKIP_FORBIDDEN_REDIRECT = new HttpContextToken<boolean>(() => false);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const notifications = inject(NotificationService);
  const language = inject(LanguageService);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (typeof localStorage === 'undefined') {
        // SSR environment — no localStorage, don't redirect
        return throwError(() => err);
      }

      // 401: session expired or invalid → clear the session.
      // The "session expired" redirect only makes sense when there really is a session
      // — a 401 on an anonymous request (e.g. a call from a public page)
      // must not pull the user off the public page they are on.
      if (err.status === 401 && auth.clearSession()) {
        // If the company data was restored, old sessions are invalidated on the server —
        // the login screen states the reason instead of "your session expired".
        const reason = errorCode(err) === 'session_invalidated' ? 'tenant_restored' : 'session_expired';
        router.navigate(['/login'], { queryParams: { reason } });
      }

      // 503 + tenant_maintenance: the company database is being restored (a few minutes). The session
      // is valid — the user is not pulled off the page, only told the reason.
      if (err.status === 503 && errorCode(err) === 'tenant_maintenance') {
        const now = Date.now();
        if (now - lastMaintenanceNotice > MAINTENANCE_NOTICE_INTERVAL) {
          lastMaintenanceNotice = now;
          notifications.warn((err.error as { message?: string })?.message ?? language.t('common.maintenance'));
        }
      }

      // 429: rate limit (backend or nginx). The response body is empty; let the user know the reason.
      if (err.status === 429) {
        const now = Date.now();
        if (now - lastRateLimitNotice > MAINTENANCE_NOTICE_INTERVAL) {
          lastRateLimitNotice = now;
          notifications.warn(language.t('common.rateLimited'));
        }
      }

      // 403: insufficient permission — the session is valid, don't log the user out.
      // The error chain continues so components can show the message in their own error flows.
      // If the user tries to go directly to an admin URL, adminGuard already redirects.
      // Auxiliary requests (SKIP_FORBIDDEN_REDIRECT) don't redirect — see the token description.
      if (err.status === 403 && !req.context.get(SKIP_FORBIDDEN_REDIRECT)) {
        // Redirect the user to a safe page (the models they can access)
        router.navigate(['/models']);
      }

      return throwError(() => err);
    })
  );
};

/** The server's machine-readable error code (a { code: '…' } body). */
function errorCode(err: HttpErrorResponse): string | null {
  const body = err.error as { code?: unknown } | null;
  return body && typeof body === 'object' && typeof body.code === 'string' ? body.code : null;
}
