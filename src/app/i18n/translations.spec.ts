import { TRANSLATIONS } from './index';

/**
 * Çeviri sözlüğünün bütünlük testi.
 *
 * NEDEN VAR: LanguageService.t() eksik bir anahtarda anahtarın KENDİSİNİ döner
 * (geliştirme kolaylığı için). Bu, eksikliği sessizleştirir — kullanıcı ekranda
 * kırmızı bir uyarı kutusu içinde literal "common.error" görene kadar hata fark
 * edilmez. Bu test tam olarak o durumu yakalar.
 */
describe('TRANSLATIONS', () => {
  const entries = Object.entries(TRANSLATIONS);

  it('boş değildir', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('her anahtar hem tr hem en karşılığı taşır', () => {
    const incomplete = entries
      .filter(([, value]) => !value?.tr?.trim() || !value?.en?.trim())
      .map(([key]) => key);

    expect(incomplete).withContext(`Eksik çeviri: ${incomplete.join(', ')}`).toEqual([]);
  });

  /**
   * Yer tutucusu ÇALIŞMA ZAMANINDA doldurulmayan, açıklama metninin parçası olan
   * anahtarlar. Bunlarda `{tablo}` → `{table}` gibi çeviri BEKLENİR; kural dışı
   * bırakılmazlarsa test yanlış alarm verir.
   *
   * Yeni bir anahtar buraya eklenmeden önce soru şudur: bu yer tutucu
   * `t(key, { ... })` çağrısıyla mı doluyor? Doluyorsa listeye EKLENMEMELİDİR.
   */
  const ILLUSTRATIVE_PLACEHOLDER_KEYS = new Set([
    'relationship.fieldJoinTableHelp',      // "{Kaynak}{Hedef}" — ad üretim kuralını anlatır
    'help.type.lookup.notes',               // "FK_{tablo}_{kolon}" — constraint adı örneği
    'help.rule.mechanismTree.desc',
    'help.rule.mechanismLookup.desc',
    'help.rule.mechanismRelationship.desc'
  ]);

  it('çalışma zamanı yer tutucuları iki dilde aynıdır', () => {
    // '{name}' gibi yer tutucular iki dilde de bulunmalı; biri unutulursa
    // o dilde parametre yerine ham "{name}" metni görünür.
    const placeholders = (text: string) =>
      (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort().join(',');

    const mismatched = entries
      .filter(([key]) => !ILLUSTRATIVE_PLACEHOLDER_KEYS.has(key))
      .filter(([, value]) => placeholders(value.tr) !== placeholders(value.en))
      .map(([key]) => key);

    expect(mismatched).withContext(`Yer tutucu uyuşmazlığı: ${mismatched.join(', ')}`).toEqual([]);
  });

  it('kodda kullanılan ortak anahtarlar tanımlıdır', () => {
    // Regresyon koruması: bu anahtarlar hata yollarında kullanılır ve eksik
    // olduklarında kullanıcı ham anahtar metnini görür.
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
    expect(missing).withContext(`Tanımsız anahtar: ${missing.join(', ')}`).toEqual([]);
  });

  it('deleted-* ekranlarının tamamı aynı anahtar setine sahiptir', () => {
    // Dört ekran tek generic component kullanır; component bu son ekleri
    // {prefix}.{suffix} olarak çözer. Biri eksikse o ekranda ham anahtar görünür.
    const prefixes = ['deleted.models', 'deleted.drafts', 'deleted.reports', 'deleted.dashboards'];
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
