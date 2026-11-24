/**
 * Pure helpers of the events screens (web: eventFormat.ts, EventAnswer
 * seatState, calendarDays eventMatches, eventTemplates, eventLinks
 * reminders, ServerEventEditor eventTimeProblem). No React, no i18n.
 */
import type { EventAnswerValue, EventChanges, EventPlace, EventRepeat, Rsvp, ServerEvent } from "./types";

/** Starting within this many minutes counts as "soon" */
export const SOON_MINUTES = 60;

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions) {
  try {
    return new Intl.DateTimeFormat(locale || "en", { numberingSystem: "latn", ...options });
  } catch {
    return new Intl.DateTimeFormat("en", options);
  }
}

/** "a – b" with Intl's range when the engine has it */
function range(format: Intl.DateTimeFormat, start: Date, end: Date) {
  const f = format as Intl.DateTimeFormat & { formatRange?: (a: Date, b: Date) => string };
  if (typeof f.formatRange === "function") {
    try {
      return f.formatRange(start, end);
    } catch {
      // fall through
    }
  }
  return `${format.format(start)} – ${format.format(end)}`;
}

/** When an event happens: "Tue, 1 Dec, 18:00 – 20:00 CET" */
export function eventWhen(event: Pick<ServerEvent, "starts_at" | "ends_at">, locale: string, timeZone?: string): string {
  const format = dateFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short", ...(timeZone ? { timeZone } : {}) });
  const start = new Date(event.starts_at);
  if (!event.ends_at) return format.format(start);
  return range(format, start, new Date(event.ends_at));
}

/** The day of an event for its date chip: "20" and "Nov" */
export function eventDay(startsAt: string, locale: string, timeZone?: string): { day: string; month: string } {
  const zone = timeZone ? { timeZone } : {};
  const start = new Date(startsAt);
  return { day: dateFormat(locale, { ...zone, day: "numeric" }).format(start), month: dateFormat(locale, { ...zone, month: "short" }).format(start) };
}

/** The hours of an event: "21:00 – 23:30" (the start alone without an end) */
export function eventTimes(event: Pick<ServerEvent, "starts_at" | "ends_at">, locale: string, timeZone?: string): string {
  const format = dateFormat(locale, { hour: "numeric", minute: "2-digit", ...(timeZone ? { timeZone } : {}) });
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : undefined;
  return end && end > start ? range(format, start, end) : format.format(start);
}

/** "in 3 hours", "tomorrow", "in 5 days" */
export function startsIn(startsAt: string, now: number, locale: string): string {
  const minutes = Math.round((Date.parse(startsAt) - now) / 60_000);
  let format: Intl.RelativeTimeFormat;
  try {
    format = new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
  } catch {
    format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  }
  if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, "hour");
  return format.format(Math.round(hours / 24), "day");
}

export type EventPhase = "live" | "soon" | "later" | "over";

/** Where an event is, for its badge */
export function eventPhase(event: Pick<ServerEvent, "status" | "starts_at">, now: number): EventPhase {
  if (event.status === "Active") return "live";
  if (event.status !== "Scheduled") return "over";
  return (Date.parse(event.starts_at) - now) / 60_000 <= SOON_MINUTES ? "soon" : "later";
}

/** Scheduled or happening now */
export const isUpcoming = (event: Pick<ServerEvent, "status">) => event.status === "Scheduled" || event.status === "Active";

/** Happening ones first, then by start time */
export function compareEvents(a: Pick<ServerEvent, "status" | "starts_at">, b: Pick<ServerEvent, "status" | "starts_at">): number {
  const live = Number(b.status === "Active") - Number(a.status === "Active");
  return live || Date.parse(a.starts_at) - Date.parse(b.starts_at);
}

/** Upcoming events counted on the Events row */
export const upcomingCount = (events: Pick<ServerEvent, "status">[]) => events.filter(isUpcoming).length;

/** How the seats of an event stand (web: seatState) */
export function seatState(event: Pick<ServerEvent, "capacity" | "counts">) {
  const capacity = event.capacity ?? undefined;
  const going = event.counts?.going ?? 0;
  const waiting = event.counts?.waiting ?? 0;
  return {
    capacity,
    going,
    waiting,
    left: capacity === undefined ? undefined : Math.max(capacity - going, 0),
    full: capacity !== undefined && going >= capacity,
    share: capacity === undefined || capacity === 0 ? 0 : Math.min(going / capacity, 1),
  };
}

export type PlaceFilter = "any" | EventPlace["type"];

/** Search words and the place filter (web: eventMatches) */
export function eventMatches(event: Pick<ServerEvent, "title" | "description" | "place">, search: string, place: PlaceFilter): boolean {
  if (place !== "any" && event.place.type !== place) return false;
  const words = search.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = `${event.title} ${event.description ?? ""}`.toLocaleLowerCase();
  return words.every((word) => text.includes(word));
}

