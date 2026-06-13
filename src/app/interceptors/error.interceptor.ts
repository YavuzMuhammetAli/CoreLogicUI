import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      // 401: token süresi dolmuş veya geçersiz → oturumu temizle
      if (err.status === 401 && typeof localStorage !== 'undefined') {
        localStorage.removeItem('access_token');
        router.navigate(['/login'], { queryParams: { reason: 'session_expired' } });
      }
      return throwError(() => err);
    })
  );
};
