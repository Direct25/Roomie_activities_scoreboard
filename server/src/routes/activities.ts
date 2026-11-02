import { Router } from 'express';
import { z } from 'zod';
import { HttpError, objectId, parse } from '../lib/http';
import { activityView } from '../lib/views';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Activity } from '../models/Activity';

export const activitiesRouter = Router();
activitiesRouter.use(requireAuth);

const MAX_ACTIVITIES = 50;

const createSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  emoji: z.string().trim().min(1).max(16).optional(),
  points: z.number().int().min(1, 'At least 1 point').max(100, 'At most 100 points'),
});

activitiesRouter.get('/', async (req, res) => {
  const activities = await Activity.find({ household: householdIdOf(req), archived: false }).sort({
    createdAt: 1,
  });
  res.json({ activities: activities.map(activityView) });
});

activitiesRouter.post('/', async (req, res) => {
  const household = householdIdOf(req);
  const body = parse(createSchema, req.body);

  if ((await Activity.countDocuments({ household, archived: false })) >= MAX_ACTIVITIES) {
    throw new HttpError(409, `You can have up to ${MAX_ACTIVITIES} activities`);
  }

  const activity = await Activity.create({
    household,
    name: body.name,
    points: body.points,
    ...(body.emoji ? { emoji: body.emoji } : {}),
  });
  res.status(201).json({ activity: activityView(activity) });
});

activitiesRouter.delete('/:id', async (req, res) => {
  const activity = await Activity.findOneAndUpdate(
    { _id: objectId(req.params.id), household: householdIdOf(req), archived: false },
    { archived: true },
  );
  if (!activity) throw new HttpError(404, 'Activity not found');
  res.json({ ok: true });
});
