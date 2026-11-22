/**
 * Screen design — types of the layout document (schemaVersion 1).
 *
 * The document is SEPARATE from the model's schema: it says where and at what width each field
 * sits, and does not touch the field's type/rules. The server (`ScreenLayoutValidator.cs`) validates the
 * same shape and stores it normalized; the rules on both sides are kept identical via shared vectors
 * (`screen-layout.vectors.json`).
 *
 * Documents are treated as IMMUTABLE: designer commands return new objects (undo /
 * redo only stores references).
 */

export const LAYOUT_SCHEMA_VERSION = 1;

/** The form grid has 12 columns; a field spans 1–12 columns. */
export const GRID_COLUMNS = 12;

/** Width of a newly placed field — the classic two-column business form. */
export const DEFAULT_FIELD_SPAN = 6;

export type ScreenViewType = 'form' | 'list';

/** The field's display widget: multi-line text (string only) or radio buttons (enum only). */
export type FieldWidget = 'multiline' | 'radio';

export type NoteTone = 'info' | 'warn';

export interface FieldItem {
  readonly kind: 'field';
  readonly id: string;
  readonly column: string;
  readonly span: number;
  /** The field starts on a new row (the space to its left is left deliberately). */
  readonly newRow?: boolean;
  readonly widget?: FieldWidget;
  /** Visible row count for multi-line text (2–20). */
  readonly rows?: number;
}

/** Deliberate empty space in a row. Not drawn on narrow screens. */
export interface SpacerItem {
  readonly kind: 'spacer';
  readonly id: string;
  readonly span: number;
  readonly newRow?: boolean;
}

/** Full-width horizontal divider line. */
export interface DividerItem {
  readonly kind: 'divider';
  readonly id: string;
}

/** An info / warning box the admin writes on the form (plain text). */
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
  /** If empty, the section is drawn without a title. */
  readonly title?: string;
  readonly collapsible?: boolean;
  /** Collapsed on open (meaningful only for a collapsible section). */
  readonly collapsed?: boolean;
  readonly items: readonly FormItem[];
}

export interface FormTab {
  readonly id: string;
  /** A single-tab form draws no tab bar; the title may be empty. */
  readonly title: string;
  readonly sections: readonly FormSection[];
}

export interface FormLayout {
  readonly schemaVersion: 1;
  readonly tabs: readonly FormTab[];
  /** Columns the admin hid on purpose. A column neither placed nor hidden is appended at the end. */
  readonly hiddenColumns: readonly string[];
}

export interface ListColumn {
  readonly column: string;
  /** Width in pixels (60–800); automatic if absent. */
  readonly width?: number;
}

export interface ListLayout {
  readonly schemaVersion: 1;
  /** A placed column is visible; its order is this array's order. */
  readonly columns: readonly ListColumn[];
}

export type ScreenLayout = FormLayout | ListLayout;

/** Same as the constants in the server-side `ScreenLayoutValidator`. */
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
 * Column facts for validation: the model's columns + the "cannot be hidden" decision (required and whose value
 * is not produced on the server). On the server `LayoutColumnFact` builds the same facts from the compiled type.
 */
export interface LayoutColumnFact {
  readonly name: string;
  readonly dataType: string;
  readonly mustStayVisible: boolean;
}

export type LayoutIssueCode =
  // Structural — always an error; not even a draft is saved.
  | 'unreadable' | 'tooLarge' | 'limit' | 'badId' | 'duplicateId' | 'badKind' | 'spanRange'
  | 'rowsRange' | 'textTooLong' | 'badTone' | 'widthRange' | 'noTabs'
  // Semantic — warning in draft, error on publish.
  | 'unknownColumn' | 'duplicateColumn' | 'requiredHidden' | 'emptyTab' | 'widgetType' | 'noColumns'
  // Info — never blocks.
  | 'unplacedColumn' | 'emptySection';

export type LayoutIssueSeverity = 'error' | 'warning';

export interface LayoutIssue {
  readonly code: LayoutIssueCode;
  readonly severity: LayoutIssueSeverity;
  /** Id of the tab/section/item the issue belongs to. */
  readonly targetId?: string;
  /** Name of the column the issue belongs to. */
  readonly column?: string;
}

export type LayoutValidationMode = 'draft' | 'publish';
