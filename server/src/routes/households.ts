import { Router } from 'express';
import { z } from 'zod';
import { generateJoinCode } from '../lib/code';
import { HttpError, parse } from '../lib/http';
import { loadMembers } from '../lib/stats';
import { householdView, publicUser } from '../lib/views';
import { isValidTimezone } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { joinLimiter } from '../middleware/limits';
import { Activity, DEFAULT_ACTIVITIES } from '../models/Activity';
import { Entry } from '../models/Entry';
import { Household } from '../models/Household';
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
      household = await Household.create({
        name,
        timezone: timezone ?? 'UTC',
        code: generateJoinCode(),
        createdBy: user._id,
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

  user.household = null;
  await user.save();

  // The last person out cleans up after themselves.
  if (!(await User.exists({ household: householdId }))) {
    await Promise.all([
      Household.deleteOne({ _id: householdId }),
      Activity.deleteMany({ household: householdId }),
      Entry.deleteMany({ household: householdId }),
    ]);
  }

  res.json({ user: publicUser(user) });
});
