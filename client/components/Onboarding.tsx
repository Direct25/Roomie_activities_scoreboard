"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import type { Household, User } from "@/lib/types";
import { Button, Card, ErrorNote, Field } from "./ui";

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function Onboarding({
  user,
  onDone,
  onSignOut,
}: {
  user: User;
  onDone: (user: User, household: Household) => void;
  onSignOut: () => void;
}) {
  const [houseName, setHouseName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "create" | "join", action: () => Promise<{ user: User; household: Household }>) {
    setBusy(kind);
    setError(null);
    try {
      const result = await action();
      onDone(result.user, result.household);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void run("create", () => api.createHousehold(houseName, browserTimezone()));
  }

  function join(event: FormEvent) {
    event.preventDefault();
    void run("join", () => api.joinHousehold(code));
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <div className="pop-in text-center">
        <p className="text-5xl" aria-hidden="true">
          👋
        </p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight">Hey {user.name}!</h1>
        <p className="mt-1 text-muted">Start a household, or join your roommates with their code.</p>
      </div>

      <div className="mt-8 space-y-4">
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Card className="pop-in">
          <form onSubmit={create} className="space-y-3">
            <h2 className="text-lg font-bold">Start a household</h2>
            <Field
              label="Name your place"
              value={houseName}
              onChange={(e) => setHouseName(e.target.value)}
              placeholder="Flat 4B, The Cave, 12 Maple St…"
              maxLength={40}
              minLength={2}
              required
              hint="The weekly reset runs on your local time."
            />
            <Button type="submit" disabled={busy !== null} className="w-full">
              {busy === "create" ? "Creating…" : "Create household"}
            </Button>
          </form>
        </Card>

        <Card className="pop-in">
          <form onSubmit={join} className="space-y-3">
            <h2 className="text-lg font-bold">Join with a code</h2>
            <Field
              label="Join code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={12}
              minLength={4}
              required
              autoCapitalize="characters"
              autoComplete="off"
              hint="Ask a roommate, it's shown at the top of their scoreboard."
            />
            <Button type="submit" variant="soft" disabled={busy !== null} className="w-full">
              {busy === "join" ? "Joining…" : "Join household"}
            </Button>
          </form>
        </Card>

        <div className="text-center">
          <Button variant="ghost" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </main>
  );
}
