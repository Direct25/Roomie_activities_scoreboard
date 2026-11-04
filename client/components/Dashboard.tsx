"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { shareText, weekShareText } from "@/lib/share";
import type {
  Activity,
  Bounty,
  Challenge,
  Entry,
  Household,
  Leaderboard,
  MemberBadges,
  NewChallenge,
  Prizes,
  Settlement,
  Transfer,
  User,
  WeekResult,
} from "@/lib/types";
import { BattleTab } from "./BattleTab";
import { BoardTab } from "./BoardTab";
import { FeedTab } from "./FeedTab";
import { LogTab } from "./LogTab";
import { MoneyTab } from "./MoneyTab";
import { Button, ErrorNote } from "./ui";

type Tab = "board" | "log" | "battle" | "feed" | "money";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "board", label: "Board", icon: "🏆" },
  { id: "log", label: "Log", icon: "➕" },
  { id: "battle", label: "Battle", icon: "⚔️" },
  { id: "feed", label: "Feed", icon: "📰" },
  { id: "money", label: "Money", icon: "💰" },
];

interface ToastState {
  id: number;
  message: string;
  tone: "ok" | "error";
  action?: { label: string; run: () => void };
}

interface Data {
  /** This week, always. The race and the duel clock use it. */
  current: Leaderboard;
  /** Whatever week the person picked on the Board tab (usually the same as `current`). */
  board: Leaderboard;
  activities: Activity[];
  entries: Entry[];
  history: WeekResult[];
  bounties: Bounty[];
  challenges: Challenge[];
  prizes: Prizes;
  badges: MemberBadges[];
}

const REFRESH_MS = 30_000;

