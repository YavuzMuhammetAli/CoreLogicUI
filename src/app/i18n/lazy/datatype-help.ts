import { registerTranslations } from '../index';
import { DATATYPE_HELP_I18N } from '../datatype-help.i18n';

// Yan etkili modül: içe aktaran parça yüklenince sözlük eklenir (bkz. i18n/index.ts).
// Kullananlar: şema ekranı (table-detail, model-node, datatype-help).
registerTranslations(DATATYPE_HELP_I18N);
