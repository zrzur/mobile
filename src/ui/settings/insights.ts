/**
 * Pure helpers of the Insights page (web: server insights). No React, no
 * strings: the page translates; these only count and measure.
 */

export type Count = number | null | undefined;

/** The ranges the page offers, in days */
export const INSIGHT_RANGES = [7, 30, 90] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

/**
 * Bar heights in percent of the chart, one per day. `null` (1 to 4, hidden)
 * shows a stub of 6 %, zero shows nothing. `fromMin` (the member total)
 * starts the scale at the smallest day so a small change still shows.
 */
export function barHeights(values: Count[], fromMin = false): number[] {
  const nums = values.filter((v): v is number => typeof v === "number");
  const max = nums.length ? Math.max(...nums) : 0;
  const min = fromMin && nums.length ? Math.min(...nums) : 0;
  const span = max - min;
  return values.map((v) => {
    if (v === null) return 6;
    if (v === undefined || v === 0) return 0;
    if (span === 0) return v > 0 ? (fromMin ? 60 : 100) : 0;
    if (fromMin) return Math.round(20 + ((v - min) / span) * 100 * 0.8);
    return Math.max(4, Math.round((v / max) * 100));
  });
}

/** Each part as a percent of the counted sum; hidden counts get a 3 % sliver */
export function shares(values: Count[]): number[] {
  const sum = values.reduce<number>((total, v) => total + (typeof v === "number" ? v : 0), 0);
  return values.map((v) => {
    if (v === null) return 3;
    if (!v || sum === 0) return 0;
    return Math.round((v / sum) * 100);
  });
}

type Day = {
  joins?: Count;
  leaves?: Count;
  messages?: Count;
  active_members?: Count;
  voice_minutes?: Count;
};

/** Nothing counted in the whole range (a hidden 1–4 count is activity) */
export function isEmptyRange(rows: Day[]): boolean {
  return rows.every((r) => [r.joins, r.leaves, r.messages, r.active_members, r.voice_minutes].every((v) => v === 0 || v === undefined));
}

/** "+3", "0", "-2" */
export function signed(change: number, format: (n: number) => string = String): string {
  return change > 0 ? `+${format(change)}` : change < 0 ? `-${format(-change)}` : format(0);
}

/** Average per day, rounded; a hidden total stays hidden */
export function perDay(total: Count, days: number): number | null {
  if (total === null) return null;
  if (!days) return 0;
  return Math.round((total ?? 0) / days);
}

/** Whole hours and the minutes left over */
export function hoursMinutes(minutes: number): { hours: number; minutes: number } {
  const m = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(m / 60), minutes: m % 60 };
}

/** A `YYYY-MM-DD` day as a date at midnight UTC (format it with timeZone UTC) */
export function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** Which bar a touch at `x` of a `width` wide chart hits (oldest at the start side) */
export function barAt(x: number, width: number, count: number, rtl: boolean): number {
  if (count <= 0 || width <= 0) return -1;
  const raw = Math.floor((Math.min(Math.max(x, 0), width - 0.001) / width) * count);
  return rtl ? count - 1 - raw : raw;
}
