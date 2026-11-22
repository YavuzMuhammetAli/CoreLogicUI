import { ALL_TRANSLATIONS as TRANSLATIONS } from './all-translations';
import { NOTIFICATION_TEMPLATE_KINDS } from '../models/parameter.model';

/**
 * Integrity test of the translation dictionary.
 *
 * WHY IT EXISTS: LanguageService.t() returns the key ITSELF for a missing key
 * (as a development aid). That silences the gap — the bug goes unnoticed until the user
 * sees a literal "common.error" in a red alert box on screen.
 * This test catches exactly that case.
 */
describe('TRANSLATIONS', () => {
  const entries = Object.entries(TRANSLATIONS);

  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('every key has both a tr and an en value', () => {
    const incomplete = entries
      .filter(([, value]) => !value?.tr?.trim() || !value?.en?.trim())
      .map(([key]) => key);

    expect(incomplete).withContext(`Missing translation: ${incomplete.join(', ')}`).toEqual([]);
  });

  /**
   * Keys whose placeholder is NOT filled AT RUNTIME but is part of the description
   * text. In these, a translation like `{tablo}` → `{table}` is EXPECTED; if they are not
   * exempted, the test raises a false alarm.
   *
   * Before adding a new key here, the question is: is this placeholder filled
   * by a `t(key, { ... })` call? If so, it must NOT BE ADDED to the list.
   */
  const ILLUSTRATIVE_PLACEHOLDER_KEYS = new Set([
    'relationship.fieldJoinTableHelp',      // "{Kaynak}{Hedef}" — explains the name generation rule
    'help.type.lookup.notes',               // "FK_{tablo}_{kolon}" — constraint name example
    'help.rule.mechanismTree.desc',
    'help.rule.mechanismLookup.desc',
    'help.rule.mechanismRelationship.desc'
  ]);

  it('runtime placeholders are the same in both languages', () => {
    // Placeholders like '{name}' must exist in both languages; if one is forgotten,
    // the raw "{name}" text shows in that language instead of the parameter.
    const placeholders = (text: string) =>
      (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');

    const mismatched = entries
      .filter(([key]) => !ILLUSTRATIVE_PLACEHOLDER_KEYS.has(key))
      .filter(([, value]) => placeholders(value.tr) !== placeholders(value.en))
      .map(([key]) => key);

    expect(mismatched).withContext(`Placeholder mismatch: ${mismatched.join(', ')}`).toEqual([]);
  });

  it('common keys used in code are defined', () => {
    // Regression guard: these keys are used on error paths, and when they
    // are missing the user sees the raw key text.
    const required = [
      'common.error',
      'deleted.restore',
      'deleted.restoreFailed',
      'deleted.restoreServerError',
      'deleted.serverConnectionError',
      'relationship.deleteConfirmTitle',
      'relationship.deleteConfirmMessage',
      'relationship.flushTableNotFound'
    ];

    const missing = required.filter(key => !TRANSLATIONS[key]);
    expect(missing).withContext(`Undefined key: ${missing.join(', ')}`).toEqual([]);
  });

  it('labels of the notification template kinds are defined', () => {
    // The template tab resolves the kind name/hint as 'parameter.templates.kind(Hint).{Kind}';
    // if a new kind is added to the backend and this is forgotten, the raw key shows.
    const missing = NOTIFICATION_TEMPLATE_KINDS
      .flatMap(kind => [`parameter.templates.kind.${kind}`, `parameter.templates.kindHint.${kind}`])
      .filter(key => !TRANSLATIONS[key]);

    expect(missing).withContext(`Eksik: ${missing.join(', ')}`).toEqual([]);
  });

  it('all deleted-* screens have the same key set', () => {
    // The four screens use one generic component; the component resolves these suffixes
    // as {prefix}.{suffix}. If one is missing, the raw key shows on that screen.
    const prefixes = [
      'deleted.models', 'deleted.drafts', 'deleted.reports',
      'deleted.dashboards', 'deleted.workflows'
    ];
    const suffixes = [
      'backLink', 'title', 'refresh', 'loadingAria', 'loading',
      'empty', 'emptyHint', 'countSuffix', 'loadFailed',
      'restoreConfirm', 'restoreConfirmTitle', 'restoreSuccess'
    ];

    const missing: string[] = [];
    for (const prefix of prefixes)
      for (const suffix of suffixes)
        if (!TRANSLATIONS[`${prefix}.${suffix}`]) missing.push(`${prefix}.${suffix}`);

    expect(missing).withContext(`Eksik: ${missing.join(', ')}`).toEqual([]);
  });
});
