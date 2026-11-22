import { Translations } from './translations.model';

/**
 * Screen design — the published layout of the record form/list and the designer screen.
 * (The prefix is `screen.*` because `layout.*` belongs to the app shell.)
 */
export const SCREEN_I18N: Translations = {
  // ─── shared/record-layout — runtime ────────────────────────────────────────
  'screen.form.tabsAria': { tr: 'Form sekmeleri', en: 'Form tabs' },
  'screen.form.untitledTab': { tr: 'Sekme {n}', en: 'Tab {n}' },
  'screen.form.untitledSection': { tr: 'Bölüm', en: 'Section' },
  'screen.form.tabErrorsAria': { tr: '{count} hatalı alan', en: '{count} invalid field(s)' },
  'screen.form.staleNotice': {
    tr: 'Ekran tasarımı güncel değil: {count} yeni alan formun sonuna eklendi.',
    en: 'The screen design is out of date: {count} new field(s) were added at the end of the form.'
  },
  'screen.form.design': { tr: 'Tasarla', en: 'Design' },

  // ─── Entry button on record screens (admin) ───────────────────────────────
  'screen.designScreen': { tr: 'Ekranı tasarla', en: 'Design screen' },
  'screen.designScreenAria': {
    tr: 'Bu modelin form ve liste yerleşimini tasarla',
    en: 'Design the form and list layout of this model'
  },

  // ─── Designer page ─────────────────────────────────────────────────────────
  'screen.designer.title': { tr: 'Ekran Tasarımı', en: 'Screen Design' },
  'screen.designer.loading': { tr: 'Tasarım yükleniyor', en: 'Loading design' },
  'screen.designer.loadFailed': { tr: 'Tasarım yüklenemedi.', en: 'The design could not be loaded.' },
  'screen.designer.modelNotFound': {
    tr: "'{typeName}' yayınlanmış modeller arasında bulunamadı. Ekran tasarımı için model önce yayınlanmalı.",
    en: "'{typeName}' was not found among published models. Publish the model before designing its screen."
  },
  'screen.designer.backToModels': { tr: 'Modellere dön', en: 'Back to models' },
  'screen.designer.moduleNotInstalled': {
    tr: 'Ekran tasarımı bu şirkette henüz kurulmamış (migrasyon 023). Tasarımı görebilirsiniz ama kaydedemezsiniz.',
    en: 'Screen design is not installed for this company yet (migration 023). You can explore but not save.'
  },
  'screen.designer.conflict': {
    tr: 'Bu tasarım siz düzenlerken başka bir yönetici tarafından kaydedildi. Yeniden yükleyip değişikliğinizi tekrar yapın.',
    en: 'Another administrator saved this design while you were editing. Reload and apply your change again.'
  },
  'screen.designer.reload': { tr: 'Yeniden yükle', en: 'Reload' },
  'screen.designer.unsaved': { tr: 'Kaydedilmedi', en: 'Unsaved' },
  'screen.designer.undo': { tr: 'Geri al (Ctrl+Z)', en: 'Undo (Ctrl+Z)' },
  'screen.designer.redo': { tr: 'Yinele (Ctrl+Y)', en: 'Redo (Ctrl+Y)' },
  'screen.designer.preview': { tr: 'Önizle', en: 'Preview' },
  'screen.designer.fullscreen': { tr: 'Tam ekran', en: 'Full screen' },
  'screen.designer.exitFullscreen': { tr: 'Tam ekrandan çık', en: 'Exit full screen' },
  'screen.designer.save': { tr: 'Kaydet', en: 'Save' },
  'screen.designer.publish': { tr: 'Yayınla', en: 'Publish' },
  'screen.designer.publishBlocked': {
    tr: 'Yayınlamadan önce {count} hatayı düzeltin.',
    en: 'Fix {count} error(s) before publishing.'
  },
  'screen.designer.saveFailed': { tr: 'Kaydedilemedi.', en: 'Could not be saved.' },
  'screen.designer.viewAria': { tr: 'Tasarlanan ekran', en: 'Screen being designed' },
  'screen.designer.viewForm': { tr: 'Kayıt formu', en: 'Record form' },
  'screen.designer.viewList': { tr: 'Liste', en: 'List' },
  'screen.designer.statusNotSaved': { tr: 'Henüz kaydedilmedi', en: 'Not saved yet' },
  'screen.designer.statusDraftOnly': { tr: 'Taslak · yayınlanmadı', en: 'Draft · not published' },
  'screen.designer.statusChanged': {
    tr: 'Yayında: sürüm {version} · yayınlanmamış değişiklik var',
    en: 'Live: version {version} · unpublished changes'
  },
  'screen.designer.statusPublished': { tr: 'Yayında: sürüm {version}', en: 'Live: version {version}' },
  'screen.designer.previewWidth': { tr: 'Önizleme genişliği', en: 'Preview width' },
  'screen.designer.frameDesktop': { tr: 'Masaüstü', en: 'Desktop' },
  'screen.designer.frameTablet': { tr: 'Tablet', en: 'Tablet' },
  'screen.designer.framePhone': { tr: 'Telefon', en: 'Phone' },
  'screen.designer.openScreen': { tr: 'Ekranı aç', en: 'Open screen' },
  'screen.designer.discard': { tr: 'Taslağı at', en: 'Discard draft' },
  'screen.designer.reset': { tr: 'Varsayılana dön', en: 'Back to default' },
  'screen.designer.notSavedNotice': {
    tr: 'Bu ekran için henüz tasarım yok. Aşağıdaki taslak bugünkü görünümden hazırlandı; düzenleyip kaydedin, hazır olunca yayınlayın.',
    en: 'This screen has no design yet. The draft below was prepared from the current view; edit and save it, then publish when ready.'
  },
  'screen.designer.discardTitle': { tr: 'Taslak atılsın mı?', en: 'Discard the draft?' },
  'screen.designer.discardMessage': {
    tr: 'Yayınlanmamış değişiklikler silinir ve yayındaki tasarıma dönülür.',
    en: 'Unpublished changes are deleted and the published design is restored.'
  },
  'screen.designer.resetTitle': { tr: 'Varsayılan görünüme dönülsün mü?', en: 'Return to the default view?' },
  'screen.designer.resetMessage': {
    tr: 'Bu ekranın tasarımı (taslak ve yayındaki) kaldırılır; kullanıcılar ekranı tasarım öncesindeki varsayılan görünümle görür.',
    en: 'The design of this screen (draft and published) is removed; users see the default view from before the design.'
  },
  'screen.designer.leaveTitle': { tr: 'Kaydedilmemiş değişiklikler var', en: 'You have unsaved changes' },
  'screen.designer.leaveMessage': {
    tr: 'Sayfadan ayrılırsanız kaydedilmemiş tasarım değişiklikleri kaybolur.',
    en: 'If you leave the page, unsaved design changes will be lost.'
  },
  'screen.designer.leaveConfirm': { tr: 'Kaydetmeden çık', en: 'Leave without saving' },

  // Sorun paneli
  'screen.designer.issues': { tr: 'Sorunlar', en: 'Issues' },
  'screen.designer.errorCount': { tr: '{count} hata', en: '{count} error(s)' },
  'screen.designer.warningCount': { tr: '{count} uyarı', en: '{count} warning(s)' },
  'screen.designer.noIssuesBadge': { tr: 'Yayınlanabilir', en: 'Ready to publish' },
  'screen.designer.severity.error': { tr: 'Hata', en: 'Error' },
  'screen.designer.severity.warning': { tr: 'Uyarı', en: 'Warning' },
  'screen.designer.fix.unknownColumn': { tr: 'Kaldır', en: 'Remove' },
  'screen.designer.fix.requiredHidden': { tr: 'Forma yerleştir', en: 'Place on form' },
  'screen.designer.fix.unplacedColumn': { tr: 'Forma yerleştir', en: 'Place on form' },

  // ─── Form designer: palette and canvas ────────────────────────────────────
  'screen.designer.paletteAria': { tr: 'Alanlar ve yerleşim öğeleri', en: 'Fields and layout elements' },
  'screen.designer.searchPlaceholder': { tr: 'Alan ara…', en: 'Search fields…' },
  'screen.designer.unplaced': { tr: 'Yerleştirilmemiş', en: 'Not placed' },
  'screen.designer.allPlaced': { tr: 'Tüm alanlar formda.', en: 'All fields are on the form.' },
  'screen.designer.hidden': { tr: 'Gizli alanlar', en: 'Hidden fields' },
  'screen.designer.elements': { tr: 'Yerleşim', en: 'Layout' },
  'screen.designer.spacer': { tr: 'Boşluk', en: 'Spacer' },
  'screen.designer.divider': { tr: 'Ayırıcı', en: 'Divider' },
  'screen.designer.note': { tr: 'Bilgi notu', en: 'Info note' },
  'screen.designer.addSection': { tr: 'Bölüm ekle', en: 'Add section' },
  'screen.designer.addTab': { tr: 'Sekme ekle', en: 'Add tab' },
  'screen.designer.addField': { tr: 'Alan ekle', en: 'Add field' },
  'screen.designer.placeAria': { tr: '{name} alanını forma yerleştir', en: 'Place the {name} field on the form' },
  'screen.designer.paletteHelp': {
    tr: 'Öğeyi tuvale sürükleyin ya da tıklayın — seçili öğenin yanına eklenir.',
    en: 'Drag an item onto the canvas or click it — it is added next to the selection.'
  },
  'screen.designer.singleTabHint': {
    tr: 'Tek sekmeli formda kullanıcılar sekme çubuğunu görmez.',
    en: 'In a single-tab form users do not see a tab bar.'
  },
  'screen.designer.untitledSection': { tr: 'Başlıksız bölüm', en: 'Untitled section' },
  'screen.designer.collapsibleBadge': { tr: 'Katlanabilir', en: 'Collapsible' },
  'screen.designer.collapsedBadge': { tr: 'Kapalı açılır', en: 'Opens collapsed' },
  'screen.designer.itemAria': { tr: '{name}, genişlik {span}/12', en: '{name}, width {span}/12' },
  'screen.designer.unknownField': {
    tr: "'{column}' modelde artık yok — kaldırın",
    en: "'{column}' no longer exists in the model — remove it"
  },
  'screen.designer.emptyNote': { tr: 'Not metni boş', en: 'Note text is empty' },
  'screen.designer.emptySection': { tr: 'Alanları buraya sürükleyin', en: 'Drag fields here' },
  'screen.designer.moveUp': { tr: 'Yukarı taşı', en: 'Move up' },
  'screen.designer.moveDown': { tr: 'Aşağı taşı', en: 'Move down' },
  'screen.designer.narrowNotice': {
    tr: 'Telefonda sıra ve genişlik buradan düzenlenir. Sürükle-bırak için geniş ekranda düzenleyin.',
    en: 'On a phone, order and width are edited here. Use a wider screen for drag and drop.'
  },

  // ─── Inspector ─────────────────────────────────────────────────────────────
  'screen.inspector.title': { tr: 'Özellikler', en: 'Properties' },
  'screen.inspector.required': { tr: 'Zorunlu', en: 'Required' },
  'screen.inspector.unknown': { tr: 'Modelde yok', en: 'Not in model' },
  'screen.inspector.width': { tr: 'Genişlik', en: 'Width' },
  'screen.inspector.widthExact': { tr: 'Genişlik (kolon)', en: 'Width (columns)' },
  'screen.inspector.spanOption': { tr: '{span} / 12 kolon', en: '{span} / 12 columns' },
  'screen.inspector.widthHelp': {
    tr: 'Tuvalde öğenin sağ kenarını sürükleyerek de ayarlayabilirsiniz. Dar ekranda alanlar alt alta dizilir.',
    en: 'You can also drag the right edge of the item on the canvas. On narrow screens fields stack.'
  },
  'screen.inspector.newRow': { tr: 'Yeni satırda başlasın', en: 'Start on a new row' },
  'screen.inspector.widget': { tr: 'Gösterim', en: 'Display' },
  'screen.inspector.widgetSingleLine': { tr: 'Tek satır', en: 'Single line' },
  'screen.inspector.widgetMultiline': { tr: 'Çok satırlı metin', en: 'Multi-line text' },
  'screen.inspector.widgetSelect': { tr: 'Açılır liste', en: 'Drop-down list' },
  'screen.inspector.widgetRadio': { tr: 'Seçenek düğmeleri', en: 'Option buttons' },
  'screen.inspector.rows': { tr: 'Satır sayısı', en: 'Rows' },
  'screen.inspector.noteText': { tr: 'Not metni', en: 'Note text' },
  'screen.inspector.noteTone': { tr: 'Tür', en: 'Kind' },
  'screen.inspector.toneInfo': { tr: 'Bilgi', en: 'Information' },
  'screen.inspector.toneWarn': { tr: 'Uyarı', en: 'Warning' },
  'screen.inspector.removeFromForm': { tr: 'Formdan kaldır', en: 'Remove from form' },
  'screen.inspector.hide': { tr: 'Gizle', en: 'Hide' },
  'screen.inspector.requiredHelp': {
    tr: 'Zorunlu alan gizlenemez: kullanıcı onu dolduramazsa kayıt kaydedilemez.',
    en: 'A required field cannot be hidden: if users cannot fill it, the record cannot be saved.'
  },
  'screen.inspector.editSchema': {
    tr: 'Etiket ve kuralları model şemasında düzenle',
    en: 'Edit label and rules in the model schema'
  },
  'screen.inspector.section': { tr: 'Bölüm', en: 'Section' },
  'screen.inspector.sectionTitle': { tr: 'Bölüm başlığı', en: 'Section title' },
  'screen.inspector.collapsible': { tr: 'Katlanabilir', en: 'Collapsible' },
  'screen.inspector.collapsed': { tr: 'Açılışta kapalı', en: 'Collapsed on open' },
  'screen.inspector.removeSection': { tr: 'Bölümü kaldır', en: 'Remove section' },
  'screen.inspector.removeSectionHelp': {
    tr: 'Bölüm kaldırılınca içindeki alanlar "Yerleştirilmemiş" listesine döner.',
    en: 'When a section is removed, its fields go back to the "Not placed" list.'
  },
  'screen.inspector.tab': { tr: 'Sekme', en: 'Tab' },
  'screen.inspector.tabTitle': { tr: 'Sekme adı', en: 'Tab name' },
  'screen.inspector.moveLeft': { tr: 'Sola', en: 'Left' },
  'screen.inspector.moveRight': { tr: 'Sağa', en: 'Right' },
  'screen.inspector.removeTab': { tr: 'Sekmeyi kaldır', en: 'Remove tab' },
  'screen.inspector.singleTabHelp': {
    tr: 'Formda en az bir sekme bulunur.',
    en: 'A form always has at least one tab.'
  },
  'screen.inspector.emptyHelp': {
    tr: 'Düzenlemek için tuvalde bir alan, bölüm ya da sekme seçin.',
    en: 'Select a field, section or tab on the canvas to edit it.'
  },
  'screen.inspector.tipDrag': {
    tr: 'Alanı sürükleyerek başka bir yere, aynı satırda başka bir alanın yanına taşıyın.',
    en: 'Drag a field to move it elsewhere, next to another field on the same row.'
  },
  'screen.inspector.tipResize': {
    tr: 'Sağ kenardaki tutamaçla genişliği 12 kolonluk ızgaraya göre ayarlayın.',
    en: 'Use the handle on the right edge to set the width on the 12-column grid.'
  },
  'screen.inspector.tipKeyboard': {
    tr: 'Klavye: Alt+↑/↓ taşır, Alt+←/→ daraltır/genişletir, Delete kaldırır, Ctrl+Z geri alır.',
    en: 'Keyboard: Alt+↑/↓ moves, Alt+←/→ narrows/widens, Delete removes, Ctrl+Z undoes.'
  },

  // ─── List designer ─────────────────────────────────────────────────────────
  'screen.list.paletteAria': { tr: 'Listede olmayan kolonlar', en: 'Columns not in the list' },
  'screen.list.hiddenColumns': { tr: 'Listede olmayanlar', en: 'Not in list' },
  'screen.list.showAria': { tr: '{name} kolonunu listeye ekle', en: 'Add the {name} column to the list' },
  'screen.list.allShown': { tr: 'Tüm kolonlar listede.', en: 'All columns are in the list.' },
  'screen.list.paletteHelp': {
    tr: 'Kolonu tablo başlığına sürükleyin ya da tıklayarak sona ekleyin.',
    en: 'Drag a column onto the table header or click it to add it at the end.'
  },
  'screen.list.hint': {
    tr: 'Başlığı sürükleyerek sıralayın; başlığın sağ kenarını sürükleyerek genişliği ayarlayın (çift tık: otomatik). ID her zaman ilk kolondur.',
    en: 'Drag a header to reorder; drag its right edge to set the width (double-click: automatic). ID is always the first column.'
  },
  'screen.list.loadingRows': { tr: 'Örnek kayıtlar yükleniyor…', en: 'Loading sample records…' },
  'screen.list.noRows': { tr: 'Önizlenecek kayıt yok.', en: 'No records to preview.' },
  'screen.list.auto': { tr: 'otomatik', en: 'auto' },
  'screen.list.width': { tr: 'Genişlik (px)', en: 'Width (px)' },
  'screen.list.widthHelp': {
    tr: '{min}–{max} px; boş bırakılırsa otomatik.',
    en: '{min}–{max} px; leave empty for automatic.'
  },
  'screen.list.autoWidth': { tr: 'Otomatik genişlik', en: 'Automatic width' },
  'screen.list.hide': { tr: 'Listeden çıkar', en: 'Remove from list' },
  'screen.list.addColumn': { tr: 'Kolon ekle', en: 'Add column' },
  'screen.list.emptyHelp': {
    tr: 'Genişliğini ya da sırasını değiştirmek için bir kolon başlığı seçin.',
    en: 'Select a column header to change its width or position.'
  },

  // ─── Validation issues (codes shared with backend ScreenLayoutIssueCodes) ──
  'screen.issue.unreadable': { tr: 'Tasarım belgesi okunamadı.', en: 'The layout document could not be read.' },
  'screen.issue.tooLarge': { tr: 'Tasarım çok büyük (en fazla 64 KB).', en: 'The layout is too large (at most 64 KB).' },
  'screen.issue.limit': {
    tr: 'Sınır aşıldı: en fazla 12 sekme, 60 bölüm, 400 öğe ya da 100 liste kolonu.',
    en: 'Limit exceeded: at most 12 tabs, 60 sections, 400 items or 100 list columns.'
  },
  'screen.issue.badId': { tr: 'Geçersiz öğe kimliği.', en: 'Invalid item identifier.' },
  'screen.issue.duplicateId': { tr: 'Aynı kimlik iki öğede kullanılmış.', en: 'The same identifier is used by two items.' },
  'screen.issue.badKind': { tr: 'Tanınmayan öğe türü.', en: 'Unknown item kind.' },
  'screen.issue.spanRange': { tr: 'Genişlik 1 ile 12 kolon arasında olmalı.', en: 'Width must be between 1 and 12 columns.' },
  'screen.issue.rowsRange': { tr: 'Satır sayısı 2 ile 20 arasında olmalı.', en: 'Rows must be between 2 and 20.' },
  'screen.issue.textTooLong': {
    tr: 'Metin çok uzun (başlık 120, not 1000 karakter).',
    en: 'Text is too long (title 120, note 1000 characters).'
  },
  'screen.issue.badTone': { tr: 'Not türü geçersiz.', en: 'Invalid note kind.' },
  'screen.issue.widthRange': {
    tr: "'{column}' genişliği 60–800 px aralığında olmalı.",
    en: "The width of '{column}' must be 60–800 px."
  },
  'screen.issue.noTabs': { tr: 'Formda en az bir sekme olmalı.', en: 'The form must have at least one tab.' },
  'screen.issue.unknownColumn': {
    tr: "'{column}' modelde artık yok.",
    en: "'{column}' no longer exists in the model."
  },
  'screen.issue.duplicateColumn': {
    tr: "'{column}' birden fazla yerde (ya da hem yerleşik hem gizli).",
    en: "'{column}' appears more than once (or is both placed and hidden)."
  },
  'screen.issue.requiredHidden': {
    tr: "Zorunlu alan '{column}' gizlenemez.",
    en: "The required field '{column}' cannot be hidden."
  },
  'screen.issue.emptyTab': { tr: 'Boş sekme var — alan ekleyin ya da kaldırın.', en: 'There is an empty tab — add fields or remove it.' },
  'screen.issue.widgetType': {
    tr: "'{column}' için seçilen gösterim bu alan tipine uymuyor.",
    en: "The display chosen for '{column}' does not fit this field type."
  },
  'screen.issue.noColumns': { tr: 'Listede en az bir kolon olmalı.', en: 'The list must have at least one column.' },
  'screen.issue.unplacedColumn': {
    tr: "'{column}' forma yerleştirilmedi — kullanıcılar onu formun sonunda görür.",
    en: "'{column}' is not placed — users see it at the end of the form."
  },
  'screen.issue.emptySection': { tr: 'Boş bölüm var.', en: 'There is an empty section.' },

  // ─── Role-specific designs (variants, 026) ────────────────────────────────
  'screen.variant.select': { tr: 'Tasarım', en: 'Layout' },
  'screen.variant.default': { tr: 'Varsayılan (herkes)', en: 'Default (everyone)' },
  'screen.variant.moveUp': { tr: 'Önceliği artır', en: 'Raise priority' },
  'screen.variant.moveDown': { tr: 'Önceliği düşür', en: 'Lower priority' },
  'screen.variant.settings': { tr: 'Ad ve roller', en: 'Name and roles' },
  'screen.variant.new': { tr: 'Yeni tasarım', en: 'New layout' },
  'screen.variant.delete': { tr: 'Tasarımı sil', en: 'Delete layout' },
  'screen.variant.audience': {
    tr: 'Bu tasarımı şu rollerdeki kullanıcılar görür: {roles} (öncelik {position}).',
    en: 'Users in these roles see this layout: {roles} (priority {position}).'
  },
  'screen.variant.defaultAudience': {
    tr: 'Varsayılan tasarım herkese gösterilir. Belirli roller için "Yeni tasarım" ile ayrı bir tasarım oluşturabilirsiniz.',
    en: 'The default layout is shown to everyone. Use "New layout" to create a separate layout for specific roles.'
  },
  'screen.variant.defaultAudienceOthers': {
    tr: 'Varsayılan tasarım: rollerine özel tasarım eşleşmeyen herkes bunu görür.',
    en: 'Default layout: everyone without a matching role-specific layout sees this.'
  },
  'screen.variant.deleteTitle': { tr: 'Tasarım silinsin mi?', en: 'Delete this layout?' },
  'screen.variant.deleteMessage': {
    tr: 'Bu rollerdeki kullanıcılar bundan sonra varsayılan tasarımı (ya da sıradaki eşleşen tasarımı) görür.',
    en: 'Users in these roles will see the default layout (or the next matching layout) from now on.'
  },
  'screen.variant.switchTitle': { tr: 'Kaydedilmemiş değişiklikler atılsın mı?', en: 'Discard unsaved changes?' },
  'screen.variant.switchMessage': {
    tr: 'Bu tasarımda kaydedilmemiş değişiklikler var. Başka bir tasarıma geçerseniz kaybolur.',
    en: 'This layout has unsaved changes. They are lost if you switch to another layout.'
  },
  'screen.variant.switchConfirm': { tr: 'Atıp geç', en: 'Discard and switch' },
  'screen.variant.createTitle': { tr: 'Rollere özel yeni tasarım', en: 'New role-specific layout' },
  'screen.variant.editTitle': { tr: 'Tasarımın adı ve rolleri', en: 'Layout name and roles' },
  'screen.variant.create': { tr: 'Oluştur', en: 'Create' },
  'screen.variant.rolesHint': {
    tr: 'Kullanıcının rolü birden çok tasarımla eşleşirse listede üstte olan kazanır.',
    en: 'If a user\'s roles match several layouts, the one higher in the list wins.'
  },
  'screen.variant.copyCurrent': {
    tr: 'Açık tasarımdan kopyala (kaydedilmemiş değişiklikler dahil)',
    en: 'Copy the open layout (including unsaved changes)'
  }
};
