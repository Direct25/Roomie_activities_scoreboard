import { Challenge, type ChallengeDoc } from '../models/Challenge';
import { Entry } from '../models/Entry';
import type { HouseholdDoc } from '../models/Household';
import { User } from '../models/User';
import { dayKey, weekKeyOfDay } from './weeks';

export const STAKE_OPTIONS = [0, 10, 25, 50] as const;
export const DURATION_OPTIONS = [1, 3, 7] as const;
export const PENDING_HOURS = 48;
export const MAX_OPEN_PER_PERSON = 3;

export interface ChallengeScore {
  challenger: number;
  opponent: number;
}

/** Live score between startDay and endDay (inclusive), using only counted chores. */
export async function scoreChallenge(challenge: ChallengeDoc): Promise<ChallengeScore> {
  const entries = await Entry.find({
    household: challenge.household,
    user: { $in: [challenge.challenger, challenge.opponent] },
    status: 'counted',
    dayKey: { $gte: challenge.startDay, $lte: challenge.endDay },
  })
    .select('user kind activity points')
    .lean();

  const score: ChallengeScore = { challenger: 0, opponent: 0 };
  for (const entry of entries) {
    if (entry.kind === 'bonus') continue;
    if (challenge.metric === 'activity' && String(entry.activity) !== String(challenge.activity)) continue;
    const value = challenge.metric === 'activity' ? 1 : entry.points;
    if (String(entry.user) === String(challenge.challenger)) score.challenger += value;
    else score.opponent += value;
  }
  return score;
}

/**
 * Settles anything that is due: stale invitations expire, and challenges whose
 * last day has passed are scored and the winner receives the stake as bonus
 * points. Safe to call on every request; each challenge is completed once.
 */
export async function resolveDue(household: HouseholdDoc): Promise<void> {
  const now = new Date();
  const today = dayKey(now, household.timezone);

  await Challenge.updateMany(
    { household: household._id, status: 'pending', expiresAt: { $lte: now } },
    { status: 'expired' },
  );

  const due = await Challenge.find({ household: household._id, status: 'active', endDay: { $lt: today } });
  for (const challenge of due) {
    const score = await scoreChallenge(challenge);
    const winner =
      score.challenger === score.opponent
        ? null
        : score.challenger > score.opponent
          ? challenge.challenger
          : challenge.opponent;

    // Only the request that flips the status gets to hand out the bonus.
    const claimed = await Challenge.findOneAndUpdate(
      { _id: challenge._id, status: 'active' },
      {
        status: 'completed',
        winner,
        challengerScore: score.challenger,
        opponentScore: score.opponent,
      },
    );
    if (!claimed || !winner || challenge.stakePoints <= 0) continue;

    const loserId = String(winner) === String(challenge.challenger) ? challenge.opponent : challenge.challenger;
    const loser = await User.findById(loserId).select('name');

    await Entry.create({
      household: household._id,
      user: winner,
      kind: 'bonus',
      activity: null,
      activityName: `Won a challenge vs ${loser?.name ?? 'a roommate'}`,
      emoji: '⚔️',
      points: challenge.stakePoints,
      challenge: challenge._id,
      // Dated to the day the challenge ended, even if nobody opened the app until later.
      dayKey: challenge.endDay,
      weekKey: weekKeyOfDay(challenge.endDay),
    });
  }
}
