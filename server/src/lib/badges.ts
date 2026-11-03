/**
 * Badges are earned once and kept: they come from lifetime numbers (longest streak,
 * total points, weekly wins...) rather than the current week.
 */

export interface BadgeStats {
  totalPoints: number;
  longestStreak: number;
  crowns: number;
  /** The chore this person has done most often, if any. */
  topChore: { name: string; count: number } | null;
  duelWins: number;
  bountiesClaimed: number;
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  tier: 1 | 2 | 3;
}

const TIER_TITLES = {
  streak: ['Warming up', 'On fire', 'Unstoppable'],
  points: ['Century club', 'Half a grand', 'Legend'],
  crowns: ['Weekly champ', 'Dynasty', 'Hall of famer'],
  duels: ['Duelist', 'Gladiator', 'Undefeated'],
  bounties: ['Bounty hunter', 'Mercenary', 'Hired gun'],
} as const;

/** The highest tier reached for `value`, or 0 if it hasn't reached the first threshold. */
function tierFor(value: number, thresholds: [number, number, number]): 0 | 1 | 2 | 3 {
  if (value >= thresholds[2]) return 3;
  if (value >= thresholds[1]) return 2;
  if (value >= thresholds[0]) return 1;
  return 0;
}

/** Longest run of consecutive days, given YYYY-MM-DD keys in any order. */
export function longestStreak(days: Iterable<string>): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    const [y, m, d] = day.split('-').map(Number);
    const time = Date.UTC(y, m - 1, d);
    run = previous !== null && time - previous === 86_400_000 ? run + 1 : 1;
    previous = time;
    best = Math.max(best, run);
  }
  return best;
}

export function badgesFor(stats: BadgeStats): Badge[] {
  const badges: Badge[] = [];

  const add = (
    id: string,
    emoji: string,
    titles: readonly string[],
    value: number,
    thresholds: [number, number, number],
    detail: (value: number) => string,
  ) => {
    const tier = tierFor(value, thresholds);
    if (tier) badges.push({ id, emoji, title: titles[tier - 1], detail: detail(value), tier });
  };

  add('streak', '🔥', TIER_TITLES.streak, stats.longestStreak, [3, 7, 14], (v) => `${v}-day streak`);
  add('points', '💯', TIER_TITLES.points, stats.totalPoints, [100, 500, 1000], (v) => `${v} points`);
  add('crowns', '👑', TIER_TITLES.crowns, stats.crowns, [1, 3, 10], (v) => `${v} weekly ${v === 1 ? 'win' : 'wins'}`);
  add('duels', '⚔️', TIER_TITLES.duels, stats.duelWins, [1, 3, 10], (v) => `${v} duel ${v === 1 ? 'win' : 'wins'}`);
  add('bounties', '🎯', TIER_TITLES.bounties, stats.bountiesClaimed, [1, 3, 10], (v) => `${v} ${v === 1 ? 'bounty' : 'bounties'} claimed`);

  if (stats.topChore) {
    const { name, count } = stats.topChore;
    const tier = tierFor(count, [10, 25, 50]);
    if (tier) {
      badges.push({
        id: 'hero',
        emoji: '🦸',
        title: `${name} hero`,
        detail: `Done ${count} times`,
        tier,
      });
    }
  }

  return badges;
}
