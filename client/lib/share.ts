import { weekLabel } from "./format";
import type { WeekResult } from "./types";

/** A WhatsApp-friendly recap of a finished week. */
export function weekShareText(household: string, week: WeekResult, meId: string): string {
  const winners = week.winners.map((w) => (w.userId === meId ? `${w.name} (me)` : w.name)).join(" & ");

  let rank = 0;
  const lines = week.standings.map((s, i) => {
    if (i === 0 || s.points !== week.standings[i - 1].points) rank = i + 1;
    return `${rank}. ${s.name} · ${s.points} pts`;
  });

  return [
    `🏆 ${household} · ${weekLabel(week.startsOn, week.endsOn)}`,
    winners ? `👑 ${winners} won with ${week.winners[0].points} pts` : "Nobody scored that week",
    "",
    ...lines,
    "",
    "Roomie Scoreboard",
  ].join("\n");
}

/** Uses the phone's share sheet when there is one, and opens WhatsApp otherwise. */
export async function shareText(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}
