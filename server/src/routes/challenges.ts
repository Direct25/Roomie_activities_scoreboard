import { Router } from 'express';
import { z } from 'zod';
import {
  DURATION_OPTIONS,
  MAX_OPEN_PER_PERSON,
  PENDING_HOURS,
  STAKE_OPTIONS,
  resolveDue,
  scoreChallenge,
} from '../lib/challenges';
import { HttpError, objectId, parse } from '../lib/http';
import { loadMembers } from '../lib/stats';
import { challengeView } from '../lib/views';
import { addDays, dayKey } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Activity } from '../models/Activity';
import { Challenge } from '../models/Challenge';
import { Household } from '../models/Household';

export const challengesRouter = Router();
challengesRouter.use(requireAuth);

const createSchema = z.object({
  opponentId: z.string(),
  metric: z.enum(['points', 'activity']),
  activityId: z.string().optional(),
  days: z.number().refine((n) => (DURATION_OPTIONS as readonly number[]).includes(n), 'Pick 1, 3 or 7 days'),
  stakePoints: z
    .number()
    .refine((n) => (STAKE_OPTIONS as readonly number[]).includes(n), 'Stake must be 0, 10, 25 or 50'),
});

async function loadHousehold(req: Parameters<typeof householdIdOf>[0]) {
  const household = await Household.findById(householdIdOf(req));
  if (!household) throw new HttpError(404, 'Household not found');
  return household;
}

async function findChallenge(req: Parameters<typeof householdIdOf>[0]) {
  const challenge = await Challenge.findOne({
    _id: objectId(req.params.id),
    household: householdIdOf(req),
  });
  if (!challenge) throw new HttpError(404, 'Challenge not found');
  return challenge;
}

async function nameLookup(householdId: ReturnType<typeof householdIdOf>) {
  return new Map((await loadMembers(householdId)).map((m) => [m.id, m.name]));
}

// Everything the household has going on, newest first, with live scores for active ones.
challengesRouter.get('/', async (req, res) => {
  const household = await loadHousehold(req);
  await resolveDue(household);

  const challenges = await Challenge.find({ household: household._id }).sort({ createdAt: -1 }).limit(30);
  const lookup = await nameLookup(household._id);

  const views = await Promise.all(
    challenges.map(async (challenge) =>
      challengeView(challenge, lookup, challenge.status === 'active' ? await scoreChallenge(challenge) : undefined),
    ),
  );
  res.json({ challenges: views });
});

challengesRouter.post('/', async (req, res) => {
  const me = req.user!;
  const household = await loadHousehold(req);
  const body = parse(createSchema, req.body);

  const opponentId = objectId(body.opponentId, 'opponentId');
  if (String(opponentId) === String(me._id)) throw new HttpError(400, "You can't challenge yourself");
  const lookup = await nameLookup(household._id);
  if (!lookup.has(String(opponentId))) throw new HttpError(404, 'That roommate is not in your household');

  let activity = null;
  if (body.metric === 'activity') {
    if (!body.activityId) throw new HttpError(400, 'Pick a chore for a chore challenge');
    activity = await Activity.findOne({
      _id: objectId(body.activityId, 'activityId'),
      household: household._id,
      archived: false,
    });
    if (!activity) throw new HttpError(404, 'Activity not found');
  }

  await resolveDue(household);
  const openStatus = { $in: ['pending', 'active'] as ('pending' | 'active')[] };

  const myOpen = await Challenge.countDocuments({
    household: household._id,
    status: openStatus,
    challenger: me._id,
  });
  if (myOpen >= MAX_OPEN_PER_PERSON) {
    throw new HttpError(409, `You can have up to ${MAX_OPEN_PER_PERSON} open challenges`);
  }
  const between = await Challenge.exists({
    household: household._id,
    status: openStatus,
    $or: [
      { challenger: me._id, opponent: opponentId },
      { challenger: opponentId, opponent: me._id },
    ],
  });
  if (between) throw new HttpError(409, 'You two already have a challenge going');

  const challenge = await Challenge.create({
    household: household._id,
    challenger: me._id,
    opponent: opponentId,
    metric: body.metric,
    activity: activity?._id ?? null,
    activityName: activity?.name ?? '',
    emoji: activity?.emoji ?? '',
    days: body.days,
    stakePoints: body.stakePoints,
    expiresAt: new Date(Date.now() + PENDING_HOURS * 60 * 60 * 1000),
  });
  res.status(201).json({ challenge: challengeView(challenge, lookup) });
});

// The opponent accepts. Scoring starts today, so nobody can win with old chores.
challengesRouter.post('/:id/accept', async (req, res) => {
  const household = await loadHousehold(req);
  const challenge = await findChallenge(req);
  if (String(challenge.opponent) !== String(req.user!._id)) {
    throw new HttpError(403, 'Only the challenged roommate can accept');
  }

  const now = new Date();
  const today = dayKey(now, household.timezone);
  const accepted = await Challenge.findOneAndUpdate(
    { _id: challenge._id, status: 'pending', expiresAt: { $gt: now } },
    { status: 'active', startDay: today, endDay: addDays(today, challenge.days - 1) },
    { returnDocument: 'after' },
  );
  if (!accepted) throw new HttpError(409, 'This challenge is no longer open');

  const lookup = await nameLookup(household._id);
  res.json({ challenge: challengeView(accepted, lookup, await scoreChallenge(accepted)) });
});

challengesRouter.post('/:id/decline', async (req, res) => {
  const challenge = await findChallenge(req);
  if (String(challenge.opponent) !== String(req.user!._id)) {
    throw new HttpError(403, 'Only the challenged roommate can decline');
  }
  const declined = await Challenge.findOneAndUpdate(
    { _id: challenge._id, status: 'pending' },
    { status: 'declined' },
  );
  if (!declined) throw new HttpError(409, 'This challenge is no longer open');
  res.json({ ok: true });
});

// The challenger can take back an invitation nobody has accepted yet.
challengesRouter.delete('/:id', async (req, res) => {
  const challenge = await findChallenge(req);
  if (String(challenge.challenger) !== String(req.user!._id)) {
    throw new HttpError(403, 'Only the person who sent it can cancel');
  }
  const cancelled = await Challenge.findOneAndUpdate(
    { _id: challenge._id, status: 'pending' },
    { status: 'cancelled' },
  );
  if (!cancelled) throw new HttpError(409, 'Only waiting challenges can be cancelled');
  res.json({ ok: true });
});
