import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Adds the UI language chosen by the user (TR/EN) to every request as an Accept-Language
 * header. UseRequestLocalization in the backend Program.cs reads it and sets
 * CultureInfo.CurrentUICulture; Business.Constants.Messages returns localized messages
 * for that culture. Reads the same localStorage key as LanguageService
 * ('lang') — symmetric with the pattern in auth.interceptor.ts, it does not inject a service.
 */
export const languageInterceptor: HttpInterceptorFn = (req, next) => {
  // There is no localStorage in an SSR (Node.js) environment; skip with a guard
  if (typeof localStorage === 'undefined') return next(req);

  const lang = localStorage.getItem('lang') === 'en' ? 'en' : 'tr';

  const cloned = req.clone({
    headers: req.headers.set('Accept-Language', lang)
  });
  return next(cloned);
};
