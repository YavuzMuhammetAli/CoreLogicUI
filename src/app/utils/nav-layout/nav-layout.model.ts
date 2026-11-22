/**
 * Navigation (sidebar) design document — schemaVersion 1.
 *
 * The menu for non-admin users: single-level folders and links at the root. On the server the document is
 * validated and normalized by `NavigationLayoutValidator`; the rules are IDENTICAL to
 * `nav-layout.validate.ts` (shared vectors: `nav-layout.vectors.json`).
 */

export const NAV_SCHEMA_VERSION = 1;

/** App pages that can be put in the menu. */
export type NavPage = 'tasks' | 'reports' | 'dashboards' | 'profile';
export const NAV_PAGES: readonly NavPage[] = ['tasks', 'reports', 'dashboards', 'profile'];

export interface NavModelLink {
  readonly kind: 'model';
  readonly id: string;
  readonly typeName: string;
  /** If empty, the model's label is used. */
  readonly label?: string;
}

export interface NavDashboardLink {
  readonly kind: 'dashboard';
  readonly id: string;
  readonly dashboardId: number;
  /** Copied from the dashboard name at design time. */
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
  /** If empty, the name from the page's translation key. */
  readonly label?: string;
}

export interface NavUrlLink {
  readonly kind: 'url';
  readonly id: string;
  /** http(s) only — `javascript:` etc. are rejected on both sides. */
  readonly url: string;
  readonly label: string;
  /** A name from the model icon catalog. */
  readonly icon?: string;
}

export type NavLink = NavModelLink | NavDashboardLink | NavReportLink | NavPageLink | NavUrlLink;
export type NavLinkKind = NavLink['kind'];

export interface NavFolder {
  readonly kind: 'folder';
  readonly id: string;
  readonly label: string;
  /** A name from the model icon catalog (e.g. `folder`, `badge`). */
  readonly icon?: string;
  /** Starts collapsed in the user's menu. */
  readonly collapsed?: boolean;
  /** Single level: a folder inside a folder is a structural error. */
  readonly children: readonly NavLink[];
}

export type NavNode = NavFolder | NavLink;

export interface NavLayout {
  readonly schemaVersion: 1;
  /** Models visible to the user but not placed in the design are appended at the end in a "Diğer modeller" (Other models) folder. */
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
  // Structural — always an error
  | 'unreadable' | 'tooLarge' | 'limit' | 'badId' | 'duplicateId' | 'badKind' | 'textTooLong'
  | 'badUrl' | 'badIcon' | 'badPage' | 'badTarget' | 'nestedFolder'
  // Semantic — warning in draft, error on publish
  | 'emptyLabel' | 'unknownModel' | 'unknownTarget' | 'duplicateModel'
  // Info
  | 'emptyFolder';

export type NavIssueSeverity = 'error' | 'warning';
export type NavValidationMode = 'draft' | 'publish';

export interface NavIssue {
  readonly code: NavIssueCode;
  readonly severity: NavIssueSeverity;
  readonly targetId?: string;
}

/** External facts for validation; a null set skips that check. */
export interface NavFacts {
  readonly models: ReadonlySet<string> | null;
  readonly dashboards: ReadonlySet<number> | null;
  readonly reports: ReadonlySet<number> | null;
}

export const EMPTY_NAV_LAYOUT: NavLayout = { schemaVersion: 1, appendUnplaced: true, items: [] };
