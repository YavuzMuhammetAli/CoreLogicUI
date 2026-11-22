import { Translations } from './translations.model';

/**
 * Common texts shared by all screens (buttons, states, general messages).
 * Screen-specific translation files do not redefine these keys; they use them directly.
 */
export const COMMON_I18N: Translations = {
  'common.save': { tr: 'Kaydet', en: 'Save' },
  'common.cancel': { tr: 'Vazgeç', en: 'Cancel' },
  'common.delete': { tr: 'Sil', en: 'Delete' },
  'common.deleteAnyway': { tr: 'Yine de Sil', en: 'Delete Anyway' },
  'common.edit': { tr: 'Düzenle', en: 'Edit' },
  'common.add': { tr: 'Ekle', en: 'Add' },
  'common.new': { tr: 'Yeni', en: 'New' },
  'common.close': { tr: 'Kapat', en: 'Close' },
  'common.back': { tr: 'Geri', en: 'Back' },
  'common.search': { tr: 'Ara', en: 'Search' },
  'common.filter': { tr: 'Filtrele', en: 'Filter' },
  'common.loading': { tr: 'Yükleniyor…', en: 'Loading…' },
  'common.noData': { tr: 'Kayıt bulunamadı.', en: 'No records found.' },
  'common.yes': { tr: 'Evet', en: 'Yes' },
  'common.no': { tr: 'Hayır', en: 'No' },
  'common.actions': { tr: 'İşlemler', en: 'Actions' },
  'common.status': { tr: 'Durum', en: 'Status' },
  'common.name': { tr: 'Ad', en: 'Name' },
  'common.description': { tr: 'Açıklama', en: 'Description' },
  'common.confirm': { tr: 'Onayla', en: 'Confirm' },
  'common.required': { tr: 'Bu alan zorunludur.', en: 'This field is required.' },
  'common.export': { tr: 'Dışa Aktar', en: 'Export' },
  'common.refresh': { tr: 'Yenile', en: 'Refresh' },
  'common.active': { tr: 'Aktif', en: 'Active' },
  'common.inactive': { tr: 'Pasif', en: 'Inactive' },
  // Last-resort text used when the server error message is empty.
  'common.error': { tr: 'Bir hata oluştu.', en: 'An error occurred.' },
  'common.rateLimited': { tr: 'Çok fazla istek gönderildi. Lütfen biraz bekleyip yeniden deneyin.', en: 'Too many requests. Please wait a moment and try again.' },
  'common.maintenance': { tr: 'Bakım', en: 'Maintenance' },

  // confirm-dialog.component.html — static texts of the shared confirmation modal
  'confirm.usageIntro': { tr: "'{name}' kullanılıyor:", en: "'{name}' is in use:" },
  'confirm.usageReports': { tr: 'Raporlarda:', en: 'In reports:' },
  'confirm.usageDashboards': { tr: 'Dashboardlarda:', en: 'In dashboards:' },
  'confirm.usageWarning': {
    tr: 'Yukarıdaki rapor ve dashboardlar da modelle birlikte pasife alınacak. Emin misiniz?',
    en: 'The reports and dashboards listed above will also be deactivated along with the model. Are you sure?'
  }
};
