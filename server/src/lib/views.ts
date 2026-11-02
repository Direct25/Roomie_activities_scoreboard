import type { Types } from 'mongoose';
import type { ActivityDoc } from '../models/Activity';
import type { EntryDoc } from '../models/Entry';
import type { HouseholdDoc } from '../models/Household';
import type { UserDoc } from '../models/User';
import type { Member } from './scoring';

export function publicUser(user: UserDoc) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    householdId: user.household ? String(user.household) : null,
  };
}

export function householdView(household: HouseholdDoc, members: Member[]) {
  return {
    id: String(household._id),
    name: household.name,
    code: household.code,
    timezone: household.timezone,
    members,
  };
}

export function activityView(activity: ActivityDoc) {
  return {
    id: String(activity._id),
    name: activity.name,
    emoji: activity.emoji,
    points: activity.points,
  };
}

export function entryView(entry: EntryDoc, names: Map<string, string>) {
  const userId = String(entry.user);
  const disputedBy = entry.disputedBy ? String(entry.disputedBy as Types.ObjectId) : null;
  return {
    id: String(entry._id),
    userId,
    userName: names.get(userId) ?? 'Former roommate',
    activityName: entry.activityName,
    emoji: entry.emoji,
    points: entry.points,
    note: entry.note ?? '',
    status: entry.status,
    disputedBy,
    disputedByName: disputedBy ? (names.get(disputedBy) ?? 'Former roommate') : null,
    weekKey: entry.weekKey,
    dayKey: entry.dayKey,
    createdAt: entry.createdAt.toISOString(),
  };
}
