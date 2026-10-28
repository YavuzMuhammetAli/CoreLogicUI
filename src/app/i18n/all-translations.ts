import { Translations } from './translations.model';
import { TRANSLATIONS } from './index';
import { DATATYPE_HELP_I18N } from './datatype-help.i18n';
import { PARAMETER_I18N } from './parameter.i18n';
import { DESIGN_I18N } from './design.i18n';

/**
 * Ana paketteki ve lazy yüklenen TÜM sözlükler — yalnız testler içindir (uygulama koduna
 * import etme: lazy sözlükleri ana pakete geri çeker).
 */
export const LAZY_TRANSLATIONS: Translations = { ...DATATYPE_HELP_I18N, ...PARAMETER_I18N, ...DESIGN_I18N };

export const ALL_TRANSLATIONS: Translations = { ...TRANSLATIONS, ...LAZY_TRANSLATIONS };
