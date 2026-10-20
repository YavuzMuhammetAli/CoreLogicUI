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
import { DATATYPE_HELP_I18N } from './datatype-help.i18n';
import { PARAMETER_I18N } from './parameter.i18n';
import { AI_I18N } from './ai.i18n';
import { WORKFLOW_I18N } from './workflow.i18n';
import { NOTIFICATION_I18N } from './notification.i18n';
import { SCREEN_I18N } from './screen.i18n';

/**
 * Tüm özellik bazlı çeviri sözlüklerinin birleşimi. Yeni bir ekran çevrildiğinde
 * burada bir `*.i18n.ts` import'u eklenir ve spread edilir — anahtarlar tüm
 * dosyalarda benzersiz olmalıdır (namespace öneki bunu garanti eder, örn. 'login.*').
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
  ...DATATYPE_HELP_I18N,
  ...PARAMETER_I18N,
  ...AI_I18N,
  ...WORKFLOW_I18N,
  ...NOTIFICATION_I18N,
  ...SCREEN_I18N
};

export type { TranslationEntry, Translations } from './translations.model';
