"use client";

import { weekLabel } from "@/lib/format";
import type { WeekResult } from "@/lib/types";
import { Card, EmptyState } from "./ui";

export function WeeksTab({
  history,
  meId,
  onShare,
}: {
  history: WeekResult[];
  meId: string;
  onShare: (week: WeekResult) => void;
}) {
  if (history.length === 0) {
    return (
      <Card>
        <EmptyState emoji="📅" title="No finished weeks yet">
          The first results land after Sunday night, when the board resets.
        </EmptyState>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {history.map((week) => (
        <li key={week.weekKey}>
          <Card className="pop-in">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                {weekLabel(week.startsOn, week.endsOn)}
              </p>
              <button
                type="button"
                onClick={() => onShare(week)}
                className="shrink-0 rounded-full bg-bg px-3 py-1 text-xs font-bold"
              >
                Share ↗
              </button>
            </div>
            <p className="mt-1 text-lg font-extrabold">
              👑 {week.winners.map((w) => (w.userId === meId ? "You" : w.name)).join(" & ")}
              <span className="ml-2 text-sm font-semibold text-muted">
                {week.winners[0].points} pts{week.winners.length > 1 ? " each" : ""}
              </span>
            </p>
            <ol className="mt-3 space-y-1.5 text-sm">
              {week.standings.map((s) => (
                <li key={s.userId} className="flex justify-between gap-3">
                  <span className="truncate">{s.userId === meId ? `${s.name} (you)` : s.name}</span>
                  <span className="font-bold tabular-nums">{s.points}</span>
                </li>
              ))}
            </ol>
          </Card>
        </li>
      ))}
    </ul>
  );
}
