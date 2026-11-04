"use client";

import { useState, type FormEvent } from "react";
import { timeLeft } from "@/lib/format";
import type { Activity, Bounty } from "@/lib/types";
import { Chip, Segmented, SelectField } from "./controls";
import { Button, Card, EmptyState, Field } from "./ui";

const EMOJI_CHOICES = ["✨", "🧹", "🍽️", "🧺", "🛒", "🪴", "🐕", "🍳", "🚿", "🛏️", "♻️", "🔧"];
const BOUNTY_OPTIONS = [10, 20, 30, 50].map((value) => ({ value, label: `+${value}` }));

export function LogTab({
  activities,
  bounties,
  meId,
  onLog,
  onCreate,
  onArchive,
  onPostBounty,
  onCancelBounty,
}: {
  activities: Activity[];
  bounties: Bounty[];
  meId: string;
  onLog: (activity: Activity, note: string) => Promise<boolean>;
  onCreate: (input: { name: string; emoji: string; points: number }) => Promise<boolean>;
  onArchive: (activity: Activity) => Promise<void>;
  onPostBounty: (activityId: string, bonusPoints: number) => Promise<boolean>;
  onCancelBounty: (bounty: Bounty) => void;
}) {
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"none" | "chore" | "bounty">("none");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(EMOJI_CHOICES[0]);
  const [newPoints, setNewPoints] = useState("10");
  const [saving, setSaving] = useState(false);

  const withoutBounty = activities.filter((a) => !bounties.some((b) => b.activityId === a.id));
  const [bountyActivity, setBountyActivity] = useState("");
  const [bountyPoints, setBountyPoints] = useState(20);

  const bountyFor = (activity: Activity) => bounties.find((b) => b.activityId === activity.id);

  async function tap(activity: Activity) {
    if (editing || busyId) return;
    setBusyId(activity.id);
    const ok = await onLog(activity, note.trim());
    if (ok) setNote("");
    setBusyId(null);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await onCreate({ name: newName.trim(), emoji: newEmoji, points: Number(newPoints) });
    setSaving(false);
    if (ok) {
      setNewName("");
      setNewPoints("10");
      setMode("none");
    }
  }

  async function postBounty(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const ok = await onPostBounty(bountyActivity || withoutBounty[0]?.id, bountyPoints);
    setSaving(false);
    if (ok) setMode("none");
  }

  return (
    <div className="space-y-4">
      <Field
        label="What did you do?"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={120}
        placeholder="Optional note, e.g. pasta night"
        hint="Tap a chore below to log it. You can undo right after."
      />

      {bounties.length > 0 ? (
        <section aria-label="Open bounties" className="space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Open bounties</h2>
          <ul className="space-y-2">
            {bounties.map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-3 py-2"
              >
                <p className="min-w-0 text-sm leading-snug">
                  <span className="font-bold">
                    🎯 {b.emoji} {b.activityName}
                  </span>{" "}
                  <span className="font-bold text-accent">+{b.bonusPoints}</span>
                  <span className="block text-xs text-muted">
                    {b.createdBy === meId ? "Posted by you" : `From ${b.createdByName ?? "a roommate"}`} ·{" "}
                    {timeLeft(b.expiresAt)}
                  </span>
                </p>
                {b.createdBy === meId ? (
                  <button type="button" onClick={() => onCancelBounty(b)} className="shrink-0 text-xs font-bold text-muted">
                    Cancel
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activities.length === 0 ? (
        <Card>
          <EmptyState emoji="🧽" title="No chores yet">
            Add the things your household does.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {activities.map((activity) => {
            const bounty = bountyFor(activity);
            const claimable = bounty && bounty.createdBy !== meId ? bounty.bonusPoints : 0;
            const total = activity.points + activity.hotBonus + claimable;
            return (
              <li key={activity.id} className="relative">
                <button
                  type="button"
                  onClick={() => tap(activity)}
                  disabled={busyId !== null || editing}
                  className="pop-in flex h-full w-full flex-col items-start gap-1 rounded-3xl border border-line bg-surface p-4 text-left shadow-sm transition active:scale-[0.97] disabled:opacity-60"
                >
                  <span className="text-3xl" aria-hidden="true">
                    {activity.emoji}
                  </span>
                  <span className="font-bold leading-tight">{activity.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Chip>+{total} pts</Chip>
                    {activity.hotBonus > 0 ? <Chip tone="gold">🔥 +{activity.hotBonus} hot</Chip> : null}
                    {claimable > 0 ? <Chip tone="accent">🎯 +{claimable}</Chip> : null}
                    {bounty && bounty.createdBy === meId ? <Chip tone="muted">🎯 yours</Chip> : null}
                  </span>
                </button>
                {editing ? (
                  <button
                    type="button"
                    aria-label={`Remove ${activity.name}`}
                    onClick={() => onArchive(activity)}
                    className="absolute -right-1.5 -top-1.5 grid h-8 w-8 place-items-center rounded-full bg-danger text-sm font-bold text-white shadow"
                  >
                    ✕
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {activities.some((a) => a.hotBonus > 0) ? (
        <p className="text-center text-xs text-muted">
          🔥 Hot chores haven&rsquo;t been done for a few days, so they&rsquo;re worth extra until someone does them.
        </p>
      ) : null}

      {mode === "chore" ? (
        <Card>
          <form onSubmit={create} className="space-y-3">
            <h2 className="text-lg font-bold">New chore</h2>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Emoji">
              {EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  role="radio"
                  aria-checked={newEmoji === emoji}
                  onClick={() => setNewEmoji(emoji)}
                  className={`grid h-11 w-11 place-items-center rounded-2xl text-xl ${
                    newEmoji === emoji ? "bg-accent-soft ring-2 ring-accent" : "bg-bg"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <Field
              label="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              required
              placeholder="Water the plants"
            />
            <Field
              label="Points"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={newPoints}
              onChange={(e) => setNewPoints(e.target.value)}
              required
              hint="Harder or grosser chores should be worth more."
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="flex-1">
                {saving ? "Adding…" : "Add chore"}
              </Button>
              <Button type="button" variant="soft" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {mode === "bounty" ? (
        <Card>
          <form onSubmit={postBounty} className="space-y-4">
            <h2 className="text-lg font-bold">Post a bounty</h2>
            <SelectField
              label="Which chore needs doing?"
              value={bountyActivity || withoutBounty[0]?.id || ""}
              onChange={setBountyActivity}
              hint="The first roommate to do it gets the bonus. You can't claim your own."
            >
              {withoutBounty.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji} {a.name}
                </option>
              ))}
            </SelectField>
            <Segmented label="Bonus points" value={bountyPoints} onChange={setBountyPoints} options={BOUNTY_OPTIONS} hint="Expires in 3 days." />
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || withoutBounty.length === 0} className="flex-1">
                {saving ? "Posting…" : "Post bounty"}
              </Button>
              <Button type="button" variant="soft" onClick={() => setMode("none")}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" className="flex-1" onClick={() => setMode("chore")}>
            ＋ New chore
          </Button>
          {withoutBounty.length > 0 ? (
            <Button variant="soft" className="flex-1" onClick={() => setMode("bounty")}>
              🎯 Post bounty
            </Button>
          ) : null}
          <Button variant={editing ? "primary" : "ghost"} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
