/**
 * Yedekleme zamanlaması için cron üretimi/çözümlemesi.
 *
 * Kullanıcı cron yazmaz: sıklık tipi + saat/gün seçer, buradaki saf fonksiyonlar
 * 5 alanlı cron ifadesine çevirir. Backend (`Core.Utilities.Scheduling.CronSchedule`)
 * aynı altkümeyi yorumlar — üretim ve tüketim tek sözleşmede buluşur.
 *
 * Tamamı saf (yan etkisiz) ve `cron-builder.spec.ts` ile test edilir; component'te
 * hiç zamanlama mantığı kalmaz.
 */

/** Desteklenen sıklık tipleri — ekrandaki seçim kutusunun değerleri. */
export type CronFrequency =
  | 'hourly'      // saatte bir
  | 'everyNHours' // N saatte bir
  | 'daily'       // her gün
  | 'everyNDays'  // N günde bir
  | 'weekly'      // haftada bir
  | 'monthly'     // ayda bir
  | 'custom';     // ham cron

/** Sıklık seçicisinin gösterim sırası. */
export const CRON_FREQUENCIES: readonly CronFrequency[] = [
  'hourly', 'everyNHours', 'daily', 'everyNDays', 'weekly', 'monthly', 'custom'
];

/** "N saatte bir" için sunulan aralıklar — 24'ü tam bölenler seçildi ki
 *  gün içindeki koşu saatleri her gün aynı kalsın. */
export const HOUR_INTERVALS: readonly number[] = [2, 3, 4, 6, 8, 12];

/** Zamanlamanın yapılandırılmış hali — form bu nesneyi tutar. */
export interface CronSpec {
  frequency: CronFrequency;
  /** 0-59 — tüm sıklıklarda kullanılır. */
  minute: number;
  /** 0-23 — hourly/everyNHours dışında kullanılır. */
  hour: number;
  /** everyNHours için saat aralığı. */
  hourInterval: number;
  /** everyNDays için gün aralığı. */
  dayInterval: number;
  /** weekly için haftanın günü (0 = Pazar … 6 = Cumartesi). */
  dayOfWeek: number;
  /** monthly için ayın günü (1-31). */
  dayOfMonth: number;
  /** custom için ham cron ifadesi. */
  raw: string;
}

