import { Router } from 'express';
import { z } from 'zod';
import { HttpError, objectId, parse } from '../lib/http';
import { finalizeSettlements } from '../lib/settlements';
import { loadMembers } from '../lib/stats';
import { settlementView } from '../lib/views';
import { dayKey, weekKeyOfDay } from '../lib/weeks';
import { householdIdOf, requireAuth } from '../middleware/auth';
import { Household } from '../models/Household';
import { Settlement } from '../models/Settlement';
import { User } from '../models/User';

export const prizesRouter = Router();
prizesRouter.use(requireAuth);

const settingsSchema = z.object({
  enabled: z.boolean(),
  // Whole rupees for 1st, 2nd and 3rd place. 0 turns a place off.
  prizes: z.array(z.number().int().min(0).max(500)).length(3, 'Set a prize for each of the top 3'),
});

async function loadHousehold(req: Parameters<typeof householdIdOf>[0]) {
  const household = await Household.findById(householdIdOf(req));
  if (!household) throw new HttpError(404, 'Household not found');
  return household;
}

prizesRouter.get('/', async (req, res) => {
  const me = String(req.user!._id);
  const household = await loadHousehold(req);
  await finalizeSettlements(household);

  const [settlements, members, users] = await Promise.all([
    Settlement.find({ household: household._id }).sort({ weekKey: -1 }).limit(12),
    loadMembers(household._id),
    User.find({ household: household._id }).select('upiId'),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const upiIds = new Map(users.map((u) => [String(u._id), u.upiId ?? '']));

  // What's still unsettled for the signed-in person, across every week.
  let owePaise = 0;
  let owedPaise = 0;
  for (const settlement of settlements) {
    for (const transfer of settlement.transfers) {
      if (transfer.paid) continue;
      if (String(transfer.from) === me) owePaise += transfer.amountPaise;
      if (String(transfer.to) === me) owedPaise += transfer.amountPaise;
    }
  }

  res.json({
    settings: {
      enabled: household.prizesEnabled,
      prizes: household.prizes,
      isOwner: String(household.createdBy) === me,
    },
    summary: { owePaise, owedPaise },
    weeks: settlements.map((s) => settlementView(s, names, upiIds, me)),
  });
});

// Only the household's creator changes the prize rules.
prizesRouter.put('/settings', async (req, res) => {
  const household = await loadHousehold(req);
  if (String(household.createdBy) !== String(req.user!._id)) {
    throw new HttpError(403, 'Only the person who created the household can change prizes');
  }
  const { enabled, prizes } = parse(settingsSchema, req.body);

  if (enabled && (!household.prizesEnabled || !household.prizesFrom)) {
    // Turning prizes on never reaches back into weeks that already happened.
    household.prizesFrom = weekKeyOfDay(dayKey(new Date(), household.timezone));
  }
  household.prizesEnabled = enabled;
  household.prizes = prizes;
  await household.save();

  res.json({ settings: { enabled: household.prizesEnabled, prizes: household.prizes, isOwner: true } });
});

// Either person in a payment can mark it paid (or undo it if it was a mistake).
prizesRouter.post('/:settlementId/transfers/:transferId/paid', async (req, res) => {
  const me = String(req.user!._id);
  const { paid } = parse(z.object({ paid: z.boolean() }), req.body);

  const settlement = await Settlement.findOne({
    _id: objectId(req.params.settlementId, 'settlementId'),
    household: householdIdOf(req),
  });
  const transfer = settlement?.transfers.find((t) => String(t._id) === req.params.transferId);
  if (!settlement || !transfer) throw new HttpError(404, 'Payment not found');

  if (String(transfer.from) !== me && String(transfer.to) !== me) {
    throw new HttpError(403, 'Only the two people in this payment can update it');
  }

  transfer.paid = paid;
  transfer.paidAt = paid ? new Date() : null;
  transfer.paidMarkedBy = paid ? req.user!._id : null;
  await settlement.save();

  res.json({ ok: true, paid });
});
