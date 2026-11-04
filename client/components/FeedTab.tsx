"use client";

import { timeAgo } from "@/lib/format";
import type { Entry } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { Avatar, Card, EmptyState } from "./ui";

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

export function FeedTab({
  entries,
  meId,
  onUndo,
  onDispute,
  onReinstate,
}: {
  entries: Entry[];
  meId: string;
  onUndo: (entry: Entry) => void;
  onDispute: (entry: Entry) => void;
  onReinstate: (entry: Entry) => void;
}) {
  const now = useNow();

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState emoji="🫧" title="Nothing logged yet">
          Chores your household logs will show up here.
        </EmptyState>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => {
        const mine = entry.userId === meId;
        const disputed = entry.status === "disputed";
        // Bonus entries (challenge wins) come from the app, so they can't be undone or disputed.
        const isBonus = entry.kind === "bonus";
        const canUndo = mine && !isBonus && now - new Date(entry.createdAt).getTime() < UNDO_WINDOW_MS;
        const canDispute = !mine && !disputed && !isBonus;
        const canReinstate = disputed && entry.disputedBy === meId;

        return (
          <li key={entry.id}>
            <Card className="pop-in !p-3">
              <div className="flex items-start gap-3">
                <Avatar name={entry.userName} seed={entry.userId} />
                <div className="min-w-0 flex-1">
                  <p className={`font-semibold leading-snug ${disputed ? "text-muted line-through" : ""}`}>
                    <span className="font-bold">{mine ? "You" : entry.userName}</span> · {entry.emoji}{" "}
                    {entry.activityName}
                  </p>
                  {entry.note ? <p className="mt-0.5 text-sm italic text-muted">“{entry.note}”</p> : null}
                  {entry.bonusPoints > 0 ? (
                    <p className="mt-0.5 text-xs font-semibold text-mint">includes +{entry.bonusPoints} bonus</p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-muted">{timeAgo(entry.createdAt, now)}</p>
                  {disputed ? (
                    <p className="mt-1.5 rounded-xl bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">
                      Disputed by {entry.disputedBy === meId ? "you" : entry.disputedByName}, so it doesn’t count
                    </p>
                  ) : null}
                </div>
                <p
                  className={`shrink-0 text-lg font-extrabold tabular-nums ${
                    disputed ? "text-muted line-through" : "text-mint"
                  }`}
                >
                  +{entry.points}
                </p>
              </div>

              {canUndo || canDispute || canReinstate ? (
                <div className="mt-2 flex justify-end gap-2 text-xs font-bold">
                  {canUndo ? (
                    <button type="button" onClick={() => onUndo(entry)} className="rounded-full bg-bg px-3 py-1.5">
                      Undo
                    </button>
                  ) : null}
                  {canDispute ? (
                    <button
                      type="button"
                      onClick={() => onDispute(entry)}
                      className="rounded-full bg-bg px-3 py-1.5 text-danger"
                    >
                      Dispute
                    </button>
                  ) : null}
                  {canReinstate ? (
                    <button
                      type="button"
                      onClick={() => onReinstate(entry)}
                      className="rounded-full bg-mint-soft px-3 py-1.5 text-mint"
                    >
                      Take it back
                    </button>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
