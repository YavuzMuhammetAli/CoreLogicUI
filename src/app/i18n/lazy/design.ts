import { registerTranslations } from '../index';
import { DESIGN_I18N } from '../design.i18n';

// Yan etkili modül: içe aktaran parça yüklenince sözlük eklenir (bkz. i18n/index.ts).
// Kullananlar: Tasarım sayfası, navigasyon tasarımcısı, ekran tasarımcısı (rol seçici ve
// tasarım ayarları diyaloğu yalnız bu ekranlarda).
registerTranslations(DESIGN_I18N);
