import { Translations } from './translations.model';

/**
 * Ekran tasarımı — kayıt formunun/listenin yayındaki yerleşimi ve tasarımcı ekranı.
 * (`layout.*` app shell'e ait olduğu için önek `screen.*`.)
 */
export const SCREEN_I18N: Translations = {
  // shared/record-layout — çalışma anı
  'screen.form.tabsAria': { tr: 'Form sekmeleri', en: 'Form tabs' },
  'screen.form.untitledTab': { tr: 'Sekme {n}', en: 'Tab {n}' },
  'screen.form.untitledSection': { tr: 'Bölüm', en: 'Section' },
  'screen.form.tabErrorsAria': { tr: '{count} hatalı alan', en: '{count} invalid field(s)' },
  'screen.form.staleNotice': {
    tr: 'Ekran tasarımı güncel değil: {count} yeni alan formun sonuna eklendi.',
    en: 'The screen design is out of date: {count} new field(s) were added at the end of the form.'
  },
  'screen.form.design': { tr: 'Tasarla', en: 'Design' },

  // Kayıt ekranlarındaki giriş düğmesi (admin)
  'screen.designScreen': { tr: 'Ekranı tasarla', en: 'Design screen' },
  'screen.designScreenAria': {
    tr: 'Bu modelin form ve liste yerleşimini tasarla',
    en: 'Design the form and list layout of this model'
  }
};
