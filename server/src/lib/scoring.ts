import { addDays } from './weeks';

/**
 * Entries are pre-aggregated into buckets (one per member, week and day) so the
 * scoring logic stays pure and cheap no matter how long a household has been
 * logging.
 */
export interface Bucket {
  userId: string;
  weekKey: string;
  dayKey: string;
  points: number;
  count: number;
}

export interface Member {
  id: string;
  name: string;
}

export interface Standing {
  userId: string;
  name: string;
  points: number;
  count: number;
  streak: number;
  crowns: number;
  rank: number;
}

export interface WeekResult {
  weekKey: string;
  winners: { userId: string; name: string; points: number }[];
  standings: { userId: string; name: string; points: number }[];
}

/**
 * Consecutive days with at least one counted entry. The streak is still alive
 * if the member has not logged anything yet today but did yesterday.
 */
export function currentStreak(days: Iterable<string>, today: string): number {
  const logged = new Set(days);
  let cursor = logged.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Sort by points, then by number of activities, then by name. Ties share a rank. */
export function rankStandings<T extends { points: number; count: number; name: string }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => b.points - a.points || b.count - a.count || a.name.localeCompare(b.name),
  );
  let rank = 0;
  return sorted.map((row, index) => {
    const previous = sorted[index - 1];
    if (!previous || previous.points !== row.points || previous.count !== row.count) {
      rank = index + 1;
    }
    return { ...row, rank };
  });
}

/** Results for every finished week (anything before `currentWeek`), newest first. */
export function weeklyResults(
  members: Member[],
  buckets: Bucket[],
  currentWeek: string,
): WeekResult[] {
  const names = new Map(members.map((m) => [m.id, m.name]));
  const byWeek = new Map<string, Map<string, number>>();

  for (const bucket of buckets) {
    if (bucket.weekKey >= currentWeek || !names.has(bucket.userId)) continue;
    const week = byWeek.get(bucket.weekKey) ?? new Map<string, number>();
    week.set(bucket.userId, (week.get(bucket.userId) ?? 0) + bucket.points);
    byWeek.set(bucket.weekKey, week);
  }

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekKey, totals]) => {
      const standings = rankStandings(
        [...totals.entries()].map(([userId, points]) => ({
          userId,
          name: names.get(userId)!,
          points,
          count: 0,
        })),
      ).map(({ userId, name, points }) => ({ userId, name, points }));

      const top = standings[0]?.points ?? 0;
      const winners = top > 0 ? standings.filter((s) => s.points === top) : [];
      return { weekKey, winners, standings };
    });
}

/**
 * Standings for one week or for all time. `crowns` are weekly wins from
 * finished weeks, and streaks always look at the whole history.
 */
export function buildStandings(
  members: Member[],
  buckets: Bucket[],
  options: { week: string | 'all'; currentWeek: string; today: string },
): Standing[] {
  const crowns = new Map<string, number>();
  for (const result of weeklyResults(members, buckets, options.currentWeek)) {
    for (const winner of result.winners) {
      crowns.set(winner.userId, (crowns.get(winner.userId) ?? 0) + 1);
    }
  }

  const rows = members.map((member) => {
    const mine = buckets.filter((b) => b.userId === member.id);
    const inScope = options.week === 'all' ? mine : mine.filter((b) => b.weekKey === options.week);
    return {
      userId: member.id,
      name: member.name,
      points: inScope.reduce((sum, b) => sum + b.points, 0),
      count: inScope.reduce((sum, b) => sum + b.count, 0),
      streak: currentStreak(
        mine.filter((b) => b.count > 0).map((b) => b.dayKey),
        options.today,
      ),
      crowns: crowns.get(member.id) ?? 0,
    };
  });

  return rankStandings(rows);
}
