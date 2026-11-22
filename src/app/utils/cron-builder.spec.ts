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
 * Tests for the scheduling logic.
 *
 * Since this computation is kept SEPARATE from the component, it runs without TestBed.
 * The real win is the round-trip guarantee: a schedule the user builds must come back
 * to the SAME form after saving and reloading — otherwise the screen silently falls back to "Özel" (Custom)
 * and the user loses their selection.
 */
describe('cron-builder', () => {

  const spec = (overrides: Partial<CronSpec> = {}): CronSpec => ({
    ...defaultCronSpec(),
    ...overrides
  });

  describe('buildCron', () => {

    it('hourly: fixes the minute, leaves the hour free', () => {
      expect(buildCron(spec({ frequency: 'hourly', minute: 30 }))).toBe('30 * * * *');
    });

    it('every N hours: writes a step into the hour field', () => {
      expect(buildCron(spec({ frequency: 'everyNHours', minute: 0, hourInterval: 8 })))
        .toBe('0 */8 * * *');
    });

    it('daily: fixes the hour and minute', () => {
      expect(buildCron(spec({ frequency: 'daily', minute: 15, hour: 3 }))).toBe('15 3 * * *');
    });

    it('every N days: writes a step into the day-of-month field', () => {
      expect(buildCron(spec({ frequency: 'everyNDays', minute: 0, hour: 4, dayInterval: 2 })))
        .toBe('0 4 */2 * *');
    });

    it('weekly: fixes the day of week', () => {
      expect(buildCron(spec({ frequency: 'weekly', minute: 0, hour: 3, dayOfWeek: 1 })))
        .toBe('0 3 * * 1');
    });

    it('monthly: fixes the day of month', () => {
      // The example the user asked for: on the 1st of every month at 12:00.
      expect(buildCron(spec({ frequency: 'monthly', minute: 0, hour: 12, dayOfMonth: 1 })))
        .toBe('0 12 1 * *');
    });

    it('custom: trims the raw expression and uses it as is', () => {
      expect(buildCron(spec({ frequency: 'custom', raw: '  5 1 * * 3  ' }))).toBe('5 1 * * 3');
    });

    it('clamps out-of-range values to the bounds', () => {
      expect(buildCron(spec({ frequency: 'daily', minute: 99, hour: -4 }))).toBe('59 0 * * *');
      expect(buildCron(spec({ frequency: 'monthly', minute: 0, hour: 0, dayOfMonth: 45 })))
        .toBe('0 0 31 * *');
    });
  });

  describe('parseCron', () => {

    it('returns the default for an empty expression', () => {
      expect(parseCron('').frequency).toBe('daily');
      expect(parseCron(null).frequency).toBe('daily');
    });

    it('maps the 7 notation for Sunday to 0', () => {
      const parsed = parseCron('0 3 * * 7');
      expect(parsed.frequency).toBe('weekly');
      expect(parsed.dayOfWeek).toBe(0);
    });

    it('falls back to custom mode for an unrecognized but valid expression, keeping it raw', () => {
      const parsed = parseCron('0 6,18 * * *');
      expect(parsed.frequency).toBe('custom');
      expect(parsed.raw).toBe('0 6,18 * * *');
    });

    it('falls back to custom mode when the field count is wrong', () => {
      expect(parseCron('0 3 * *').frequency).toBe('custom');
    });

    it('falls back to custom mode when the month field is restricted (not produced by this subset)', () => {
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
      it(`${original.frequency} selection survives save and reload`, () => {
        const expression = buildCron(original);
        const reparsed = parseCron(expression);

        expect(reparsed.frequency).toBe(original.frequency);
        expect(buildCron(reparsed)).toBe(expression);
      });
    });
  });

  describe('isValidCron', () => {

    it('accepts valid expressions', () => {
      ['0 3 * * *', '*/15 * * * *', '0 9-17/4 * * 1-5', '0 12 1 * *']
        .forEach(expr => expect(isValidCron(expr)).withContext(expr).toBe(true));
    });

    it('rejects invalid expressions', () => {
      ['', '0 3 * *', '0 99 * * *', 'abc 3 * * *', '0 17-9 * * *', '0 3 * * * *']
        .forEach(expr => expect(isValidCron(expr)).withContext(expr).toBe(false));
    });
  });

  describe('nextOccurrences', () => {

    // 5 August 2026, Wednesday 10:17 — all expectations are relative to this moment.
    const from = new Date(2026, 7, 5, 10, 17);

    const asText = (dates: Date[]): string[] =>
      dates.map(d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
        `${pad(d.getHours())}:${pad(d.getMinutes())}`);

    const pad = (n: number): string => String(n).padStart(2, '0');

    it('daily at 03:00', () => {
      expect(asText(nextOccurrences('0 3 * * *', from, 2)))
        .toEqual(['2026-08-06 03:00', '2026-08-07 03:00']);
    });

    it('every 8 hours', () => {
      expect(asText(nextOccurrences('0 */8 * * *', from, 3)))
        .toEqual(['2026-08-05 16:00', '2026-08-06 00:00', '2026-08-06 08:00']);
    });

    it('on the 1st of every month at 12:00', () => {
      expect(asText(nextOccurrences('0 12 1 * *', from, 2)))
        .toEqual(['2026-09-01 12:00', '2026-10-01 12:00']);
    });

    it('weekly on Monday', () => {
      expect(asText(nextOccurrences('0 3 * * 1', from, 2)))
        .toEqual(['2026-08-10 03:00', '2026-08-17 03:00']);
    });

    it('skips short months when the 31st is selected', () => {
      expect(asText(nextOccurrences('0 2 31 * *', from, 3)))
        .toEqual(['2026-08-31 02:00', '2026-10-31 02:00', '2026-12-31 02:00']);
    });

    it('29 February only occurs in leap years', () => {
      expect(asText(nextOccurrences('0 0 29 2 *', from, 2)))
        .toEqual(['2028-02-29 00:00', '2032-02-29 00:00']);
    });

    it('does not return the current minute again', () => {
      const exact = new Date(2026, 7, 5, 3, 0);
      expect(asText(nextOccurrences('0 3 * * *', exact, 1))).toEqual(['2026-08-06 03:00']);
    });

    it('returns an empty array for an invalid expression', () => {
      expect(nextOccurrences('bozuk', from, 3)).toEqual([]);
    });
  });

  describe('isShortMonthRisk', () => {

    it('warns when the 29th-31st is selected', () => {
      [29, 30, 31].forEach(day =>
        expect(isShortMonthRisk(spec({ frequency: 'monthly', dayOfMonth: day }))).toBe(true));
    });

    it('does not warn for the 28th or earlier', () => {
      expect(isShortMonthRisk(spec({ frequency: 'monthly', dayOfMonth: 28 }))).toBe(false);
    });

    it('does not warn for a non-monthly frequency', () => {
      expect(isShortMonthRisk(spec({ frequency: 'daily', dayOfMonth: 31 }))).toBe(false);
    });
  });
});
