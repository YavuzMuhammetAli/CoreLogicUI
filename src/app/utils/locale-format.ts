import { Lang } from '../services/language.service';

/**
 * Aktif arayüz diline göre sayı/tarih biçimlendirme.
 *
 * Neden gerekli: biçimlendiriciler projede üç ayrı dosyada `'tr-TR'` sabitiyle
 * kuruluyordu (chart-mapping, chart.component, report-viewer). Uygulama TR/EN
 * arasında geçiş yaptığı için EN modunda sayılar ve tarihler yine Türkçe
 * biçimde görünüyordu (1.234,56 ve "1 Ağu 2026").
 *
 * `Intl.*Format` kurulumu pahalıdır; örnekler dil başına bir kez üretilip
 * saklanır (grafik formatter'ları her veri noktası için çağrılır).
 */

const LOCALES: Record<Lang, string> = { tr: 'tr-TR', en: 'en-US' };

const numberFormatters = new Map<Lang, Intl.NumberFormat>();
const dateFormatters = new Map<Lang, Intl.DateTimeFormat>();

export function numberFormatter(lang: Lang): Intl.NumberFormat {
  let formatter = numberFormatters.get(lang);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALES[lang]);
    numberFormatters.set(lang, formatter);
  }
  return formatter;
}

export function dateFormatter(lang: Lang): Intl.DateTimeFormat {
  let formatter = dateFormatters.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium' });
    dateFormatters.set(lang, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, lang: Lang): string {
  return numberFormatter(lang).format(value);
}

export function formatDate(value: Date, lang: Lang): string {
  return dateFormatter(lang).format(value);
}

const dateTimeFormatters = new Map<Lang, Intl.DateTimeFormat>();

/** Tarih + saat (bekleme vadesi gibi saatin önemli olduğu yerler). */
export function formatDateTime(value: Date, lang: Lang): string {
  let formatter = dateTimeFormatters.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeStyle: 'short' });
    dateTimeFormatters.set(lang, formatter);
  }
  return formatter.format(value);
}
