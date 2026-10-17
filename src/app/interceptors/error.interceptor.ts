import { HttpInterceptorFn, HttpErrorResponse, HttpContextToken } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * 403'te `/models`'e yönlendirmeyi bu istek için kapatır.
 *
 * Yalnız YARDIMCI isteklerde kullanılır — sayfanın asıl verisi olmayan, başarısız
 * olunca sessizce düşebilen çağrılar (assembly yükleme, form kuralları, lookup
 * etiketleri). Bunlar sayfanın asıl verisi değildir; 403 döndüklerinde kullanıcıyı
 * bulunduğu sayfadan koparmak yanlıştır. Örneğin admin olmayan kullanıcı açılış
 * dashboard'unu hiç göremiyor, kayıt ekranına ilk denemede giremiyordu.
 *
 * Kullanım: `{ context: new HttpContext().set(SKIP_FORBIDDEN_REDIRECT, true) }`
 */
export const SKIP_FORBIDDEN_REDIRECT = new HttpContextToken<boolean>(() => false);

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      if (typeof localStorage === 'undefined') {
        // SSR ortamı — localStorage yok, yönlendirme yapma
        return throwError(() => err);
      }

      // 401: token süresi dolmuş veya geçersiz → oturumu temizle.
      // "Oturum süresi doldu" yönlendirmesi yalnızca gerçekten bir token varken
      // anlamlıdır — anonim bir isteğin 401'i (örn. public sayfadan yapılan çağrı)
      // kullanıcıyı bulunduğu public sayfadan koparmamalı.
      if (err.status === 401) {
        const hadToken = !!localStorage.getItem('access_token');
        if (hadToken) {
          localStorage.removeItem('access_token');
          router.navigate(['/login'], { queryParams: { reason: 'session_expired' } });
        }
      }

      // 403: yetki yetersiz — oturum geçerli, kullanıcıyı çıkartma.
      // Bileşenler kendi hata akışlarında mesajı göstersin diye hata zinciri devam eder.
      // Eğer kullanıcı doğrudan bir admin URL'sine gitmeye çalışıyorsa adminGuard zaten yönlendirir.
      // Yardımcı istekler (SKIP_FORBIDDEN_REDIRECT) yönlendirmez — bkz. token açıklaması.
      if (err.status === 403 && !req.context.get(SKIP_FORBIDDEN_REDIRECT)) {
        // Kullanıcıyı güvenli bir sayfaya yönlendir (erişebildiği modeller)
        router.navigate(['/models']);
      }

      return throwError(() => err);
    })
  );
};
