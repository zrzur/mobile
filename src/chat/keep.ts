/**
 * Saved messages and reminders (web: saved/savedStore.ts, savedModel.ts).
 * The routes are not in the SDK's typed table yet, so they are called by
 * path; the answers put their messages and authors into the SDK's caches
 * like any other fetch. "Tonight" and "tomorrow morning" are worked out on
 * the phone's own clock, then sent as one instant, so a reminder set in
 * Vienna for 20:00 arrives at 20:00 Vienna time wherever the server is.
 *
 * Besides the calls, the little the app remembers between screens: which
 * messages are known to be saved (so the menu can offer "Remove from
 * saved"), the reminders that came due while the app was open, and a
 * counter that open lists watch to read again.
 */
import type { API, Client, Message } from "@zrzur/sdk/solid";
import { useSyncExternalStore } from "react";

export const TONIGHT_HOUR = 20;
export const MORNING_HOUR = 9;
const TONIGHT_LEAD_MS = 30 * 60_000;
const NIGHT_OWL_HOUR = 4;

export type ReminderPreset = "20m" | "1h" | "tonight" | "morning";
export type PresetTime = { preset: ReminderPreset; at: Date; sameDay?: boolean };

/** Saving and reminders are on only on a clear yes (`features.saved_reminders`) */
export function savedRemindersEnabled(client: { configuration?: { features?: object } } | null | undefined) {
  return (client?.configuration?.features as { saved_reminders?: boolean } | undefined)?.saved_reminders === true;
}

/** The ready-made times for "Remind me" (local setters on purpose: DST keeps 09:00 at 09:00) */
export function presetTimes(now: Date): PresetTime[] {
  const list: PresetTime[] = [
    { preset: "20m", at: new Date(now.getTime() + 20 * 60_000) },
    { preset: "1h", at: new Date(now.getTime() + 60 * 60_000) },
  ];
  const tonight = new Date(now);
  tonight.setHours(TONIGHT_HOUR, 0, 0, 0);
  if (tonight.getTime() - now.getTime() >= TONIGHT_LEAD_MS) list.push({ preset: "tonight", at: tonight });
  const morning = new Date(now);
  const sameDay = now.getHours() < NIGHT_OWL_HOUR;
  if (!sameDay) morning.setDate(morning.getDate() + 1);
  morning.setHours(MORNING_HOUR, 0, 0, 0);
  list.push({ preset: "morning", at: morning, ...(sameDay && { sameDay }) });
  return list;
}

/** Furthest ahead a reminder can be set (the server checks its own setting) */
export const MAX_DAYS_AHEAD = 366;

export type DueProblem = "past" | "too-far";

/** What is wrong with a time the person picked, if anything */
export function dueProblem(at: Date | undefined, now: Date): DueProblem | undefined {
  if (!at || at.getTime() <= now.getTime()) return "past";
  if (at.getTime() > now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60_000) return "too-far";
  return undefined;
}

/** The time first shown in "Pick a time": the next half hour, an hour on */
export function suggestedCustomTime(now: Date): Date {
  const at = new Date(now.getTime() + 60 * 60_000);
  const minutes = at.getMinutes();
  at.setMinutes(minutes === 0 ? 0 : minutes <= 30 ? 30 : 60, 0, 0);
  return at;
}

export type ReminderLike = { due_at: number; delivered_at?: number | null };

/** Waiting reminders soonest first; delivered ones newest first */
export function splitReminders<T extends ReminderLike>(list: T[]) {
  const waiting = list.filter((r) => r.delivered_at == null).sort((a, b) => a.due_at - b.due_at);
  const due = list.filter((r) => r.delivered_at != null).sort((a, b) => b.delivered_at! - a.delivered_at!);
  return { waiting, due };
}

/** Whether another reminder fits under the limit */
export function canAddReminder(waiting: number, max: number | undefined) {
  return max === undefined || waiting < max;
}

export type SavedEntry = { message: string; channel: string; saved_at: number; available: boolean };

export type Reminder = {
  _id: string;
  message: string;
  channel: string;
  due_at: number;
  created_at: number;
  delivered_at?: number | null;
  available: boolean;
};

type Carried = { messages?: API.Message[]; users?: API.User[] };
export type SavedPage = Carried & { entries: SavedEntry[]; total: number; max: number };
export type RemindersAnswer = Carried & { reminders: Reminder[]; max_active: number; max_active_plus: number };
type ReminderDueEvent = { type: "MessageReminderDue"; reminder: Reminder; message?: API.Message; user?: API.User };

