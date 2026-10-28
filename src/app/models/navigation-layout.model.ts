import { NavIssue } from '../utils/nav-layout/nav-layout.model';

// Backend Entities.DTOs.Navigation ile birebir. Belge API yüzeyinde HAM JSON METNİDİR;
// tipli hali utils/nav-layout'ta (parseNavLayout).

/** Kenar çubuğunun okuduğu, kullanıcıya düşen yayındaki tasarım. */
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
  /** Tenant migrasyonu 026 uygulanmış mı. */
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

/** Yazma sonucu. Hata yanıtının gövdesinde de `data` dolu gelir (sorunlar / çakışma). */
export interface NavigationLayoutSaveResultDto {
  id: number;
  lastModifiedOn: string | null;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  draftJson: string | null;
  conflict: boolean;
  issues: NavIssue[];
}
