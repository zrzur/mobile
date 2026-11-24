import { intlLocale } from "./time";

/**
 * A call's system line in a DM or group, as the web draws it
 * (messaging/elements/SystemMessage.tsx):
 *
 * - missed, started by me: "Nobody answered your call"
 * - missed, started by someone else: "Missed call from {name}"
 * - over: "{name} started a call that lasted {duration}"
 * - still going: "{name} started a call"
 *
 * The backend sends `{ type: "call_started", by, finished_at?, missed? }`;
 * `missed` is set when the call ends and nobody but the caller joined.
 */

export type CallSystem = { by?: string; finished_at?: string | null; missed?: boolean };

export type CallLine =
  | { kind: "unanswered" }
  | { kind: "missed"; by: string }
  | { kind: "lasted"; by: string; ms: number }
  | { kind: "started"; by: string };

export function callLine(system: CallSystem, startedAt: number, selfId?: string): CallLine {
  const by = system.by ?? "";
  if (system.missed === true) return selfId && by === selfId ? { kind: "unanswered" } : { kind: "missed", by };
  const finished = system.finished_at ? new Date(system.finished_at).getTime() : NaN;
  if (Number.isFinite(finished)) return { kind: "lasted", by, ms: Math.max(0, finished - startedAt) };
  return { kind: "started", by };
}

export type DurationUnit = "second" | "minute" | "hour" | "day" | "month" | "year";

/**
 * dayjs `from(start, true)` (the web's `<Time format="relative" hideSuffix>`):
 * its rounding and thresholds, as a value and unit. "a few seconds" becomes
 * the seconds, "a minute" 1 minute, "an hour" 1 hour, and so on.
 */
export function durationParts(ms: number): { value: number; unit: DurationUnit } {
  const abs = Math.abs(ms);
  const seconds = Math.round(abs / 1000);
  if (seconds <= 44) return { value: Math.max(1, seconds), unit: "second" };
  if (seconds <= 89) return { value: 1, unit: "minute" };
  const minutes = Math.round(abs / 60_000);
  if (minutes <= 44) return { value: Math.max(1, minutes), unit: "minute" };
  if (minutes <= 89) return { value: 1, unit: "hour" };
  const hours = Math.round(abs / 3_600_000);
  if (hours <= 21) return { value: Math.max(1, hours), unit: "hour" };
  if (hours <= 35) return { value: 1, unit: "day" };
  const days = Math.round(abs / 86_400_000);
  if (days <= 25) return { value: Math.max(1, days), unit: "day" };
  if (days <= 45) return { value: 1, unit: "month" };
  const months = Math.round(abs / (86_400_000 * 30.4375));
  if (months <= 10) return { value: Math.max(1, months), unit: "month" };
  if (months <= 17) return { value: 1, unit: "year" };
  return { value: Math.max(1, Math.round(abs / (86_400_000 * 365.25))), unit: "year" };
}

/** "5 minutes", "٥ دقائق": the duration in the app's language */
export function callDuration(ms: number, locale: string): string {
  const { value, unit } = durationParts(ms);
  try {
    return new Intl.NumberFormat(intlLocale(locale), { style: "unit", unit, unitDisplay: "long" }).format(value);
  } catch {
    return `${value} ${unit}${value === 1 ? "" : "s"}`;
  }
}
