import { LayoutIssue, ScreenViewType } from '../utils/screen-layout/screen-layout.model';

// One to one with the backend Entities.DTOs.ScreenLayout. On the API surface the layout document is RAW JSON
// TEXT; the typed form is in utils/screen-layout (parseFormLayout / parseListLayout).

/** The published layout read by the record screens — the design that falls to the user's role (picked by the server). */
export interface PublishedScreenLayoutDto {
  layoutId: number;
  typeName: string;
  viewType: ScreenViewType;
  layoutJson: string;
  version: number;
}

/** A saved design: the view's default or a named variant assigned to roles (026). */
export interface ScreenLayoutViewStateDto {
  id: number;
  viewType: ScreenViewType;
  /** Name of the variant (empty for the default). */
  name: string | null;
  isDefault: boolean;
  /** Variant priority — lower is tried first. */
  priority: number;
  roleIds: number[];
  exists: boolean;
  draftJson: string | null;
  publishedJson: string | null;
  publishedVersion: number;
  publishedOn: string | null;
  /** Optimistic lock — sent back as `expectedLastModifiedOn` on the next save. */
  lastModifiedOn: string | null;
  hasUnpublishedChanges: boolean;
}

/** The designer's initial state — all saved designs of the two views. */
export interface ScreenLayoutStateDto {
  typeName: string;
  /** Whether tenant migrations 023 + 026 are applied; if not, the designer cannot save. */
  moduleInstalled: boolean;
  /** If there is no default row, it is not in the list either; the designer seeds it from the current view. */
  layouts: ScreenLayoutViewStateDto[];
}

export interface SaveScreenLayoutDraftDto {
  /** null = the view's default design (created if missing). */
  layoutId: number | null;
  typeName: string;
  viewType: ScreenViewType;
  layoutJson: string;
  /** null = "no saved row" assumption. */
  expectedLastModifiedOn: string | null;
}

export interface ScreenLayoutActionDto {
  layoutId: number | null;
  typeName: string;
  viewType: ScreenViewType;
  expectedLastModifiedOn: string | null;
}

/** Write result. `data` is also filled in the body of an error response (issues / conflict). */
export interface ScreenLayoutSaveResultDto {
  layoutId: number | null;
  lastModifiedOn: string | null;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  draftJson: string | null;
  conflict: boolean;
  issues: LayoutIssue[];
}

export interface CreateScreenLayoutVariantDto {
  typeName: string;
  viewType: ScreenViewType;
  name: string;
  roleIds: number[];
  layoutJson: string;
}

export interface UpdateScreenLayoutVariantDto {
  layoutId: number;
  name: string;
  roleIds: number[];
  expectedLastModifiedOn: string | null;
}

export interface ReorderScreenLayoutVariantsDto {
  typeName: string;
  viewType: ScreenViewType;
  orderedIds: number[];
}

/** The row's new lock stamp after reordering. */
export interface ScreenLayoutStampDto {
  layoutId: number;
  lastModifiedOn: string;
}

/** Design page card. */
export interface ScreenLayoutSummaryDto {
  typeName: string;
  formCount: number;
  listCount: number;
  /** Number of variants assigned to roles (excluding the default). */
  variantCount: number;
  hasUnpublishedChanges: boolean;
}
