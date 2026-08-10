import {
  CronSpec,
  buildCron,
  defaultCronSpec,
  isShortMonthRisk,
  isValidCron,
  nextOccurrences,
  parseCron
} from './cron-builder';

/**
 * Zamanlama mantığının testleri.
 *
 * Bu hesap component'ten AYRI tutulduğu için TestBed olmadan çalıştırılabilir.
 * Asıl kazanç round-trip garantisi: kullanıcının kurduğu zamanlama kaydedilip
 * geri yüklendiğinde AYNI forma dönmeli — dönmezse ekran sessizce "Özel"e
 * düşer ve kullanıcı seçimini kaybeder.
 */
describe('cron-builder', () => {

  const spec = (overrides: Partial<CronSpec> = {}): CronSpec => ({
    ...defaultCronSpec(),
    ...overrides
  });

  describe('buildCron', () => {

    it('saatte bir: dakikayı sabitler, saati serbest bırakır', () => {
      expect(buildCron(spec({ frequency: 'hourly', minute: 30 }))).toBe('30 * * * *');
    });

    it('N saatte bir: saat alanına adım yazar', () => {
      expect(buildCron(spec({ frequency: 'everyNHours', minute: 0, hourInterval: 8 })))
        .toBe('0 */8 * * *');
    });

    it('her gün: saat ve dakikayı sabitler', () => {
      expect(buildCron(spec({ frequency: 'daily', minute: 15, hour: 3 }))).toBe('15 3 * * *');
    });

    it('N günde bir: ayın günü alanına adım yazar', () => {
      expect(buildCron(spec({ frequency: 'everyNDays', minute: 0, hour: 4, dayInterval: 2 })))
        .toBe('0 4 */2 * *');
    });

    it('haftada bir: haftanın gününü sabitler', () => {
      expect(buildCron(spec({ frequency: 'weekly', minute: 0, hour: 3, dayOfWeek: 1 })))
        .toBe('0 3 * * 1');
    });

    it('ayda bir: ayın gününü sabitler', () => {
      // Kullanıcının istediği örnek: her ayın 1'inde saat 12:00.
      expect(buildCron(spec({ frequency: 'monthly', minute: 0, hour: 12, dayOfMonth: 1 })))
        .toBe('0 12 1 * *');
    });

    it('özel: ham ifadeyi kırpar ve olduğu gibi kullanır', () => {
      expect(buildCron(spec({ frequency: 'custom', raw: '  5 1 * * 3  ' }))).toBe('5 1 * * 3');
    });

    it('aralık dışı değerleri sınırlara çeker', () => {
      expect(buildCron(spec({ frequency: 'daily', minute: 99, hour: -4 }))).toBe('59 0 * * *');
      expect(buildCron(spec({ frequency: 'monthly', minute: 0, hour: 0, dayOfMonth: 45 })))
        .toBe('0 0 31 * *');
    });
  });

  describe('parseCron', () => {

    it('boş ifadede varsayılana döner', () => {
      expect(parseCron('').frequency).toBe('daily');
      expect(parseCron(null).frequency).toBe('daily');
    });

    it('pazar için 7 gösterimini 0 ile eşitler', () => {
      const parsed = parseCron('0 3 * * 7');
      expect(parsed.frequency).toBe('weekly');
      expect(parsed.dayOfWeek).toBe(0);
    });

    it('tanınmayan ama geçerli ifadeyi özel moda düşürür ve ham hâlini korur', () => {
      const parsed = parseCron('0 6,18 * * *');
      expect(parsed.frequency).toBe('custom');
      expect(parsed.raw).toBe('0 6,18 * * *');
    });

    it('alan sayısı yanlışsa özel moda düşer', () => {
      expect(parseCron('0 3 * *').frequency).toBe('custom');
    });

    it('ay alanı kısıtlıysa özel moda düşer (bu altkümede üretilmez)', () => {
      expect(parseCron('0 3 1 6 *').frequency).toBe('custom');
    });
  });

  describe('round-trip (build → parse → build)', () => {

    const cases: CronSpec[] = [
      spec({ frequency: 'hourly', minute: 45 }),
      spec({ frequency: 'everyNHours', minute: 10, hourInterval: 6 }),
      spec({ frequency: 'daily', minute: 0, hour: 3 }),
      spec({ frequency: 'everyNDays', minute: 30, hour: 23, dayInterval: 3 }),
      spec({ frequency: 'weekly', minute: 0, hour: 5, dayOfWeek: 6 }),
      spec({ frequency: 'monthly', minute: 0, hour: 12, dayOfMonth: 1 }),
      spec({ frequency: 'monthly', minute: 15, hour: 2, dayOfMonth: 31 })
    ];

    cases.forEach(original => {
      it(`${original.frequency} seçimi kaydedilip geri yüklendiğinde korunur`, () => {
        const expression = buildCron(original);
        const reparsed = parseCron(expression);

        expect(reparsed.frequency).toBe(original.frequency);
        expect(buildCron(reparsed)).toBe(expression);
      });
    });
  });

  describe('isValidCron', () => {

    it('geçerli ifadeleri kabul eder', () => {
      ['0 3 * * *', '*/15 * * * *', '0 9-17/4 * * 1-5', '0 12 1 * *']
        .forEach(expr => expect(isValidCron(expr)).withContext(expr).toBe(true));
    });

    it('geçersiz ifadeleri reddeder', () => {
      ['', '0 3 * *', '0 99 * * *', 'abc 3 * * *', '0 17-9 * * *', '0 3 * * * *']
        .forEach(expr => expect(isValidCron(expr)).withContext(expr).toBe(false));
    });
  });

  describe('nextOccurrences', () => {

    // 5 Ağustos 2026, Çarşamba 10:17 — tüm beklentiler bu ana göre.
    const from = new Date(2026, 7, 5, 10, 17);

    const asText = (dates: Date[]): string[] =>
      dates.map(d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`);

    const pad = (n: number): string => String(n).padStart(2, '0');

    it('her gün 03:00', () => {
      expect(asText(nextOccurrences('0 3 * * *', from, 2)))
        .toEqual(['2026-08-06 03:00', '2026-08-07 03:00']);
    });

    it('8 saatte bir', () => {
      expect(asText(nextOccurrences('0 */8 * * *', from, 3)))
        .toEqual(['2026-08-05 16:00', '2026-08-06 00:00', '2026-08-06 08:00']);
    });

    it('her ayın 1\'inde 12:00', () => {
      expect(asText(nextOccurrences('0 12 1 * *', from, 2)))
        .toEqual(['2026-09-01 12:00', '2026-10-01 12:00']);
    });

    it('haftada bir pazartesi', () => {
      expect(asText(nextOccurrences('0 3 * * 1', from, 2)))
        .toEqual(['2026-08-10 03:00', '2026-08-17 03:00']);
    });

    it('ayın 31\'i seçildiğinde kısa ayları atlar', () => {
      expect(asText(nextOccurrences('0 2 31 * *', from, 3)))
        .toEqual(['2026-08-31 02:00', '2026-10-31 02:00', '2026-12-31 02:00']);
    });

    it('29 Şubat yalnızca artık yılda düşer', () => {
      expect(asText(nextOccurrences('0 0 29 2 *', from, 2)))
        .toEqual(['2028-02-29 00:00', '2032-02-29 00:00']);
    });

    it('şu anki dakikayı tekrar döndürmez', () => {
      const exact = new Date(2026, 7, 5, 3, 0);
      expect(asText(nextOccurrences('0 3 * * *', exact, 1))).toEqual(['2026-08-06 03:00']);
    });

    it('geçersiz ifadede boş dizi döner', () => {
      expect(nextOccurrences('bozuk', from, 3)).toEqual([]);
    });
  });

  describe('isShortMonthRisk', () => {

    it('ayın 29-31\'i seçildiğinde uyarır', () => {
      [29, 30, 31].forEach(day =>
        expect(isShortMonthRisk(spec({ frequency: 'monthly', dayOfMonth: day }))).toBe(true));
    });

    it('ayın 28 ve öncesinde uyarmaz', () => {
      expect(isShortMonthRisk(spec({ frequency: 'monthly', dayOfMonth: 28 }))).toBe(false);
    });

    it('aylık olmayan sıklıkta uyarmaz', () => {
      expect(isShortMonthRisk(spec({ frequency: 'daily', dayOfMonth: 31 }))).toBe(false);
    });
  });
});
