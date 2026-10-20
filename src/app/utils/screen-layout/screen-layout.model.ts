/**
 * Ekran tasarımı — yerleşim belgesinin tipleri (schemaVersion 1).
 *
 * Belge modelin şemasından AYRIDIR: hangi alanın nerede ve ne genişlikte duracağını
 * söyler, alanın tipine/kuralına dokunmaz. Sunucu (`ScreenLayoutValidator.cs`) aynı
 * şekli doğrular ve normalize ederek saklar; iki tarafın kuralları ortak vektörlerle
 * (`screen-layout.vectors.json`) birebir tutulur.
 *
 * Belgeler DEĞİŞMEZ kabul edilir: tasarımcı komutları yeni nesne döndürür (geri al /
 * yinele yalnız referans saklar).
 */

export const LAYOUT_SCHEMA_VERSION = 1;

/** Form ızgarası 12 kolondur; bir alanın genişliği 1–12 kolon. */
export const GRID_COLUMNS = 12;

/** Yeni yerleştirilen alanın genişliği — iki kolonlu klasik iş formu. */
export const DEFAULT_FIELD_SPAN = 6;

export type ScreenViewType = 'form' | 'list';

/** Alanın gösterim biçimi: çok satırlı metin (yalnız string) ya da seçenek düğmeleri (yalnız enum). */
export type FieldWidget = 'multiline' | 'radio';

export type NoteTone = 'info' | 'warn';

export interface FieldItem {
  readonly kind: 'field';
  readonly id: string;
  readonly column: string;
  readonly span: number;
  /** Alan yeni bir satırda başlar (solundaki boşluk bilinçli bırakılır). */
  readonly newRow?: boolean;
  readonly widget?: FieldWidget;
  /** Çok satırlı metinde görünen satır sayısı (2–20). */
  readonly rows?: number;
}

/** Satırda bilinçli boş yer. Dar ekranda çizilmez. */
export interface SpacerItem {
  readonly kind: 'spacer';
  readonly id: string;
  readonly span: number;
  readonly newRow?: boolean;
}

/** Tam genişlikte yatay ayırıcı çizgi. */
export interface DividerItem {
  readonly kind: 'divider';
  readonly id: string;
}

/** Admin'in forma yazdığı açıklama / uyarı kutusu (düz metin). */
export interface NoteItem {
  readonly kind: 'note';
  readonly id: string;
  readonly text: string;
  readonly tone: NoteTone;
  readonly span: number;
  readonly newRow?: boolean;
}

export type FormItem = FieldItem | SpacerItem | DividerItem | NoteItem;

export interface FormSection {
  readonly id: string;
  /** Boşsa bölüm başlıksız çizilir. */
  readonly title?: string;
  readonly collapsible?: boolean;
  /** Açılışta kapalı (yalnız katlanabilir bölümde anlamlı). */
  readonly collapsed?: boolean;
  readonly items: readonly FormItem[];
}

export interface FormTab {
  readonly id: string;
  /** Tek sekmeli formda sekme çubuğu çizilmez; başlık boş olabilir. */
  readonly title: string;
  readonly sections: readonly FormSection[];
}

export interface FormLayout {
  readonly schemaVersion: 1;
  readonly tabs: readonly FormTab[];
  /** Admin'in bilerek gizlediği kolonlar. Ne yerleştirilmiş ne gizlenmiş kolon sona eklenir. */
  readonly hiddenColumns: readonly string[];
}

export interface ListColumn {
  readonly column: string;
  /** Piksel genişlik (60–800); yoksa otomatik. */
  readonly width?: number;
}

export interface ListLayout {
  readonly schemaVersion: 1;
  /** Yerleştirilen kolon görünür, sırası bu dizinin sırası. */
  readonly columns: readonly ListColumn[];
}

export type ScreenLayout = FormLayout | ListLayout;

/** Sunucudaki `ScreenLayoutValidator` sabitleriyle aynı. */
export const LAYOUT_LIMITS = {
  maxBytes: 64 * 1024,
  maxTabs: 12,
  maxSections: 60,
  maxItems: 400,
  maxListColumns: 100,
  maxTitleLength: 120,
  maxNoteLength: 1000,
  minRows: 2,
  maxRows: 20,
  minWidth: 60,
  maxWidth: 800
} as const;

/**
 * Doğrulamanın kolon bilgisi: modelin kolonları + "gizlenemez" kararı (zorunlu ve değeri
 * sunucuda üretilmeyen). Sunucuda `LayoutColumnFact` aynı bilgiyi derlenmiş tipten kurar.
 */
export interface LayoutColumnFact {
  readonly name: string;
  readonly dataType: string;
  readonly mustStayVisible: boolean;
}

export type LayoutIssueCode =
  // Yapısal — her zaman hata; taslak da kaydedilmez.
  | 'unreadable' | 'tooLarge' | 'limit' | 'badId' | 'duplicateId' | 'badKind' | 'spanRange'
  | 'rowsRange' | 'textTooLong' | 'badTone' | 'widthRange' | 'noTabs'
  // Anlamsal — taslakta uyarı, yayında hata.
  | 'unknownColumn' | 'duplicateColumn' | 'requiredHidden' | 'emptyTab' | 'widgetType' | 'noColumns'
  // Bilgi — hiçbir zaman engellemez.
  | 'unplacedColumn' | 'emptySection';

export type LayoutIssueSeverity = 'error' | 'warning';

export interface LayoutIssue {
  readonly code: LayoutIssueCode;
  readonly severity: LayoutIssueSeverity;
  /** Sorunun bağlı olduğu sekme/bölüm/öğe kimliği. */
  readonly targetId?: string;
  /** Sorunun bağlı olduğu kolon adı. */
  readonly column?: string;
}

export type LayoutValidationMode = 'draft' | 'publish';
