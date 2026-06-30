import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Her isteğe kullanıcının seçtiği arayüz dilini (TR/EN) Accept-Language header'ı
 * olarak ekler. Backend Program.cs'teki UseRequestLocalization bunu okuyup
 * CultureInfo.CurrentUICulture'a basar; Business.Constants.Messages bu culture'a
 * göre lokalize mesaj döner. LanguageService ile aynı localStorage anahtarını
 * ('lang') okur — auth.interceptor.ts'teki desenle simetrik, servis enjekte etmez.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  // SSR (Node.js) ortamında localStorage yoktur; guard ile atla
  if (typeof localStorage === 'undefined') return next(req);

  const lang = localStorage.getItem('lang') === 'en' ? 'en' : 'tr';

  const cloned = req.clone({
    headers: req.headers.set('Accept-Language', lang)
  });
  return next(cloned);
};
