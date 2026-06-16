import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { PermissionService } from '../services/permission.service';

/** Yalnızca yöneticilerin erişebileceği rotaları korur. Yönetici değilse /login'e yönlendirir. */
export const adminGuard: CanActivateFn = () => {
  const permissions = inject(PermissionService);
  const router = inject(Router);

  if (permissions.isAdmin()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
