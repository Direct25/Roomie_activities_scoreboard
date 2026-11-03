import { Router } from 'express';
import { z } from 'zod';
import { generateJoinCode } from '../lib/code';
import { HttpError, parse } from '../lib/http';
import { finalizeSettlements } from '../lib/settlements';
import { loadMembers } from '../lib/stats';
import { householdView, publicUser } from '../lib/views';
import { dayKey, isValidTimezone, weekKeyOfDay } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { joinLimiter } from '../middleware/limits';
import { Activity, DEFAULT_ACTIVITIES } from '../models/Activity';
import { Bounty } from '../models/Bounty';
import { Challenge } from '../models/Challenge';
import { Entry } from '../models/Entry';
import { Household } from '../models/Household';
import { Settlement } from '../models/Settlement';
import { User } from '../models/User';

export const householdsRouter = Router();
householdsRouter.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(2, 'Give your place a name').max(40),
  timezone: z
    .string()
    .refine(isValidTimezone, 'Unknown timezone')
    .optional(),
});

const joinSchema = z.object({
  code: z.string().trim().min(4).max(12),
});

householdsRouter.post('/', async (req, res) => {
  const user = req.user!;
  if (user.household) throw new HttpError(409, 'You are already in a household');

  const { name, timezone } = parse(createSchema, req.body);

  let household = null;
  for (let attempt = 0; attempt < 5 && !household; attempt += 1) {
    try {
      const tz = timezone ?? 'UTC';
      household = await Household.create({
        name,
        timezone: tz,
        code: generateJoinCode(),
        createdBy: user._id,
        prizesFrom: weekKeyOfDay(dayKey(new Date(), tz)),
      });
    } catch (error) {
      // Retry on the (very unlikely) join code collision.
      if ((error as { code?: number }).code !== 11000) throw error;
    }
  }
  if (!household) throw new HttpError(500, 'Could not create the household, please try again');

  await Activity.insertMany(DEFAULT_ACTIVITIES.map((a) => ({ ...a, household: household._id })));
  user.household = household._id;
  await user.save();

  res.status(201).json({
    user: publicUser(user),
    household: householdView(household, await loadMembers(household._id)),
  });
});

householdsRouter.post('/join', joinLimiter, async (req, res) => {
  const user = req.user!;
  if (user.household) throw new HttpError(409, 'You are already in a household');

  const { code } = parse(joinSchema, req.body);
  const household = await Household.findOne({ code: code.toUpperCase() });
  if (!household) throw new HttpError(404, 'No household found with that code');

  // Weeks that already ended are settled among the people who were here, so a new
  // roommate never inherits a share of last week's pot.
  await finalizeSettlements(household);

  user.household = household._id;
  await user.save();

  res.json({
    user: publicUser(user),
    household: householdView(household, await loadMembers(household._id)),
  });
});

householdsRouter.get('/me', async (req, res) => {
  const householdId = householdIdOf(req);
  const household = await Household.findById(householdId);
  if (!household) throw new HttpError(404, 'Household not found');

  res.json({ household: householdView(household, await loadMembers(household._id)) });
});

householdsRouter.post('/leave', async (req, res) => {
  const user = req.user!;
  const householdId = householdIdOf(req);

  // Settle finished weeks first, so leaving can't dodge what you owe.
  const leaving = await Household.findById(householdId);
  if (leaving) await finalizeSettlements(leaving);

  user.household = null;
  await user.save();

  const remaining = await User.find({ household: householdId }).sort({ createdAt: 1 }).select('_id');
  if (remaining.length === 0) {
    // The last person out cleans up after themselves.
    await Promise.all([
      Household.deleteOne({ _id: householdId }),
      Activity.deleteMany({ household: householdId }),
      Entry.deleteMany({ household: householdId }),
      Challenge.deleteMany({ household: householdId }),
      Bounty.deleteMany({ household: householdId }),
      Settlement.deleteMany({ household: householdId }),
    ]);
  } else {
    // If the owner leaves, the longest-standing roommate takes over the prize settings.
    await Household.updateOne({ _id: householdId, createdBy: user._id }, { createdBy: remaining[0]._id });
    // Cancel anything the leaver was part of so nothing is left hanging.
    await Challenge.updateMany(
      {
        household: householdId,
        status: { $in: ['pending', 'active'] },
        $or: [{ challenger: user._id }, { opponent: user._id }],
      },
      { status: 'cancelled' },
    );
    await Bounty.updateMany({ household: householdId, status: 'open', createdBy: user._id }, { status: 'cancelled' });
  }

  res.json({ user: publicUser(user) });
});
