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
 * Ana pakete giren çeviri sözlüklerinin birleşimi. Yeni bir ekran çevrildiğinde
 * burada bir `*.i18n.ts` import'u eklenir ve spread edilir — anahtarlar tüm
 * dosyalarda benzersiz olmalıdır (namespace öneki bunu garanti eder, örn. 'login.*').
 *
 * YALNIZ TEK BİR LAZY EKRANIN kullandığı büyük sözlükler burada DEĞİL, o ekranın
 * parçasıyla iner (`i18n/lazy/*`, bkz. registerTranslations): `help.*` (tip/kural kılavuzu —
 * yalnız şema ekranı) ve `parameter.*` (yalnız Parametreler). İkisi ana paketin yaklaşık
 * 100 KB'ıydı. `design.*` (Tasarım sayfası + tasarımcılar) da aynı yoldan iner. Bir anahtarı başka bir ekranda da kullanmak gerekirse sözlüğü buraya geri
 * almak gerekir — yoksa o ekranda ham anahtar görünür. Testler tüm sözlükleri
 * `all-translations.ts` üzerinden denetler.
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
 * Lazy bir parçanın sözlüğünü çalışma anındaki sözlüğe ekler. `i18n/lazy/*` modülleri
 * bunu modül yüklenirken (bileşen oluşmadan önce) çağırır; tekrar çağrı zararsızdır.
 */
export function registerTranslations(dictionary: Translations): void {
  Object.assign(TRANSLATIONS, dictionary);
}

export type { TranslationEntry, Translations } from './translations.model';
