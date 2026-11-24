/**
 * Pure helpers for the user settings pages: device-only preference shapes
 * (the web keeps these in local stores), the synced `event_notices` value,
 * and small formatters. No React and no storage here, so it is unit tested.
 */

/** Read a stored JSON object over defaults, keeping only known keys of the same type */
export function readPrefs<T extends Record<string, unknown>>(raw: string | null | undefined, defaults: T): T {
  if (!raw) return { ...defaults };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...defaults };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...defaults };
  const out: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value !== undefined && typeof value === typeof defaults[key]) out[key] = value;
  }
  return out as T;
}

// --- Notifications: events (synced) ---------------------------------------

export const EVENT_KEYS = ["reminders", "changes", "invitations", "seats"] as const;
export type EventKey = (typeof EVENT_KEYS)[number];
export type EventNotices = Record<EventKey, boolean>;

/** The `event_notices` account setting: JSON of only the switched-off keys; all default on */
export function parseEventNotices(raw: string | null | undefined): EventNotices {
  const out = Object.fromEntries(EVENT_KEYS.map((k) => [k, true])) as EventNotices;
  if (!raw) return out;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const k of EVENT_KEYS) if (parsed?.[k] === false) out[k] = false;
  } catch {
    // a broken value means "all on", as on the web
  }
  return out;
}

export function eventNoticesValue(state: EventNotices): string {
  const off: Partial<Record<EventKey, false>> = {};
  for (const k of EVENT_KEYS) if (!state[k]) off[k] = false;
  return JSON.stringify(off);
}

/** `POST /sync/settings/fetch` answers `{ key: [timestamp, value] }` */
export function syncedValue(answer: unknown, key: string): string | undefined {
  const entry = (answer as Record<string, unknown> | null | undefined)?.[key];
  if (Array.isArray(entry) && typeof entry[1] === "string") return entry[1];
  return undefined;
}

// --- Notifications: sounds (device) ----------------------------------------

export const SOUNDS_KEY = "zrzur.prefs.sounds";
export const SOUND_DEFAULTS = {
  message: true,
  mute: true,
  unmute: true,
  deafen: true,
  undeafen: true,
  userJoinVoice: true,
  userLeaveVoice: true,
  streamStart: true,
  streamEnd: true,
};
export type SoundPrefs = typeof SOUND_DEFAULTS;

// --- Save data (device) ----------------------------------------------------

export const SAVE_DATA_KEY = "zrzur.prefs.saveData";
export const SAVE_DATA_DEFAULTS = { enabled: false };

// --- Haptics (device) ------------------------------------------------------

export const HAPTICS_KEY = "zrzur.prefs.haptics";
export const HAPTICS_DEFAULTS = { enabled: true };

// --- Language: date and time (device) --------------------------------------

export const DATETIME_KEY = "zrzur.prefs.datetime";
export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;
export const TIME_FORMATS = ["HH:mm", "h:mm A"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];
export type TimeFormat = (typeof TIME_FORMATS)[number];
export const DATETIME_DEFAULTS: { date: string; time: string } = { date: "DD/MM/YYYY", time: "HH:mm" };

const pad = (n: number) => String(n).padStart(2, "0");

/** A sample in one of the fixed patterns (web: dayjs L / LT formats) */
export function formatPattern(pattern: string, date: Date): string {
  const h = date.getHours();
  switch (pattern) {
    case "DD/MM/YYYY":
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    case "MM/DD/YYYY":
      return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
    case "YYYY-MM-DD":
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    case "HH:mm":
      return `${pad(h)}:${pad(date.getMinutes())}`;
    case "h:mm A":
      return `${h % 12 === 0 ? 12 : h % 12}:${pad(date.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
    default:
      return "";
  }
}

// --- Voice (device) --------------------------------------------------------

export const VOICE_KEY = "zrzur.prefs.voice";
export const VOICE_DEFAULTS = {
  inputVolume: 1,
  outputVolume: 1,
  autoSensitivity: true,
  threshold: -50,
  highQuality: false,
  noiseSuppression: true,
  echoCancellation: true,
  autoGain: true,
  soundboardMuted: false,
  soundboardVolume: 1,
};
export type VoicePrefs = typeof VOICE_DEFAULTS;

/** Snap a slider value to its step inside the range (no float drift) */
export function snap(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const steps = Math.round((clamped - min) / step);
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((min + steps * step).toFixed(decimals));
}

// --- Feather ---------------------------------------------------------------

/** Prices come in minor units (web: formatPrice) */
export function formatPrice(minor: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: currency || "USD" }).format(minor / 100);
  } catch {
    return (minor / 100).toFixed(2);
  }
}

/** Bytes as whole megabytes, like the web perks table */
export function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** "1080p60" from a plan's stream limits */
export function streamQuality(limits: { video_resolution: number[]; video_framerate: number }): string {
  const height = limits.video_resolution[1] ?? limits.video_resolution[0] ?? 0;
  return `${height}p${limits.video_framerate}`;
}

/** Whether a Feather period is still running */
export function periodActive(end: string | undefined | null, now: number): boolean {
  return !!end && new Date(end).getTime() > now;
}

// --- Safety ----------------------------------------------------------------

export const SAFETY_CONTACT = "support@zrzur.com";

/** Short reference of a decision, as quoted in the e-mail (web: decisionReference) */
export function decisionReference(actionId: string): string {
  return `ZR-${actionId.slice(-8).toUpperCase()}`;
}

export const STANDING_LEVELS = ["Good", "Limited", "VeryLimited", "AtRisk", "Suspended"] as const;

// --- Bug report ------------------------------------------------------------

export type BugDraft = { title: string; description: string };

/** The server's limits for a bug report (title 5..120, description 10..4000) */
export function bugReady(d: BugDraft): boolean {
  const title = d.title.trim().length;
  const text = d.description.trim().length;
  return title >= 5 && title <= 120 && text >= 10 && text <= 4000;
}

// --- Support ---------------------------------------------------------------

export const SUPPORT_CATEGORIES = ["account", "billing", "safety", "bug", "feature", "other"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export function ticketReady(subject: string, body: string): boolean {
  const s = subject.trim().length;
  const b = body.trim().length;
  return s > 0 && s <= 120 && b > 0 && b <= 4000;
}
