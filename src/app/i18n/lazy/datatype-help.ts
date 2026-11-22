import { registerTranslations } from '../index';
import { DATATYPE_HELP_I18N } from '../datatype-help.i18n';

// Side-effect module: the dictionary is added when the importing chunk loads (see i18n/index.ts).
// Used by: the schema screen (table-detail, model-node, datatype-help).
registerTranslations(DATATYPE_HELP_I18N);
