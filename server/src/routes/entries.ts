import { Router } from 'express';
import { z } from 'zod';
import { HttpError, objectId, parse } from '../lib/http';
import { loadMembers } from '../lib/stats';
import { entryView } from '../lib/views';
import { dayKey, weekKeyOfDay } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Activity } from '../models/Activity';
import { Entry } from '../models/Entry';
import { Household } from '../models/Household';

export const entriesRouter = Router();
entriesRouter.use(requireAuth);

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;
const DOUBLE_TAP_MS = 5_000;

const createSchema = z.object({
  activityId: z.string(),
  note: z.string().trim().max(120).optional(),
});

async function namesFor(householdId: ReturnType<typeof householdIdOf>) {
  const members = await loadMembers(householdId);
  return new Map(members.map((m) => [m.id, m.name]));
}

async function findEntry(req: Parameters<typeof householdIdOf>[0]) {
  const entry = await Entry.findOne({
    _id: objectId(req.params.id),
    household: householdIdOf(req),
  });
  if (!entry) throw new HttpError(404, 'Entry not found');
  return entry;
}

entriesRouter.get('/', async (req, res) => {
  const householdId = householdIdOf(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);

  const filter: Record<string, unknown> = { household: householdId };
  const before = typeof req.query.before === 'string' ? new Date(req.query.before) : null;
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before };

  const entries = await Entry.find(filter).sort({ createdAt: -1 }).limit(limit);
  const names = await namesFor(householdId);
  res.json({ entries: entries.map((entry) => entryView(entry, names)) });
});

entriesRouter.post('/', async (req, res) => {
  const user = req.user!;
  const householdId = householdIdOf(req);
  const body = parse(createSchema, req.body);

  const activity = await Activity.findOne({
    _id: objectId(body.activityId, 'activityId'),
    household: householdId,
    archived: false,
  });
  if (!activity) throw new HttpError(404, 'Activity not found');

  // Guard against accidental double taps.
  const duplicate = await Entry.exists({
    household: householdId,
    user: user._id,
    activity: activity._id,
    createdAt: { $gte: new Date(Date.now() - DOUBLE_TAP_MS) },
  });
  if (duplicate) throw new HttpError(409, 'You just logged that one, give it a few seconds');

  const household = await Household.findById(householdId);
  if (!household) throw new HttpError(404, 'Household not found');

  const today = dayKey(new Date(), household.timezone);
  const entry = await Entry.create({
    household: householdId,
    user: user._id,
    activity: activity._id,
    activityName: activity.name,
    emoji: activity.emoji,
    points: activity.points,
    note: body.note ?? '',
    dayKey: today,
    weekKey: weekKeyOfDay(today),
  });

  res.status(201).json({ entry: entryView(entry, await namesFor(householdId)) });
});

// Undo your own entry (within 24 hours).
entriesRouter.delete('/:id', async (req, res) => {
  const entry = await findEntry(req);
  if (String(entry.user) !== String(req.user!._id)) {
    throw new HttpError(403, 'You can only remove your own entries');
  }
  if (Date.now() - entry.createdAt.getTime() > UNDO_WINDOW_MS) {
    throw new HttpError(403, 'Entries can only be removed within 24 hours');
  }
  await entry.deleteOne();
  res.json({ ok: true });
});

// A roommate says "that didn't happen": the entry stops counting until reinstated.
entriesRouter.post('/:id/dispute', async (req, res) => {
  const user = req.user!;
  const entry = await findEntry(req);
  if (String(entry.user) === String(user._id)) {
    throw new HttpError(400, "You can't dispute your own entry");
  }

  if (entry.status !== 'disputed') {
    entry.status = 'disputed';
    entry.disputedBy = user._id;
    await entry.save();
  }
  res.json({ entry: entryView(entry, await namesFor(householdIdOf(req))) });
});

// Only the person who disputed it can take the dispute back.
entriesRouter.post('/:id/reinstate', async (req, res) => {
  const user = req.user!;
  const entry = await findEntry(req);
  if (entry.status !== 'disputed') {
    return res.json({ entry: entryView(entry, await namesFor(householdIdOf(req))) });
  }
  if (String(entry.disputedBy) !== String(user._id)) {
    throw new HttpError(403, 'Only the person who disputed this can reinstate it');
  }

  entry.status = 'counted';
  entry.disputedBy = null;
  await entry.save();
  res.json({ entry: entryView(entry, await namesFor(householdIdOf(req))) });
});
