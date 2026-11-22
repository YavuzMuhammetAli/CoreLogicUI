import { Lang } from '../services/language.service';

/**
 * Number/date formatting according to the active UI language.
 *
 * Why it is needed: formatters were built with a hard-coded `'tr-TR'` in three separate
 * files (chart-mapping, chart.component, report-viewer). Since the app switches between
 * TR/EN, numbers and dates still appeared in Turkish format in EN mode
 * (1.234,56 and "1 Ağu 2026").
 *
 * Building an `Intl.*Format` is expensive; instances are created once per language and
 * cached (chart formatters are called for every data point).
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

/** Date + time (where the time matters, e.g. a timer's due date). */
export function formatDateTime(value: Date, lang: Lang): string {
  let formatter = dateTimeFormatters.get(lang);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALES[lang], { dateStyle: 'medium', timeStyle: 'short' });
    dateTimeFormatters.set(lang, formatter);
  }
  return formatter.format(value);
}
