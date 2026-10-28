/**
 * Navigasyon (kenar çubuğu) tasarımı belgesi — schemaVersion 1.
 *
 * Admin olmayan kullanıcıların menüsü: kökte tek seviye klasörler ve bağlantılar. Belge sunucuda
 * `NavigationLayoutValidator` ile doğrulanıp normalize edilir; kurallar `nav-layout.validate.ts`
 * ile BİREBİR aynıdır (ortak vektörler: `nav-layout.vectors.json`).
 */

export const NAV_SCHEMA_VERSION = 1;

/** Menüye konabilen uygulama sayfaları. */
export type NavPage = 'tasks' | 'reports' | 'dashboards' | 'profile';
export const NAV_PAGES: readonly NavPage[] = ['tasks', 'reports', 'dashboards', 'profile'];

export interface NavModelLink {
  readonly kind: 'model';
  readonly id: string;
  readonly typeName: string;
  /** Boşsa modelin etiketi kullanılır. */
  readonly label?: string;
}

export interface NavDashboardLink {
  readonly kind: 'dashboard';
  readonly id: string;
  readonly dashboardId: number;
  /** Tasarım anında dashboard adından kopyalanır. */
  readonly label: string;
}

export interface NavReportLink {
  readonly kind: 'report';
  readonly id: string;
  readonly reportId: number;
  readonly label: string;
}

export interface NavPageLink {
  readonly kind: 'page';
  readonly id: string;
  readonly page: NavPage;
  /** Boşsa sayfanın çeviri anahtarındaki ad. */
  readonly label?: string;
}

export interface NavUrlLink {
  readonly kind: 'url';
  readonly id: string;
  /** Yalnız http(s) — `javascript:` vb. iki tarafta da reddedilir. */
  readonly url: string;
  readonly label: string;
  /** Model ikon kataloğundan ad. */
  readonly icon?: string;
}

export type NavLink = NavModelLink | NavDashboardLink | NavReportLink | NavPageLink | NavUrlLink;
export type NavLinkKind = NavLink['kind'];

export interface NavFolder {
  readonly kind: 'folder';
  readonly id: string;
  readonly label: string;
  /** Model ikon kataloğundan ad (ör. `folder`, `badge`). */
  readonly icon?: string;
  /** Kullanıcının menüsünde kapalı başlasın. */
  readonly collapsed?: boolean;
  /** Tek seviye: klasör içinde klasör yapısal hatadır. */
  readonly children: readonly NavLink[];
}

export type NavNode = NavFolder | NavLink;

export interface NavLayout {
  readonly schemaVersion: 1;
  /** Tasarıma yerleştirilmemiş, kullanıcının görebildiği modeller sona "Diğer modeller" klasöründe eklenir. */
  readonly appendUnplaced: boolean;
  readonly items: readonly NavNode[];
}

export const NAV_LIMITS = {
  maxBytes: 64 * 1024,
  maxFolders: 40,
  maxNodes: 300,
  maxLabel: 60,
  maxUrl: 500
} as const;

export type NavIssueCode =
  // Yapısal — her zaman hata
  | 'unreadable' | 'tooLarge' | 'limit' | 'badId' | 'duplicateId' | 'badKind' | 'textTooLong'
  | 'badUrl' | 'badIcon' | 'badPage' | 'badTarget' | 'nestedFolder'
  // Anlamsal — taslakta uyarı, yayında hata
  | 'emptyLabel' | 'unknownModel' | 'unknownTarget' | 'duplicateModel'
  // Bilgi
  | 'emptyFolder';

export type NavIssueSeverity = 'error' | 'warning';
export type NavValidationMode = 'draft' | 'publish';

export interface NavIssue {
  readonly code: NavIssueCode;
  readonly severity: NavIssueSeverity;
  readonly targetId?: string;
}

/** Doğrulamanın dış bilgisi; null küme o denetimi atlar. */
export interface NavFacts {
  readonly models: ReadonlySet<string> | null;
  readonly dashboards: ReadonlySet<number> | null;
  readonly reports: ReadonlySet<number> | null;
}

export const EMPTY_NAV_LAYOUT: NavLayout = { schemaVersion: 1, appendUnplaced: true, items: [] };
