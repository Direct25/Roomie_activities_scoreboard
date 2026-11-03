import { Router } from 'express';
import { badgesFor, longestStreak } from '../lib/badges';
import { HttpError } from '../lib/http';
import { resolveDue } from '../lib/challenges';
import { buildStandings } from '../lib/scoring';
import { loadBuckets, loadMembers } from '../lib/stats';
import { dayKey, weekKeyOfDay } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Challenge } from '../models/Challenge';
import { Entry } from '../models/Entry';
import { Household } from '../models/Household';

export const badgesRouter = Router();
badgesRouter.use(requireAuth);

// Lifetime badges for everyone in the household.
badgesRouter.get('/', async (req, res) => {
  const householdId = householdIdOf(req);
  const household = await Household.findById(householdId);
  if (!household) throw new HttpError(404, 'Household not found');

  // Finished challenges pay out before we count wins and points.
  await resolveDue(household);

  const today = dayKey(new Date(), household.timezone);
  const currentWeek = weekKeyOfDay(today);
  const [members, buckets, chores, completed] = await Promise.all([
    loadMembers(householdId),
    loadBuckets(householdId),
    Entry.find({ household: householdId, kind: 'chore', status: 'counted' })
      .select('user activityName bounty')
      .lean(),
    Challenge.find({ household: householdId, status: 'completed' }).select('winner').lean(),
  ]);

  const standings = new Map(
    buildStandings(members, buckets, { week: 'all', currentWeek, today }).map((s) => [s.userId, s]),
  );

  const choreCounts = new Map<string, Map<string, number>>();
  const bounties = new Map<string, number>();
  for (const entry of chores) {
    const userId = String(entry.user);
    const counts = choreCounts.get(userId) ?? new Map<string, number>();
    counts.set(entry.activityName, (counts.get(entry.activityName) ?? 0) + 1);
    choreCounts.set(userId, counts);
    if (entry.bounty) bounties.set(userId, (bounties.get(userId) ?? 0) + 1);
  }

  const duelWins = new Map<string, number>();
  for (const challenge of completed) {
    if (!challenge.winner) continue;
    const id = String(challenge.winner);
    duelWins.set(id, (duelWins.get(id) ?? 0) + 1);
  }

  res.json({
    badges: members.map((member) => {
      const mine = standings.get(member.id);
      const top = [...(choreCounts.get(member.id) ?? new Map<string, number>()).entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0];
      return {
        userId: member.id,
        name: member.name,
        badges: badgesFor({
          totalPoints: mine?.points ?? 0,
          longestStreak: longestStreak(
            buckets.filter((b) => b.userId === member.id && b.count > 0).map((b) => b.dayKey),
          ),
          crowns: mine?.crowns ?? 0,
          topChore: top ? { name: top[0], count: top[1] } : null,
          duelWins: duelWins.get(member.id) ?? 0,
          bountiesClaimed: bounties.get(member.id) ?? 0,
        }),
      };
    }),
  });
});
