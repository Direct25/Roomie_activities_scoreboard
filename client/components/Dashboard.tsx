"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Activity, Entry, Household, Leaderboard, User, WeekResult } from "@/lib/types";
import { BoardTab } from "./BoardTab";
import { FeedTab } from "./FeedTab";
import { LogTab } from "./LogTab";
import { WeeksTab } from "./WeeksTab";
import { Button, ErrorNote } from "./ui";

type Tab = "board" | "log" | "feed" | "weeks";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "board", label: "Board", icon: "🏆" },
  { id: "log", label: "Log", icon: "➕" },
  { id: "feed", label: "Feed", icon: "📰" },
  { id: "weeks", label: "Weeks", icon: "📅" },
];

interface ToastState {
  id: number;
  message: string;
  tone: "ok" | "error";
  action?: { label: string; run: () => void };
}

const REFRESH_MS = 30_000;

export function Dashboard({
  user,
  household,
  onSignOut,
  onLeft,
}: {
  user: User;
  household: Household;
  onSignOut: () => void;
  onLeft: (user: User) => void;
}) {
  const [tab, setTab] = useState<Tab>("board");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState<WeekResult[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const selectedWeek = useRef<string | undefined>(undefined);

  const showToast = useCallback(
    (message: string, tone: ToastState["tone"] = "ok", action?: ToastState["action"]) =>
      setToast({ id: Date.now(), message, tone, action }),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const [b, a, e, h] = await Promise.all([
        api.leaderboard(selectedWeek.current),
        api.activities(),
        api.entries(),
        api.history(),
      ]);
      setBoard(b);
      setActivities(a.activities);
      setEntries(e.entries);
      setHistory(h.history);
      setLoadError(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignOut();
        return;
      }
      setLoadError(error instanceof ApiError ? error.message : "Something went wrong");
    }
  }, [onSignOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep the board fresh while roommates are logging chores.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const id = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.action ? 6000 : 3500);
    return () => clearTimeout(id);
  }, [toast]);

  async function guard<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      return await action();
    } catch (error) {
      showToast(error instanceof ApiError ? error.message : "Something went wrong", "error");
      return undefined;
    }
  }

  async function undo(entry: Entry) {
    if (await guard(() => api.undoEntry(entry.id))) {
      showToast("Removed");
      await refresh();
    }
  }

  async function log(activity: Activity, note: string) {
    const result = await guard(() => api.logEntry(activity.id, note));
    if (!result) return false;
    showToast(`+${activity.points} pts · ${activity.name}`, "ok", {
      label: "Undo",
      run: () => void undo(result.entry),
    });
    await refresh();
    return true;
  }

  async function dispute(entry: Entry) {
    const sure = window.confirm(
      `Dispute "${entry.activityName}" by ${entry.userName}? It won't count until you take it back.`,
    );
    if (sure && (await guard(() => api.disputeEntry(entry.id)))) await refresh();
  }

  async function reinstate(entry: Entry) {
    if (await guard(() => api.reinstateEntry(entry.id))) await refresh();
  }

  async function createActivity(input: { name: string; emoji: string; points: number }) {
    if (!(await guard(() => api.createActivity(input)))) return false;
    showToast(`Added ${input.name}`);
    await refresh();
    return true;
  }

  async function archiveActivity(activity: Activity) {
    if (!window.confirm(`Remove "${activity.name}"? Past entries keep their points.`)) return;
    if (await guard(() => api.archiveActivity(activity.id))) await refresh();
  }

  async function changeWeek(week: string) {
    selectedWeek.current = week;
    const next = await guard(() => api.leaderboard(week));
    if (next) setBoard(next);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(household.code);
      showToast("Join code copied");
    } catch {
      showToast(`Join code: ${household.code}`);
    }
  }

  async function leave() {
    if (!window.confirm(`Leave ${household.name}? Your points will stop showing on the board.`)) return;
    const result = await guard(() => api.leaveHousehold());
    if (result) onLeft(result.user);
  }

  const roommateCount = board?.standings.length ?? household.members.length;

  return (
    <div className="mx-auto max-w-md px-5 pb-32">
      <header className="flex items-start justify-between gap-3 pb-4 pt-6">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{household.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {roommateCount} {roommateCount === 1 ? "roommate" : "roommates"}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold"
            aria-label={`Copy join code ${household.code}`}
          >
            Invite code <span className="tracking-widest">{household.code}</span> <span aria-hidden="true">📋</span>
          </button>
        </div>

        <details className="relative">
          <summary
            aria-label="Menu"
            className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-full border border-line bg-surface text-lg font-bold [&::-webkit-details-marker]:hidden"
          >
            ⋯
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
            <p className="truncate px-3 py-2 text-xs text-muted">Signed in as {user.name}</p>
            <button type="button" onClick={onSignOut} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold hover:bg-bg">
              Sign out
            </button>
            <button type="button" onClick={leave} className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-danger hover:bg-bg">
              Leave household
            </button>
          </div>
        </details>
      </header>

      <main>
        {!board && loadError ? (
          <div className="space-y-3">
            <ErrorNote>{loadError}</ErrorNote>
            <Button variant="soft" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : !board ? (
          <p className="py-16 text-center text-muted">Loading the scoreboard…</p>
        ) : (
          <>
            {loadError ? (
              <div className="mb-3">
                <ErrorNote>{loadError}</ErrorNote>
              </div>
            ) : null}
            {tab === "board" ? (
              <BoardTab board={board} meId={user.id} onWeekChange={changeWeek} onLogClick={() => setTab("log")} />
            ) : null}
            {tab === "log" ? (
              <LogTab activities={activities} onLog={log} onCreate={createActivity} onArchive={archiveActivity} />
            ) : null}
            {tab === "feed" ? (
              <FeedTab entries={entries} meId={user.id} onUndo={undo} onDispute={dispute} onReinstate={reinstate} />
            ) : null}
            {tab === "weeks" ? <WeeksTab history={history} meId={user.id} /> : null}
          </>
        )}
      </main>

      {toast ? (
        <div
          key={toast.id}
          role="status"
          className="pop-in fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-bg shadow-lg"
        >
          <span className={toast.tone === "error" ? "text-danger" : ""}>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
              className="shrink-0 rounded-full bg-bg/20 px-3 py-1 font-bold"
            >
              {toast.action.label}
            </button>
          ) : null}
        </div>
      ) : null}

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold transition ${
                tab === t.id ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-xl" aria-hidden="true">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
