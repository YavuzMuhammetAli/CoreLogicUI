import { Translations } from './translations.model';

/** login.component.html / .ts — giriş ve kayıt formu statik metinleri. */
export const LOGIN_I18N: Translations = {
  'login.welcome': { tr: 'Hoş Geldiniz', en: 'Welcome' },
  'login.subtitle': { tr: 'Dinamik model yayınlama platformuna giriş yapın.', en: 'Sign in to the dynamic model publishing platform.' },
  'login.sessionExpired': { tr: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.', en: 'Your session has expired. Please log in again.' },
  'login.tenantRestored': {
    tr: 'Şirket verisi yedekten geri yüklendi; tüm oturumlar sonlandırıldı. Lütfen yeniden giriş yapın.',
    en: 'The company data was restored from a backup and all sessions were ended. Please sign in again.'
  },
  'login.tabLogin': { tr: 'Giriş Yap', en: 'Log In' },
  'login.noAccount': { tr: 'Şirketiniz henüz kayıtlı değil mi?', en: 'Company not registered yet?' },
  'login.createCompany': { tr: 'Yeni Şirket Oluştur', en: 'Create New Company' },
  'login.email': { tr: 'E-posta', en: 'Email' },
  'login.emailPlaceholder': { tr: 'ad@sirket.com', en: 'name@company.com' },
  'login.emailRequired': { tr: 'E-posta zorunludur.', en: 'Email is required.' },
  'login.emailInvalid': { tr: 'Geçerli bir e-posta girin.', en: 'Enter a valid email address.' },
  'login.password': { tr: 'Şifre', en: 'Password' },
  'login.passwordRequired': { tr: 'Şifre zorunludur.', en: 'Password is required.' },
  'login.loggingIn': { tr: 'Giriş yapılıyor...', en: 'Logging in...' },
  'login.passwordPlaceholderMin8': { tr: 'Min. 8 karakter', en: 'Min. 8 characters' },
  'login.passwordMinLength': { tr: 'Şifre en az 8 karakter olmalıdır.', en: 'Password must be at least 8 characters.' },
  'login.loginFailed': { tr: 'Giriş başarısız.', en: 'Login failed.' },
  'login.serverUnreachable': { tr: 'Sunucuya bağlanılamadı.', en: 'Could not connect to the server.' }
};
