import type { Types } from 'mongoose';
import type { ActivityDoc } from '../models/Activity';
import type { BountyDoc } from '../models/Bounty';
import type { ChallengeDoc } from '../models/Challenge';
import type { EntryDoc } from '../models/Entry';
import type { HouseholdDoc } from '../models/Household';
import type { SettlementDoc } from '../models/Settlement';
import type { UserDoc } from '../models/User';
import { upiLink } from './prizes';
import type { Member } from './scoring';
import { weekEndsOn, weekStartsOn } from './weeks';

export type Names = Map<string, string>;

const nameOf = (names: Names, id: Types.ObjectId | string | null | undefined) =>
  id ? (names.get(String(id)) ?? 'Former roommate') : null;

export function publicUser(user: UserDoc) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    householdId: user.household ? String(user.household) : null,
    upiId: user.upiId ?? '',
  };
}

export function householdView(household: HouseholdDoc, members: Member[]) {
  return {
    id: String(household._id),
    name: household.name,
    code: household.code,
    timezone: household.timezone,
    ownerId: String(household.createdBy),
    prizes: { enabled: household.prizesEnabled, rupees: household.prizes },
    members,
  };
}

export function activityView(activity: ActivityDoc, hotBonus = 0) {
  return {
    id: String(activity._id),
    name: activity.name,
    emoji: activity.emoji,
    points: activity.points,
    // Extra points right now because nobody has done this chore for a while.
    hotBonus,
  };
}

export function entryView(entry: EntryDoc, names: Names) {
  const userId = String(entry.user);
  return {
    id: String(entry._id),
    userId,
    userName: nameOf(names, userId),
    kind: entry.kind ?? 'chore',
    activityName: entry.activityName,
    emoji: entry.emoji,
    points: entry.points,
    bonusPoints: entry.bonusPoints ?? 0,
    note: entry.note ?? '',
    status: entry.status,
    disputedBy: entry.disputedBy ? String(entry.disputedBy) : null,
    disputedByName: nameOf(names, entry.disputedBy),
    weekKey: entry.weekKey,
    dayKey: entry.dayKey,
    createdAt: entry.createdAt.toISOString(),
  };
}

export function bountyView(bounty: BountyDoc, names: Names) {
  return {
    id: String(bounty._id),
    activityId: String(bounty.activity),
    activityName: bounty.activityName,
    emoji: bounty.emoji,
    bonusPoints: bounty.bonusPoints,
    createdBy: String(bounty.createdBy),
    createdByName: nameOf(names, bounty.createdBy),
    expiresAt: bounty.expiresAt.toISOString(),
  };
}

export function challengeView(
  challenge: ChallengeDoc,
  names: Names,
  live?: { challenger: number; opponent: number },
) {
  const done = challenge.status === 'completed';
  return {
    id: String(challenge._id),
    challengerId: String(challenge.challenger),
    challengerName: nameOf(names, challenge.challenger),
    opponentId: String(challenge.opponent),
    opponentName: nameOf(names, challenge.opponent),
    metric: challenge.metric,
    activityName: challenge.activityName,
    emoji: challenge.emoji,
    days: challenge.days,
    stakePoints: challenge.stakePoints,
    status: challenge.status,
    startDay: challenge.startDay,
    endDay: challenge.endDay,
    winnerId: challenge.winner ? String(challenge.winner) : null,
    challengerScore: done ? challenge.challengerScore : (live?.challenger ?? 0),
    opponentScore: done ? challenge.opponentScore : (live?.opponent ?? 0),
    expiresAt: challenge.expiresAt.toISOString(),
    createdAt: challenge.createdAt.toISOString(),
  };
}

export function settlementView(
  settlement: SettlementDoc,
  names: Names,
  upiIds: Map<string, string>,
  meId: string,
) {
  return {
    id: String(settlement._id),
    weekKey: settlement.weekKey,
    startsOn: weekStartsOn(settlement.weekKey),
    endsOn: weekEndsOn(settlement.weekKey),
    prizes: settlement.prizes,
    memberCount: settlement.memberCount,
    payouts: settlement.payouts.map((p) => ({
      userId: String(p.user),
      name: nameOf(names, p.user),
      rank: p.rank,
      prizePaise: p.prizePaise,
    })),
    balances: settlement.balances.map((b) => ({
      userId: String(b.user),
      name: nameOf(names, b.user),
      prizePaise: b.prizePaise,
      sharePaise: b.sharePaise,
      netPaise: b.netPaise,
    })),
    transfers: settlement.transfers.map((t) => {
      const payeeUpi = upiIds.get(String(t.to)) ?? '';
      const payeeName = nameOf(names, t.to) ?? 'Roommate';
      return {
        id: String(t._id),
        fromId: String(t.from),
        fromName: nameOf(names, t.from),
        toId: String(t.to),
        toName: payeeName,
        amountPaise: t.amountPaise,
        paid: t.paid,
        paidAt: t.paidAt ? t.paidAt.toISOString() : null,
        // Only the person who has to pay needs the payee's UPI details.
        upiId: String(t.from) === meId ? payeeUpi : '',
        upiLink:
          String(t.from) === meId && payeeUpi && !t.paid
            ? upiLink({
                upiId: payeeUpi,
                name: payeeName,
                amountPaise: t.amountPaise,
                note: `Roomie ${settlement.weekKey}`,
              })
            : '',
      };
    }),
  };
}