export function Dashboard({
  user,
  household,
  onSignOut,
  onLeft,
  onUserUpdated,
}: {
  user: User;
  household: Household;
  onSignOut: () => void;
  onLeft: (user: User) => void;
  onUserUpdated: (user: User) => void;
}) {
  const [tab, setTab] = useState<Tab>("board");
  const [data, setData] = useState<Data | null>(null);
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
      // These two settle finished duels and finished weeks on the server, so run them first
      // and the numbers below already include any payouts.
      const [challenges, prizes] = await Promise.all([api.challenges(), api.prizes()]);
      const [current, a, e, h, bo, bd] = await Promise.all([
        api.leaderboard(),
        api.activities(),
        api.entries(),
        api.history(),
        api.bounties(),
        api.badges(),
      ]);
      const week = selectedWeek.current;
      const board = week && week !== current.currentWeek ? await api.leaderboard(week) : current;
      setData({
        current,
        board,
        activities: a.activities,
        entries: e.entries,
        history: h.history,
        bounties: bo.bounties,
        challenges: challenges.challenges,
        prizes,
        badges: bd.badges,
      });
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

  // Keep everything fresh while roommates are logging chores.
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
    const bonus = result.entry.bonusPoints;
    showToast(
      `+${result.entry.points} pts · ${activity.name}${bonus > 0 ? ` (incl. +${bonus} bonus)` : ""}`,
      "ok",
      { label: "Undo", run: () => void undo(result.entry) },
    );
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
    if (next) setData((prev) => (prev ? { ...prev, board: next } : prev));
  }

  async function postBounty(activityId: string, bonusPoints: number) {
    if (!(await guard(() => api.createBounty(activityId, bonusPoints)))) return false;
    showToast(`Bounty posted: +${bonusPoints}`);
    await refresh();
    return true;
  }

  async function cancelBounty(bounty: Bounty) {
    if (await guard(() => api.cancelBounty(bounty.id))) await refresh();
  }

  async function createChallenge(input: NewChallenge) {
    if (!(await guard(() => api.createChallenge(input)))) return false;
    showToast("Challenge sent ⚔️");
    await refresh();
    return true;
  }

  async function acceptChallenge(challenge: Challenge) {
    if (await guard(() => api.acceptChallenge(challenge.id))) {
      showToast("Challenge accepted. Game on!");
      await refresh();
    }
  }

  async function declineChallenge(challenge: Challenge) {
    if (await guard(() => api.declineChallenge(challenge.id))) await refresh();
  }

  async function cancelChallenge(challenge: Challenge) {
    if (await guard(() => api.cancelChallenge(challenge.id))) await refresh();
  }

  async function savePrizeSettings(enabled: boolean, prizes: number[]) {
    if (!(await guard(() => api.savePrizeSettings(enabled, prizes)))) return false;
    showToast("Prize rules saved");
    await refresh();
    return true;
  }

  async function saveUpi(upiId: string) {
    const result = await guard(() => api.saveUpi(upiId));
    if (!result) return false;
    onUserUpdated(result.user);
    showToast(upiId ? "UPI ID saved" : "UPI ID removed");
    await refresh();
    return true;
  }

  async function markPaid(week: Settlement, transfer: Transfer, paid: boolean) {
    if (await guard(() => api.markPaid(week.id, transfer.id, paid))) {
      showToast(paid ? "Marked as paid" : "Marked as unpaid");
      await refresh();
    }
  }

  async function share(week: WeekResult) {
    await shareText(weekShareText(household.name, week, user.id));
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

  const roommateCount = data?.current.standings.length ?? household.members.length;

  // Little dots on the tabs that need attention.
  const waitingDuels = data
    ? data.challenges.filter((c) => c.status === "pending" && c.opponentId === user.id).length
    : 0;
  const openPayments = data
    ? data.prizes.weeks.flatMap((w) => w.transfers).filter((t) => !t.paid && (t.fromId === user.id || t.toId === user.id)).length
    : 0;
  const attention: Partial<Record<Tab, number>> = { battle: waitingDuels, money: openPayments };

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
        {!data && loadError ? (
          <div className="space-y-3">
            <ErrorNote>{loadError}</ErrorNote>
            <Button variant="soft" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        ) : !data ? (
          <p className="py-16 text-center text-muted">Loading the scoreboard…</p>
        ) : (
          <>
            {loadError ? (
              <div className="mb-3">
                <ErrorNote>{loadError}</ErrorNote>
              </div>
            ) : null}
            {tab === "board" ? (
              <BoardTab
                board={data.board}
                meId={user.id}
                prizeSettings={data.prizes.settings}
                badges={data.badges}
                history={data.history}
                onWeekChange={changeWeek}
                onLogClick={() => setTab("log")}
                onShare={share}
              />
            ) : null}
            {tab === "log" ? (
              <LogTab
                activities={data.activities}
                bounties={data.bounties}
                meId={user.id}
                onLog={log}
                onCreate={createActivity}
                onArchive={archiveActivity}
                onPostBounty={postBounty}
                onCancelBounty={cancelBounty}
              />
            ) : null}
            {tab === "battle" ? (
              <BattleTab
                current={data.current}
                challenges={data.challenges}
                activities={data.activities}
                members={household.members}
                meId={user.id}
                onCreate={createChallenge}
                onAccept={acceptChallenge}
                onDecline={declineChallenge}
                onCancel={cancelChallenge}
              />
            ) : null}
            {tab === "feed" ? (
              <FeedTab entries={data.entries} meId={user.id} onUndo={undo} onDispute={dispute} onReinstate={reinstate} />
            ) : null}
            {tab === "money" ? (
              <MoneyTab
                prizes={data.prizes}
                user={user}
                memberCount={roommateCount}
                onSaveSettings={savePrizeSettings}
                onSaveUpi={saveUpi}
                onMarkPaid={markPaid}
              />
            ) : null}
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
        <div className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((t) => {
            const dots = attention[t.id] ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold transition ${
                  tab === t.id ? "text-accent" : "text-muted"
                }`}
              >
                <span className="relative text-xl" aria-hidden="true">
                  {t.icon}
                  {dots > 0 ? (
                    <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-extrabold text-white">
                      {dots}
                    </span>
                  ) : null}
                </span>
                {t.label}
                {dots > 0 ? <span className="sr-only">, {dots} need your attention</span> : null}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
