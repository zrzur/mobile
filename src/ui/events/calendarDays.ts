/**
 * The month and week views of events: which days a view shows, and which
 * events fall on which day, by the clock of the person looking (web:
 * events/calendarDays.ts, same rules).
 */
import type { ServerEvent } from "./types";

export type CalendarView = "month" | "week";

/** The first day of the week where a language is spoken (0 is Sunday) */
export function weekStartsOn(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay?: number }; getWeekInfo?: () => { firstDay?: number } };
    const first = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay;
    // Intl counts Monday as 1 and Sunday as 7
    if (typeof first === "number") return first % 7;
  } catch {
    /* fall through */
  }
  const language = locale.split("-")[0];
  if (language === "ar") return 6;
  if (language === "en") return 0;
  return 1;
}

/** A day as a key: the local date, `2026-11-20` */
export function dayKey(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The local day of a key */
export function keyDay(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** The same local day `days` later (across daylight saving changes) */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** The seven days of the week a date is in */
export function weekOf(date: Date, weekStart: number): Date[] {
  const back = (date.getDay() - weekStart + 7) % 7;
  const first = addDays(date, -back);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

/** The weeks a month view shows: whole weeks that cover the month */
export function monthWeeks(date: Date, weekStart: number): Date[][] {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const weeks: Date[][] = [];
  let week = weekOf(new Date(date.getFullYear(), date.getMonth(), 1), weekStart);
  while (week[0] <= last) {
    weeks.push(week);
    week = weekOf(addDays(week[0], 7), weekStart);
  }
  return weeks;
}

/** The days a view shows, and the time span to ask the server for */
export function calendarRange(view: CalendarView, anchor: Date, weekStart: number): { days: Date[]; from: Date; to: Date } {
  const days = view === "week" ? weekOf(anchor, weekStart) : monthWeeks(anchor, weekStart).flat();
  return { days, from: days[0], to: addDays(days[days.length - 1], 1) };
}

/** The view one step earlier or later */
export function moveAnchor(view: CalendarView, anchor: Date, step: -1 | 1): Date {
  return view === "week" ? addDays(anchor, step * 7) : new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);
}

/** The day that stays chosen after a step: the same day if still shown, else the first of the span */
export function chosenAfterMove(view: CalendarView, next: Date, weekStart: number, chosen: string): string {
  if (calendarRange(view, next, weekStart).days.some((day) => dayKey(day) === chosen)) return chosen;
  return dayKey(view === "week" ? next : new Date(next.getFullYear(), next.getMonth(), 1));
}

/** Events by the local day they start on, each day soonest first */
export function eventsByDay<T extends Pick<ServerEvent, "starts_at">>(events: T[]): Map<string, T[]> {
  const days = new Map<string, T[]>();
  const sorted = [...events].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  for (const event of sorted) {
    const key = dayKey(new Date(event.starts_at));
    const list = days.get(key);
    if (list) list.push(event);
    else days.set(key, [event]);
  }
  return days;
}

/** "November 2026", or the span of a week: "16 – 22 Nov 2026" (short: for the phone's bar) */
export function calendarTitle(view: CalendarView, anchor: Date, weekStart: number, locale: string, short = false): string {
  if (view === "month") return new Intl.DateTimeFormat(locale, { numberingSystem: "latn", month: short ? "short" : "long", year: "numeric" }).format(anchor);
  const week = weekOf(anchor, weekStart);
  const format = new Intl.DateTimeFormat(locale, { numberingSystem: "latn", day: "numeric", month: "short", year: short ? undefined : "numeric" });
  const range = (format as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string }).formatRange;
  // Hermes may not have formatRange yet
  return typeof range === "function" ? range.call(format, week[0], week[6]) : `${format.format(week[0])} – ${format.format(week[6])}`;
}
