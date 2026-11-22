import { Translations } from './translations.model';

/**
 * In-company user management — /users (list), /users/new (create), /users/:id (edit).
 *
 * General-purpose keys (save/cancel/delete/refresh) are in common.i18n.ts; they are
 * not redefined here.
 */
export const USER_I18N: Translations = {
  // ── Liste ─────────────────────────────────────────────────────────────────
  'user.list.title': { tr: 'Kullanıcılar', en: 'Users' },
  'user.list.panelTitle': { tr: 'Kullanıcılar', en: 'Users' },
  'user.list.loading': { tr: 'Kullanıcılar yükleniyor…', en: 'Loading users…' },
  'user.list.loadError': { tr: 'Kullanıcılar yüklenemedi.', en: 'Users could not be loaded.' },
  'user.list.emptyTitle': { tr: 'Henüz başka kullanıcı yok', en: 'No other users yet' },
  'user.list.emptyHint': {
    tr: 'Ekibinizden birini ekleyerek başlayın.',
    en: 'Start by adding someone from your team.'
  },
  'user.list.addFirst': { tr: 'İlk Kullanıcıyı Ekle', en: 'Add the First User' },
  'user.list.tableLabel': { tr: 'Kullanıcı listesi', en: 'User list' },

  'user.list.colName': { tr: 'Ad Soyad', en: 'Name' },
  'user.list.colEmail': { tr: 'E-posta', en: 'Email' },
  'user.list.colStatus': { tr: 'Durum', en: 'Status' },
  'user.list.colRole': { tr: 'Yetki', en: 'Role' },
  'user.list.colCreatedOn': { tr: 'Kayıt Tarihi', en: 'Created' },

  'user.list.statusActive': { tr: 'Aktif', en: 'Active' },
  'user.list.statusPassive': { tr: 'Pasif', en: 'Inactive' },
  'user.list.roleAdmin': { tr: 'Admin', en: 'Admin' },
  'user.list.roleUser': { tr: 'Kullanıcı', en: 'User' },
  'user.list.you': { tr: 'siz', en: 'you' },

  'user.list.rowAria': { tr: '{name} kullanıcısını düzenle', en: 'Edit user {name}' },
  'user.list.deactivate': { tr: 'Pasifleştir', en: 'Deactivate' },
  'user.list.activate': { tr: 'Aktifleştir', en: 'Activate' },
  'user.list.ownAccountHint': {
    tr: 'Kendi hesabınız üzerinde bu işlemi yapamazsınız.',
    en: 'You cannot perform this action on your own account.'
  },

  // ── Create / edit ─────────────────────────────────────────────────────────
  'user.detail.newTitle': { tr: 'Yeni Kullanıcı', en: 'New User' },
  'user.detail.editTitle': { tr: 'Kullanıcıyı Düzenle', en: 'Edit User' },
  'user.detail.newSubtitle': {
    tr: 'Kullanıcı şirketinize eklenir. Belirlediğiniz parolayı kendisine iletin; giriş yaptıktan sonra profilinden değiştirebilir.',
    en: 'The user is added to your company. Share the password you set with them; they can change it from their profile after signing in.'
  },
  'user.detail.backToList': { tr: 'Listeye Dön', en: 'Back to list' },

  'user.detail.sectionInfo': { tr: 'Kullanıcı Bilgileri', en: 'User Details' },
  'user.detail.sectionAccess': { tr: 'Yetki', en: 'Access' },
  'user.detail.sectionPassword': { tr: 'Parola', en: 'Password' },
  'user.detail.sectionDanger': { tr: 'Tehlikeli Bölge', en: 'Danger Zone' },

  'user.detail.firstName': { tr: 'Ad', en: 'First name' },
  'user.detail.lastName': { tr: 'Soyad', en: 'Last name' },
  'user.detail.email': { tr: 'E-posta', en: 'Email' },
  'user.detail.password': { tr: 'Parola', en: 'Password' },
  'user.detail.passwordRepeat': { tr: 'Parola (tekrar)', en: 'Password (repeat)' },
  'user.detail.newPassword': { tr: 'Yeni parola', en: 'New password' },

  'user.detail.emailHelp': {
    tr: 'Giriş için kullanılır ve tüm sistemde benzersiz olmalıdır.',
    en: 'Used to sign in and must be unique across the whole system.'
  },
  'user.detail.emailChangeWarning': {
    tr: 'E-postayı değiştirirseniz kullanıcı bundan sonra yeni adresle giriş yapar.',
    en: 'If you change the email, the user will sign in with the new address from now on.'
  },
  'user.detail.passwordHelp': { tr: 'En az 8 karakter.', en: 'At least 8 characters.' },
  'user.detail.isAdmin': { tr: 'Admin yetkisi ver', en: 'Grant admin rights' },
  'user.detail.isAdminHelp': {
    tr: 'Admin kullanıcılar model oluşturabilir, kullanıcı ve izin yönetebilir.',
    en: 'Admins can create models and manage users and permissions.'
  },
  'user.detail.role': { tr: 'Rol (opsiyonel)', en: 'Role (optional)' },
  'user.detail.roleNone': { tr: 'Rol atama', en: 'No role' },
  'user.detail.roleHelp': {
    tr: 'Model bazlı ayrıntılı izinler Kullanıcı Yetkileri ekranından verilir.',
    en: 'Detailed per-model permissions are granted from the User Permissions screen.'
  },
  'user.detail.newSessionNote': {
    tr: 'Yetki değişiklikleri kullanıcının bir sonraki girişinde etkinleşir.',
    en: 'Access changes take effect the next time the user signs in.'
  },

  'user.detail.create': { tr: 'Kullanıcıyı Oluştur', en: 'Create User' },
  'user.detail.resetPassword': { tr: 'Parolayı Sıfırla', en: 'Reset Password' },
  'user.detail.resetPasswordHelp': {
    tr: 'Yeni parolayı kullanıcıya kendiniz iletin — sistem e-posta göndermez.',
    en: 'Share the new password with the user yourself — the system does not send email.'
  },
  'user.detail.deleteTitle': { tr: 'Kullanıcıyı kalıcı sil', en: 'Permanently delete user' },
  'user.detail.deleteHelp': {
    tr: 'Geri alınamaz. Kullanıcı sistemde kayıt oluşturmuşsa silinemez — bunun yerine pasifleştirin.',
    en: 'This cannot be undone. If the user has created records they cannot be deleted — deactivate them instead.'
  },
  'user.detail.deleteConfirmTitle': { tr: 'Kullanıcıyı sil', en: 'Delete user' },
  'user.detail.deleteConfirmMessage': {
    tr: '"{name}" kalıcı olarak silinecek. Bu işlem geri alınamaz.',
    en: '"{name}" will be permanently deleted. This cannot be undone.'
  },

  // ── Validation / notification ─────────────────────────────────────────────
  'user.detail.firstNameRequired': { tr: 'Ad zorunludur.', en: 'First name is required.' },
  'user.detail.lastNameRequired': { tr: 'Soyad zorunludur.', en: 'Last name is required.' },
  'user.detail.emailRequired': { tr: 'E-posta zorunludur.', en: 'Email is required.' },
  'user.detail.emailInvalid': { tr: 'Geçerli bir e-posta adresi girin.', en: 'Enter a valid email address.' },
  'user.detail.passwordRequired': { tr: 'Parola zorunludur.', en: 'Password is required.' },
  'user.detail.passwordTooShort': { tr: 'Parola en az 8 karakter olmalıdır.', en: 'The password must be at least 8 characters.' },
  'user.detail.passwordMismatch': { tr: 'Parolalar eşleşmiyor.', en: 'Passwords do not match.' },

  'user.detail.created': { tr: 'Kullanıcı oluşturuldu.', en: 'User created.' },
  'user.detail.saved': { tr: 'Değişiklikler kaydedildi.', en: 'Changes saved.' },
  'user.detail.loadError': { tr: 'Kullanıcı yüklenemedi.', en: 'The user could not be loaded.' },
  'user.detail.notFound': { tr: 'Kullanıcı bulunamadı.', en: 'User not found.' }
};
