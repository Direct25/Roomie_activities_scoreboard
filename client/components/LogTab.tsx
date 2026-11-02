"use client";

import { useState, type FormEvent } from "react";
import type { Activity } from "@/lib/types";
import { Button, Card, EmptyState, Field } from "./ui";

const EMOJI_CHOICES = ["✨", "🧹", "🍽️", "🧺", "🛒", "🪴", "🐕", "🍳", "🚿", "🛏️", "♻️", "🔧"];

export function LogTab({
  activities,
  onLog,
  onCreate,
  onArchive,
}: {
  activities: Activity[];
  onLog: (activity: Activity, note: string) => Promise<boolean>;
  onCreate: (input: { name: string; emoji: string; points: number }) => Promise<boolean>;
  onArchive: (activity: Activity) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState(EMOJI_CHOICES[0]);
  const [newPoints, setNewPoints] = useState("10");
  const [saving, setSaving] = useState(false);

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
      setAdding(false);
    }
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

      {activities.length === 0 ? (
        <Card>
          <EmptyState emoji="🧽" title="No chores yet">
            Add the things your household does.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {activities.map((activity) => (
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
                <span className="mt-1 rounded-full bg-mint-soft px-2.5 py-0.5 text-xs font-bold text-mint">
                  +{activity.points} pts
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
          ))}
        </ul>
      )}

      {adding ? (
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
              <Button type="button" variant="soft" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" onClick={() => setAdding(true)}>
            ＋ New chore
          </Button>
          <Button variant={editing ? "primary" : "ghost"} onClick={() => setEditing((v) => !v)}>
            {editing ? "Done" : "Edit"}
          </Button>
        </div>
      )}
    </div>
  );
}