/** The channel of a channel place */
export const placeChannel = (place: EventPlace) => (place.type === "External" ? undefined : place.channel);

/** Whether an outside place reads as a web address */
export function placeLink(place: EventPlace): string | undefined {
  if (place.type !== "External") return undefined;
  const text = place.location.trim();
  return /^https?:\/\/\S+$/i.test(text) ? text : undefined;
}

/** Whether you take part (going or maybe) */
export const takesPart = (rsvp?: Rsvp | null) => !!rsvp && rsvp.answer !== "NotGoing";

/** Pressing your own answer again takes it back */
export const answerAction = (current: EventAnswerValue | undefined, next: EventAnswerValue): "withdraw" | "set" => (current === next ? "withdraw" : "set");

/** Whether you may read who comes (the server decides; this saves a request) */
export function namesShown(event: Pick<ServerEvent, "people_removed_at" | "attendee_list">, organiser: boolean, rsvp?: Rsvp | null) {
  return !event.people_removed_at && (organiser || event.attendee_list === "Everyone" || (event.attendee_list === "Participants" && takesPart(rsvp)));
}

/** The address that opens an event in the app */
export const eventLink = (origin: string, serverId: string, eventId: string) => `${origin.replace(/\/$/, "")}/server/${serverId}/events/${eventId}`;

/** An event's share link: `<base>/e/<name>-<code>`, or `/e/<code>` */
export const shareLink = (base: string, link: { code: string; name?: string | null }) => `${base.replace(/\/$/, "")}/e/${link.name ? `${link.name}-${link.code}` : link.code}`;

// ---- Editor ----

export type EventTemplate = { id: "game-night" | "tournament" | "watch-party" | "questions" | "hangout"; place: EventPlace["type"]; hours: number; repeat?: EventRepeat; seats?: number };

export const EVENT_TEMPLATES: EventTemplate[] = [
  { id: "game-night", place: "Voice", hours: 3, repeat: "Weekly" },
  { id: "tournament", place: "Voice", hours: 4, seats: 16 },
  { id: "watch-party", place: "Voice", hours: 2 },
  { id: "questions", place: "Text", hours: 1 },
  { id: "hangout", place: "Voice", hours: 2 },
];

/** Reminder choices, in minutes before the start */
export const REMINDER_CHOICES = [15, 60, 1440, 10080] as const;
/** What a new event starts with: a day and a quarter of an hour before */
export const DEFAULT_REMINDERS = [1440, 15];
export const MAX_REMINDERS = 3;
export const MAX_SEATS = 10000;

/** "15 minutes", "1 hour", "2 days" */
export function reminderSpan(minutes: number, locale: string): string {
  const [value, unit] = minutes % 1440 === 0 ? [minutes / 1440, "day"] : minutes % 60 === 0 ? [minutes / 60, "hour"] : [minutes, "minute"];
  try {
    return new Intl.NumberFormat(locale, { style: "unit", unit: unit as string, unitDisplay: "long" }).format(value as number);
  } catch {
    return `${value} ${unit}`;
  }
}

/** Turn one reminder on or off, keeping at most three */
export function toggleReminder(list: number[], minutes: number, on: boolean): number[] {
  if (!on) return list.filter((m) => m !== minutes);
  if (list.includes(minutes) || list.length >= MAX_REMINDERS) return list;
  return [...list, minutes];
}

export type TimeProblem = "start-missing" | "start-past" | "end-before" | "end-long";

/** Problems found before anything is sent (web: eventTimeProblem) */
export function eventTimeProblem(start: Date | undefined, end: Date | undefined, now: Date, startChanged: boolean): TimeProblem | undefined {
  if (!start) return "start-missing";
  if (startChanged && start.getTime() < now.getTime() - 5 * 60_000) return "start-past";
  if (end && end.getTime() <= start.getTime()) return "end-before";
  if (end && end.getTime() - start.getTime() > 31 * 24 * 60 * 60_000) return "end-long";
  return undefined;
}

