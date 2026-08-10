import { Translations } from './translations.model';

/**
 * dashboard-list / dashboard-build / dashboard (viewer) component'lerine özel statik metinler.
 * `common.i18n.ts`'de zaten tanımlı genel anahtarlar (kaydet, vazgeç vb.) burada tekrar
 * tanımlanmaz, doğrudan kullanılır.
 */
export const DASHBOARD_I18N: Translations = {
  // dashboard-list.component.html
  'dashboard.list.title': { tr: "Dashboard'lar", en: 'Dashboards' },
  'dashboard.list.deletedLink': { tr: "Silinmiş Dashboard'lar", en: 'Deleted Dashboards' },
  'dashboard.list.newButton': { tr: 'Yeni Dashboard', en: 'New Dashboard' },
  'dashboard.list.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'dashboard.list.colName': { tr: 'Ad', en: 'Name' },
  'dashboard.list.colWidgetCount': { tr: 'Widget Sayısı', en: 'Widget Count' },
  'dashboard.list.view': { tr: 'Görüntüle', en: 'View' },
  'dashboard.list.emptyTitle': { tr: 'Henüz dashboard yok', en: 'No dashboards yet' },
  'dashboard.list.emptyText': { tr: "Mevcut raporlarınızdan widget seçerek ilk dashboard'unuzu oluşturun.", en: 'Create your first dashboard by selecting widgets from your existing reports.' },
  'dashboard.list.emptyCta': { tr: "İlk Dashboard'u Oluştur", en: 'Create First Dashboard' },
  'dashboard.list.loadError': { tr: "Dashboard'lar yüklenemedi.", en: 'Failed to load dashboards.' },
  'dashboard.list.serverError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },

  // dashboard-build.component.html
  'dashboard.build.title': { tr: 'Yeni Dashboard', en: 'New Dashboard' },
  'dashboard.build.emptyReportsTitle': { tr: 'Henüz rapor yok', en: 'No reports yet' },
  'dashboard.build.emptyReportsText': { tr: 'Dashboard oluşturmak için önce en az bir rapor tanımlamalısınız.', en: 'You must define at least one report before creating a dashboard.' },
  'dashboard.build.createReport': { tr: 'Rapor Oluştur', en: 'Create Report' },
  'dashboard.build.nameSection': { tr: 'Dashboard Adı', en: 'Dashboard Name' },
  'dashboard.build.nameLabel': { tr: 'Ad', en: 'Name' },
  'dashboard.build.nameRequired': { tr: 'Dashboard adı zorunludur.', en: 'Dashboard name is required.' },
  'dashboard.build.showInNav': { tr: 'Navigasyonda göster', en: 'Show in navigation' },
  'dashboard.build.showInNavHelp': { tr: 'İşaretlenirse bu dashboard tüm kullanıcıların kenar çubuğunda görünür.', en: 'If checked, this dashboard will appear in the sidebar for all users.' },
  'dashboard.build.addReportSection': { tr: 'Rapor Ekle', en: 'Add Report' },
  'dashboard.build.layoutSection': { tr: 'Yerleşim', en: 'Layout' },
  'dashboard.build.layoutEmpty': { tr: 'Yerleşimi düzenlemek için yukarıdan rapor ekleyin.', en: 'Add a report from above to edit the layout.' },
  'dashboard.build.layoutHelp': { tr: "Widget başlığından sürükleyip taşıyın; sağ-alt köşedeki tutamaçtan yeniden boyutlandırın.", en: 'Drag from the widget title to move it; resize using the handle at the bottom-right corner.' },
  'dashboard.build.removeWidgetAria': { tr: "{name} widget'ını kaldır", en: 'Remove {name} widget' },
  'dashboard.build.chartTypeAria': { tr: '{name} için grafik tipi', en: 'Chart type for {name}' },
  'dashboard.build.atLeastOneReport': { tr: 'En az bir rapor eklenmelidir.', en: 'At least one report must be added.' },
  'dashboard.build.loadReportsError': { tr: 'Raporlar yüklenemedi.', en: 'Failed to load reports.' },
  'dashboard.build.saveError': { tr: 'Dashboard kaydedilemedi.', en: 'Failed to save dashboard.' },
  'dashboard.build.serverError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },

  // dashboard.component.html (viewer)
  'dashboard.view.defaultTitle': { tr: 'Dashboard', en: 'Dashboard' },
  'dashboard.view.newButton': { tr: 'Yeni Dashboard', en: 'New Dashboard' },
  'dashboard.view.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'dashboard.view.noAccess': { tr: 'Bu rapora erişim yetkiniz yok veya rapor silinmiş.', en: 'You do not have access to this report or it has been deleted.' },
  'dashboard.view.noRows': { tr: 'Bu rapor için kayıt bulunamadı.', en: 'No records found for this report.' },
  'dashboard.view.emptyWidgetsTitle': { tr: 'Görüntülenebilir widget yok', en: 'No widgets to display' },
  'dashboard.view.emptyWidgetsText': { tr: "Widget'ların işaret ettiği raporlara erişim yetkiniz olmayabilir.", en: 'You may not have access to the reports the widgets point to.' },
  'dashboard.view.loadError': { tr: 'Dashboard yüklenemedi.', en: 'Failed to load dashboard.' },
  'dashboard.view.serverError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },
  'dashboard.view.reportFallbackName': { tr: 'Rapor #{id}', en: 'Report #{id}' }
};