/** Makul bir başlangıç: her gün gece 03:00 (yoğunluk dışı saat). */
export function defaultCronSpec(): CronSpec {
  return {
    frequency: 'daily',
    minute: 0,
    hour: 3,
    hourInterval: 8,
    dayInterval: 2,
    dayOfWeek: 1,
    dayOfMonth: 1,
    raw: '0 3 * * *'
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : min;

/** Yapılandırılmış seçimden 5 alanlı cron ifadesi üretir. */
export function buildCron(spec: CronSpec): string {
  const minute = clamp(spec.minute, 0, 59);
  const hour = clamp(spec.hour, 0, 23);

  switch (spec.frequency) {
    case 'hourly':
      return `${minute} * * * *`;

    case 'everyNHours':
      return `${minute} */${clamp(spec.hourInterval, 1, 23)} * * *`;

    case 'daily':
      return `${minute} ${hour} * * *`;

    case 'everyNDays':
      return `${minute} ${hour} */${clamp(spec.dayInterval, 1, 31)} * *`;

    case 'weekly':
      return `${minute} ${hour} * * ${clamp(spec.dayOfWeek, 0, 6)}`;

    case 'monthly':
      return `${minute} ${hour} ${clamp(spec.dayOfMonth, 1, 31)} * *`;

    case 'custom':
      return spec.raw.trim();
  }
}

/**
 * Kaydedilmiş cron'u yapılandırılmış forma geri çevirir.
 *
 * Tanınmayan (ama geçerli) bir ifade bilgi kaybına uğramasın diye 'custom'
 * moduna düşer ve ham hâliyle korunur.
 */
export function parseCron(expression: string | null | undefined): CronSpec {
  const base = defaultCronSpec();
  const expr = (expression ?? '').trim();
  if (!expr) return base;

  base.raw = expr;

  const fields = expr.split(/\s+/);
  if (fields.length !== 5) return { ...base, frequency: 'custom' };

  const [min, hr, dom, month, dow] = fields;

  // Ay alanı her zaman '*' olmalı; değilse bizim üretmediğimiz bir ifadedir.
  const minute = parseSingle(min);
  if (minute === null || month !== '*') return { ...base, frequency: 'custom' };
  base.minute = minute;

  // Saatte bir: dakika sabit, saat serbest.
  if (hr === '*' && dom === '*' && dow === '*') {
    return { ...base, frequency: 'hourly' };
  }

  // N saatte bir.
  const hourStep = parseStep(hr);
  if (hourStep !== null && dom === '*' && dow === '*') {
    return { ...base, frequency: 'everyNHours', hourInterval: hourStep };
  }

  const hour = parseSingle(hr);
  if (hour === null) return { ...base, frequency: 'custom' };
  base.hour = hour;

  // Her gün.
  if (dom === '*' && dow === '*') {
    return { ...base, frequency: 'daily' };
  }

  // N günde bir.
  const dayStep = parseStep(dom);
  if (dayStep !== null && dow === '*') {
    return { ...base, frequency: 'everyNDays', dayInterval: dayStep };
  }

  // Haftada bir.
  if (dom === '*') {
    const weekday = parseSingle(dow);
    // Cron'da 7 de Pazar'dır; tek gösterime indirgenir.
    if (weekday !== null && weekday >= 0 && weekday <= 7) {
      return { ...base, frequency: 'weekly', dayOfWeek: weekday === 7 ? 0 : weekday };
    }
    return { ...base, frequency: 'custom' };
  }

  // Ayda bir.
  if (dow === '*') {
    const monthDay = parseSingle(dom);
    if (monthDay !== null && monthDay >= 1 && monthDay <= 31) {
      return { ...base, frequency: 'monthly', dayOfMonth: monthDay };
    }
  }

  return { ...base, frequency: 'custom' };
}

/** Yalnızca düz bir tamsayı alanını çözer; joker/adım/liste alanlarında null döner. */
function parseSingle(field: string): number | null {
  return /^\d+$/.test(field) ? Number(field) : null;
}

/** "*&#47;n" biçimindeki adım alanını çözer; değilse null. */
function parseStep(field: string): number | null {
  const match = /^\*\/(\d+)$/.exec(field);
  if (!match) return null;
  const step = Number(match[1]);
  return step >= 1 ? step : null;
}

/**
 * Cron ifadesinin bu altkümeye göre geçerli olup olmadığı.
 * Backend'deki CronSchedule.TryParse ile aynı alan kurallarını uygular —
 * kullanıcı "Kaydet"e basmadan hatayı görebilsin diye.
 */
export function isValidCron(expression: string | null | undefined): boolean {
  const fields = (expression ?? '').trim().split(/\s+/);
  if (fields.length !== 5) return false;

  const ranges: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  return fields.every((field, i) => isValidField(field, ranges[i][0], ranges[i][1]));
}

function isValidField(field: string, min: number, max: number): boolean {
  if (!field) return false;

  return field.split(',').every(part => {
    if (!part) return false;

    let range = part;
    let step = 1;

    const slash = part.indexOf('/');
    if (slash >= 0) {
      range = part.slice(0, slash);
      step = Number(part.slice(slash + 1));
      if (!Number.isInteger(step) || step < 1) return false;
    }

    if (range === '*') return true;

    const dash = range.indexOf('-');
    if (dash >= 0) {
      const start = Number(range.slice(0, dash));
      const end = Number(range.slice(dash + 1));
      return Number.isInteger(start) && Number.isInteger(end)
        && start >= min && end <= max && start <= end;
    }

    const value = Number(range);
    return Number.isInteger(value) && value >= min && value <= max;
  });
}

/**
 * Sıradaki `count` çalışma zamanını hesaplar (yerel saatte `Date` olarak).
 *
 * Backend UTC + saat dilimi üzerinden hesaplar; buradaki önizleme tarayıcının
 * yerel saatinde yürür — kullanıcı zamanlamayı zaten kendi saatiyle kuruyor.
 * Ayın 31'i gibi seçimlerde kısa aylar doğal olarak atlanır çünkü arama gerçek
 * `Date` nesneleri üzerinde ilerler.
 */
export function nextOccurrences(
  expression: string, from: Date, count: number): Date[] {
  const results: Date[] = [];
  if (count <= 0 || !isValidCron(expression)) return results;

  const fields = expression.trim().split(/\s+/);
  const minutes = expandField(fields[0], 0, 59);
  const hours = expandField(fields[1], 0, 23);
  const daysOfMonth = expandField(fields[2], 1, 31);
  const months = expandField(fields[3], 1, 12);
  const daysOfWeek = expandField(fields[4], 0, 7).map(d => (d === 7 ? 0 : d));

  const domRestricted = fields[2] !== '*';
  const dowRestricted = fields[4] !== '*';

  // Aynı dakika tekrar dönmesin: bir sonraki dakikadan başla.
  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Arama bütçesi HER SONUÇ İÇİN ayrı işler: "29 Şubat" gibi ifadelerde iki
  // koşu arasında 4 yıl olabilir, tek ortak pencere ikinciyi hiç bulamazdı.
  // Backend'deki CronSchedule de her çağrıda kendi penceresini açar.
  const maxGapDays = 366 * 4;
  let lastMatchDay = 0;

  for (let dayOffset = 0; dayOffset - lastMatchDay <= maxGapDays && results.length < count; dayOffset++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayOffset);

    if (!months.includes(date.getMonth() + 1)) continue;

    const domMatch = daysOfMonth.includes(date.getDate());
    const dowMatch = daysOfWeek.includes(date.getDay());

    // Vixie cron kuralı: her iki alan da kısıtlıysa VEYA, aksi halde VE.
    const dateMatches = domRestricted && dowRestricted
      ? domMatch || dowMatch
      : domMatch && dowMatch;
    if (!dateMatches) continue;

    for (const hour of hours) {
      for (const minute of minutes) {
        const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute);
        if (candidate < start) continue;
        results.push(candidate);
        lastMatchDay = dayOffset;
        if (results.length >= count) break;
      }
      if (results.length >= count) break;
    }
  }

  return results;
}

