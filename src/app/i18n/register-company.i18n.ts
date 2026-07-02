import { Translations } from './translations.model';

/** register-company.component — yeni şirket kayıt sihirbazı metinleri. */
export const REGISTER_COMPANY_I18N: Translations = {
  // Genel
  'regco.title': { tr: 'Yeni Şirket Oluştur', en: 'Create New Company' },
  'regco.subtitle': { tr: 'Birkaç adımda şirketinizin çalışma alanını kurun.', en: 'Set up your company workspace in a few steps.' },
  'regco.backToLogin': { tr: 'Girişe dön', en: 'Back to login' },
  'regco.next': { tr: 'İleri', en: 'Next' },
  'regco.back': { tr: 'Geri', en: 'Back' },
  'regco.start': { tr: 'Kurulumu Başlat', en: 'Start Setup' },
  'regco.stepLabel': { tr: 'Adım {{current}} / {{total}}', en: 'Step {{current}} of {{total}}' },

  // Adım başlıkları
  'regco.step1': { tr: 'Şirket Bilgileri', en: 'Company Info' },
  'regco.step2': { tr: 'Yönetici Bilgileri', en: 'Admin Info' },
  'regco.step3': { tr: 'Kurulum', en: 'Setup' },
  'regco.step4': { tr: 'Tamamlandı', en: 'Done' },

  // Adım 1 — Şirket bilgileri
  'regco.companyName': { tr: 'Şirket Adı', en: 'Company Name' },
  'regco.companyNamePlaceholder': { tr: 'Örn. Acme Teknoloji A.Ş.', en: 'e.g. Acme Technologies Inc.' },
  'regco.companyNameRequired': { tr: 'Şirket adı zorunludur.', en: 'Company name is required.' },
  'regco.companyCode': { tr: 'Şirket Kodu', en: 'Company Code' },
  'regco.companyCodePlaceholder': { tr: 'örn. acme', en: 'e.g. acme' },
  'regco.companyCodeHelp': { tr: '2-20 karakter, yalnızca küçük harf ve rakam. Şirketinizin benzersiz kimliğidir, sonradan değiştirilemez.', en: '2-20 characters, lowercase letters and digits only. This is your company\'s unique identifier and cannot be changed later.' },
  'regco.companyCodeRequired': { tr: 'Şirket kodu zorunludur.', en: 'Company code is required.' },
  'regco.companyCodeInvalid': { tr: 'Kod 2-20 karakter olmalı, yalnızca harf ve rakam içerebilir.', en: 'Code must be 2-20 characters, letters and digits only.' },

  // Adım 2 — Yönetici bilgileri
  'regco.adminName': { tr: 'Ad', en: 'First Name' },
  'regco.adminNameRequired': { tr: 'Ad zorunludur.', en: 'First name is required.' },
  'regco.adminSurname': { tr: 'Soyad', en: 'Last Name' },
  'regco.adminSurnameRequired': { tr: 'Soyad zorunludur.', en: 'Last name is required.' },
  'regco.adminInfoHint': { tr: 'Bu kullanıcı şirketinizin ilk yöneticisi (admin) olacak.', en: 'This user will be your company\'s first administrator.' },

  // Adım 3 — Kurulum (adım adları backend ProvisionLog.StepName ile eşleşir)
  'regco.provisioning': { tr: 'Şirketiniz kuruluyor…', en: 'Setting up your company…' },
  'regco.provisioningHint': { tr: 'Bu işlem genellikle birkaç saniye sürer.', en: 'This usually takes a few seconds.' },
  'regco.step.ValidateAndReserve': { tr: 'Kayıt doğrulanıyor', en: 'Validating registration' },
  'regco.step.CreateDatabase': { tr: 'Veritabanı oluşturuluyor', en: 'Creating database' },
  'regco.step.ApplySchema': { tr: 'Tablolar ve şema uygulanıyor', en: 'Applying tables and schema' },
  'regco.step.SeedDefaults': { tr: 'Varsayılan roller oluşturuluyor', en: 'Creating default roles' },
  'regco.step.CreateAdminUser': { tr: 'Yönetici hesabı oluşturuluyor', en: 'Creating admin account' },
  'regco.step.CreateMasterUser': { tr: 'Giriş kaydı oluşturuluyor', en: 'Creating sign-in record' },
  'regco.step.Activate': { tr: 'Şirket etkinleştiriliyor', en: 'Activating company' },

  // Adım 4 — Tamamlandı / hata
  'regco.done': { tr: 'Kurulum tamamlandı!', en: 'Setup complete!' },
  'regco.doneHint': { tr: 'Çalışma alanınıza yönlendiriliyorsunuz…', en: 'Redirecting to your workspace…' },
  'regco.doneManualLogin': { tr: 'Kurulum tamamlandı. Giriş ekranından e-posta ve şifrenizle giriş yapabilirsiniz.', en: 'Setup is complete. You can sign in with your email and password.' },
  'regco.goToLogin': { tr: 'Giriş Yap', en: 'Log In' },
  'regco.failed': { tr: 'Kurulum başarısız oldu.', en: 'Setup failed.' },
  'regco.failedHint': { tr: 'Yapılan değişiklikler geri alındı. Bilgilerinizi kontrol edip yeniden deneyebilirsiniz.', en: 'All changes were rolled back. Please check your details and try again.' },
  'regco.retry': { tr: 'Yeniden Dene', en: 'Try Again' },
  'regco.startFailed': { tr: 'Kurulum başlatılamadı.', en: 'Setup could not be started.' },
  'regco.serverUnreachable': { tr: 'Sunucuya bağlanılamadı.', en: 'Could not connect to the server.' }
};
