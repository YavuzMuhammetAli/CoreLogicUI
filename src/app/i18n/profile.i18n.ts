import { Translations } from './translations.model';

/**
 * user-profile.component.html/.ts ve audit-log.component.html/.ts — kullanıcı
 * profil sayfası (kendi profilini görüntüleme/güncelleme, şifre değiştirme,
 * fotoğraf yükleme) ve denetim kayıtları (audit log) ekranlarına özel statik metinler.
 */
export const PROFILE_I18N: Translations = {
  // ── user-profile: sayfa başlığı ──
  'profile.title': { tr: 'Profil Ayarları', en: 'Profile Settings' },
  'profile.loading': { tr: 'Profil yükleniyor…', en: 'Loading profile…' },

  // ── user-profile: fotoğraf paneli ──
  'profile.photoAlt': { tr: 'Profil fotoğrafı', en: 'Profile photo' },
  'profile.user': { tr: 'Kullanıcı', en: 'User' },
  'profile.admin': { tr: 'Admin', en: 'Admin' },
  'profile.selectPhoto': { tr: 'Fotoğraf seç', en: 'Select photo' },
  'profile.uploadPhoto': { tr: 'Fotoğraf Yükle', en: 'Upload Photo' },
  'profile.uploadOrChangePhoto': { tr: 'Fotoğraf yükle veya değiştir', en: 'Upload or change photo' },
  'profile.removePhoto': { tr: 'Kaldır', en: 'Remove' },
  'profile.removePhotoAria': { tr: 'Profil fotoğrafını sil', en: 'Delete profile photo' },
  'profile.photoHelp': { tr: 'JPG, PNG veya WebP · Maks. 2 MB', en: 'JPG, PNG or WebP · Max. 2 MB' },

  // ── user-profile: hesap bilgileri paneli ──
  'profile.accountInfo': { tr: 'Hesap Bilgileri', en: 'Account Information' },
  'profile.registeredOn': { tr: 'Kayıt Tarihi', en: 'Registered On' },
  'profile.role': { tr: 'Rol', en: 'Role' },
  'profile.normalUser': { tr: 'Normal Kullanıcı', en: 'Regular User' },
  'profile.accountStatus': { tr: 'Hesap Durumu', en: 'Account Status' },
  'profile.userId': { tr: 'Kullanıcı ID', en: 'User ID' },

  // ── user-profile: kişisel bilgiler formu ──
  'profile.personalInfo': { tr: 'Kişisel Bilgiler', en: 'Personal Information' },
  'profile.firstName': { tr: 'Ad', en: 'First Name' },
  'profile.firstNameRequired': { tr: 'Ad zorunludur.', en: 'First name is required.' },
  'profile.lastName': { tr: 'Soyad', en: 'Last Name' },
  'profile.lastNameRequired': { tr: 'Soyad zorunludur.', en: 'Last name is required.' },
  'profile.email': { tr: 'E-posta', en: 'Email' },
  'profile.emailHelp': { tr: "E-posta değişikliği bir sonraki girişte JWT'ye yansır.", en: 'Email changes take effect in the JWT on your next login.' },
  'profile.emailRequired': { tr: 'E-posta zorunludur.', en: 'Email is required.' },
  'profile.emailInvalid': { tr: 'Geçerli bir e-posta adresi girin.', en: 'Enter a valid email address.' },
  'profile.tc': { tr: 'TC Kimlik No', en: 'National ID Number' },
  'profile.tcInvalid': { tr: 'TC Kimlik No 11 haneli olmalıdır.', en: 'National ID number must be 11 digits.' },
  'profile.birthDay': { tr: 'Doğum Tarihi', en: 'Date of Birth' },
  'profile.saving': { tr: 'Kaydediliyor…', en: 'Saving…' },
  'profile.saveInfo': { tr: 'Bilgileri Kaydet', en: 'Save Information' },

  // ── user-profile: şifre formu ──
  'profile.changePasswordTitle': { tr: 'Şifre Değiştir', en: 'Change Password' },
  'profile.currentPassword': { tr: 'Mevcut Şifre', en: 'Current Password' },
  'profile.currentPasswordRequired': { tr: 'Mevcut şifre zorunludur.', en: 'Current password is required.' },
  'profile.newPassword': { tr: 'Yeni Şifre', en: 'New Password' },
  'profile.newPasswordHelp': { tr: 'En az 6 karakter', en: 'At least 6 characters' },
  'profile.newPasswordRequired': { tr: 'Yeni şifre zorunludur.', en: 'New password is required.' },
  'profile.newPasswordMinLength': { tr: 'Şifre en az 6 karakter olmalıdır.', en: 'Password must be at least 6 characters.' },
  'profile.confirmPassword': { tr: 'Yeni Şifre Tekrar', en: 'Confirm New Password' },
  'profile.confirmPasswordRequired': { tr: 'Şifre tekrarı zorunludur.', en: 'Password confirmation is required.' },
  'profile.passwordsMismatch': { tr: 'Şifreler eşleşmiyor.', en: 'Passwords do not match.' },
  'profile.changePassword': { tr: 'Şifreyi Değiştir', en: 'Change Password' },

  // ── user-profile: bildirim/onay mesajları (.ts) ──
  'profile.loadFailed': { tr: 'Profil yüklenemedi.', en: 'Failed to load profile.' },
  'profile.loadFailedRetry': { tr: 'Profil bilgileri alınamadı. Lütfen tekrar deneyin.', en: 'Could not retrieve profile information. Please try again.' },
  'profile.photoUpdated': { tr: 'Profil fotoğrafı güncellendi.', en: 'Profile photo updated.' },
  'profile.photoUploadFailed': { tr: 'Fotoğraf yüklenemedi.', en: 'Failed to upload photo.' },
  'profile.photoUploadFailedRetry': { tr: 'Fotoğraf yüklenemedi. Lütfen tekrar deneyin.', en: 'Failed to upload photo. Please try again.' },
  'profile.photoDeleted': { tr: 'Profil fotoğrafı silindi.', en: 'Profile photo deleted.' },
  'profile.photoDeleteFailed': { tr: 'Fotoğraf silinemedi.', en: 'Failed to delete photo.' },
  'profile.photoDeleteFailedRetry': { tr: 'Fotoğraf silinemedi. Lütfen tekrar deneyin.', en: 'Failed to delete photo. Please try again.' },
  'profile.infoSaved': { tr: 'Profil bilgileri kaydedildi.', en: 'Profile information saved.' },
  'profile.updateFailed': { tr: 'Güncelleme başarısız.', en: 'Update failed.' },
  'profile.genericErrorRetry': { tr: 'Bir hata oluştu. Lütfen tekrar deneyin.', en: 'An error occurred. Please try again.' },
  'profile.passwordChanged': { tr: 'Şifreniz başarıyla değiştirildi.', en: 'Your password has been changed successfully.' },
  'profile.passwordChangeFailed': { tr: 'Şifre değiştirilemedi.', en: 'Failed to change password.' },
  'profile.passwordChangeFailedRetry': { tr: 'Şifre değiştirilemedi. Lütfen tekrar deneyin.', en: 'Failed to change password. Please try again.' },

  // ── audit-log: sayfa başlığı ──
  'audit.title': { tr: 'Denetim Kayıtları', en: 'Audit Logs' },

  // ── audit-log: filtreler ──
  'audit.filterTitle': { tr: 'Filtrele', en: 'Filter' },
  'audit.entityName': { tr: 'Entity Adı', en: 'Entity Name' },
  'audit.entityNamePlaceholder': { tr: 'Örn. Product', en: 'e.g. Product' },
  'audit.fromDate': { tr: 'Başlangıç', en: 'From' },
  'audit.toDate': { tr: 'Bitiş', en: 'To' },
  'audit.clear': { tr: 'Temizle', en: 'Clear' },

  // ── audit-log: kayıtlar paneli ──
  'audit.recordsTitle': { tr: 'Kayıtlar', en: 'Records' },
  'audit.loadingRecords': { tr: 'Denetim kayıtları yükleniyor...', en: 'Loading audit logs...' },
  'audit.noRecordsTitle': { tr: 'Kayıt bulunamadı', en: 'No records found' },
  'audit.noRecordsBody': { tr: 'Seçilen filtrelerle eşleşen bir denetim kaydı yok.', en: 'There are no audit logs matching the selected filters.' },
  'audit.tableAriaLabel': { tr: 'Denetim kayıtları', en: 'Audit logs' },

  // ── audit-log: tablo başlıkları ──
  'audit.colDate': { tr: 'Tarih', en: 'Date' },
  'audit.colEntity': { tr: 'Entity', en: 'Entity' },
  'audit.colRecordId': { tr: 'Kayıt ID', en: 'Record ID' },
  'audit.colAction': { tr: 'İşlem', en: 'Action' },
  'audit.colUserId': { tr: 'Kullanıcı ID', en: 'User ID' },
  'audit.colIp': { tr: 'IP', en: 'IP' },
  'audit.colDetail': { tr: 'Detay', en: 'Detail' },

  // ── audit-log: satır detay genişletme ──
  'audit.expandClose': { tr: 'Kapat', en: 'Close' },
  'audit.expandShow': { tr: 'Göster', en: 'Show' },
  'audit.expandDetailClose': { tr: 'kapat', en: 'close' },
  'audit.expandDetailOpen': { tr: 'aç', en: 'open' },
  'audit.expandAriaLabel': { tr: 'Kayıt {id} detayını {action}', en: '{action} record {id} detail' },
  'audit.oldValues': { tr: 'Eski Değerler', en: 'Old Values' },
  'audit.newValues': { tr: 'Yeni Değerler', en: 'New Values' },

  // ── audit-log: sayfalama / alt bilgi ──
  'audit.recordCount': { tr: '{start}–{end} / {total} kayıt', en: '{start}–{end} of {total} records' },
  'audit.recordCountZero': { tr: '0 kayıt', en: '0 records' },
  'audit.paginationAriaLabel': { tr: 'Sayfalama', en: 'Pagination' },
  'audit.prevPage': { tr: 'Önceki sayfa', en: 'Previous page' },
  'audit.nextPage': { tr: 'Sonraki sayfa', en: 'Next page' },
  'audit.pageSizeAriaLabel': { tr: 'Sayfa başına kayıt', en: 'Records per page' },
  'audit.pageSizeOption': { tr: '{count} / sayfa', en: '{count} / page' },

  // ── audit-log: bildirim/onay mesajları (.ts) ──
  'audit.loadFailed': { tr: 'Denetim kayıtları yüklenemedi.', en: 'Failed to load audit logs.' }
};
