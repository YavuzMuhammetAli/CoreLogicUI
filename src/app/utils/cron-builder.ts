/**
 * Cron generation/parsing for the backup schedule.
 *
 * The user does not write cron: they pick a frequency type + time/day, and the pure functions here
 * turn that into a 5-field cron expression. The backend (`Core.Utilities.Scheduling.CronSchedule`)
 * interprets the same subset — production and consumption meet in a single contract.
 *
 * Entirely pure (side-effect free) and tested by `cron-builder.spec.ts`; no scheduling logic
 * remains in the component.
 */

/** Supported frequency types — the values of the select box on screen. */
export type CronFrequency =
  | 'hourly'      // every hour
  | 'everyNHours' // every N hours
  | 'daily'       // every day
  | 'everyNDays'  // every N days
  | 'weekly'      // once a week
  | 'monthly'     // once a month
  | 'custom';     // raw cron

/** Display order of the frequency selector. */
export const CRON_FREQUENCIES: readonly CronFrequency[] = [
  'hourly', 'everyNHours', 'daily', 'everyNDays', 'weekly', 'monthly', 'custom'
];

/** Intervals offered for "every N hours" — divisors of 24 were chosen so
 *  the run times within a day stay the same every day. */
export const HOUR_INTERVALS: readonly number[] = [2, 3, 4, 6, 8, 12];

/** Structured form of the schedule — the form holds this object. */
export interface CronSpec {
  frequency: CronFrequency;
  /** 0-59 — used by all frequencies. */
  minute: number;
  /** 0-23 — used except for hourly/everyNHours. */
  hour: number;
  /** Hour interval for everyNHours. */
  hourInterval: number;
  /** Day interval for everyNDays. */
  dayInterval: number;
  /** Day of week for weekly (0 = Sunday … 6 = Saturday). */
  dayOfWeek: number;
  /** Day of month for monthly (1-31). */
  dayOfMonth: number;
  /** Raw cron expression for custom. */
  raw: string;
}

/** A sensible default: every day at 03:00 (off-peak hour). */
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

/** Builds a 5-field cron expression from the structured selection. */
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
 * Converts a saved cron back into the structured form.
 *
 * An unrecognized (but valid) expression falls back to 'custom' mode and is kept raw,
 * so no information is lost.
 */
export function parseCron(expression: string | null | undefined): CronSpec {
  const base = defaultCronSpec();
  const expr = (expression ?? '').trim();
  if (!expr) return base;

  base.raw = expr;

  const fields = expr.split(/\s+/);
  if (fields.length !== 5) return { ...base, frequency: 'custom' };

  const [min, hr, dom, month, dow] = fields;

  // The month field must always be '*'; otherwise it is an expression we did not produce.
  const minute = parseSingle(min);
  if (minute === null || month !== '*') return { ...base, frequency: 'custom' };
  base.minute = minute;

  // Hourly: fixed minute, free hour.
  if (hr === '*' && dom === '*' && dow === '*') {
    return { ...base, frequency: 'hourly' };
  }

  // Every N hours.
  const hourStep = parseStep(hr);
  if (hourStep !== null && dom === '*' && dow === '*') {
    return { ...base, frequency: 'everyNHours', hourInterval: hourStep };
  }

  const hour = parseSingle(hr);
  if (hour === null) return { ...base, frequency: 'custom' };
  base.hour = hour;

  // Every day.
  if (dom === '*' && dow === '*') {
    return { ...base, frequency: 'daily' };
  }

  // Every N days.
  const dayStep = parseStep(dom);
  if (dayStep !== null && dow === '*') {
    return { ...base, frequency: 'everyNDays', dayInterval: dayStep };
  }

  // Once a week.
  if (dom === '*') {
    const weekday = parseSingle(dow);
    // In cron 7 is also Sunday; reduce to a single notation.
    if (weekday !== null && weekday >= 0 && weekday <= 7) {
      return { ...base, frequency: 'weekly', dayOfWeek: weekday === 7 ? 0 : weekday };
    }
    return { ...base, frequency: 'custom' };
  }

  // Once a month.
  if (dow === '*') {
    const monthDay = parseSingle(dom);
    if (monthDay !== null && monthDay >= 1 && monthDay <= 31) {
      return { ...base, frequency: 'monthly', dayOfMonth: monthDay };
    }
  }

  return { ...base, frequency: 'custom' };
}

/** Parses only a plain integer field; returns null for wildcard/step/list fields. */
function parseSingle(field: string): number | null {
  return /^\d+$/.test(field) ? Number(field) : null;
}

/** Parses a step field of the form "*&#47;n"; null otherwise. */
function parseStep(field: string): number | null {
  const match = /^\*\/(\d+)$/.exec(field);
  if (!match) return null;
  const step = Number(match[1]);
  return step >= 1 ? step : null;
}

/**
 * Whether the cron expression is valid for this subset.
 * Applies the same field rules as the backend CronSchedule.TryParse —
 * so the user can see the error before pressing "Kaydet" (Save).
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
 * Computes the next `count` run times (as local-time `Date`s).
 *
 * The backend computes via UTC + time zone; the preview here runs in the browser's
 * local time — the user sets up the schedule in their own time anyway.
 * For selections like the 31st, short months are naturally skipped because the search walks
 * real `Date` objects.
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

  // Don't return the same minute again: start from the next minute.
  const start = new Date(from.getTime());
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // The search budget runs separately FOR EACH RESULT: for expressions like "29 February" there can be
  // 4 years between two runs, and a single shared window would never find the second.
  // The backend CronSchedule also opens its own window on every call.
  const maxGapDays = 366 * 4;
  let lastMatchDay = 0;

  for (let dayOffset = 0; dayOffset - lastMatchDay <= maxGapDays && results.length < count; dayOffset++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayOffset);

    if (!months.includes(date.getMonth() + 1)) continue;

    const domMatch = daysOfMonth.includes(date.getDate());
    const dowMatch = daysOfWeek.includes(date.getDay());

    // Vixie cron rule: OR if both fields are restricted, otherwise AND.
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

/** Expands a cron field into an array of possible values (ascending, deduplicated). */
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
        // A single value without a step is just itself; with a step it runs to the end of the range.
        end = slash >= 0 ? max : start;
      }
    }

    for (let v = start; v <= end; v += step) values.add(v);
  }

  return [...values].sort((a, b) => a - b);
}

/**
 * When the 29th-31st is selected we must tell the user some months will be skipped —
 * otherwise the expectation "a backup is taken every month" would be silently wrong.
 */
export function isShortMonthRisk(spec: CronSpec): boolean {
  return spec.frequency === 'monthly' && spec.dayOfMonth >= 29;
}

/** The browser's IANA time zone id (e.g. "Europe/Istanbul"); null if it cannot be read. */
export function detectTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
