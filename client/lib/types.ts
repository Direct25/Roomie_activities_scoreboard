export interface User {
  id: string;
  name: string;
  email: string;
  householdId: string | null;
  upiId: string;
}

export interface Member {
  id: string;
  name: string;
}

export interface Household {
  id: string;
  name: string;
  code: string;
  timezone: string;
  ownerId: string;
  prizes: { enabled: boolean; rupees: number[] };
  members: Member[];
}

export interface Activity {
  id: string;
  name: string;
  emoji: string;
  points: number;
  /** Extra points right now because nobody has done this chore for a few days. */
  hotBonus: number;
}

export interface Entry {
  id: string;
  userId: string;
  userName: string;
  /** "bonus" entries are points awarded by the app (a challenge win), not a chore. */
  kind: "chore" | "bonus";
  activityName: string;
  emoji: string;
  points: number;
  bonusPoints: number;
  note: string;
  status: "counted" | "disputed";
  disputedBy: string | null;
  disputedByName: string | null;
  weekKey: string;
  dayKey: string;
  createdAt: string;
}

export interface Standing {
  userId: string;
  name: string;
  points: number;
  count: number;
  streak: number;
  crowns: number;
  rank: number;
}

export interface WeekInfo {
  key: string;
  startsOn: string;
  endsOn: string;
}

export interface Leaderboard {
  week: string;
  currentWeek: string;
  isCurrent: boolean;
  startsOn: string | null;
  endsOn: string | null;
  daysUntilReset: number;
  today: string;
  weeks: WeekInfo[];
  standings: Standing[];
  totals: { points: number; count: number };
}

export interface WeekResult {
  weekKey: string;
  startsOn: string;
  endsOn: string;
  winners: { userId: string; name: string; points: number }[];
  standings: { userId: string; name: string; points: number }[];
}

export interface Bounty {
  id: string;
  activityId: string;
  activityName: string;
  emoji: string;
  bonusPoints: number;
  createdBy: string;
  createdByName: string | null;
  expiresAt: string;
}

export type ChallengeStatus = "pending" | "active" | "completed" | "declined" | "cancelled" | "expired";

export interface Challenge {
  id: string;
  challengerId: string;
  challengerName: string | null;
  opponentId: string;
  opponentName: string | null;
  metric: "points" | "activity";
  activityName: string;
  emoji: string;
  days: number;
  stakePoints: number;
  status: ChallengeStatus;
  startDay: string;
  endDay: string;
  winnerId: string | null;
  challengerScore: number;
  opponentScore: number;
  expiresAt: string;
  createdAt: string;
}

export interface NewChallenge {
  opponentId: string;
  metric: "points" | "activity";
  activityId?: string;
  days: number;
  stakePoints: number;
}

export interface Transfer {
  id: string;
  fromId: string;
  fromName: string | null;
  toId: string;
  toName: string;
  amountPaise: number;
  paid: boolean;
  paidAt: string | null;
  /** Only filled in for the person who has to pay. */
  upiId: string;
  upiLink: string;
}

export interface Settlement {
  id: string;
  weekKey: string;
  startsOn: string;
  endsOn: string;
  prizes: number[];
  memberCount: number;
  payouts: { userId: string; name: string | null; rank: number; prizePaise: number }[];
  balances: { userId: string; name: string | null; prizePaise: number; sharePaise: number; netPaise: number }[];
  transfers: Transfer[];
}

export interface Prizes {
  settings: { enabled: boolean; prizes: number[]; isOwner: boolean };
  summary: { owePaise: number; owedPaise: number };
  weeks: Settlement[];
}

export interface Badge {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  tier: 1 | 2 | 3;
}

export interface MemberBadges {
  userId: string;
  name: string;
  badges: Badge[];
}
