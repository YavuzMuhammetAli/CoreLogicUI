import { Translations } from './translations.model';
import { COMMON_I18N } from './common.i18n';
import { LAYOUT_I18N } from './layout.i18n';
import { LOGIN_I18N } from './login.i18n';
import { REGISTER_COMPANY_I18N } from './register-company.i18n';
import { REPORT_I18N } from './report.i18n';
import { SHARED_I18N } from './shared.i18n';
import { MODEL_I18N } from './model.i18n';
import { ADMIN_I18N } from './admin.i18n';
import { PERMISSION_I18N } from './permission.i18n';
import { DASHBOARD_I18N } from './dashboard.i18n';
import { PROFILE_I18N } from './profile.i18n';
import { RELATIONSHIP_I18N } from './relationship.i18n';
import { USER_I18N } from './user.i18n';
import { AI_I18N } from './ai.i18n';
import { WORKFLOW_I18N } from './workflow.i18n';
import { NOTIFICATION_I18N } from './notification.i18n';
import { SCREEN_I18N } from './screen.i18n';

/**
 * Union of the translation dictionaries that go into the main bundle. When a new screen is translated,
 * a `*.i18n.ts` import is added here and spread — keys must be unique across all
 * files (the namespace prefix guarantees this, e.g. 'login.*').
 *
 * Large dictionaries used by ONLY ONE LAZY SCREEN are NOT here; they load with that screen's
 * chunk (`i18n/lazy/*`, see registerTranslations): `help.*` (type/rule guide —
 * schema screen only) and `parameter.*` (Parametreler (Parameters) only). The two were about
 * 100 KB of the main bundle. `design.*` (Design page + designers) loads the same way too. If a key is also needed on another screen, the dictionary must be moved back
 * here — otherwise the raw key shows on that screen. Tests check all dictionaries
 * through `all-translations.ts`.
 */
export const TRANSLATIONS: Translations = {
  ...COMMON_I18N,
  ...LAYOUT_I18N,
  ...LOGIN_I18N,
  ...REGISTER_COMPANY_I18N,
  ...REPORT_I18N,
  ...SHARED_I18N,
  ...MODEL_I18N,
  ...ADMIN_I18N,
  ...PERMISSION_I18N,
  ...DASHBOARD_I18N,
  ...PROFILE_I18N,
  ...RELATIONSHIP_I18N,
  ...USER_I18N,
  ...AI_I18N,
  ...WORKFLOW_I18N,
  ...NOTIFICATION_I18N,
  ...SCREEN_I18N
};

/**
 * Adds a lazy chunk's dictionary to the runtime dictionary. `i18n/lazy/*` modules
 * call it while the module loads (before the component is created); calling it again is harmless.
 */
export function registerTranslations(dictionary: Translations): void {
  Object.assign(TRANSLATIONS, dictionary);
}

export type { TranslationEntry, Translations } from './translations.model';
