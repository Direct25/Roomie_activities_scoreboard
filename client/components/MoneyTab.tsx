"use client";

import { useState, type FormEvent } from "react";
import { rupees, weekLabel } from "@/lib/format";
import type { Prizes, Settlement, Transfer, User } from "@/lib/types";
import { Chip } from "./controls";
import { Button, Card, EmptyState, Field } from "./ui";

const MEDALS = ["🥇", "🥈", "🥉"];

function parseRupees(value: string): number | null {
  if (!/^\d{1,3}$/.test(value.trim())) return null;
  const n = Number(value);
  return n >= 0 && n <= 500 ? n : null;
}

function Summary({ summary }: { summary: Prizes["summary"] }) {
  const { owePaise, owedPaise } = summary;
  if (owePaise === 0 && owedPaise === 0) {
    return (
      <Card className="text-center">
        <p className="text-4xl" aria-hidden="true">
          🎉
        </p>
        <p className="mt-2 text-lg font-extrabold">All square</p>
        <p className="text-sm text-muted">Nobody owes anything right now.</p>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className={owePaise > 0 ? "!border-danger" : ""}>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">You owe</p>
        <p className={`mt-1 text-2xl font-extrabold tabular-nums ${owePaise > 0 ? "text-danger" : ""}`}>{rupees(owePaise)}</p>
      </Card>
      <Card className={owedPaise > 0 ? "!border-mint" : ""}>
        <p className="text-xs font-bold uppercase tracking-wide text-muted">You&rsquo;re owed</p>
        <p className={`mt-1 text-2xl font-extrabold tabular-nums ${owedPaise > 0 ? "text-mint" : ""}`}>{rupees(owedPaise)}</p>
      </Card>
    </div>
  );
}

function Rules({
  settings,
  memberCount,
  onSave,
}: {
  settings: Prizes["settings"];
  memberCount: number;
  onSave: (enabled: boolean, prizes: number[]) => Promise<boolean>;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [values, setValues] = useState(settings.prizes.map(String));
  const [busy, setBusy] = useState(false);

  const parsed = values.map(parseRupees);
  const valid = parsed.every((n) => n !== null);
  const prizes = parsed.map((n) => n ?? 0);
  const paid = prizes.filter((n) => n > 0);
  const cancelsOut = enabled && paid.length > 0 && new Set(paid).size === 1 && memberCount <= paid.length;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    await onSave(enabled, prizes);
    setBusy(false);
  }

  const summary = !settings.enabled
    ? "Weekly prizes are off."
    : (() => {
        const list = settings.prizes
          .map((n, i) => (n > 0 ? `${MEDALS[i]} ₹${n}` : null))
          .filter(Boolean)
          .join("  ");
        return `Each week: ${list}`;
      })();

  return (
    <Card>
      <h2 className="text-lg font-bold">Weekly prizes</h2>
      <p className="mt-1 text-sm text-muted">
        The week&rsquo;s prizes are added up and split equally between everyone. Winners get their prize minus their
        share, and everyone else pays their share. Money moves on UPI, not through this app.
      </p>

      {settings.isOwner ? (
        <form onSubmit={save} className="mt-4 space-y-4">
          <label className="flex items-center justify-between gap-3">
            <span className="font-semibold">Prizes on</span>
            <input
              type="checkbox"
              role="switch"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-6 w-6 accent-[var(--accent)]"
            />
          </label>

          {enabled ? (
            <div className="grid grid-cols-3 gap-2">
              {["1st", "2nd", "3rd"].map((place, i) => (
                <Field
                  key={place}
                  label={`${MEDALS[i]} ${place}`}
                  inputMode="numeric"
                  value={values[i]}
                  onChange={(e) => setValues((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                  aria-label={`${place} place prize in rupees`}
                  hint="₹"
                />
              ))}
            </div>
          ) : null}

          {!valid ? <p className="text-sm font-semibold text-danger">Use whole rupees from 0 to 500.</p> : null}
          {cancelsOut ? (
            <p className="rounded-2xl bg-gold-soft px-3 py-2 text-sm font-semibold">
              With {memberCount} roommates everyone finishes in a paid place, so equal prizes cancel out and nobody
              gains. Try tiered prizes like ₹40 / ₹25 / ₹10.
            </p>
          ) : null}

          <Button type="submit" disabled={busy || !valid} className="w-full">
            {busy ? "Saving…" : "Save prize rules"}
          </Button>
        </form>
      ) : (
        <p className="mt-3 rounded-2xl bg-bg px-3 py-2 text-sm font-semibold">
          {summary} <span className="font-normal text-muted">Set by the household owner.</span>
        </p>
      )}
    </Card>
  );
}

function UpiCard({ user, onSave }: { user: User; onSave: (upiId: string) => Promise<boolean> }) {
  const [upi, setUpi] = useState(user.upiId);
  const [busy, setBusy] = useState(false);
  const changed = upi.trim() !== user.upiId;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave(upi.trim());
    setBusy(false);
  }

  return (
    <Card>
      <form onSubmit={save} className="space-y-3">
        <h2 className="text-lg font-bold">Get paid on UPI</h2>
        <Field
          label="Your UPI ID"
          value={upi}
          onChange={(e) => setUpi(e.target.value)}
          placeholder="name@bank"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          hint="Optional. Roommates who owe you get a one-tap pay link. Only they can see it."
        />
        <Button type="submit" variant="soft" disabled={busy || !changed} className="w-full">
          {busy ? "Saving…" : user.upiId && !upi.trim() ? "Remove UPI ID" : "Save UPI ID"}
        </Button>
      </form>
    </Card>
  );
}

function TransferRow({
  transfer: t,
  meId,
  onMarkPaid,
}: {
  transfer: Transfer;
  meId: string;
  onMarkPaid: (paid: boolean) => void;
}) {
  const isPayer = t.fromId === meId;
  const isPayee = t.toId === meId;
  const from = isPayer ? "You" : (t.fromName ?? "Former roommate");
  const to = isPayee ? "you" : t.toName;

  return (
    <li className="rounded-2xl border border-line bg-bg p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="leading-snug">
          <span className="font-bold">{from}</span> {isPayer ? "pay" : "pays"} <span className="font-bold">{to}</span>
        </p>
        <p className={`shrink-0 text-lg font-extrabold tabular-nums ${t.paid ? "text-muted line-through" : ""}`}>
          {rupees(t.amountPaise)}
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Chip tone={t.paid ? "mint" : "gold"}>{t.paid ? "Paid ✓" : "Unpaid"}</Chip>

        <div className="flex flex-wrap items-center gap-2">
          {!t.paid && isPayer && t.upiLink ? (
            <a
              href={t.upiLink}
              className="inline-flex items-center rounded-2xl bg-accent px-4 py-2 text-sm font-semibold text-accent-ink"
            >
              Pay with UPI
            </a>
          ) : null}
          {!t.paid && isPayer ? (
            <Button variant="soft" className="!px-4 !py-2" onClick={() => onMarkPaid(true)}>
              I&rsquo;ve paid
            </Button>
          ) : null}
          {!t.paid && isPayee ? (
            <Button variant="soft" className="!px-4 !py-2" onClick={() => onMarkPaid(true)}>
              Got it
            </Button>
          ) : null}
          {t.paid && (isPayer || isPayee) ? (
            <Button variant="ghost" className="!px-3 !py-2" onClick={() => onMarkPaid(false)}>
              Undo
            </Button>
          ) : null}
        </div>
      </div>

      {!t.paid && isPayer && t.upiId ? <p className="mt-2 text-xs text-muted">UPI: {t.upiId}</p> : null}
      {!t.paid && isPayer && !t.upiId ? (
        <p className="mt-2 text-xs text-muted">{t.toName} hasn&rsquo;t added a UPI ID. Ask them, or pay another way.</p>
      ) : null}
    </li>
  );
}

function WeekLedger({
  week,
  meId,
  onMarkPaid,
}: {
  week: Settlement;
  meId: string;
  onMarkPaid: (week: Settlement, transfer: Transfer, paid: boolean) => void;
}) {
  const pot = week.payouts.reduce((sum, p) => sum + p.prizePaise, 0);

  return (
    <Card className="pop-in">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{weekLabel(week.startsOn, week.endsOn)}</p>
      <p className="mt-1 text-sm text-muted">
        {pot > 0 ? `Prize pot ${rupees(pot)}, shared by ${week.memberCount}` : "Nobody scored that week."}
      </p>

      {week.payouts.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {week.payouts.map((p) => (
            <li key={p.userId} className="rounded-full bg-gold-soft px-3 py-1 text-sm font-bold">
              {MEDALS[p.rank - 1] ?? p.rank} {p.userId === meId ? "You" : (p.name ?? "Former roommate")} · {rupees(p.prizePaise)}
            </li>
          ))}
        </ul>
      ) : null}

      {week.transfers.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {week.transfers.map((t) => (
            <TransferRow key={t.id} transfer={t} meId={meId} onMarkPaid={(paid) => onMarkPaid(week, t, paid)} />
          ))}
        </ul>
      ) : pot > 0 ? (
        <p className="mt-3 text-sm font-semibold">Prizes cancelled out, nothing to pay. 🤝</p>
      ) : null}
    </Card>
  );
}

export function MoneyTab({
  prizes,
  user,
  memberCount,
  onSaveSettings,
  onSaveUpi,
  onMarkPaid,
}: {
  prizes: Prizes;
  user: User;
  memberCount: number;
  onSaveSettings: (enabled: boolean, prizes: number[]) => Promise<boolean>;
  onSaveUpi: (upiId: string) => Promise<boolean>;
  onMarkPaid: (week: Settlement, transfer: Transfer, paid: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <Summary summary={prizes.summary} />

      <h2 className="pt-2 text-lg font-bold">Weekly results</h2>
      {prizes.weeks.length === 0 ? (
        <Card>
          <EmptyState emoji="💰" title="No payouts yet">
            {prizes.settings.enabled
              ? "The first prizes land after Sunday night, when the board resets."
              : "Prizes are off. The household owner can turn them on below."}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-3">
          {prizes.weeks.map((week) => (
            <li key={week.id}>
              <WeekLedger week={week} meId={user.id} onMarkPaid={onMarkPaid} />
            </li>
          ))}
        </ul>
      )}

      <Rules settings={prizes.settings} memberCount={memberCount} onSave={onSaveSettings} />
      <UpiCard user={user} onSave={onSaveUpi} />
    </div>
  );
}
