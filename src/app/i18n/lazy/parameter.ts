import { registerTranslations } from '../index';
import { PARAMETER_I18N } from '../parameter.i18n';

// Yan etkili modül: içe aktaran parça yüklenince sözlük eklenir (bkz. i18n/index.ts).
// Kullananlar: Parametreler ekranı ve sekmeleri.
registerTranslations(PARAMETER_I18N);
