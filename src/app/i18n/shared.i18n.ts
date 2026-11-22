import { Translations } from './translations.model';

/**
 * Static texts specific to the shared components under `components/shared/*`
 * (e.g. the column-visibility popover). General keys already defined in `common.i18n.ts`
 * (save, cancel, delete etc.) are not redefined here.
 */
export const SHARED_I18N: Translations = {
  // column-visibility.component.html/.ts
  'shared.columnVisibility.toggleLabel': { tr: 'Kolonları yönet', en: 'Manage columns' },
  'shared.columnVisibility.buttonLabel': { tr: 'Kolonlar', en: 'Columns' },
  'shared.columnVisibility.menuLabel': { tr: 'Kolon görünürlüğü', en: 'Column visibility' },
  'shared.columnVisibility.header': { tr: 'Görünür Kolonlar', en: 'Visible Columns' },
  'shared.columnVisibility.requiredBadge': { tr: 'zorunlu', en: 'required' },
  'shared.columnVisibility.empty': { tr: 'Bu modelde kolon bulunmuyor.', en: 'There are no columns in this model.' },
  'shared.columnVisibility.minOneHint': { tr: 'En az bir kolon seçili olmalı.', en: 'At least one column must be selected.' },
  'shared.columnVisibility.savingLabel': { tr: 'Kaydediliyor', en: 'Saving' }
};
