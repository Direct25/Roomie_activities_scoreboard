const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function asDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "Oct 26 – Nov 1" from two YYYY-MM-DD strings. */
export function weekLabel(startsOn: string, endsOn: string): string {
  return `${dayFormat.format(asDate(startsOn))} – ${dayFormat.format(asDate(endsOn))}`;
}

export function resetLabel(daysUntilReset: number): string {
  if (daysUntilReset <= 1) return "Resets tonight";
  return `Resets in ${daysUntilReset} days`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "₹25" or "₹18.75" from paise. */
export function rupees(paise: number): string {
  const value = paise / 100;
  return Number.isInteger(value) ? `₹${value}` : `₹${value.toFixed(2)}`;
}

/** Whole days from one YYYY-MM-DD to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000);
}

/** "5h left" / "2d left" for an ISO deadline. */
export function timeLeft(iso: string, now = Date.now()): string {
  const hours = Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 3_600_000));
  if (hours < 1) return "under an hour left";
  if (hours < 24) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.trim().slice(0, 2);
  return letters.toUpperCase();
}

const AVATAR_COLORS = ["#ff6b4a", "#2bb59a", "#7c6cf0", "#f5a623", "#e2559a", "#3b9be0", "#6bbf3a", "#d9674a"];

/** Stable colour per person so avatars are recognisable at a glance. */
export function avatarColor(seed: string): string {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