/** Bir cron alanını olası değerler dizisine açar (artan, tekrarsız). */
function expandField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    let range = part;
    let step = 1;

    const slash = part.indexOf('/');
    if (slash >= 0) {
      range = part.slice(0, slash);
      step = Number(part.slice(slash + 1));
    }

    let start: number;
    let end: number;

    if (range === '*') {
      start = min;
      end = max;
    } else {
      const dash = range.indexOf('-');
      if (dash >= 0) {
        start = Number(range.slice(0, dash));
        end = Number(range.slice(dash + 1));
      } else {
        start = Number(range);
        // Adımsız tek değer yalnız kendisidir; adımlıysa aralığın sonuna kadar yürür.
        end = slash >= 0 ? max : start;
      }
    }

    for (let v = start; v <= end; v += step) values.add(v);
  }

  return [...values].sort((a, b) => a - b);
}

/**
 * Ayın 29-31'i seçildiğinde bazı ayların atlanacağını bildirmek gerekir —
 * "her ay yedek alınıyor" beklentisi sessizce yanlış olurdu.
 */
export function isShortMonthRisk(spec: CronSpec): boolean {
  return spec.frequency === 'monthly' && spec.dayOfMonth >= 29;
}

/** Tarayıcının IANA saat dilimi kimliği (ör. "Europe/Istanbul"); okunamazsa null. */
export function detectTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
