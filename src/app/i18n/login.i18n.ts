import { Translations } from './translations.model';

/** login.component.html / .ts — giriş ve kayıt formu statik metinleri. */
export const LOGIN_I18N: Translations = {
  'login.welcome': { tr: 'Hoş Geldiniz', en: 'Welcome' },
  'login.subtitle': { tr: 'Dinamik model yayınlama platformuna giriş yapın.', en: 'Sign in to the dynamic model publishing platform.' },
  'login.sessionExpired': { tr: 'Oturumunuzun süresi doldu. Lütfen tekrar giriş yapın.', en: 'Your session has expired. Please log in again.' },
  'login.tabLogin': { tr: 'Giriş Yap', en: 'Log In' },
  'login.tabRegister': { tr: 'Kayıt Ol', en: 'Register' },
  'login.email': { tr: 'E-posta', en: 'Email' },
  'login.emailPlaceholder': { tr: 'ad@sirket.com', en: 'name@company.com' },
  'login.emailRequired': { tr: 'E-posta zorunludur.', en: 'Email is required.' },
  'login.emailInvalid': { tr: 'Geçerli bir e-posta girin.', en: 'Enter a valid email address.' },
  'login.password': { tr: 'Şifre', en: 'Password' },
  'login.passwordRequired': { tr: 'Şifre zorunludur.', en: 'Password is required.' },
  'login.loggingIn': { tr: 'Giriş yapılıyor...', en: 'Logging in...' },
  'login.firstName': { tr: 'Ad', en: 'First Name' },
  'login.firstNamePlaceholder': { tr: 'Adınız', en: 'Your first name' },
  'login.firstNameRequired': { tr: 'Ad zorunludur.', en: 'First name is required.' },
  'login.lastName': { tr: 'Soyad', en: 'Last Name' },
  'login.lastNamePlaceholder': { tr: 'Soyadınız', en: 'Your last name' },
  'login.lastNameRequired': { tr: 'Soyad zorunludur.', en: 'Last name is required.' },
  'login.passwordPlaceholderMin6': { tr: 'Min. 6 karakter', en: 'Min. 6 characters' },
  'login.passwordMinLength': { tr: 'Şifre en az 6 karakter olmalıdır.', en: 'Password must be at least 6 characters.' },
  'login.registering': { tr: 'Kaydediliyor...', en: 'Registering...' },
  'login.loginFailed': { tr: 'Giriş başarısız.', en: 'Login failed.' },
  'login.serverUnreachable': { tr: 'Sunucuya bağlanılamadı.', en: 'Could not connect to the server.' },
  'login.registerSuccess': { tr: 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.', en: 'Registration successful! You can now log in.' },
  'login.registerFailed': { tr: 'Kayıt başarısız.', en: 'Registration failed.' }
};
