"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { Dashboard } from "@/components/Dashboard";
import { Onboarding } from "@/components/Onboarding";
import { Button, ErrorNote } from "@/components/ui";
import { api, ApiError, tokenStore } from "@/lib/api";
import type { Household, User } from "@/lib/types";

type Session =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "error"; message: string }
  | { status: "ready"; user: User; household: Household | null };

const messageOf = (error: unknown) => (error instanceof ApiError ? error.message : "Something went wrong");

/** Loads the household for a signed-in user (if they have one). */
async function sessionFor(user: User): Promise<Session> {
  try {
    const household = user.householdId ? (await api.household()).household : null;
    return { status: "ready", user, household };
  } catch (error) {
    return { status: "error", message: messageOf(error) };
  }
}

/** Restores a previous session from the stored token. */
async function restoreSession(): Promise<Session> {
  if (!tokenStore.get()) return { status: "anonymous" };
  try {
    return await sessionFor((await api.me()).user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      tokenStore.clear();
      return { status: "anonymous" };
    }
    return { status: "error", message: messageOf(error) };
  }
}

export default function Home() {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void restoreSession().then((next) => {
      if (!cancelled) setSession(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setSession({ status: "anonymous" });
  }, []);

  const left = useCallback((user: User) => {
    setSession({ status: "ready", user, household: null });
  }, []);

  const updateUser = useCallback((user: User) => {
    setSession((prev) => (prev.status === "ready" ? { ...prev, user } : prev));
  }, []);

  if (session.status === "loading") {
    return <p className="grid min-h-dvh place-items-center text-muted">Loading…</p>;
  }

  if (session.status === "error") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
        <ErrorNote>{session.message}</ErrorNote>
        <Button
          onClick={() => {
            setSession({ status: "loading" });
            void restoreSession().then(setSession);
          }}
        >
          Try again
        </Button>
        <Button variant="ghost" onClick={signOut}>
          Sign out
        </Button>
      </main>
    );
  }

  if (session.status === "anonymous") {
    return <AuthScreen onAuthed={(user) => void sessionFor(user).then(setSession)} />;
  }

  if (!session.household) {
    return (
      <Onboarding
        user={session.user}
        onDone={(user, household) => setSession({ status: "ready", user, household })}
        onSignOut={signOut}
      />
    );
  }

  return (
    <Dashboard
      user={session.user}
      household={session.household}
      onSignOut={signOut}
      onLeft={left}
      onUserUpdated={updateUser}
    />
  );
}
