import { registerTranslations } from '../index';
import { DESIGN_I18N } from '../design.i18n';

// Side-effect module: the dictionary is added when the importing chunk loads (see i18n/index.ts).
// Used by: the Design page, navigation designer, screen designer (the role picker and the
// design settings dialog appear only on these screens).
registerTranslations(DESIGN_I18N);
