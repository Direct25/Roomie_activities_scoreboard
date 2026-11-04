"use client";

import { useState, type FormEvent } from "react";
import { avatarColor, daysBetween, resetLabel, timeLeft } from "@/lib/format";
import type { Activity, Challenge, Leaderboard, Member, NewChallenge } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { Chip, Segmented, SelectField } from "./controls";
import { Avatar, Button, Card, EmptyState } from "./ui";

const DURATIONS = [
  { value: 1, label: "1 day" },
  { value: 3, label: "3 days" },
  { value: 7, label: "7 days" },
];

const STAKES = [
  { value: 0, label: "None" },
  { value: 10, label: "10" },
  { value: 25, label: "25" },
  { value: 50, label: "50" },
];

/** Everyone's points this week as a race, plus a nudge about who to catch. */
function Race({ board, meId }: { board: Leaderboard; meId: string }) {
  const rows = board.standings;
  const max = Math.max(1, ...rows.map((s) => s.points));
  const meIndex = rows.findIndex((s) => s.userId === meId);
  const me = rows[meIndex];

  let nudge = "";
  if (me && board.totals.points > 0) {
    if (meIndex > 0) {
      const ahead = rows[meIndex - 1];
      const gap = ahead.points - me.points;
      nudge =
        gap === 0
          ? `Level with ${ahead.name} on points. One more chore takes the spot!`
          : `${ahead.name} is ${gap} pts ahead of you. Catch up!`;
    } else if (rows[1]) {
      nudge = `You lead ${rows[1].name} by ${me.points - rows[1].points} pts. Don't slip!`;
    }
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">This week&rsquo;s race</h2>
        <span className="text-xs font-semibold text-muted">{resetLabel(board.daysUntilReset)}</span>
      </div>

      {board.totals.points === 0 ? (
        <EmptyState emoji="🏁" title="On your marks">
          Nobody has scored yet. Log a chore to take the lead.
        </EmptyState>
      ) : (
        <>
          <ol className="mt-4 space-y-3">
            {rows.map((s) => (
              <li key={s.userId} className="flex items-center gap-3">
                <Avatar name={s.name} seed={s.userId} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate font-bold">{s.userId === meId ? "You" : s.name}</span>
                    <span className="font-extrabold tabular-nums">{s.points}</span>
                  </div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-bg">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(3, (s.points / max) * 100)}%`, background: avatarColor(s.userId) }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {nudge ? <p className="mt-4 rounded-2xl bg-gold-soft px-3 py-2 text-sm font-semibold">{nudge}</p> : null}
        </>
      )}
    </Card>
  );
}

function describe(challenge: Challenge): string {
  const what =
    challenge.metric === "points" ? "Most points" : `Most ${challenge.emoji} ${challenge.activityName}`.trim();
  return `${what} · ${challenge.days}-day`;
}

function ChallengeCard({
  challenge: c,
  meId,
  today,
  now,
  onAccept,
  onDecline,
  onCancel,
}: {
  challenge: Challenge;
  meId: string;
  today: string;
  now: number;
  onAccept: (c: Challenge) => void;
  onDecline: (c: Challenge) => void;
  onCancel: (c: Challenge) => void;
}) {
  const label = (id: string, name: string | null) => (id === meId ? "You" : (name ?? "Former roommate"));
  const challenger = label(c.challengerId, c.challengerName);
  const opponent = label(c.opponentId, c.opponentName);
  const iAmChallenger = c.challengerId === meId;
  const iAmOpponent = c.opponentId === meId;
  const live = c.status === "active" || c.status === "completed";

  const total = c.challengerScore + c.opponentScore;
  const share = total === 0 ? 50 : Math.round((c.challengerScore / total) * 100);

  const daysLeft = c.status === "active" ? daysBetween(today, c.endDay) + 1 : 0;
  const winnerName = c.winnerId ? label(c.winnerId, c.winnerId === c.challengerId ? c.challengerName : c.opponentName) : null;

  return (
    <Card className="pop-in !p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold leading-snug">
            {challenger} <span className="text-muted">vs</span> {opponent}
          </p>
          <p className="text-xs text-muted">{describe(c)}</p>
        </div>
        <Chip tone={c.stakePoints > 0 ? "gold" : "muted"}>
          {c.stakePoints > 0 ? `🏅 ${c.stakePoints} bonus` : "Bragging rights"}
        </Chip>
      </div>

      {live ? (
        <div className="mt-3">
          <div className="flex justify-between gap-2 text-sm font-bold tabular-nums">
            <span className="truncate">
              {challenger} {c.challengerScore}
            </span>
            <span className="truncate">
              {c.opponentScore} {opponent}
            </span>
          </div>
          <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-bg">
            <div style={{ width: `${share}%`, background: avatarColor(c.challengerId) }} />
            <div style={{ width: `${100 - share}%`, background: avatarColor(c.opponentId) }} />
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {c.status === "pending" && iAmOpponent ? `${challenger} challenged you` : null}
          {c.status === "pending" && !iAmOpponent ? `Waiting for ${opponent} · ${timeLeft(c.expiresAt, now)}` : null}
          {c.status === "active" ? (daysLeft <= 1 ? "🔥 Last day" : `${daysLeft} days left`) : null}
          {c.status === "completed" ? (winnerName ? `🏆 ${winnerName} won` : "🤝 Draw") : null}
        </p>

        {c.status === "pending" && iAmOpponent ? (
          <div className="flex gap-2">
            <Button className="!px-4 !py-2" onClick={() => onAccept(c)}>
              Accept
            </Button>
            <Button variant="soft" className="!px-4 !py-2" onClick={() => onDecline(c)}>
              Decline
            </Button>
          </div>
        ) : null}
        {c.status === "pending" && iAmChallenger ? (
          <Button variant="ghost" className="!px-3 !py-2" onClick={() => onCancel(c)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function NewChallengeForm({
  opponents,
  activities,
  onCreate,
  onClose,
}: {
  opponents: Member[];
  activities: Activity[];
  onCreate: (input: NewChallenge) => Promise<boolean>;
  onClose: () => void;
}) {
  const [opponentId, setOpponentId] = useState(opponents[0]?.id ?? "");
  const [metric, setMetric] = useState<"points" | "activity">("points");
  const [activityId, setActivityId] = useState(activities[0]?.id ?? "");
  const [days, setDays] = useState(3);
  const [stakePoints, setStakePoints] = useState(10);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await onCreate({
      opponentId,
      metric,
      activityId: metric === "activity" ? activityId : undefined,
      days,
      stakePoints,
    });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-lg font-bold">Challenge a roommate</h2>

        <SelectField label="Who?" value={opponentId} onChange={setOpponentId}>
          {opponents.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </SelectField>

        <Segmented
          label="What counts?"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "points", label: "Most points" },
            { value: "activity", label: "One chore" },
          ]}
        />

        {metric === "activity" ? (
          <SelectField
            label="Which chore?"
            value={activityId}
            onChange={setActivityId}
            hint="Whoever does it more times wins."
          >
            {activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.emoji} {a.name}
              </option>
            ))}
          </SelectField>
        ) : null}

        <Segmented label="How long?" value={days} onChange={setDays} options={DURATIONS} />
        <Segmented
          label="Winner gets"
          value={stakePoints}
          onChange={setStakePoints}
          options={STAKES}
          hint="Bonus points from the app. Nobody loses points, and only chores done after they accept count."
        />

        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !opponentId || (metric === "activity" && !activityId)} className="flex-1">
            {busy ? "Sending…" : "Send challenge"}
          </Button>
          <Button type="button" variant="soft" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function BattleTab({
  current,
  challenges,
  activities,
  members,
  meId,
  onCreate,
  onAccept,
  onDecline,
  onCancel,
}: {
  current: Leaderboard;
  challenges: Challenge[];
  activities: Activity[];
  members: Member[];
  meId: string;
  onCreate: (input: NewChallenge) => Promise<boolean>;
  onAccept: (c: Challenge) => void;
  onDecline: (c: Challenge) => void;
  onCancel: (c: Challenge) => void;
}) {
  const now = useNow();
  const [creating, setCreating] = useState(false);
  const opponents = members.filter((m) => m.id !== meId);

  const incoming = challenges.filter((c) => c.status === "pending" && c.opponentId === meId);
  const running = challenges.filter((c) => c.status === "active" || (c.status === "pending" && c.opponentId !== meId));
  const finished = challenges.filter((c) => c.status === "completed").slice(0, 5);
  const shown = [...incoming, ...running, ...finished];

  return (
    <div className="space-y-4">
      <Race board={current} meId={meId} />

      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-lg font-bold">Duels</h2>
        {!creating && opponents.length > 0 ? (
          <Button className="!px-4 !py-2" onClick={() => setCreating(true)}>
            ⚔️ Challenge
          </Button>
        ) : null}
      </div>

      {creating ? (
        <NewChallengeForm
          opponents={opponents}
          activities={activities}
          onCreate={onCreate}
          onClose={() => setCreating(false)}
        />
      ) : null}

      {shown.length === 0 && !creating ? (
        <Card>
          <EmptyState emoji="⚔️" title="No duels yet">
            {opponents.length > 0
              ? "Pick a roommate and settle who really does more around here."
              : "Invite a roommate with your code to start a duel."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((c) => (
            <li key={c.id}>
              <ChallengeCard
                challenge={c}
                meId={meId}
                today={current.today}
                now={now}
                onAccept={onAccept}
                onDecline={onDecline}
                onCancel={onCancel}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
