"use client";

import { resetLabel, weekLabel } from "@/lib/format";
import type { Leaderboard, Standing } from "@/lib/types";
import { Avatar, Button, Card, EmptyState } from "./ui";

const MEDALS = ["🥇", "🥈", "🥉"];
const PODIUM_HEIGHT = ["h-28", "h-20", "h-14"];

function Podium({ standings, meId }: { standings: Standing[]; meId: string }) {
  const top = standings.filter((s) => s.rank <= 3 && s.points > 0).slice(0, 3);
  if (top.length < 2) return null;

  // Classic podium layout: 2nd, 1st, 3rd.
  const arranged = top.length === 3 ? [top[1], top[0], top[2]] : [top[1], top[0]];

  return (
    <div className="flex items-end justify-center gap-3 px-2 pt-4" aria-label="Podium">
      {arranged.map((s) => (
        <div key={s.userId} className="flex w-24 flex-col items-center">
          <span className="text-2xl" aria-hidden="true">
            {MEDALS[s.rank - 1]}
          </span>
          <Avatar name={s.name} seed={s.userId} size={48} />
          <p className="mt-1 max-w-full truncate text-sm font-bold">
            {s.userId === meId ? "You" : s.name}
          </p>
          <p className="text-xs font-semibold text-muted">{s.points} pts</p>
          <div
            className={`mt-2 w-full rounded-t-2xl ${PODIUM_HEIGHT[s.rank - 1]} ${
              s.rank === 1 ? "bg-gold" : s.rank === 2 ? "bg-line" : "bg-accent-soft"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function detailLine(s: Standing): string {
  const parts = [`${s.count} ${s.count === 1 ? "chore" : "chores"}`];
  if (s.streak >= 2) parts.push(`🔥 ${s.streak}-day streak`);
  if (s.crowns > 0) parts.push(`👑 ${s.crowns} ${s.crowns === 1 ? "win" : "wins"}`);
  return parts.join(" · ");
}

export function BoardTab({
  board,
  meId,
  onWeekChange,
  onLogClick,
}: {
  board: Leaderboard;
  meId: string;
  onWeekChange: (week: string) => void;
  onLogClick: () => void;
}) {
  const scored = board.totals.points > 0;
  const subtitle = board.week === "all" ? "Since day one" : board.isCurrent ? resetLabel(board.daysUntilReset) : "Final standings";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          aria-label="Choose a week"
          value={board.week}
          onChange={(e) => onWeekChange(e.target.value)}
          className="min-w-[14rem] flex-1 rounded-2xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold"
        >
          {board.weeks.map((w) => (
            <option key={w.key} value={w.key}>
              {w.key === board.currentWeek ? "This week" : "Week"} · {weekLabel(w.startsOn, w.endsOn)}
            </option>
          ))}
          <option value="all">All time</option>
        </select>
        <span className="shrink-0 rounded-full bg-gold-soft px-3 py-1.5 text-xs font-bold">{subtitle}</span>
      </div>

      <Card className="pop-in !p-3">
        {scored ? (
          <>
            <Podium standings={board.standings} meId={meId} />
            <ol className="mt-4 space-y-2">
              {board.standings.map((s) => (
                <li
                  key={s.userId}
                  className={`flex items-center gap-3 rounded-2xl border p-3 ${
                    s.userId === meId ? "border-accent bg-accent-soft" : "border-line bg-bg"
                  }`}
                >
                  <span className="w-7 text-center text-base font-extrabold text-muted">
                    {s.points > 0 ? (MEDALS[s.rank - 1] ?? s.rank) : "–"}
                  </span>
                  <Avatar name={s.name} seed={s.userId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">
                      {s.name}
                      {s.userId === meId ? <span className="font-medium text-muted"> (you)</span> : null}
                    </p>
                    <p className="text-xs leading-snug text-muted">{detailLine(s)}</p>
                  </div>
                  <p className="text-xl font-extrabold tabular-nums">
                    {s.points}
                    <span className="ml-0.5 text-xs font-semibold text-muted">pts</span>
                  </p>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <EmptyState emoji="🏁" title={board.isCurrent ? "Nobody's on the board yet" : "No points that week"}>
            {board.isCurrent ? (
              <>
                <p>Log the first chore and grab an early lead.</p>
                <Button onClick={onLogClick} className="mt-4">
                  Log a chore
                </Button>
              </>
            ) : null}
          </EmptyState>
        )}
      </Card>

      {scored ? (
        <p className="text-center text-xs text-muted">
          {board.totals.count} {board.totals.count === 1 ? "chore" : "chores"} · {board.totals.points} points between you
        </p>
      ) : null}
    </div>
  );
}
