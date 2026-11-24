import type { IconName } from "@/ui/Icon";

/** One row of GET /auth/session/all (web sessionList.ts) */
export type ListedSession = { _id: string; name?: string; last_seen?: string };

/** When each session was last used, by id (undefined: never or unreadable) */
export function readLastUsed(sessions: ListedSession[]): Map<string, number | undefined> {
  return new Map(
    sessions.map((session) => {
      const time = session.last_seen ? Date.parse(session.last_seen) : NaN;
      return [session._id, Number.isNaN(time) ? undefined : time];
    }),
  );
}

/** Newest use first; a session never used counts from when it was made */
export function byLastUsed<T extends { id: string; createdAt: number }>(sessions: T[], lastUsed: Map<string, number | undefined>): T[] {
  const time = (s: T) => lastUsed.get(s.id) ?? s.createdAt;
  return [...sessions].sort((a, b) => time(b) - time(a));
}

/** The device icon the web picks from a session name */
export function sessionIcon(name: string | undefined): IconName {
  if (!name) return "question";
  return /android|i(Pad|Phone)?os|mobile/i.test(name) ? "device-mobile" : "desktop";
}

/** Session names show with their first letter upper-cased */
export function sessionTitle(name: string): string {
  return name ? name.charAt(0).toLocaleUpperCase() + name.slice(1) : name;
}

/** `UnknownUser` from DELETE /auth/session/{id}: already closed */
export const isAlreadyClosed = (error: unknown) => (error as { type?: string } | undefined)?.type === "UnknownUser";

/** `InvalidSession` on logout: already signed out */
export const isAlreadySignedOut = (error: unknown) => (error as { type?: string } | undefined)?.type === "InvalidSession";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** The largest whole unit for a time `ms` ago (negative = past), like dayjs fromNow */
export function relativeParts(ms: number): { value: number; unit: Intl.RelativeTimeFormatUnit } {
  const abs = Math.abs(ms);
  for (const [unit, size] of UNITS) {
    if (abs >= size) return { value: Math.round(ms / size), unit };
  }
  return { value: 0, unit: "minute" };
}

/** "3 hours ago" in the app language */
export function relativeTime(then: number, now: number, locale: string): string {
  const { value, unit } = relativeParts(then - now);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
}
