import { Translations } from './translations.model';

/**
 * Tasarım sayfası (/design) — ekran tasarımları listesi, navigasyon tasarımları ve tasarımcısı,
 * rol seçici, tasarım ayarları diyaloğu. Ekran tasarımcısının kendi metinleri `screen.*`'tadır.
 * `design.issue.{kod}` anahtarları sunucuyla ortak doğrulama kodlarıdır (nav-layout.validate.ts).
 */
export const DESIGN_I18N: Translations = {
  // ─── Ortak: roller ve ayarlar diyaloğu ──────────────────────────────────────
  'design.roles.label': { tr: 'Roller', en: 'Roles' },
  'design.roles.none': { tr: 'Henüz rol tanımlanmamış.', en: 'No roles have been defined yet.' },
  'design.roles.manage': { tr: 'Rolleri yönet', en: 'Manage roles' },
  'design.roles.missing': {
    tr: '{count} rol artık yok; kaydedince listeden düşer.',
    en: '{count} role(s) no longer exist; they are dropped when you save.'
  },
  'design.roles.everyone': { tr: 'Herkes', en: 'Everyone' },
  'design.roles.nobody': { tr: 'Rol atanmadı', en: 'No roles assigned' },
  'design.settings.name': { tr: 'Tasarım adı', en: 'Layout name' },
  'design.settings.nameRequired': { tr: 'Ad zorunludur (en fazla 100 karakter).', en: 'A name is required (at most 100 characters).' },
  'design.settings.rolesRequired': { tr: 'En az bir rol seçin.', en: 'Select at least one role.' },

  // ─── Tasarım sayfası ────────────────────────────────────────────────────────
  'design.hub.title': { tr: 'Tasarım', en: 'Design' },
  'design.hub.tabsAria': { tr: 'Tasarım türü', en: 'Design type' },
  'design.hub.tabScreens': { tr: 'Ekranlar', en: 'Screens' },
  'design.hub.tabNavigation': { tr: 'Navigasyon', en: 'Navigation' },
  'design.hub.screensIntro': {
    tr: 'Bir modelin kayıt formunu ve liste kolonlarını tasarlamak için kartını açın. Her model için rollere özel ayrı tasarımlar da oluşturabilirsiniz.',
    en: 'Open a model\'s card to design its record form and list columns. You can also create separate layouts for specific roles.'
  },
  'design.hub.loading': { tr: 'Yükleniyor', en: 'Loading' },
  'design.hub.loadFailed': { tr: 'Tasarımlar yüklenemedi.', en: 'Layouts could not be loaded.' },
  'design.hub.saveFailed': { tr: 'İşlem tamamlanamadı.', en: 'The operation could not be completed.' },
  'design.hub.noModels': { tr: 'Henüz yayınlanmış model yok.', en: 'There are no published models yet.' },
  'design.hub.goBuild': { tr: 'Model oluştur', en: 'Create a model' },
  'design.hub.search': { tr: 'Ara', en: 'Search' },
  'design.hub.noMatch': { tr: 'Aramayla eşleşen model yok.', en: 'No models match the search.' },
  'design.hub.designModelAria': { tr: '{name} ekranını tasarla', en: 'Design the {name} screen' },
  'design.hub.formCount': { tr: 'Form: {count}', en: 'Form: {count}' },
  'design.hub.listCount': { tr: 'Liste: {count}', en: 'List: {count}' },
  'design.hub.variantCount': { tr: '{count} rollere özel', en: '{count} role-specific' },
  'design.hub.unpublished': { tr: 'Yayınlanmamış değişiklik', en: 'Unpublished changes' },
  'design.hub.defaultView': { tr: 'Varsayılan görünüm', en: 'Default view' },

  // ─── Navigasyon listesi ─────────────────────────────────────────────────────
  'design.nav.intro': {
    tr: 'Yönetici olmayan kullanıcıların sol menüsünü klasörlerle düzenleyin. Yönetici menüsü değişmez.',
    en: 'Organize the left menu of non-admin users into folders. The admin menu does not change.'
  },
  'design.nav.notInstalled': {
    tr: 'Navigasyon tasarımı bu şirkette henüz kurulmamış (migrasyon 026). Platform yöneticisine başvurun.',
    en: 'Navigation design is not installed for this company yet (migration 026). Contact the platform administrator.'
  },
  'design.nav.empty': {
    tr: 'Henüz navigasyon tasarımı yok; kullanıcılar otomatik menüyü görüyor.',
    en: 'There are no navigation layouts yet; users see the automatic menu.'
  },
  'design.nav.noDefault': {
    tr: 'Varsayılan tasarım yok: rolü hiçbir tasarımla eşleşmeyen kullanıcılar otomatik menüyü görür.',
    en: 'No default layout: users whose roles match no layout see the automatic menu.'
  },
  'design.nav.new': { tr: 'Yeni navigasyon', en: 'New navigation' },
  'design.nav.colPriority': { tr: 'Sıra', en: 'Order' },
  'design.nav.colName': { tr: 'Ad', en: 'Name' },
  'design.nav.colRoles': { tr: 'Roller', en: 'Roles' },
  'design.nav.colStatus': { tr: 'Durum', en: 'Status' },
  'design.nav.colEnabled': { tr: 'Etkin', en: 'Enabled' },
  'design.nav.colActions': { tr: 'İşlemler', en: 'Actions' },
  'design.nav.default': { tr: 'Varsayılan', en: 'Default' },
  'design.nav.disabled': { tr: 'Pasif', en: 'Disabled' },
  'design.nav.unreachable': { tr: 'Kimseye gösterilmez', en: 'Shown to nobody' },
  'design.nav.statusDraft': { tr: 'Yalnız taslak', en: 'Draft only' },
  'design.nav.statusChanged': { tr: 'Değişti (yayında: {version})', en: 'Changed (live: {version})' },
  'design.nav.statusPublished': { tr: 'Yayında: sürüm {version}', en: 'Live: version {version}' },
  'design.nav.enabledAria': { tr: '{name} etkin', en: '{name} enabled' },
  'design.nav.moveUpAria': { tr: '{name} önceliğini artır', en: 'Raise the priority of {name}' },
  'design.nav.moveDownAria': { tr: '{name} önceliğini düşür', en: 'Lower the priority of {name}' },
  'design.nav.makeDefault': { tr: 'Varsayılan yap', en: 'Make default' },
  'design.nav.edit': { tr: 'Düzenle', en: 'Edit' },
  'design.nav.copyAria': { tr: '{name} tasarımını kopyala', en: 'Copy the {name} layout' },
  'design.nav.copyName': { tr: '{name} (kopya)', en: '{name} (copy)' },
  'design.nav.deleteAria': { tr: '{name} tasarımını sil', en: 'Delete the {name} layout' },
  'design.nav.deleteTitle': { tr: 'Navigasyon tasarımı silinsin mi?', en: 'Delete this navigation layout?' },
  'design.nav.deleteMessage': {
    tr: '"{name}" silinir; bu tasarımı gören kullanıcılar sıradaki eşleşen tasarımı, yoksa otomatik menüyü görür.',
    en: '"{name}" will be deleted; its users see the next matching layout, or the automatic menu.'
  },
  'design.nav.priorityHelp': {
    tr: 'Kullanıcının rolü birden çok tasarımla eşleşirse listede üstte olan kazanır. Eşleşme yoksa Varsayılan tasarım, o da yoksa otomatik menü gösterilir. Pasif ve hiç yayınlanmamış tasarımlar atlanır.',
    en: 'If a user\'s roles match several layouts, the one higher in the list wins. With no match the Default layout is shown, otherwise the automatic menu. Disabled and never-published layouts are skipped.'
  },
  'design.nav.createTitle': { tr: 'Yeni navigasyon tasarımı', en: 'New navigation layout' },
  'design.nav.create': { tr: 'Oluştur ve düzenle', en: 'Create and edit' },
  'design.nav.rolesHint': {
    tr: 'Seçilen rollerdeki kullanıcılar bu menüyü görür. Rol seçmezseniz yalnız "Varsayılan" işaretliyse gösterilir.',
    en: 'Users in the selected roles see this menu. Without roles it is shown only if marked "Default".'
  },
  'design.nav.startFrom': { tr: 'Başlangıç', en: 'Start from' },
  'design.nav.startCurrent': { tr: 'Bugünkü menü (tüm modeller ve sayfalar)', en: 'The current menu (all models and pages)' },
  'design.nav.startEmpty': { tr: 'Boş', en: 'Empty' },

  // ─── Navigasyon tasarımcısı ─────────────────────────────────────────────────
  'design.nav.designerTitle': { tr: 'Navigasyon', en: 'Navigation' },
  'design.nav.back': { tr: 'Tasarımlar', en: 'Layouts' },
  'design.nav.settings': { tr: 'Ad ve roller', en: 'Name and roles' },
  'design.nav.settingsTitle': { tr: 'Navigasyon tasarımı ayarları', en: 'Navigation layout settings' },
  'design.nav.isDefault': { tr: 'Varsayılan tasarım', en: 'Default layout' },
  'design.nav.isDefaultHelp': {
    tr: 'Rolü hiçbir tasarımla eşleşmeyen kullanıcılar varsayılanı görür. Yalnız bir tasarım varsayılan olabilir.',
    en: 'Users whose roles match no layout see the default. Only one layout can be the default.'
  },
  'design.nav.isEnabled': { tr: 'Etkin', en: 'Enabled' },
  'design.nav.audience': { tr: 'Görenler: {roles}', en: 'Shown to: {roles}' },
  'design.nav.narrowNotice': {
    tr: 'Telefonda sürükle-bırak yok: öğeyi seçip "Konum" düğmeleriyle taşıyın. Rahat düzenleme için geniş ekran kullanın.',
    en: 'No drag and drop on phones: select an item and move it with the "Position" buttons. Use a wide screen for easier editing.'
  },
  'design.nav.palette': { tr: 'Eklenebilecek öğeler', en: 'Items to add' },
  'design.nav.paletteStructure': { tr: 'Yapı', en: 'Structure' },
  'design.nav.palettePages': { tr: 'Sayfalar', en: 'Pages' },
  'design.nav.paletteModels': { tr: 'Modeller', en: 'Models' },
  'design.nav.paletteDashboards': { tr: 'Dashboard\'lar', en: 'Dashboards' },
  'design.nav.paletteReports': { tr: 'Raporlar', en: 'Reports' },
  'design.nav.paletteHelp': {
    tr: 'Tıklayınca seçili klasöre ya da seçili öğenin altına eklenir; menüde istediğiniz yere sürükleyebilirsiniz.',
    en: 'Click to add into the selected folder or below the selected item; or drag it anywhere in the menu.'
  },
  'design.nav.addFolder': { tr: 'Klasör', en: 'Folder' },
  'design.nav.addLink': { tr: 'Dış bağlantı', en: 'External link' },
  'design.nav.newFolder': { tr: 'Yeni klasör', en: 'New folder' },
  'design.nav.newLink': { tr: 'Yeni bağlantı', en: 'New link' },
  'design.nav.untitledFolder': { tr: 'Adsız klasör', en: 'Untitled folder' },
  'design.nav.placed': { tr: 'Menüde', en: 'In the menu' },
  'design.nav.tree': { tr: 'Menü', en: 'Menu' },
  'design.nav.emptyTree': {
    tr: 'Menü boş. Soldan öğe ekleyin ya da sürükleyin.',
    en: 'The menu is empty. Add or drag items from the left.'
  },
  'design.nav.emptyFolder': { tr: 'Boş klasör — öğeyi buraya sürükleyin', en: 'Empty folder — drag an item here' },
  'design.nav.dropHere': { tr: 'Klasörün sonuna bırak', en: 'Drop at the end of the folder' },
  'design.nav.autoAppended': { tr: 'yerleştirilmemiş modeller kendiliğinden', en: 'unplaced models, automatically' },
  'design.nav.broken': { tr: 'Hedef bulunamadı ya da adres geçersiz', en: 'Target not found or the address is invalid' },
  'design.nav.previewNote': {
    tr: 'Kullanıcı gözüyle: her kullanıcı yalnız izni olan modelleri görür, boş kalan klasörler gizlenir.',
    en: 'As users see it: each user only sees models they may access, and empty folders are hidden.'
  },
  'design.nav.inspector': { tr: 'Özellikler', en: 'Properties' },
  'design.nav.deselect': { tr: 'Seçimi kaldır', en: 'Clear selection' },
  'design.nav.modelTarget': { tr: 'Model: {name}', en: 'Model: {name}' },
  'design.nav.dashboardTarget': { tr: 'Dashboard #{id}', en: 'Dashboard #{id}' },
  'design.nav.reportTarget': { tr: 'Rapor #{id}', en: 'Report #{id}' },
  'design.nav.label': { tr: 'Menüdeki ad', en: 'Name in the menu' },
  'design.nav.labelOptional': { tr: 'Boş bırakılırsa varsayılan ad kullanılır.', en: 'Leave empty to use the default name.' },
  'design.nav.url': { tr: 'Adres', en: 'Address' },
  'design.nav.urlInvalid': {
    tr: 'Adres http:// ya da https:// ile başlamalı ve boşluk içermemeli.',
    en: 'The address must start with http:// or https:// and contain no spaces.'
  },
  'design.nav.urlHelp': { tr: 'Bağlantı yeni sekmede açılır.', en: 'The link opens in a new tab.' },
  'design.nav.icon': { tr: 'İkon', en: 'Icon' },
  'design.nav.chooseIcon': { tr: 'İkon seç', en: 'Choose icon' },
  'design.nav.startCollapsed': { tr: 'Kapalı başlasın', en: 'Start collapsed' },
  'design.nav.position': { tr: 'Konum', en: 'Position' },
  'design.nav.moveUp': { tr: 'Yukarı', en: 'Up' },
  'design.nav.moveDown': { tr: 'Aşağı', en: 'Down' },
  'design.nav.indent': { tr: 'Üstteki klasöre al', en: 'Move into folder above' },
  'design.nav.outdent': { tr: 'Klasörden çıkar', en: 'Move out of folder' },
  'design.nav.keyboardHelp': {
    tr: 'Kısayollar: Alt+↑/↓ taşı, Alt+→ klasöre al, Alt+← klasörden çıkar, Delete sil.',
    en: 'Shortcuts: Alt+↑/↓ move, Alt+→ into folder, Alt+← out of folder, Delete removes.'
  },
  'design.nav.remove': { tr: 'Menüden kaldır', en: 'Remove from menu' },
  'design.nav.documentSettings': { tr: 'Menü ayarları', en: 'Menu settings' },
  'design.nav.appendUnplaced': { tr: 'Yerleştirilmemiş modelleri sona ekle', en: 'Append unplaced models at the end' },
  'design.nav.appendUnplacedHelp': {
    tr: 'Menüde olmayan, kullanıcının görebildiği modeller "Diğer modeller" klasöründe gösterilir — sonradan yayınlanan modeller kaybolmaz.',
    en: 'Models not in the menu that the user can access are shown in an "Other models" folder — models published later do not get lost.'
  },
  'design.nav.selectHint': { tr: 'Düzenlemek için menüden bir öğe seçin.', en: 'Select an item in the menu to edit it.' },
  'design.nav.kind.folder': { tr: 'Klasör', en: 'Folder' },
  'design.nav.kind.model': { tr: 'Model', en: 'Model' },
  'design.nav.kind.dashboard': { tr: 'Dashboard', en: 'Dashboard' },
  'design.nav.kind.report': { tr: 'Rapor', en: 'Report' },
  'design.nav.kind.page': { tr: 'Sayfa', en: 'Page' },
  'design.nav.kind.url': { tr: 'Bağlantı', en: 'Link' },

  // ─── Doğrulama sorunları (sunucuyla ortak kodlar) ───────────────────────────
  'design.issue.unreadable': { tr: 'Tasarım belgesi okunamadı.', en: 'The layout document could not be read.' },
  'design.issue.tooLarge': { tr: 'Tasarım çok büyük.', en: 'The layout is too large.' },
  'design.issue.limit': {
    tr: 'Sınır aşıldı: en fazla 40 klasör ve 300 öğe.',
    en: 'Limit exceeded: at most 40 folders and 300 items.'
  },
  'design.issue.badId': { tr: 'Geçersiz öğe kimliği.', en: 'Invalid item id.' },
  'design.issue.duplicateId': { tr: 'Aynı kimlik iki kez kullanılmış.', en: 'The same id is used twice.' },
  'design.issue.badKind': { tr: 'Bilinmeyen öğe türü.', en: 'Unknown item type.' },
  'design.issue.textTooLong': { tr: '"{name}" adı 60 karakterden uzun.', en: 'The name "{name}" is longer than 60 characters.' },
  'design.issue.badUrl': {
    tr: '"{name}" bağlantısının adresi geçersiz (http:// ya da https:// olmalı).',
    en: 'The address of "{name}" is invalid (must be http:// or https://).'
  },
  'design.issue.badIcon': { tr: '"{name}" için geçersiz ikon.', en: 'Invalid icon for "{name}".' },
  'design.issue.badPage': { tr: 'Bilinmeyen sayfa.', en: 'Unknown page.' },
  'design.issue.badTarget': { tr: '"{name}" geçerli bir hedefe bağlı değil.', en: '"{name}" is not linked to a valid target.' },
  'design.issue.nestedFolder': {
    tr: 'Klasör içinde klasör olamaz (tek seviye).',
    en: 'A folder cannot contain a folder (one level only).'
  },
  'design.issue.emptyLabel': { tr: 'Bir öğenin adı boş.', en: 'An item has an empty name.' },
  'design.issue.unknownModel': {
    tr: '"{name}" modeli artık yayında değil.',
    en: 'The model "{name}" is no longer published.'
  },
  'design.issue.unknownTarget': {
    tr: '"{name}" silinmiş bir dashboard\'a ya da rapora bağlı.',
    en: '"{name}" points to a deleted dashboard or report.'
  },
  'design.issue.duplicateModel': {
    tr: '"{name}" menüde birden çok kez var.',
    en: '"{name}" appears in the menu more than once.'
  },
  'design.issue.emptyFolder': {
    tr: '"{name}" klasörü boş — kullanıcılara gösterilmez.',
    en: 'The folder "{name}" is empty — it is not shown to users.'
  }
};