type RawApi = {
  get(path: string, params?: object): Promise<unknown>;
  put(path: string, body?: object): Promise<unknown>;
  post(path: string, body?: object): Promise<unknown>;
  patch(path: string, body?: object): Promise<unknown>;
  delete(path: string): Promise<unknown>;
};
const raw = (client: Client) => client.api as unknown as RawApi;

/** Put the messages and authors an answer carries into the caches */
function carry(client: Client, data: Carried) {
  for (const user of data.users ?? []) client.users.getOrCreate(user._id, user);
  for (const message of data.messages ?? []) client.messages.getOrCreate(message._id, message);
}

/** The cached message of an entry or reminder, when it is available */
export function messageOf(client: Client, item: { message: string; available: boolean }): Message | undefined {
  return item.available ? client.messages.get(item.message) : undefined;
}

// ---- the little store the screens share (useSyncExternalStore) ----

const listeners = new Set<() => void>();
let snapshot = { arrived: [] as Reminder[], changes: 0 };
const emit = (next: Partial<typeof snapshot>) => {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Reminders that came due while the app was open and were not looked at */
export const useArrivedReminders = () => useSyncExternalStore(subscribe, () => snapshot.arrived);
/** Bumped when a reminder is set, moved or removed: open lists read again */
export const useReminderChanges = () => useSyncExternalStore(subscribe, () => snapshot.changes);
export const remindersChanged = () => emit({ changes: snapshot.changes + 1 });

/** Messages known to be in the saved list (so the sheet can offer "Remove from saved") */
const saved = new Set<string>();
export const isKnownSaved = (id: string) => saved.has(id);

export async function fetchSaved(client: Client, options: { before?: number; query?: string; limit?: number } = {}): Promise<SavedPage> {
  const params: Record<string, string | number> = { limit: options.limit ?? 30 };
  if (options.before !== undefined) params.before = options.before;
  if (options.query) params.query = options.query;
  const page = (await raw(client).get("/users/@me/saved", params)) as SavedPage;
  carry(client, page);
  for (const entry of page.entries) saved.add(entry.message);
  return page;
}

export async function saveMessage(client: Client, id: string) {
  await raw(client).put(`/users/@me/saved/${id}`);
  saved.add(id);
}

export async function unsaveMessage(client: Client, id: string) {
  await raw(client).delete(`/users/@me/saved/${id}`);
  saved.delete(id);
}

export async function fetchReminders(client: Client): Promise<RemindersAnswer> {
  const answer = (await raw(client).get("/users/@me/reminders")) as RemindersAnswer;
  carry(client, answer);
  // what the list holds replaces what arrived live
  if (snapshot.arrived.length) emit({ arrived: [] });
  return answer;
}

export async function createReminder(client: Client, messageId: string, at: Date) {
  const made = (await raw(client).post("/users/@me/reminders", { message: messageId, due_at: at.getTime() })) as Reminder;
  remindersChanged();
  return made;
}

export async function moveReminder(client: Client, id: string, at: Date) {
  const moved = (await raw(client).patch(`/users/@me/reminders/${id}`, { due_at: at.getTime() })) as Reminder;
  remindersChanged();
  return moved;
}

export async function removeReminder(client: Client, id: string) {
  await raw(client).delete(`/users/@me/reminders/${id}`);
  emit({ arrived: snapshot.arrived.filter((r) => r._id !== id), changes: snapshot.changes + 1 });
}

/** The reminder a gateway event brings, when it is a "reminder due" event */
export function dueReminderOf(event: unknown): ReminderDueEvent | undefined {
  const due = event as ReminderDueEvent | null;
  return due && typeof due === "object" && due.type === "MessageReminderDue" && due.reminder && typeof due.reminder._id === "string" ? due : undefined;
}

/** Add a newly due reminder in front of the ones already there (one per id) */
export function withArrived(list: Reminder[], reminder: Reminder): Reminder[] {
  return [reminder, ...list.filter((r) => r._id !== reminder._id)];
}

const attached = new WeakSet<Client>();

/**
 * Listen for reminders coming due, once per client. `onDue` runs for each
 * one (the place that shows the notice).
 */
export function attachReminders(client: Client, onDue: (reminder: Reminder, message: Message | undefined) => void) {
  if (attached.has(client)) return;
  attached.add(client);
  client.events.on("event", (event: unknown) => {
    const due = dueReminderOf(event);
    if (!due) return;
    carry(client, { users: due.user ? [due.user] : [], messages: due.message ? [due.message] : [] });
    emit({ arrived: withArrived(snapshot.arrived, due.reminder), changes: snapshot.changes + 1 });
    onDue(due.reminder, messageOf(client, due.reminder));
  });
}

/** Tests only: forget what arrived */
export function resetKeepStore() {
  saved.clear();
  snapshot = { arrived: [], changes: 0 };
}
