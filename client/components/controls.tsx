"use client";

import type { ReactNode } from "react";

/** A row of mutually exclusive choices, like a segmented control. */
export function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  hint?: string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid gap-1 rounded-2xl bg-bg p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-xl px-2 py-2 text-sm font-semibold transition ${
              value === option.value ? "bg-surface text-ink shadow-sm" : "text-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-line bg-bg px-4 py-3 text-base"
      >
        {children}
      </select>
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Chip({
  children,
  tone = "mint",
}: {
  children: ReactNode;
  tone?: "mint" | "gold" | "accent" | "muted";
}) {
  const tones = {
    mint: "bg-mint-soft text-mint",
    gold: "bg-gold-soft text-ink",
    accent: "bg-accent-soft text-accent",
    muted: "bg-bg text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}
