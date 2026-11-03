import { Settlement } from '../models/Settlement';
import type { HouseholdDoc } from '../models/Household';
import { resolveDue } from './challenges';
import { computeBalances, computePayouts, computeTransfers } from './prizes';
import { buildStandings } from './scoring';
import { loadBuckets, loadMembers } from './stats';
import { dayKey, weekKeyOfDay } from './weeks';

/**
 * Creates the prize settlement for every finished week that doesn't have one
 * yet. Runs lazily when someone opens the app, so there is no cron job to keep
 * alive. A week is settled exactly once; later changes to the prize amounts
 * never rewrite it.
 */
export async function finalizeSettlements(household: HouseholdDoc): Promise<void> {
  if (!household.prizesEnabled || !household.prizesFrom) return;

  // Challenges that ended in a finished week must pay out before that week is totalled.
  await resolveDue(household);

  const today = dayKey(new Date(), household.timezone);
  const currentWeek = weekKeyOfDay(today);
  const [members, buckets, existing] = await Promise.all([
    loadMembers(household._id),
    loadBuckets(household._id),
    Settlement.find({ household: household._id }).select('weekKey').lean(),
  ]);
  if (members.length === 0) return;

  const settled = new Set(existing.map((s) => s.weekKey));
  const pending = [...new Set(buckets.map((b) => b.weekKey))]
    .filter((week) => week >= household.prizesFrom && week < currentWeek && !settled.has(week))
    .sort();

  for (const week of pending) {
    const standings = buildStandings(members, buckets, { week, currentWeek, today });
    const payouts = computePayouts(standings, household.prizes);
    const balances = computeBalances(
      members.map((m) => m.id),
      payouts,
    );
    const transfers = computeTransfers(balances);

    try {
      await Settlement.create({
        household: household._id,
        weekKey: week,
        prizes: household.prizes,
        memberCount: members.length,
        payouts: payouts.map((p) => ({ user: p.userId, rank: p.rank, prizePaise: p.prizePaise })),
        balances: balances.map((b) => ({
          user: b.userId,
          prizePaise: b.prizePaise,
          sharePaise: b.sharePaise,
          netPaise: b.netPaise,
        })),
        transfers: transfers.map((t) => ({ from: t.from, to: t.to, amountPaise: t.amountPaise })),
      });
    } catch (error) {
      // Another request settled this week at the same moment. That's fine.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
}
