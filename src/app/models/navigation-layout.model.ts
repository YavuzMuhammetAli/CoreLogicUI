import { NavIssue } from '../utils/nav-layout/nav-layout.model';

// One to one with the backend Entities.DTOs.Navigation. On the API surface the document is RAW JSON TEXT;
// the typed form is in utils/nav-layout (parseNavLayout).

/** The published design that falls to the user, read by the sidebar. */
export interface MyNavigationLayoutDto {
  layoutId: number;
  layoutJson: string;
  version: number;
}

export interface NavigationLayoutSummaryDto {
  id: number;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
  priority: number;
  roleIds: number[];
  publishedVersion: number;
  publishedOn: string | null;
  lastModifiedOn: string;
  hasUnpublishedChanges: boolean;
}

export interface NavigationLayoutListDto {
  /** Whether tenant migration 026 is applied. */
  moduleInstalled: boolean;
  layouts: NavigationLayoutSummaryDto[];
}

export interface NavigationLayoutDetailDto extends NavigationLayoutSummaryDto {
  draftJson: string | null;
  publishedJson: string | null;
}

export interface CreateNavigationLayoutDto {
  name: string;
  layoutJson: string;
}

export interface SaveNavigationLayoutDraftDto {
  id: number;
  layoutJson: string;
  expectedLastModifiedOn: string | null;
}

export interface NavigationLayoutActionDto {
  id: number;
  expectedLastModifiedOn: string | null;
}

export interface UpdateNavigationLayoutMetaDto {
  id: number;
  name: string;
  roleIds: number[];
  isDefault: boolean;
  isEnabled: boolean;
}

/** Write result. `data` is also filled in the body of an error response (issues / conflict). */
export interface NavigationLayoutSaveResultDto {
  id: number;
  lastModifiedOn: string | null;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  draftJson: string | null;
  conflict: boolean;
  issues: NavIssue[];
}
