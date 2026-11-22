import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';

/**
 * Protects routes that only administrators may access.
 *
 * Guarantees the permission data is loaded via ensureLoaded();
 * decides correctly even if the synchronous signal is null on a page reload.
 * Redirects to /login if the user is not an administrator.
 */
export const adminGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const permissions = inject(PermissionService);
  const router = inject(Router);

  return permissions.ensureLoaded().pipe(
    map(() => permissions.isAdmin() ? true : router.createUrlTree(['/login']))
  );
};
