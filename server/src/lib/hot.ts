import type { Types } from 'mongoose';
import type { ActivityDoc } from '../models/Activity';
import { Entry } from '../models/Entry';
import { dayKey, daysBetween } from './weeks';

/**
 * Hot chores: a chore nobody has done for a few days heats up and is worth more,
 * so the bathroom can't be ignored forever. The bonus resets as soon as someone does it.
 */
export const HOT_AFTER_DAYS = 3; // untouched for this many days and it starts heating up
export const HOT_STEP = 0.1; // +10% of the base points for every day after that
export const HOT_CAP = 0.5; // never more than +50%

export function hotBonus(basePoints: number, daysUntouched: number): number {
  if (daysUntouched < HOT_AFTER_DAYS) return 0;
  const fraction = Math.min(HOT_CAP, (daysUntouched - HOT_AFTER_DAYS + 1) * HOT_STEP);
  return Math.max(1, Math.round(basePoints * fraction));
}

/** Latest local day each chore was done (counted entries only), keyed by activity id. */
export async function lastDoneByActivity(householdId: Types.ObjectId): Promise<Map<string, string>> {
  const rows = await Entry.find({ household: householdId, kind: 'chore', status: 'counted' })
    .select('activity dayKey')
    .lean();
  const last = new Map<string, string>();
  for (const row of rows) {
    const id = String(row.activity);
    const seen = last.get(id);
    if (!seen || row.dayKey > seen) last.set(id, row.dayKey);
  }
  return last;
}

/** Current bonus for one chore. A chore nobody has ever done counts from the day it was added. */
export function hotBonusFor(
  activity: Pick<ActivityDoc, 'points'> & { _id: unknown; createdAt: Date },
  lastDone: Map<string, string>,
  timeZone: string,
  now = new Date(),
): number {
  const since = lastDone.get(String(activity._id)) ?? dayKey(activity.createdAt, timeZone);
  return hotBonus(activity.points, daysBetween(since, dayKey(now, timeZone)));
}
