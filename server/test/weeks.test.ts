import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  daysUntilReset,
  isValidTimezone,
  isWeekKey,
  weekEndsOn,
  weekKey,
  weekKeyOfDay,
  weekStartsOn,
} from '../src/lib/weeks';

describe('weekKeyOfDay', () => {
  it('uses ISO weeks that start on Monday', () => {
    expect(weekKeyOfDay('2026-11-01')).toBe('2026-W44'); // Sunday
    expect(weekKeyOfDay('2026-11-02')).toBe('2026-W45'); // Monday
  });

  it('handles the year boundary', () => {
    expect(weekKeyOfDay('2026-12-31')).toBe('2026-W53');
    expect(weekKeyOfDay('2027-01-01')).toBe('2026-W53');
    expect(weekKeyOfDay('2027-01-04')).toBe('2027-W01');
    expect(weekKeyOfDay('2024-12-30')).toBe('2025-W01');
  });
});

describe('timezones', () => {
  it('rolls over to the next day at local midnight, not UTC midnight', () => {
    const instant = new Date('2026-11-01T19:00:00Z'); // 00:30 on Nov 2 in India
    expect(dayKey(instant, 'UTC')).toBe('2026-11-01');
    expect(dayKey(instant, 'Asia/Kolkata')).toBe('2026-11-02');
    expect(weekKey(instant, 'UTC')).toBe('2026-W44');
    expect(weekKey(instant, 'Asia/Kolkata')).toBe('2026-W45');
  });

  it('validates timezone names', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidTimezone('Mars/Phobos')).toBe(false);
  });
});

describe('week boundaries', () => {
  it('finds the Monday and Sunday of a week', () => {
    expect(weekStartsOn('2026-W44')).toBe('2026-10-26');
    expect(weekEndsOn('2026-W44')).toBe('2026-11-01');
    expect(weekStartsOn('2026-W53')).toBe('2026-12-28');
    expect(weekStartsOn('2027-W01')).toBe('2027-01-04');
  });

  it('counts the days left before the reset', () => {
    expect(daysUntilReset('2026-11-02')).toBe(7); // Monday
    expect(daysUntilReset('2026-11-05')).toBe(4); // Thursday
    expect(daysUntilReset('2026-11-01')).toBe(1); // Sunday
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('recognises week keys', () => {
    expect(isWeekKey('2026-W44')).toBe(true);
    expect(isWeekKey('2026-W54')).toBe(false);
    expect(isWeekKey('2026-44')).toBe(false);
    expect(isWeekKey('all')).toBe(false);
  });
});
