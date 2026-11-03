import { describe, expect, it } from 'vitest';
import { badgesFor, longestStreak } from '../src/lib/badges';
import { HOT_AFTER_DAYS, hotBonus } from '../src/lib/hot';
import { daysBetween } from '../src/lib/weeks';

describe('hotBonus', () => {
  it('adds nothing until a chore has been ignored for a few days', () => {
    expect(HOT_AFTER_DAYS).toBe(3);
    expect(hotBonus(30, 0)).toBe(0);
    expect(hotBonus(30, 2)).toBe(0);
  });

  it('heats up 10% of the base points per extra day', () => {
    expect(hotBonus(30, 3)).toBe(3);
    expect(hotBonus(30, 4)).toBe(6);
    expect(hotBonus(30, 5)).toBe(9);
  });

  it('never goes above +50%', () => {
    expect(hotBonus(30, 7)).toBe(15);
    expect(hotBonus(30, 60)).toBe(15);
  });

  it('is always worth at least 1 point once hot, even for tiny chores', () => {
    expect(hotBonus(1, 3)).toBe(1);
    expect(hotBonus(5, 3)).toBe(1);
  });
});

describe('daysBetween', () => {
  it('counts whole days across month ends and in both directions', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(daysBetween('2026-11-02', '2026-11-02')).toBe(0);
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3);
  });
});

describe('longestStreak', () => {
  it('finds the longest run regardless of order or duplicates', () => {
    expect(longestStreak(['2026-11-03', '2026-11-01', '2026-11-02', '2026-11-02', '2026-10-20'])).toBe(3);
  });

  it('handles gaps and empty input', () => {
    expect(longestStreak(['2026-11-01', '2026-11-03'])).toBe(1);
    expect(longestStreak([])).toBe(0);
  });
});

describe('badgesFor', () => {
  const none = { totalPoints: 0, longestStreak: 0, crowns: 0, topChore: null, duelWins: 0, bountiesClaimed: 0 };

  it('awards nothing to a newcomer', () => {
    expect(badgesFor(none)).toEqual([]);
  });

  it('picks the highest tier reached for each badge', () => {
    const badges = badgesFor({ ...none, longestStreak: 8, totalPoints: 1200, crowns: 1 });
    const byId = Object.fromEntries(badges.map((b) => [b.id, b]));
    expect(byId.streak).toMatchObject({ tier: 2, title: 'On fire', detail: '8-day streak' });
    expect(byId.points).toMatchObject({ tier: 3, title: 'Legend' });
    expect(byId.crowns).toMatchObject({ tier: 1, detail: '1 weekly win' });
  });

  it('names a hero badge after the chore someone does most', () => {
    const badges = badgesFor({ ...none, topChore: { name: 'Wash the dishes', count: 26 } });
    expect(badges).toEqual([
      { id: 'hero', emoji: '🦸', title: 'Wash the dishes hero', detail: 'Done 26 times', tier: 2 },
    ]);
    expect(badgesFor({ ...none, topChore: { name: 'Wash the dishes', count: 9 } })).toEqual([]);
  });

  it('counts duel wins and bounties', () => {
    const badges = badgesFor({ ...none, duelWins: 3, bountiesClaimed: 1 });
    expect(badges.map((b) => [b.id, b.tier])).toEqual([
      ['duels', 2],
      ['bounties', 1],
    ]);
  });
});
