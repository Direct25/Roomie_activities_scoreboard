import { Router } from 'express';
import { z } from 'zod';
import { HttpError, objectId, parse } from '../lib/http';
import { loadMembers } from '../lib/stats';
import { bountyView } from '../lib/views';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Activity } from '../models/Activity';
import { Bounty } from '../models/Bounty';

export const bountiesRouter = Router();
bountiesRouter.use(requireAuth);

const MAX_OPEN = 5;
const LIFETIME_MS = 3 * 24 * 60 * 60 * 1000;

const createSchema = z.object({
  activityId: z.string(),
  bonusPoints: z.number().int().min(5, 'At least 5 bonus points').max(50, 'At most 50 bonus points'),
});

async function names(householdId: ReturnType<typeof householdIdOf>) {
  return new Map((await loadMembers(householdId)).map((m) => [m.id, m.name]));
}

async function expireOld(householdId: ReturnType<typeof householdIdOf>) {
  await Bounty.updateMany(
    { household: householdId, status: 'open', expiresAt: { $lte: new Date() } },
    { status: 'expired' },
  );
}

// Open bounties, newest first. Doing one of these chores earns the bonus on top.
bountiesRouter.get('/', async (req, res) => {
  const householdId = householdIdOf(req);
  await expireOld(householdId);
  const open = await Bounty.find({ household: householdId, status: 'open' }).sort({ createdAt: -1 });
  const lookup = await names(householdId);
  res.json({ bounties: open.map((b) => bountyView(b, lookup)) });
});

bountiesRouter.post('/', async (req, res) => {
  const householdId = householdIdOf(req);
  const { activityId, bonusPoints } = parse(createSchema, req.body);
  await expireOld(householdId);

  const activity = await Activity.findOne({
    _id: objectId(activityId, 'activityId'),
    household: householdId,
    archived: false,
  });
  if (!activity) throw new HttpError(404, 'Activity not found');

  if (await Bounty.exists({ household: householdId, activity: activity._id, status: 'open' })) {
    throw new HttpError(409, 'That chore already has a bounty');
  }
  if ((await Bounty.countDocuments({ household: householdId, status: 'open' })) >= MAX_OPEN) {
    throw new HttpError(409, `Up to ${MAX_OPEN} bounties can be open at once`);
  }

  const bounty = await Bounty.create({
    household: householdId,
    activity: activity._id,
    activityName: activity.name,
    emoji: activity.emoji,
    bonusPoints,
    createdBy: req.user!._id,
    expiresAt: new Date(Date.now() + LIFETIME_MS),
  });
  res.status(201).json({ bounty: bountyView(bounty, await names(householdId)) });
});

// Take your own bounty down while nobody has claimed it.
bountiesRouter.delete('/:id', async (req, res) => {
  const result = await Bounty.findOneAndUpdate(
    {
      _id: objectId(req.params.id),
      household: householdIdOf(req),
      createdBy: req.user!._id,
      status: 'open',
    },
    { status: 'cancelled' },
  );
  if (!result) throw new HttpError(404, 'Open bounty not found');
  res.json({ ok: true });
});
