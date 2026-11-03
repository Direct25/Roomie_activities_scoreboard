import type { Types } from 'mongoose';
import { Entry } from '../models/Entry';
import { User } from '../models/User';
import type { Bucket, Member } from './scoring';

export async function loadMembers(householdId: Types.ObjectId): Promise<Member[]> {
  const users = await User.find({ household: householdId }).select('name').sort({ createdAt: 1 });
  return users.map((user) => ({ id: String(user._id), name: user.name }));
}

/**
 * One bucket per member per day, counting only entries that haven't been disputed.
 * A household is a handful of people logging a few chores a day, so bucketing in
 * memory is simpler and more portable than a database-side $group.
 */
export async function loadBuckets(householdId: Types.ObjectId): Promise<Bucket[]> {
  const entries = await Entry.find({ household: householdId, status: 'counted' })
    .select('user kind weekKey dayKey points')
    .lean();

  const buckets = new Map<string, Bucket>();
  for (const entry of entries) {
    const userId = String(entry.user);
    // Bonus points (like a challenge win) add to the score but aren't chores:
    // they don't raise the chore count or keep a streak alive.
    const chores = entry.kind === 'bonus' ? 0 : 1;
    const key = `${userId}|${entry.dayKey}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.points += entry.points;
      bucket.count += chores;
    } else {
      buckets.set(key, {
        userId,
        weekKey: entry.weekKey,
        dayKey: entry.dayKey,
        points: entry.points,
        count: chores,
      });
    }
  }
  return [...buckets.values()];
}
