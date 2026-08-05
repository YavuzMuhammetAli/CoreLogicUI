import { Translations } from './translations.model';

/**
 * Model ilişkileri (G1) — table-detail "Relationships" sekmesi, ilişki popup'ı,
 * önizleme diyaloğu ve entity graph görselleştirmesi.
 */
export const RELATIONSHIP_I18N: Translations = {
  // ── Sekme ve liste ────────────────────────────────────────────────────────
  'relationship.tab': { tr: 'İlişkiler', en: 'Relationships' },
  'relationship.tablistAria': { tr: 'Model sekmeleri', en: 'Model tabs' },
  'relationship.panelAria': { tr: 'İlişkiler paneli', en: 'Relationships panel' },
  'relationship.new': { tr: '+ İlişki', en: '+ Relationship' },
  'relationship.preview': { tr: 'Önizleme', en: 'Preview' },

  'relationship.emptyTitle': { tr: 'Henüz ilişki yok', en: 'No relationships yet' },
  'relationship.emptyMessage': {
    tr: 'İlişki, bu modeli VAR OLAN başka bir modele bağlar; navigation property\'ler otomatik üretilir. Kendi alanlarıyla yeni bir çocuk model istiyorsanız "Alt Modeller" sekmesini kullanın.',
    en: 'A relationship links this model to an EXISTING model; navigation properties are generated automatically. If you want a new child model with its own fields, use the "Sub-models" tab.'
  },
  'relationship.saveModelFirst': {
    tr: 'İlişki ekleyebilmek için önce modeli kaydedin.',
    en: 'Save the model first to add relationships.'
  },

  // ── Tablo başlıkları ──────────────────────────────────────────────────────
  'relationship.colTarget': { tr: 'Hedef Model', en: 'Target Model' },
  'relationship.colType': { tr: 'İlişki Tipi', en: 'Relationship Type' },
  'relationship.colProperty': { tr: 'Property Adı', en: 'Property Name' },
  'relationship.colInverse': { tr: 'Ters Property', en: 'Inverse Property' },
  'relationship.colCascade': { tr: 'Cascade Delete', en: 'Cascade Delete' },
  'relationship.colRequired': { tr: 'Zorunlu', en: 'Required' },
  'relationship.colDisplayName': { tr: 'Görünen Ad', en: 'Display Name' },
  'relationship.colOrder': { tr: 'Sıra', en: 'Order' },
  'relationship.colDepth': { tr: 'Derinlik', en: 'Depth' },

  // ── İlişki tipleri ────────────────────────────────────────────────────────
  'relationship.type.oneToOne': { tr: 'Bire Bir (One To One)', en: 'One To One' },
  'relationship.type.oneToMany': { tr: 'Bire Çok (One To Many)', en: 'One To Many' },
  'relationship.type.manyToOne': { tr: 'Çoka Bir (Many To One)', en: 'Many To One' },
  'relationship.type.manyToMany': { tr: 'Çoka Çok (Many To Many)', en: 'Many To Many' },
  'relationship.type.selfReference': { tr: 'Kendine Referans (Self Reference)', en: 'Self Reference' },

  // ── Popup ─────────────────────────────────────────────────────────────────
  'relationship.dialogNewTitle': { tr: 'Yeni İlişki', en: 'New Relationship' },
  'relationship.dialogEditTitle': { tr: 'İlişkiyi Düzenle', en: 'Edit Relationship' },
  'relationship.dialogSubtitle': {
    tr: 'İlişki, var olan bir modele bağlanır — yeni model oluşturmaz.',
    en: 'A relationship targets an existing model — it does not create one.'
  },

  'relationship.fieldTarget': { tr: 'Hedef Model', en: 'Target Model' },
  'relationship.fieldTargetPlaceholder': { tr: 'Model ara…', en: 'Search model…' },
  'relationship.fieldTargetHelp': {
    tr: 'Listede yayınlanmış modeller çıkar. Bu modele ait yeni bir çocuk model için "Alt Modeller" sekmesini kullanın.',
    en: 'The list shows published models. For a new child model of this model, use the "Sub-models" tab.'
  },
  'relationship.fieldType': { tr: 'İlişki Tipi', en: 'Relationship Type' },
  'relationship.fieldProperty': { tr: 'Property Adı', en: 'Property Name' },
  'relationship.fieldPropertyHelp': {
    tr: 'Bu modelde üretilecek navigation property adı (örn. Orders).',
    en: 'Navigation property name generated on this model (e.g. Orders).'
  },
  'relationship.fieldInverse': { tr: 'Ters Property', en: 'Inverse Property' },
  'relationship.fieldInverseHelp': {
    tr: 'Hedef modelde üretilecek karşı navigation property adı (örn. Customer).',
    en: 'Navigation property generated on the target model (e.g. Customer).'
  },
  'relationship.fieldInverseRequiredHelp': {
    tr: 'Bu ilişki tipi çift yönlüdür — ters property zorunludur.',
    en: 'This relationship type is bidirectional — the inverse property is required.'
  },
  'relationship.fieldForeignKey': { tr: 'FK Kolon Adı', en: 'Foreign Key Column' },
  'relationship.fieldForeignKeyHelp': {
    tr: 'Boş bırakılırsa property adından türetilir.',
    en: 'Derived from the property name when left empty.'
  },
  'relationship.fieldJoinTable': { tr: 'Ara Tablo Adı', en: 'Join Table Name' },
  'relationship.fieldJoinTableHelp': {
    tr: 'Boş bırakılırsa {Kaynak}{Hedef} olarak üretilir.',
    en: 'Generated as {Source}{Target} when left empty.'
  },
  'relationship.fieldDisplayName': { tr: 'Görünen Ad', en: 'Display Name' },
  'relationship.fieldOrder': { tr: 'Sıra', en: 'Order' },
  'relationship.fieldCascade': { tr: 'Cascade Delete (silme yayılsın)', en: 'Cascade delete' },
  'relationship.fieldRequired': { tr: 'Zorunlu (FK NOT NULL)', en: 'Required (FK NOT NULL)' },

  'relationship.errTargetRequired': { tr: 'Hedef model seçilmelidir.', en: 'A target model must be selected.' },
  'relationship.errPropertyRequired': { tr: 'Property adı zorunludur.', en: 'Property name is required.' },
  'relationship.errPropertyPattern': {
    tr: 'Harf veya alt çizgi ile başlamalı; yalnızca harf, rakam ve alt çizgi içerebilir.',
    en: 'Must start with a letter or underscore and contain only letters, digits and underscores.'
  },
  'relationship.errInverseRequired': {
    tr: 'Bu ilişki tipi için ters property zorunludur.',
    en: 'The inverse property is required for this relationship type.'
  },

  // ── Doğrulama / durum ─────────────────────────────────────────────────────
  'relationship.depthBadge': { tr: 'Derinlik {depth}/{max}', en: 'Depth {depth}/{max}' },
  'relationship.errorsTitle': { tr: 'Hatalar', en: 'Errors' },
  'relationship.warningsTitle': { tr: 'Uyarılar', en: 'Warnings' },
  'relationship.blocksPublish': {
    tr: 'Bu hatalar giderilmeden model yayınlanamaz.',
    en: 'The model cannot be published until these errors are resolved.'
  },

  'relationship.deleteAria': { tr: '{name} ilişkisini sil', en: 'Delete relationship {name}' },
  'relationship.editAria': { tr: '{name} ilişkisini düzenle', en: 'Edit relationship {name}' },
  'relationship.deleteConfirmTitle': { tr: 'İlişkiyi sil', en: 'Delete relationship' },
  'relationship.deleteConfirmMessage': {
    tr: '"{name}" ilişkisi silinecek. SQL tarafındaki foreign key bir sonraki yayınlamada kaldırılır.',
    en: 'Relationship "{name}" will be deleted. The SQL foreign key is removed on the next publish.'
  },
  'relationship.flushTableNotFound': {
    tr: 'Model kaydedildi ancak tablosu bulunamadı — bekleyen ilişkiler gönderilemedi. Sayfayı yenileyip tekrar deneyin.',
    en: 'The model was saved but its table was not found — pending relationships could not be submitted. Refresh and try again.'
  },

  // ── Önizleme diyaloğu ─────────────────────────────────────────────────────
  'relationship.previewTitle': { tr: 'Yayınlama Önizlemesi', en: 'Publish Preview' },
  'relationship.previewSubtitle': {
    tr: 'Aşağıdakiler henüz uygulanmadı — yalnızca yayınlandığında oluşacakları gösterir.',
    en: 'Nothing below has been applied yet — this shows what publishing would create.'
  },
  'relationship.previewTabGraph': { tr: 'Entity Graph', en: 'Entity Graph' },
  'relationship.previewTabCode': { tr: 'Üretilecek C#', en: 'Generated C#' },
  'relationship.previewTabSql': { tr: 'Üretilecek SQL', en: 'Generated SQL' },
  'relationship.previewBatch': { tr: 'Yeniden derlenecek modeller', en: 'Models to be recompiled' },
  'relationship.previewNoSql': {
    tr: 'Uygulanacak şema değişikliği yok.',
    en: 'No schema changes to apply.'
  },
  'relationship.previewLoading': { tr: 'Önizleme hazırlanıyor…', en: 'Preparing preview…' },

  // ── Entity graph görselleştirmesi ─────────────────────────────────────────
  'relationship.graphAria': { tr: 'Entity ilişki grafiği', en: 'Entity relationship graph' },
  'relationship.graphEmpty': { tr: 'Gösterilecek ilişki yok.', en: 'No relationships to display.' },
  'relationship.graphLevel': { tr: 'Seviye {depth}', en: 'Level {depth}' },
  'relationship.graphLegendRoot': { tr: 'Kök model', en: 'Root model' },
  'relationship.graphLegendRelation': { tr: 'İlişki', en: 'Relationship' },
  'relationship.graphLegendLegacy': { tr: 'Mevcut FK (alt-model / lookup)', en: 'Existing FK (sub-model / lookup)' },
  'relationship.graphLegendExceeds': { tr: 'Derinlik aşımı', en: 'Depth exceeded' },

  // ── Autocomplete ──────────────────────────────────────────────────────────
  'relationship.autocompleteNoResult': { tr: 'Eşleşen model yok', en: 'No matching model' },
  'relationship.autocompleteAria': { tr: 'Model seçimi', en: 'Model selection' },
  'relationship.autocompleteClear': { tr: 'Seçimi temizle', en: 'Clear selection' }
};
