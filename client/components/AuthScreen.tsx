"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, tokenStore } from "@/lib/api";
import type { User } from "@/lib/types";
import { Button, ErrorNote, Field } from "./ui";

export function AuthScreen({ onAuthed }: { onAuthed: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "register"
          ? await api.register(name, email, password)
          : await api.login(email, password);
      tokenStore.set(result.token);
      onAuthed(result.user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="pop-in text-center">
        <p className="text-6xl" aria-hidden="true">
          🏠
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Roomie Scoreboard</h1>
        <p className="mt-2 text-muted">Chores, but make it a competition.</p>
      </div>

      <form onSubmit={submit} className="pop-in mt-8 space-y-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-bg p-1" role="tablist">
          {(["register", "login"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={`rounded-xl py-2 text-sm font-semibold transition ${
                mode === value ? "bg-surface shadow-sm" : "text-muted"
              }`}
            >
              {value === "register" ? "Create account" : "Sign in"}
            </button>
          ))}
        </div>

        {mode === "register" ? (
          <Field
            label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={40}
            required
            placeholder="What do your roommates call you?"
          />
        ) : null}
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          minLength={mode === "register" ? 8 : undefined}
          required
          hint={mode === "register" ? "At least 8 characters" : undefined}
        />

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "One moment…" : mode === "register" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
