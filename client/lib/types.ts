export interface User {
  id: string;
  name: string;
  email: string;
  householdId: string | null;
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
  members: Member[];
}

export interface Activity {
  id: string;
  name: string;
  emoji: string;
  points: number;
}

export interface Entry {
  id: string;
  userId: string;
  userName: string;
  activityName: string;
  emoji: string;
  points: number;
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
