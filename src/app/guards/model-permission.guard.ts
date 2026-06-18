import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionService } from '../services/permission.service';
import { NotificationService } from '../services/notification.service';

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

    const typeName = route.paramMap.get('typeName') ?? '';

    return permissions.ensureLoaded().pipe(
      map(() => {
        if (typeName && permissions.can(typeName, action)) {
          return true;
        }

        const actionLabel: Record<string, string> = {
          read:   'okuma',
          create: 'kayıt ekleme',
          update: 'güncelleme',
          delete: 'silme',
        };
        const label = typeName
          ? `'${typeName}' modeli için ${actionLabel[action] ?? action} yetkiniz yok.`
          : 'Bu modele erişim yetkiniz yok.';

        notify.warn(label);
        return router.createUrlTree(['/models']);
      })
    );
  };
}
