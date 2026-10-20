import { LayoutIssue, ScreenViewType } from '../utils/screen-layout/screen-layout.model';

// Backend Entities.DTOs.ScreenLayout ile birebir. Yerleşim belgesi API yüzeyinde HAM JSON
// METNİDİR; tipli hali utils/screen-layout'ta (parseFormLayout / parseListLayout).

/** Kayıt ekranlarının okuduğu yayındaki yerleşim. */
export interface PublishedScreenLayoutDto {
  typeName: string;
  viewType: ScreenViewType;
  layoutJson: string;
  version: number;
}

export interface ScreenLayoutViewStateDto {
  viewType: ScreenViewType;
  /** Kayıtlı satır var mı; yoksa tasarımcı varsayılan belgeyle başlar. */
  exists: boolean;
  draftJson: string | null;
  publishedJson: string | null;
  publishedVersion: number;
  publishedOn: string | null;
  /** İyimser kilit — sonraki kayıtta `expectedLastModifiedOn` olarak geri gönderilir. */
  lastModifiedOn: string | null;
  hasUnpublishedChanges: boolean;
}

/** Tasarımcının açılış durumu — iki görünüm birlikte. */
export interface ScreenLayoutStateDto {
  typeName: string;
  /** Tenant migrasyonu 023 uygulanmış mı; değilse tasarımcı kaydedemez. */
  moduleInstalled: boolean;
  form: ScreenLayoutViewStateDto;
  list: ScreenLayoutViewStateDto;
}

export interface SaveScreenLayoutDraftDto {
  typeName: string;
  viewType: ScreenViewType;
  layoutJson: string;
  /** null = "kayıtlı satır yok" varsayımı. */
  expectedLastModifiedOn: string | null;
}

export interface ScreenLayoutActionDto {
  typeName: string;
  viewType: ScreenViewType;
  expectedLastModifiedOn: string | null;
}

/** Yazma sonucu. Hata yanıtının gövdesinde de `data` dolu gelir (sorunlar / çakışma). */
export interface ScreenLayoutSaveResultDto {
  lastModifiedOn: string | null;
  publishedVersion: number;
  hasUnpublishedChanges: boolean;
  draftJson: string | null;
  conflict: boolean;
  issues: LayoutIssue[];
}
