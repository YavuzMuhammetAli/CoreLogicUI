import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';

/**
 * Yalnızca yöneticilerin erişebileceği rotaları korur.
 *
 * ensureLoaded() ile yetki verisinin yüklü olmasını garantiler;
 * sayfa yenilemesinde senkron sinyal null olsa dahi doğru kararı verir.
 * Yönetici değilse /login'e yönlendirir.
 */
export const adminGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const permissions = inject(PermissionService);
  const router = inject(Router);

  return permissions.ensureLoaded().pipe(
    map(() => permissions.isAdmin() ? true : router.createUrlTree(['/login']))
  );
};
