import { describe, expect, it } from 'vitest';
import {
  buildStandings,
  currentStreak,
  rankStandings,
  weeklyResults,
  type Bucket,
  type Member,
} from '../src/lib/scoring';

const members: Member[] = [
  { id: 'a', name: 'Asha' },
  { id: 'b', name: 'Ben' },
  { id: 'c', name: 'Chen' },
];

function bucket(userId: string, weekKey: string, dayKey: string, points: number, count = 1): Bucket {
  return { userId, weekKey, dayKey, points, count };
}

describe('currentStreak', () => {
  const today = '2026-11-05';

  it('counts consecutive days ending today', () => {
    expect(currentStreak(['2026-11-05', '2026-11-04', '2026-11-03'], today)).toBe(3);
  });

  it('stays alive if today is still empty but yesterday was logged', () => {
    expect(currentStreak(['2026-11-04', '2026-11-03'], today)).toBe(2);
  });

  it('breaks on a gap', () => {
    expect(currentStreak(['2026-11-05', '2026-11-03', '2026-11-02'], today)).toBe(1);
  });

  it('is zero once a full day has been missed', () => {
    expect(currentStreak(['2026-11-03'], today)).toBe(0);
    expect(currentStreak([], today)).toBe(0);
  });

  it('works across a month boundary', () => {
    expect(currentStreak(['2026-11-01', '2026-10-31', '2026-10-30'], '2026-11-01')).toBe(3);
  });
});

describe('rankStandings', () => {
  it('sorts by points, then activities, then name, and shares ranks on full ties', () => {
    const ranked = rankStandings([
      { name: 'Ben', points: 20, count: 2 },
      { name: 'Asha', points: 20, count: 2 },
      { name: 'Chen', points: 30, count: 1 },
      { name: 'Dev', points: 20, count: 1 },
    ]);
    expect(ranked.map((r) => [r.name, r.rank])).toEqual([
      ['Chen', 1],
      ['Asha', 2],
      ['Ben', 2],
      ['Dev', 4],
    ]);
  });
});

describe('weeklyResults', () => {
  const buckets = [
    bucket('a', '2026-W43', '2026-10-20', 30),
    bucket('b', '2026-W43', '2026-10-21', 20),
    bucket('b', '2026-W44', '2026-10-27', 40),
    bucket('c', '2026-W44', '2026-10-28', 40),
    bucket('x', '2026-W42', '2026-10-13', 99), // someone who left
  ];

  it('only reports finished weeks, newest first', () => {
    const results = weeklyResults(members, buckets, '2026-W44');
    expect(results.map((r) => r.weekKey)).toEqual(['2026-W43']);
    expect(results[0].winners).toEqual([{ userId: 'a', name: 'Asha', points: 30 }]);
  });

  it('ignores people who are no longer in the household', () => {
    const results = weeklyResults(members, buckets, '2026-W50');
    expect(results.map((r) => r.weekKey)).toEqual(['2026-W44', '2026-W43']);
  });

  it('shares the win when two people tie on points', () => {
    const [week44] = weeklyResults(members, buckets, '2026-W50');
    expect(week44.winners.map((w) => w.name).sort()).toEqual(['Ben', 'Chen']);
  });
});

describe('buildStandings', () => {
  const buckets = [
    bucket('a', '2026-W43', '2026-10-20', 30, 2),
    bucket('b', '2026-W43', '2026-10-21', 20, 1),
    bucket('b', '2026-W44', '2026-11-01', 15, 1),
    bucket('c', '2026-W44', '2026-10-31', 10, 1),
    bucket('c', '2026-W44', '2026-11-01', 10, 1),
  ];
  const base = { currentWeek: '2026-W44', today: '2026-11-01' };

  it('scores a single week', () => {
    const standings = buildStandings(members, buckets, { ...base, week: '2026-W44' });
    expect(standings.map((s) => [s.name, s.points, s.rank])).toEqual([
      ['Chen', 20, 1],
      ['Ben', 15, 2],
      ['Asha', 0, 3],
    ]);
  });

  it('scores all time', () => {
    const standings = buildStandings(members, buckets, { ...base, week: 'all' });
    expect(standings.map((s) => [s.name, s.points])).toEqual([
      ['Ben', 35],
      ['Asha', 30],
      ['Chen', 20],
    ]);
  });

  it('adds crowns from finished weeks and streaks from the whole history', () => {
    const standings = buildStandings(members, buckets, { ...base, week: '2026-W44' });
    const byName = Object.fromEntries(standings.map((s) => [s.name, s]));
    expect(byName.Asha.crowns).toBe(1);
    expect(byName.Ben.crowns).toBe(0);
    expect(byName.Chen.streak).toBe(2);
    expect(byName.Ben.streak).toBe(1);
    expect(byName.Asha.streak).toBe(0);
  });
});
