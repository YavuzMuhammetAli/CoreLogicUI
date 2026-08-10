import { Translations } from './translations.model';

/**
 * form-build, draft-models, database-proccess ve deleted-* (silinmiş öğe yönetimi)
 * ekranlarına özel statik metinler. Paylaşılan anahtarlar için bkz. common.i18n.ts.
 */
export const ADMIN_I18N: Translations = {
  // ── form-build.component.html / .ts — yayınlanmış model listesi + pasifleştirme ──
  'formBuild.title': { tr: 'Tablo Oluştur', en: 'Create Table' },
  'formBuild.createNewTable': { tr: 'Yeni Tablo Oluştur', en: 'Create New Table' },
  'formBuild.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'formBuild.publishedModels': { tr: 'Yayınlanmış Modeller', en: 'Published Models' },
  'formBuild.clickToEdit': { tr: 'Düzenlemek için bir modele tıklayın.', en: 'Click a model to edit it.' },
  'formBuild.columnCount': { tr: 'sütun', en: 'columns' },
  'formBuild.deactivateAria': { tr: "'{name}' modelini pasif yap", en: "Deactivate model '{name}'" },
  'formBuild.delete': { tr: 'Sil', en: 'Delete' },
  'formBuild.noModelsYet': { tr: 'Henüz model yayınlanmadı', en: 'No models published yet' },
  'formBuild.noModelsHint': {
    tr: "C# entity kodunu çalışma zamanında derleyen dinamik model sisteminizi kullanmaya başlayın. İlk modelinizi oluşturun.",
    en: 'Start using your dynamic model system that compiles C# entity code at runtime. Create your first model.'
  },
  'formBuild.createFirstModel': { tr: 'İlk Modeli Oluştur', en: 'Create First Model' },
  'formBuild.deactivateModelTitle': { tr: 'Modeli pasif yap', en: 'Deactivate model' },
  'formBuild.deactivateModelMessage': {
    tr: 'Bu modeli pasif yapmak istediğinize emin misiniz? SQL tablosu ve içindeki kayıtlar silinmez; model yalnızca uygulamadan kaldırılır.',
    en: 'Are you sure you want to deactivate this model? The SQL table and its records will not be deleted; the model is only removed from the application.'
  },
  'formBuild.modelsLoadFailed': { tr: 'Modeller yüklenemedi.', en: 'Models could not be loaded.' },
  'formBuild.serverConnectionError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },
  'formBuild.modelDeactivated': { tr: "'{name}' modeli pasif alındı.", en: "Model '{name}' was deactivated." },
  'formBuild.modelDeactivateFailed': { tr: "'{name}' pasif yapılamadı.", en: "Model '{name}' could not be deactivated." },

  // ── draft-models.component.html / .ts — taslak modeller (yayınlanmamış) ──
  'draft.title': { tr: 'Yayınlanmamış Modeller', en: 'Unpublished Models' },
  'draft.deletedDrafts': { tr: 'Silinen Taslaklar', en: 'Deleted Drafts' },
  'draft.refresh': { tr: 'Yenile', en: 'Refresh' },
  'draft.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'draft.loadingDrafts': { tr: 'Taslak modeller yükleniyor…', en: 'Loading draft models…' },
  'draft.noneFound': { tr: 'Yayınlanmamış taslak model bulunamadı.', en: 'No unpublished draft models found.' },
  'draft.allPublishedHint': { tr: 'Tüm kayıtlı modeller zaten yayınlanmış.', en: 'All registered models are already published.' },
  'draft.countSuffix': { tr: 'kayıtlı ama henüz yayınlanmamış ana model var.', en: 'registered but not yet published root model(s).' },
  'draft.badgeDraft': { tr: 'Taslak', en: 'Draft' },
  'draft.badgeSubModel': { tr: 'Alt Model', en: 'Sub-model' },
  'draft.edit': { tr: 'Düzenle', en: 'Edit' },
  'draft.publishing': { tr: 'Yayınlanıyor…', en: 'Publishing…' },
  'draft.publish': { tr: 'Yayınla', en: 'Publish' },
  'draft.deactivateAria': { tr: "'{name}' taslağını pasif yap", en: "Deactivate draft '{name}'" },
  'draft.delete': { tr: 'Sil', en: 'Delete' },
  'draft.publishedSuccess': { tr: 'Başarıyla yayınlandı.', en: 'Published successfully.' },
  'draft.publishFailed': { tr: 'Yayınlama başarısız.', en: 'Publishing failed.' },
  'draft.publishServerError': { tr: 'Yayınlama sırasında sunucu hatası oluştu.', en: 'A server error occurred while publishing.' },
  'draft.tablesLoadFailed': { tr: 'Tablolar yüklenemedi.', en: 'Tables could not be loaded.' },
  'draft.serverConnectionError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },
  'draft.deactivateConfirm': {
    tr: "'{name}'{childrenSuffix} pasif yapmak istediğinize emin misiniz?\n\nYanlışlıkla sildiyseniz \"Silinen Taslaklar\" sayfasından geri yükleyebilirsiniz.",
    en: "Are you sure you want to deactivate '{name}'{childrenSuffix}?\n\nIf you deleted it by mistake, you can restore it from the \"Deleted Drafts\" page."
  },
  'draft.andSubModels': { tr: ' ve alt modellerini', en: ' and its sub-models' },
  'draft.deactivateFailed': { tr: 'Taslak pasif yapılamadı.', en: 'Draft could not be deactivated.' },

  // ── database-proccess.component.html / .ts — /Database işlemleri ──
  'database.title': { tr: 'Veritabanı İşlemleri', en: 'Database Operations' },
  'database.inProgress': { tr: 'İşlem devam ediyor…', en: 'Operation in progress…' },
  'database.createDbTitle': { tr: 'Veritabanı Oluştur', en: 'Create Database' },
  'database.createDbDesc': { tr: 'Veritabanını ve temel şemayı sıfırdan oluşturur.', en: 'Creates the database and base schema from scratch.' },
  'database.createDbButton': { tr: 'Veritabanı Oluştur', en: 'Create Database' },
  'database.createTableTitle': { tr: 'Tablo Oluştur', en: 'Create Table' },
  'database.createTableDesc': {
    tr: 'Yayınlanmış modeller için SQL tablolarını oluşturur veya günceller.',
    en: 'Creates or updates SQL tables for published models.'
  },
  'database.createTableButton': { tr: 'Tablo Oluştur', en: 'Create Table' },
  'database.checkDbTitle': { tr: 'Veritabanını Kontrol Et', en: 'Check Database' },
  'database.checkDbDesc': { tr: 'Veritabanı bağlantısını ve şemasını doğrular.', en: 'Validates the database connection and schema.' },
  'database.checkDbButton': { tr: 'Veritabanını Kontrol Et', en: 'Check Database' },
  'database.createDbSuccess': { tr: 'Veritabanı başarıyla oluşturuldu.', en: 'Database created successfully.' },
  'database.operationFailed': { tr: 'İşlem başarısız.', en: 'Operation failed.' },
  'database.createDbError': { tr: 'Veritabanı oluşturulurken bir hata oluştu.', en: 'An error occurred while creating the database.' },
  'database.createTableSuccess': { tr: 'Tablo başarıyla oluşturuldu.', en: 'Table created successfully.' },
  'database.createTableError': { tr: 'Tablo oluşturulurken bir hata oluştu.', en: 'An error occurred while creating the table.' },
  'database.checkDbSuccess': { tr: 'Veritabanı bağlantısı başarılı.', en: 'Database connection successful.' },
  'database.checkDbFailed': { tr: 'Veritabanı kontrolü başarısız.', en: 'Database check failed.' },
  'database.checkDbError': { tr: 'Veritabanı kontrol edilirken bir hata oluştu.', en: 'An error occurred while checking the database.' },

  // ── deleted-* ortak metinler (deleted-models, deleted-drafts, deleted-reports, deleted-dashboards) ──
  'deleted.restoring': { tr: 'Geri Yükleniyor…', en: 'Restoring…' },
  'deleted.restore': { tr: 'Geri Yükle', en: 'Restore' },
  'deleted.badge': { tr: 'Silinmiş', en: 'Deleted' },
  'deleted.serverConnectionError': { tr: 'Sunucu bağlantı hatası.', en: 'Server connection error.' },
  'deleted.restoreServerError': { tr: 'Geri yükleme sırasında sunucu hatası oluştu.', en: 'A server error occurred while restoring.' },
  'deleted.restoreFailed': { tr: 'Geri yükleme başarısız.', en: 'Restore failed.' },

  // ── deleted-models.component.html / .ts ──
  'deleted.models.backLink': { tr: 'Modeller', en: 'Models' },
  'deleted.models.title': { tr: 'Silinmiş Modeller', en: 'Deleted Models' },
  'deleted.models.refresh': { tr: 'Yenile', en: 'Refresh' },
  'deleted.models.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'deleted.models.loading': { tr: 'Silinmiş modeller yükleniyor…', en: 'Loading deleted models…' },
  'deleted.models.empty': { tr: 'Silinmiş model bulunmuyor.', en: 'No deleted models found.' },
  'deleted.models.emptyHint': {
    tr: 'Yayınlanmış bir modeli /models sayfasından sildiğinizde burada görünür.',
    en: 'When you delete a published model from the /models page, it appears here.'
  },
  'deleted.models.countSuffix': { tr: 'silinmiş (pasif) model var.', en: 'deleted (inactive) model(s).' },
  'deleted.models.loadFailed': { tr: 'Silinmiş modeller yüklenemedi.', en: 'Deleted models could not be loaded.' },
  'deleted.models.restoreConfirmTitle': { tr: 'Modeli geri yükle', en: 'Restore model' },
  'deleted.models.restoreConfirm': {
    tr: "'{name}' modelini geri yüklemek istediğinize emin misiniz?",
    en: "Are you sure you want to restore the model '{name}'?"
  },
  'deleted.models.restoreSuccess': { tr: 'Model geri yüklendi.', en: 'Model restored.' },

  // ── deleted-drafts.component.html / .ts ──
  'deleted.drafts.backLink': { tr: 'Taslaklar', en: 'Drafts' },
  'deleted.drafts.title': { tr: 'Silinen Taslaklar', en: 'Deleted Drafts' },
  'deleted.drafts.refresh': { tr: 'Yenile', en: 'Refresh' },
  'deleted.drafts.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'deleted.drafts.loading': { tr: 'Silinen taslaklar yükleniyor…', en: 'Loading deleted drafts…' },
  'deleted.drafts.empty': { tr: 'Silinmiş taslak bulunmuyor.', en: 'No deleted drafts found.' },
  'deleted.drafts.emptyHint': {
    tr: 'Bir taslağı /drafts sayfasından sildiğinizde burada görünür.',
    en: 'When you delete a draft from the /drafts page, it appears here.'
  },
  'deleted.drafts.countSuffix': { tr: 'silinmiş (pasif) taslak var.', en: 'deleted (inactive) draft(s).' },
  'deleted.drafts.loadFailed': { tr: 'Silinen taslaklar yüklenemedi.', en: 'Deleted drafts could not be loaded.' },
  'deleted.drafts.restoreConfirmTitle': { tr: 'Taslağı geri yükle', en: 'Restore draft' },
  'deleted.drafts.restoreConfirm': {
    tr: "'{name}' taslağını geri yüklemek istediğinize emin misiniz?",
    en: "Are you sure you want to restore the draft '{name}'?"
  },
  'deleted.drafts.restoreSuccess': { tr: 'Taslak geri yüklendi.', en: 'Draft restored.' },

  // ── deleted-reports.component.html / .ts ──
  'deleted.reports.backLink': { tr: 'Raporlar', en: 'Reports' },
  'deleted.reports.title': { tr: 'Silinmiş Raporlar', en: 'Deleted Reports' },
  'deleted.reports.refresh': { tr: 'Yenile', en: 'Refresh' },
  'deleted.reports.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'deleted.reports.loading': { tr: 'Silinmiş raporlar yükleniyor…', en: 'Loading deleted reports…' },
  'deleted.reports.empty': { tr: 'Silinmiş rapor bulunmuyor.', en: 'No deleted reports found.' },
  'deleted.reports.emptyHint': {
    tr: 'Bir raporu sildiğinizde (veya bağlı olduğu model silindiğinde) burada görünür.',
    en: 'When you delete a report (or its underlying model is deleted), it appears here.'
  },
  'deleted.reports.countSuffix': { tr: 'silinmiş (pasif) rapor var.', en: 'deleted (inactive) report(s).' },
  'deleted.reports.loadFailed': { tr: 'Silinmiş raporlar yüklenemedi.', en: 'Deleted reports could not be loaded.' },
  'deleted.reports.restoreConfirmTitle': { tr: 'Raporu geri yükle', en: 'Restore report' },
  'deleted.reports.restoreConfirm': {
    tr: "'{name}' raporunu geri yüklemek istediğinize emin misiniz?",
    en: "Are you sure you want to restore the report '{name}'?"
  },
  'deleted.reports.restoreSuccess': { tr: 'Rapor geri yüklendi.', en: 'Report restored.' },

  // ── deleted-dashboards.component.html / .ts ──
  'deleted.dashboards.backLink': { tr: "Dashboard'lar", en: 'Dashboards' },
  'deleted.dashboards.title': { tr: "Silinmiş Dashboard'lar", en: 'Deleted Dashboards' },
  'deleted.dashboards.refresh': { tr: 'Yenile', en: 'Refresh' },
  'deleted.dashboards.loadingAria': { tr: 'Yükleniyor', en: 'Loading' },
  'deleted.dashboards.loading': { tr: "Silinmiş dashboard'lar yükleniyor…", en: 'Loading deleted dashboards…' },
  'deleted.dashboards.empty': { tr: 'Silinmiş dashboard bulunmuyor.', en: 'No deleted dashboards found.' },
  'deleted.dashboards.emptyHint': {
    tr: "Bir dashboard'u sildiğinizde (veya bağlı olduğu model silindiğinde) burada görünür.",
    en: 'When you delete a dashboard (or its underlying model is deleted), it appears here.'
  },
  'deleted.dashboards.countSuffix': { tr: "silinmiş (pasif) dashboard var.", en: 'deleted (inactive) dashboard(s).' },
  'deleted.dashboards.loadFailed': { tr: "Silinmiş dashboard'lar yüklenemedi.", en: 'Deleted dashboards could not be loaded.' },
  'deleted.dashboards.widgetCount': { tr: '{count} widget', en: '{count} widget(s)' },
  'deleted.dashboards.restoreConfirmTitle': { tr: "Dashboard'ı geri yükle", en: 'Restore dashboard' },
  'deleted.dashboards.restoreConfirm': {
    tr: "'{name}' dashboard'unu geri yüklemek istediğinize emin misiniz?",
    en: "Are you sure you want to restore the dashboard '{name}'?"
  },
  'deleted.dashboards.restoreSuccess': { tr: "Dashboard geri yüklendi.", en: 'Dashboard restored.' }
};