/** The next half hour after a time (web: roundUp) */
export function roundUp(date: Date, minutes: number): Date {
  const step = minutes * 60_000;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

/** A whole number of seats from 1 to 10000, else undefined */
export function seatCount(text: string): number | undefined {
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= MAX_SEATS ? n : undefined;
}

export type EditorDraft = {
  title: string;
  description: string;
  start: Date;
  end?: Date;
  place: EventPlace;
  repeat?: EventRepeat;
  visibility: "Place" | "Roles";
  roles: string[];
  attendeeList: "Organisers" | "Participants" | "Everyone";
  seats?: number;
  waitlist: boolean;
  reminders: number[];
  cover?: string;
  removeCover?: boolean;
};

/** The body of a new event (web: create) */
export function createBody(d: EditorDraft, timeZone: string, draft: boolean): EventChanges {
  return {
    title: d.title.trim(),
    description: d.description.trim() || undefined,
    starts_at: d.start.toISOString(),
    ends_at: d.end?.toISOString(),
    place: d.place,
    repeat: d.repeat,
    cover: d.cover,
    time_zone: timeZone,
    draft: draft || undefined,
    visibility: d.visibility,
    visible_roles: d.visibility === "Roles" ? d.roles : undefined,
    attendee_list: d.attendeeList,
    reminders: d.reminders,
    capacity: d.seats,
    waitlist: d.seats !== undefined ? d.waitlist : undefined,
  };
}

/**
 * The changes to an event (web: edit). An event shown as invited-only
 * whose invited list did not come with it keeps who sees it as it is.
 */
export function editBody(d: EditorDraft, existing: ServerEvent): EventChanges {
  const remove: NonNullable<EventChanges["remove"]> = [];
  const changes: EventChanges = { title: d.title.trim(), place: d.place, remove };
  const description = d.description.trim();
  if (description) changes.description = description;
  else if (existing.description) remove.push("Description");
  if (d.start.toISOString() !== new Date(existing.starts_at).toISOString() && existing.status === "Scheduled") changes.starts_at = d.start.toISOString();
  if (d.end) changes.ends_at = d.end.toISOString();
  else if (existing.ends_at) remove.push("EndsAt");
  if (d.repeat) changes.repeat = d.repeat;
  else if (existing.repeat) remove.push("Repeat");
  if (d.cover) changes.cover = d.cover;
  else if (d.removeCover && existing.cover) remove.push("Cover");
  if (existing.visibility !== "Invited") {
    changes.visibility = d.visibility;
    changes.visible_roles = d.visibility === "Roles" ? d.roles : [];
  }
  changes.reminders = d.reminders;
  changes.attendee_list = d.attendeeList;
  if (d.seats !== undefined) {
    changes.capacity = d.seats;
    changes.waitlist = d.waitlist;
  } else if (existing.capacity != null) remove.push("Capacity");
  return changes;
}

/** Days offered by the date picker: today and the next `count - 1` days, at local midnight */
export function pickerDays(now: Date, count: number): Date[] {
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Array.from({ length: count }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
}

/** A day with the hours and minutes of another date */
export function withTime(day: Date, hours: number, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes);
}

/** A day (from `day`) at the clock time of `time` (web: atMinutes(day, minutesOf(time))) */
export function onDayAt(day: Date, time: Date): Date {
  return withTime(day, time.getHours(), time.getMinutes());
}

/** The earliest moment a field may hold, or the value moved up to it */
export function notBefore(value: Date, min: Date | undefined): Date {
  return min && value.getTime() < min.getTime() ? new Date(min.getTime()) : value;
}

/** The day and time texts of a date field (web: dateFormats; Latin digits, as the web) */
export function fieldTexts(value: Date, locale: string): { day: string; time: string } {
  const lang = locale || "en";
  return {
    day: new Intl.DateTimeFormat(lang, { numberingSystem: "latn", weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(value),
    time: new Intl.DateTimeFormat(lang, { numberingSystem: "latn", hour: "numeric", minute: "2-digit" }).format(value),
  };
}

/** The person's time zone, named, so a time is never read in another one (web: DateTimeField zone) */
export function zoneText(value: Date, locale: string, zoneId?: string): string {
  const id = zoneId ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  let short = "";
  try {
    short = new Intl.DateTimeFormat(locale || "en", { timeZoneName: "short", timeZone: id }).formatToParts(value).find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    short = "";
  }
  return short ? `${short} · ${id}` : id;
}

/** Share and invitation codes use this alphabet (web: eventLinks RE_CODE) */
const RE_CODE = /^[2-9bcdfghjkmnpqrstvwxyz]+$/;

/** Whether the part after `/e/` can be a share link's path (web: isSharePath) */
export function isSharePath(path: string): boolean {
  const code = path.split("-").pop() ?? "";
  return path.length <= 60 && code.length === 8 && RE_CODE.test(code);
}

/** Whether a text can be an invitation code (web: isInvitationCode) */
export const isInvitationCode = (code: string) => code.length === 16 && RE_CODE.test(code);

/** A route parameter decoded, or "" when it is not valid percent-encoding */
export function decodeParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  try {
    return decodeURIComponent(raw ?? "");
  } catch {
    return "";
  }
}

export type MyEventsTab = "mine" | "all" | "calendar";

/** The cross-server list (web: MyEventsPage): upcoming events of servers you are in, yours or all */
export function myEventsShown<E extends Pick<ServerEvent, "_id" | "status" | "server">>(events: E[], which: MyEventsTab, takingPart: (id: string) => boolean, inServer: (id: string) => boolean): E[] {
  const open = events.filter((e) => (e.status === "Scheduled" || e.status === "Active") && inServer(e.server));
  return which === "mine" ? open.filter((e) => takingPart(e._id)) : open;
}
