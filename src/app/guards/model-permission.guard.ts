import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';
import { NotificationService } from '../services/notification.service';
import { LanguageService } from '../services/language.service';

/**
 * Factory for the per-model permission guard of model routes.
 *
 * Usage (app.routes.ts):
 *   canActivate: [modelPermissionGuard('read')]
 *   canActivate: [modelPermissionGuard('create')]
 *
 * - Admins are bypassed inside PermissionService.can().
 * - Without permission, redirects to '/models' and shows a warning via NotificationService.
 * - Waits for the permission data to be loaded via ensureLoaded(); decides correctly
 *   even if the synchronous signal is null on a page reload.
 */
export function modelPermissionGuard(action: 'read' | 'create' | 'update' | 'delete'): CanActivateFn {
  return (route): Observable<boolean | UrlTree> => {
    const permissions = inject(PermissionService);
    const notify      = inject(NotificationService);
    const router      = inject(Router);
    const language    = inject(LanguageService);

    const typeName = route.paramMap.get('typeName') ?? '';

    return permissions.ensureLoaded().pipe(
      map(() => {
        if (typeName && permissions.can(typeName, action)) {
          return true;
        }

        // The warning is in the active language (previously a fixed Turkish text).
        const label = typeName
          ? language.t('permission.guard.denied', {
              model: typeName,
              action: language.t(`permission.guard.action.${action}`)
            })
          : language.t('permission.guard.deniedGeneric');

        notify.warn(label);
        return router.createUrlTree(['/models']);
      })
    );
  };
}
