import { LayoutIssue, ScreenViewType } from '../utils/screen-layout/screen-layout.model';

// Backend Entities.DTOs.ScreenLayout ile birebir. Yerleşim belgesi API yüzeyinde HAM JSON
// METNİDİR; tipli hali utils/screen-layout'ta (parseFormLayout / parseListLayout).

/** Kayıt ekranlarının okuduğu yayındaki yerleşim — kullanıcının rolüne düşen tasarım (sunucu seçer). */
export interface PublishedScreenLayoutDto {
  layoutId: number;
  typeName: string;
  viewType: ScreenViewType;
  layoutJson: string;
  version: number;
}

/** Kayıtlı bir tasarım: görünümün varsayılanı ya da rollere atanmış adlandırılmış varyant (026). */
export interface ScreenLayoutViewStateDto {
  id: number;
  viewType: ScreenViewType;
  /** Varyantın adı (varsayılanda boş). */
  name: string | null;
  isDefault: boolean;
  /** Varyant önceliği — küçük olan önce denenir. */
  priority: number;
  roleIds: number[];
  exists: boolean;
  draftJson: string | null;
  publishedJson: string | null;
  publishedVersion: number;
  publishedOn: string | null;
  /** İyimser kilit — sonraki kayıtta `expectedLastModifiedOn` olarak geri gönderilir. */
  lastModifiedOn: string | null;
  hasUnpublishedChanges: boolean;
}

/** Tasarımcının açılış durumu — iki görünümün kayıtlı tüm tasarımları. */
export interface ScreenLayoutStateDto {
  typeName: string;
  /** Tenant migrasyonları 023 + 026 uygulanmış mı; değilse tasarımcı kaydedemez. */
  moduleInstalled: boolean;
  /** Varsayılan satırı yoksa listede de yoktur; tasarımcı onu bugünkü görünümden tohumlar. */
  layouts: ScreenLayoutViewStateDto[];
}

export interface SaveScreenLayoutDraftDto {
  /** null = görünümün varsayılan tasarımı (yoksa oluşturulur). */
  layoutId: number | null;
  typeName: string;
  viewType: ScreenViewType;
  layoutJson: string;
  /** null = "kayıtlı satır yok" varsayımı. */
  expectedLastModifiedOn: string | null;
}

export interface ScreenLayoutActionDto {
  layoutId: number | null;
  typeName: string;
  viewType: ScreenViewType;
  expectedLastModifiedOn: string | null;
}

/** Yazma sonucu. Hata yanıtının gövdesinde de `data` dolu gelir (sorunlar / çakışma). */
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

/** Sıralamadan sonra satırın yeni kilit damgası. */
export interface ScreenLayoutStampDto {
  layoutId: number;
  lastModifiedOn: string;
}

/** Tasarım sayfası kartı. */
export interface ScreenLayoutSummaryDto {
  typeName: string;
  formCount: number;
  listCount: number;
  /** Rollere atanmış varyant sayısı (varsayılan hariç). */
  variantCount: number;
  hasUnpublishedChanges: boolean;
}
