import { Router } from 'express';
import { HttpError } from '../lib/http';
import { buildStandings, weeklyResults } from '../lib/scoring';
import { loadBuckets, loadMembers } from '../lib/stats';
import { dayKey, daysUntilReset, isWeekKey, weekEndsOn, weekKeyOfDay, weekStartsOn } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Household } from '../models/Household';

export const leaderboardRouter = Router();
leaderboardRouter.use(requireAuth);

async function loadContext(householdId: ReturnType<typeof householdIdOf>) {
  const household = await Household.findById(householdId);
  if (!household) throw new HttpError(404, 'Household not found');

  const today = dayKey(new Date(), household.timezone);
  const [members, buckets] = await Promise.all([loadMembers(householdId), loadBuckets(householdId)]);
  return { today, currentWeek: weekKeyOfDay(today), members, buckets };
}

// GET /api/leaderboard?week=2026-W44 | all   (defaults to the current week)
leaderboardRouter.get('/', async (req, res) => {
  const { today, currentWeek, members, buckets } = await loadContext(householdIdOf(req));

  const requested = typeof req.query.week === 'string' ? req.query.week : currentWeek;
  if (requested !== 'all' && !isWeekKey(requested)) {
    throw new HttpError(400, 'week must look like 2026-W44, or "all"');
  }

  const standings = buildStandings(members, buckets, {
    week: requested,
    currentWeek,
    today,
  });

  const weeks = [...new Set([currentWeek, ...buckets.map((b) => b.weekKey)])]
    .sort()
    .reverse()
    .map((key) => ({ key, startsOn: weekStartsOn(key), endsOn: weekEndsOn(key) }));

  res.json({
    week: requested,
    currentWeek,
    isCurrent: requested === currentWeek,
    startsOn: requested === 'all' ? null : weekStartsOn(requested),
    endsOn: requested === 'all' ? null : weekEndsOn(requested),
    daysUntilReset: daysUntilReset(today),
    today,
    weeks,
    standings,
    totals: {
      points: standings.reduce((sum, s) => sum + s.points, 0),
      count: standings.reduce((sum, s) => sum + s.count, 0),
    },
  });
});

// Finished weeks, newest first, with the winner(s) of each.
leaderboardRouter.get('/history', async (req, res) => {
  const { currentWeek, members, buckets } = await loadContext(householdIdOf(req));

  const history = weeklyResults(members, buckets, currentWeek)
    .slice(0, 12)
    .map((result) => ({
      ...result,
      startsOn: weekStartsOn(result.weekKey),
      endsOn: weekEndsOn(result.weekKey),
    }));

  res.json({ history });
});
