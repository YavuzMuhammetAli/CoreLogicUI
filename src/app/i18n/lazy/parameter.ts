import { registerTranslations } from '../index';
import { PARAMETER_I18N } from '../parameter.i18n';

// Side-effect module: the dictionary is added when the importing chunk loads (see i18n/index.ts).
// Used by: the Parameters screen and its tabs.
registerTranslations(PARAMETER_I18N);
