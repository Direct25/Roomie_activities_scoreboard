/**
 * Calendar helpers. Everything is computed in the household's timezone so the
 * weekly reset happens at local midnight on Monday, wherever the server runs.
 *
 * A "day key" is a local calendar date like "2026-11-01".
 * A "week key" is an ISO week like "2026-W44" (weeks start on Monday).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Local calendar date for an instant, e.g. "2026-11-02". */
export function dayKey(date: Date, timeZone: string): string {
  const parts = formatterFor(timeZone).formatToParts(date);
  const pick = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number): string {
  const d = parseDay(key);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDay(d);
}

/** Whole days from one day key to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(key: string): number {
  return parseDay(key).getUTCDay() || 7;
}

export function weekKeyOfDay(key: string): string {
  const d = parseDay(key);
  // The Thursday of a week decides which ISO year the week belongs to.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weekKey(date: Date, timeZone: string): string {
  return weekKeyOfDay(dayKey(date, timeZone));
}

export function isWeekKey(value: string): boolean {
  return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(value);
}

/** Monday (YYYY-MM-DD) of the given ISO week. */
export function weekStartsOn(week: string): string {
  const [yearPart, weekPart] = week.split('-W');
  const year = Number(yearPart);
  const weekNumber = Number(weekPart);
  // January 4th is always in ISO week 1.
  const jan4 = formatDay(new Date(Date.UTC(year, 0, 4)));
  const mondayOfWeek1 = addDays(jan4, -(isoWeekday(jan4) - 1));
  return addDays(mondayOfWeek1, (weekNumber - 1) * 7);
}

/** Sunday (YYYY-MM-DD) of the given ISO week. */
export function weekEndsOn(week: string): string {
  return addDays(weekStartsOn(week), 6);
}

/** Days until the leaderboard resets: 7 on Monday ... 1 on Sunday. */
export function daysUntilReset(todayKey: string): number {
  return 8 - isoWeekday(todayKey);
}
