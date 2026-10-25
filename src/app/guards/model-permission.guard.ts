import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';
import { NotificationService } from '../services/notification.service';
import { LanguageService } from '../services/language.service';

/**
 * Model rotaları için per-model izin guard'ı fabrikası.
 *
 * Kullanım (app.routes.ts):
 *   canActivate: [modelPermissionGuard('read')]
 *   canActivate: [modelPermissionGuard('create')]
 *
 * - Admin'ler PermissionService.can() içinde bypass edilir.
 * - İzin yoksa '/models'e yönlendirir ve NotificationService üzerinden uyarı gösterir.
 * - ensureLoaded() ile yetki verisinin yüklü olması beklenir; sayfa yenilemesinde
 *   senkron sinyal null olsa dahi doğru kararı verir.
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

        // Uyarı aktif dilde (önceden sabit Türkçe metindi).
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
